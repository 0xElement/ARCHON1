#!/usr/bin/env node
'use strict'
// test/e2e-simulation.js — end-to-end pipeline simulation with dummy data ("unitTest" dispatch).
//
// Drives the REAL pipeline functions (not mocks) with realistic dummy findings — 200× dupes,
// progress noise, and the SENTRY-writes-12 / AUDITOR-adds-2 split that caused the "only 2
// findings" bug — asserting each stage, then writes every artifact the portal reads so the run
// shows up in the UI (Overview / Findings / Testing logs / Report) for visual validation.
//
//   node test/e2e-simulation.js            → run + assert + push to UI
//
// Leaves a completed task on the board named "unitTest". Safe: task status = done, no dispatch
// queued, so the daemon never runs real agents on it.

const fs = require('fs')
const path = require('path')
const agentPaths = require('../paths')
const INTEL = agentPaths.INTEL_ROOT
const { dedupeSuspected } = require('../src/pipeline/suspected-dedup')
const { nextBatch } = require('../src/pipeline/streaming-triage')
const auditorBuilder = require('../agents/auditor-validated-builder')
const dashboard = require('../scripts/dashboard') // require.main-guarded → no server starts
let cvss = null; try { cvss = require('../ui/cvss') } catch {}

const TID = 't-unitTest-' + Date.now()
const TARGET = 'http://unittest.local'
const now = () => new Date().toISOString()
const F = (name) => path.join(INTEL, name)
const write = (name, data) => { const p = F(name); const tmp = p + '.tmp'; fs.writeFileSync(tmp, data); fs.renameSync(tmp, p) }
const jsonl = (arr) => arr.map(o => JSON.stringify(o)).join('\n') + '\n'

// ── assertions ──────────────────────────────────────────────────────────────
const checks = []
const check = (name, cond, got) => { checks.push({ name, pass: !!cond, got: got === undefined ? '' : String(got) }) }

// ── 14 canonical "truth" findings on the dummy target (real URLs — no placeholders) ─────────
const bandOf = (v) => { try { return cvss ? cvss.sevFromScore(cvss.cvss31(cvss.parseVector(v)).score) : null } catch { return null } }
const FIND = [
  ['RCE',  'Unauthenticated Remote Code Execution in /api/exec', 'CWE-78',  '/api/exec?cmd=id',            'POST', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'],
  ['SQLi', 'SQL Injection in /login username field',            'CWE-89',  '/login',                       'POST', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'],
  ['Auth', 'Authentication bypass on /admin via header spoof',  'CWE-287', '/admin',                       'GET',  'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:N'],
  ['SSRF', 'Server-Side Request Forgery in /fetch url param',   'CWE-918', '/fetch?url=http://169.254.169.254/', 'GET', 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:N/A:N'],
  ['IDOR', 'IDOR: any user reads any invoice at /api/invoice/N','CWE-639', '/api/invoice/1042',            'GET',  'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N'],
  ['LFI',  'Path traversal in /download filename',              'CWE-22',  '/download?file=../../etc/passwd','GET', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N'],
  ['XSS',  'Stored XSS in /comment body',                       'CWE-79',  '/comment',                     'POST', 'CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N'],
  ['CSRF', 'CSRF on /transfer — no token or SameSite',          'CWE-352', '/transfer',                    'POST', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:H/A:N'],
  ['SESS', 'Session fixation: /login accepts attacker SID',     'CWE-384', '/login',                       'POST', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N'],
  ['INFO', 'Sensitive data exposure at /debug',                 'CWE-200', '/debug',                       'GET',  'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N'],
  ['CRYP', 'Weak password hashing (unsalted MD5)',              'CWE-916', '/register',                    'POST', 'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N'],
  ['REDIR','Open redirect in /go?next=',                        'CWE-601', '/go?next=http://evil.example', 'GET',  'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:N/A:N'],
  // these two arrive via AUDITOR (post-SENTRY), to exercise the merge:
  ['RATE', 'Broken rate limit on /transfer (in-memory, multi-worker)', 'CWE-770', '/transfer', 'POST', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:L'],
  ['HDR',  'Missing security headers (no CSP/HSTS/XFO)',        'CWE-693', '/',                            'GET',  'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N'],
]
const idOf = (i) => i < 12 ? `SENTRY-${String(i + 1).padStart(3, '0')}` : `AUDITOR-${String(i - 11).padStart(3, '0')}`
const recFor = (i) => {
  const [tag, title, cwe, urlPath, method, vec] = FIND[i]
  return { id: idOf(i), tag, title, cwe, url: TARGET + urlPath, method, cvss_vector: vec, severity: bandOf(vec) || 'Medium' }
}

// ── STAGE 1: specialists emit raw live-findings — with heavy dupes + progress noise ─────────
const live = []
FIND.forEach((f, i) => {
  const r = recFor(i)
  const emits = i === 0 ? 200 : (i < 5 ? 40 : 6) // RCE emitted 200×, etc. → tests dedup
  for (let n = 0; n < emits; n++) {
    live.push({ type: 'confirmed', agent: r.id.split('-')[0] === 'SENTRY' ? 'VIPER' : 'GATEWAY',
      severity: r.severity, cwe: r.cwe, url: r.url, method: r.method,
      details: `${r.title} (attempt ${n})`, reproduction: `curl -X ${r.method} '${r.url}'`, reproduction_result: 'HTTP 200 / vulnerable' })
  }
})
for (let n = 0; n < 120; n++) live.push({ type: 'info', agent: 'SCOUT', details: 'DISCOVERY' })
for (let n = 0; n < 80; n++) live.push({ type: 'in-progress', agent: 'RANGER', details: 'RECON Complete' })
write(`live-findings-${TID}.jsonl`, jsonl(live))

const ded = dedupeSuspected(live)
check('dedup collapses raw emits → 14 distinct findings', ded.distinct === 14, `distinct=${ded.distinct} (from ${ded.total} candidates, ${live.length} raw)`)
check('dedup drops the 200 noise rows (DISCOVERY/RECON)', ded.total === live.length - 200, `candidates=${ded.total}`)
check('dedup keeps the worst-severity finding first (RCE Critical)', /Code Execution/.test(ded.findings[0].title), ded.findings[0].title)

// ── STAGE 2: streaming triage tails the append-only file across polls, one-by-one ───────────
const seen = new Set()
const half = Math.floor(live.length / 2)
const b1 = nextBatch(live.slice(0, half), seen)
const b2 = nextBatch(live, seen) // file "grew" — old ones must not re-triage
check('streaming triage surfaces each distinct finding exactly once across polls', b1.length + b2.length === 14, `poll1=${b1.length} poll2=${b2.length}`)

// ── STAGE 3: SENTRY writes 12 validated; AUDITOR adds 2 via ACTIVITY-LOG; builder MERGES ────
const sentry = []
for (let i = 0; i < 12; i++) {
  const r = recFor(i)
  sentry.push({ id: r.id, title: r.title, severity: r.severity, validation_status: 'CONFIRMED', original_agent: 'SENTRY',
    url: r.url, method: r.method, cwe: r.cwe, cvss_vector: r.cvss_vector,
    reproduction_method: `curl -X ${r.method} '${r.url}'`, reproduction_result: 'HTTP 200 — vulnerable', taskId: TID, source: 'sentry' })
}
write(`VALIDATED-FINDINGS-${TID}.jsonl`, jsonl(sentry)) // SENTRY's file (what the old builder clobbered)

// AUDITOR verdicts appended to the shared ACTIVITY-LOG (2 new CONFIRMED + 3 KILLED dupes)
const auditLines = []
for (let i = 12; i < 14; i++) {
  const r = recFor(i)
  auditLines.push({ ts: now(), agent: 'AUDITOR', action: `CONFIRMED — ${r.id}: ${r.title}`,
    details: `Q1-Q7 PASSED. url=${r.url} vector=${r.cvss_vector}. reproduction_method: curl -X ${r.method} ${r.url}. reproduction_result: HTTP 200 vulnerable.`,
    taskId: TID, squad: 'pentest' })
}
for (const dup of ['LEDGER: Race Condition duplicate of SENTRY-008', 'GATEWAY: IDOR dup of SENTRY-005', 'FORGE: CMDi dup of SENTRY-001'])
  auditLines.push({ ts: now(), agent: 'AUDITOR', action: `KILLED — ${dup}`, details: 'DUPLICATE — not forwarding.', taskId: TID, squad: 'pentest' })
fs.appendFileSync(F('ACTIVITY-LOG.jsonl'), jsonl(auditLines))

const built = auditorBuilder.buildAndWriteForTask(TID)
check('MERGE fix: SENTRY 12 + AUDITOR 2 = 14 validated (was clobbered to 2)', built.count === 14, `count=${built.count} (existingKept=${built.existingKept}, auditorAdded=${built.auditorAdded})`)

// ── STAGE 4: TRIAGER + WRITER — dedup/merge (no-op here) then write full detail per finding ──
// class-aware, action-oriented reproduction steps (the format the writer now produces)
const stepsFor = (tag, url, method) => {
  if (tag === 'REDIR') return [`Step 1: Open the following link in the browser: ${url}.`, `Step 2: Observed that the browser is redirected to the injected URL http://evil.example.`]
  if (tag === 'XSS') return [`Step 1: Go to ${TARGET} and log in as tester / Passw0rd! (or self-register).`, `Step 2: Go to Comments and inject the payload <script>alert(document.domain)</script> into the body field.`, `Step 3: Save the comment.`, `Step 4: Observed that the injected payload executes in the browser.`]
  if (tag === 'SQLi') return [`Step 1: In the HTTP request below, replace the username field with the SQLi payload.`, `Step 2: Send the request and observed a 5-second time delay, proving blind SQL injection.`]
  if (tag === 'IDOR') return [`Step 1: Log in as a low-privileged user and note your own invoice id.`, `Step 2: Change the id in ${url} to another user's id.`, `Step 3: Observed that another user's invoice is returned without authorization.`]
  if (tag === 'Auth') return [`Step 1: Send the request below to ${url} with a spoofed X-Original-User: admin header.`, `Step 2: Observed that the admin page is returned without authentication.`]
  return [`Step 1: Send a ${method} request to ${url}.`, `Step 2: Observed that the vulnerability is triggered (HTTP 200 with the expected proof).`]
}
const pocFor = (tag, url, method) => {
  if (tag === 'SQLi') return `curl -X POST '${TARGET}/login' --data "username=admin' AND SLEEP(5)-- -&password=x"`
  if (tag === 'XSS') return `curl -X POST '${TARGET}/comment' -H 'Cookie: session=<token>' --data 'body=<script>alert(document.domain)</script>'`
  if (tag === 'REDIR') return `curl -sI '${url}'`
  if (tag === 'Auth') return `curl '${url}' -H 'X-Original-User: admin'`
  return `curl -X ${method} '${url}'`
}
// short one-line observed result — evidence only, NOT printed in the report/card
const respFor = (tag) => {
  if (tag === 'SQLi') return `response delayed ~5.02s — time-based blind SQLi confirmed`
  if (tag === 'REDIR') return `302 redirect to http://evil.example`
  if (tag === 'XSS') return `payload reflected unencoded and executes`
  if (tag === 'IDOR') return `another user's invoice returned (owner: another.user)`
  if (tag === 'Auth') return `admin dashboard returned without a valid session`
  return `HTTP 200 — vulnerability confirmed`
}
const validated = fs.readFileSync(F(`VALIDATED-FINDINGS-${TID}.jsonl`), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
const detail = {}
for (const f of validated) {
  const meta = FIND.find(x => f.title && f.title.startsWith(x[1].slice(0, 20))) || []
  const tag = f.tag || meta[0] || ''
  const vec = f.cvss_vector || meta[5] || 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N'
  const url = f.url || (TARGET + (meta[3] || '/'))
  const method = f.method || meta[4] || 'GET'
  detail[f.id] = {
    title: f.title, severity: bandOf(vec) || f.severity, cwe: f.cwe || meta[2] || 'CWE-0',
    cvss_vector: vec, cvss_score: cvss ? cvss.cvss31(cvss.parseVector(vec)).score : null,
    description: `${f.title}. The endpoint accepts attacker-controlled input without validation. **Root cause:** missing input validation / authorization at ${url}.`,
    test_steps: stepsFor(tag, url, method),
    raw_request: `${method} ${url.replace(TARGET, '')} HTTP/1.1\nHost: unittest.local\n\n`,
    validation: respFor(tag),
    impact: `An attacker can exploit ${url} to compromise the application.`,
    remediation: `Validate/authorize input at ${url}; apply the standard fix for ${f.cwe || meta[2] || 'this class'}.`,
    poc: pocFor(tag, url, method),
  }
}
write(`findings-detail-${TID}.json`, JSON.stringify(detail, null, 2))
check('repro steps are action-oriented and end in an "Observed …" step', Object.values(detail).every(d => /^step 1:/i.test(d.test_steps[0]) && /observed/i.test(d.test_steps[d.test_steps.length - 1])), 'all steps action-oriented + observed-ending')
check('POC shows the CURL request only; response kept to one short line (report stays short)', Object.values(detail).every(d => /^curl /.test(d.poc) && !/\n/.test(String(d.validation || '')) && String(d.validation || '').length < 140), 'curl req present, response is a short one-liner')

// ── STAGE 5: the REAL board logic (what the portal serves at /api/findings) ──────────────────
const board = dashboard.findingsForTask(TID)
check('board shows all 14 findings (merge + enriched-only both hold)', board.total === 14, `total=${board.total}`)
check('board: every card is fully enriched (has details)', board.findings.every(f => f.enriched && f.description && f.poc), `enriched=${board.findings.filter(f => f.enriched).length}/14`)
check('board: real tested URLs, NO placeholders', board.findings.every(f => f.url && f.url.startsWith(TARGET) && !/<host>|example\.com|attacker\.com/.test(f.url)), board.findings.map(f => f.url).find(u => /<host>|example|attacker/.test(u)) || 'all real')
check('board: severity badge matches the CVSS vector band', board.findings.every(f => !f.cvssVector || !bandOf(f.cvssVector) || f.severity === bandOf(f.cvssVector)), board.findings.filter(f => f.cvssVector && bandOf(f.cvssVector) && f.severity !== bandOf(f.cvssVector)).map(f => `${f.id}:${f.severity}!=${bandOf(f.cvssVector)}`).join(',') || 'all match')
check('board: severity counts add up to 14', Object.values(board.counts).reduce((a, b) => a + b, 0) === 14, JSON.stringify(board.counts))

// ── STAGE 6: Testing-logs feed (incl. the AGENT → TRIAGE → verdict conversation) ─────────────
const t0 = Date.now()
const at = (s) => new Date(t0 + s * 1000).toISOString()
const logs = [
  { ts: at(0), agent: 'NEXUS', action: '🛡️ Phase 0.0: scope pre-validate allowed', details: `target "${TARGET}" in scope` },
  { ts: at(1), agent: 'NEXUS', action: '⚡ Dispatching task to ATLAS: unitTest', details: 'end-to-end simulation' },
  { ts: at(12), agent: 'NEXUS', action: '🛰️ Phase 0.4: naabu→nmap — 3 open ports (1 web)', details: '22/ssh, 53/dns, 80/http · Web: ' + TARGET },
  { ts: at(30), agent: 'NEXUS', action: '🔄 Phase 1: Recon — SCOUT, RANGER', details: 'surface mapping' },
  { ts: at(90), agent: 'NEXUS', action: '📥 Phase 2.7: Streaming triage ONLINE — findings triaged live', details: 'agents stream findings to the triager one-by-one' },
  { ts: at(95), agent: 'NEXUS', action: '🔄 Phase 2 Wave 1 (parallel): VIPER, WARDEN, RELAY, DRILL, SENTRY', details: '5 specialists, 5 at a time' },
]
FIND.forEach((f, i) => {
  const r = recFor(i)
  const ag = i < 12 ? 'VIPER' : 'GATEWAY'
  logs.push({ ts: at(110 + i * 6), agent: ag, action: `📤 → TRIAGE: ${r.title.slice(0, 60)}`, details: `${ag} handed a finding to the triager` })
  logs.push({ ts: at(112 + i * 6), agent: 'TRIAGER', action: `✅ → board: ${r.title.slice(0, 55)} (${r.severity})`, details: 'Validated + written — now on the Findings tab.' })
})
logs.push({ ts: at(210), agent: 'TRIAGER', action: '🗑️ dropped: verbose 404 page — no security impact', details: 'not a real finding' })
logs.push({ ts: at(230), agent: 'NEXUS', action: '📥 Streaming triage complete — 14 findings on the board', details: 'validated + written live' })
logs.push({ ts: at(240), agent: 'NEXUS', action: '✅ Run complete — 14 confirmed findings, report written', details: 'unitTest simulation done' })
fs.mkdirSync(F('task-logs'), { recursive: true })
write(`task-logs/${TID}.jsonl`, jsonl(logs))

// ── STAGE 7: the published report (Report tab) ──────────────────────────────────────────────
const bySev = { Critical: [], High: [], Medium: [], Low: [], Info: [] }
for (const f of board.findings) (bySev[f.severity] || bySev.Info).push(f)
let md = `# Penetration Test Report — unitTest\n\n**Target:** ${TARGET}\n**Date:** ${now().slice(0, 10)}\n**Findings:** ${board.total} confirmed\n\n## Executive Summary\nSimulated end-to-end run against \`${TARGET}\`. ${board.total} vulnerabilities confirmed across ${Object.entries(board.counts).filter(([, n]) => n).map(([s, n]) => `${n} ${s}`).join(', ')}.\n\n## Findings\n`
for (const sev of ['Critical', 'High', 'Medium', 'Low', 'Info']) for (const f of bySev[sev]) {
  const d = detail[f.id] || {}
  const steps = (d.test_steps || []).map((s, i) => `${i + 1}. ${String(s).replace(/^step\s*\d+\s*[:.\-]\s*/i, '')}`).join('\n')
  md += `\n### [${f.severity}] ${f.title}\n- **CWE:** ${f.cwe}\n- **CVSS:** \`${f.cvssVector}\` = ${f.cvss}\n- **Vulnerable URL:** ${f.url}\n- **Description:** ${d.description || ''}\n\n**Reproduction steps**\n${steps}\n\n**POC — CURL Request**\n\`\`\`\n${d.poc || ''}\n\`\`\`\n- **Impact:** ${d.impact || ''}\n- **Remediation:** ${d.remediation || ''}\n`
}
check('report POC shows only the CURL request (no response dump)', !/CURL RESPONSE|CURL Response/i.test(md), 'no response block in report')
fs.mkdirSync(F('reports'), { recursive: true })
write(`reports/${TID}.md`, md)
check('report written with real target URL (no placeholder host)', /unittest\.local/.test(md) && !/<host>|attacker\.com/.test(md), 'report references real target')

// ── STAGE 8: register the task so it appears on the portal ───────────────────────────────────
try {
  const tp = F('tasks.json')
  const arr = JSON.parse(fs.readFileSync(tp, 'utf8'))
  const list = Array.isArray(arr) ? arr : (arr.tasks || [])
  // SAFETY: this rewrites the real tasks.json — don't do that while a live run is writing it
  // (a manual sim should not run against an active engagement). Force with ARCHON_SIM_FORCE=1.
  const live = list.filter(t => t && t.status === 'in-progress')
  if (live.length && process.env.ARCHON_SIM_FORCE !== '1') {
    console.error(`\n⛔ Refusing to register the sim task: ${live.length} in-progress task(s) are live: ${live.map(t => t.id).join(', ')}.`)
    console.error(`   Re-run with ARCHON_SIM_FORCE=1 to override.\n`)
    process.exit(2)
  }
  const filtered = list.filter(t => String(t.id) !== TID && t.title !== 'unitTest' && t.source !== 'e2e-simulation')
  filtered.push({ id: TID, title: 'unitTest', status: 'done', squad: 'pentest-squad', assignee: 'ATLAS',
    goal: `unitTest end-to-end simulation — ${TARGET}`, createdAt: now(), startedAt: now(), lastUpdate: now(),
    projectId: '', source: 'e2e-simulation', progress: 100, statusMessage: `Done — ${board.total} findings`, totalCost: 0 })
  const out = Array.isArray(arr) ? filtered : { ...arr, tasks: filtered }
  const tmp = tp + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(out, null, 2)); fs.renameSync(tmp, tp)
  check('task registered in tasks.json (visible on the portal)', true)
} catch (e) { check('task registered in tasks.json', false, e.message) }

// ── report ──────────────────────────────────────────────────────────────────
const pass = checks.filter(c => c.pass).length
console.log(`\n  ═══ unitTest end-to-end simulation — ${TID} ═══\n`)
for (const c of checks) console.log(`  ${c.pass ? '✅' : '❌'} ${c.name}${c.got ? `  → ${c.got}` : ''}`)
console.log(`\n  ${pass}/${checks.length} checks passed.`)
console.log(`  Target: ${TARGET}   Findings on board: ${board.total}`)
console.log(`  Open the portal → task "unitTest" → Overview / Findings / Testing logs / Report.\n`)
process.exit(pass === checks.length ? 0 : 1)
