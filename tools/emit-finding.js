#!/usr/bin/env node
'use strict'
// emit-finding.js — the ONLY sanctioned way for a specialist agent to record a finding.
//
// Why this exists: agents used to `echo '{...}' >> live-findings-<task>.jsonl`, hand-building
// JSON. Multi-line reproduction/evidence injected raw newlines and shell/regex backslashes
// (USER\|PASS) that broke JSON.parse, and 13 parallel agents `>>`-appending to one file
// interleaved their writes — ~30% of findings were silently lost. Here the agent supplies
// only shell ARGUMENTS; Node owns 100% of the JSON via JSON.stringify, so malformed JSON is
// structurally impossible, and an O_EXCL lock serializes the append so writes never interleave.
//
// Usage (one call per finding):
//   node tools/emit-finding.js --task <id> --agent <NAME> --title "<one-line title>" \
//     --type confirmed|suspected|surface --url <url> --confidence high|medium|low \
//     --cvss "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N"   (sets score + severity band) \
//     --severity critical|high|medium|low|info   (fallback when --cvss is absent) \
//     --details <text> --impact <text> --reproduction-file <path>   (or --reproduction <inline>) \
//     [--payloads-file <path>] [--auth ...] [--relation ...] [--parent ...] \
//     [--tested a,b,c] [--not-tested d,e]
//
// Multi-line fields (reproduction, payloads) take a --*-file flag pointing at a temp file the
// agent already wrote (e.g. captured curl output) — newlines live safely on disk, never in argv.

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

// ── tiny --k v argv parser (stdlib only) ──
function parseArgs(argv) {
  const a = {}
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (!t.startsWith('--')) continue
    const key = t.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) { a[key] = true } // bare flag
    else { a[key] = next; i++ }
  }
  return a
}

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info']
const TYPES = ['confirmed', 'suspected', 'surface']

function normSeverity(s) {
  const m = String(s || '').toLowerCase().match(/^(critical|high|medium|low|info)/)
  return m ? m[1] : 'medium' // default medium: too low fails validation, too high primes false-confidence
}
function normType(t) {
  const lc = String(t || '').toLowerCase()
  return TYPES.includes(lc) ? lc : 'suspected' // unproven defaults to suspected
}
function readMaybeFile(inline, file) {
  if (file && fs.existsSync(String(file))) { try { return fs.readFileSync(String(file), 'utf8') } catch { return '' } }
  return inline && inline !== true ? String(inline) : ''
}
function listOf(v) {
  if (!v || v === true) return []
  return String(v).split(',').map(s => s.trim()).filter(Boolean)
}

// ── atomic append under an O_EXCL spinlock (serializes the 13 parallel writers) ──
// ponytail: O_EXCL spinlock on one shared file — fine for ~13 writers; upgrade to
// one-file-per-finding under live-findings-<task>.d/ if writer count ever explodes.
function sleepMs(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch { /* no SAB */ } }
function lockedAppend(file, line) {
  const lock = file + '.lock'
  for (let i = 0; i < 100; i++) {
    let fd
    try { fd = fs.openSync(lock, 'wx') } // wx = O_CREAT|O_EXCL — fails if held
    catch (e) {
      if (e.code !== 'EEXIST') throw e
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10000) fs.unlinkSync(lock) } catch {} // steal stale lock
      sleepMs(20); continue
    }
    try { fs.appendFileSync(file, line) } finally { try { fs.closeSync(fd) } catch {}; try { fs.unlinkSync(lock) } catch {} }
    return true
  }
  // lock never freed (shouldn't happen) — append anyway: a possibly-interleaved line the
  // tolerant reader can salvage beats a lost finding.
  fs.appendFileSync(file, line)
  return false
}

// Identity of a finding for dedup: same agent + class + location + claim. Two emits
// with the same (agent, type, url, details, reproduction) are the SAME finding.
function findingKey(rec) {
  const norm = s => String(s == null ? '' : s).toLowerCase().trim().replace(/\s+/g, ' ')
  return [norm(rec.agent), norm(rec.type), norm(rec.url), norm(rec.details), norm(rec.reproduction).slice(0, 400)].join('')
}

// Append rec UNLESS an identical finding is already recorded — dedup-on-write, so a
// looping agent can't spam the same finding 67×. Read-check-append happens INSIDE the
// O_EXCL lock, so it's race-safe across the parallel writers.
// ponytail: O(n) scan of the file per emit — fine at finding scale (dozens–hundreds);
// switch to an in-memory key index if a run ever emits thousands.
function lockedAppendUnique(file, rec) {
  const line = JSON.stringify(rec) + '\n'
  const lock = file + '.lock'
  for (let i = 0; i < 100; i++) {
    let fd
    try { fd = fs.openSync(lock, 'wx') }
    catch (e) {
      if (e.code !== 'EEXIST') throw e
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10000) fs.unlinkSync(lock) } catch {}
      sleepMs(20); continue
    }
    try {
      if (fs.existsSync(file)) {
        const want = findingKey(rec)
        for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
          if (!l) continue
          let o; try { o = JSON.parse(l) } catch { continue }
          if (findingKey(o) === want) return 'duplicate'
        }
      }
      fs.appendFileSync(file, line)
      return 'appended'
    } finally { try { fs.closeSync(fd) } catch {}; try { fs.unlinkSync(lock) } catch {} }
  }
  fs.appendFileSync(file, line) // lock never freed — append anyway (a lost finding is worse than a dup)
  return 'appended'
}

function resolveFile(args) {
  if (args.file && args.file !== true) return String(args.file) // explicit override (used by --selftest)
  const task = String(args.task || '').trim()
  if (!task) { process.stderr.write('emit-finding: --task <id> is required (or --file <path>)\n'); process.exit(2) }
  const INTEL = require('../paths').INTEL_ROOT
  return path.join(INTEL, `live-findings-${task}.jsonl`)
}

// Parse + score a CVSS 3.1 vector via the shared calculator (ui/cvss.js, node-mode).
// Returns the canonical vector, numeric score, and severity band, or null if absent/bad.
function cvssFrom(vector) {
  if (!vector || vector === true) return null
  try {
    const { cvss31, sevFromScore, parseVector } = require('../ui/cvss')
    const { score, vector: canon } = cvss31(parseVector(String(vector)))
    return { cvss_vector: canon, cvss_score: score, band: String(sevFromScore(score)).toLowerCase() }
  } catch { return null }
}

function buildRecord(args) {
  // A supplied CVSS vector is authoritative for the severity band (the number IS the
  // argument); --severity is the fallback when no vector is given.
  const cvss = cvssFrom(args.cvss)
  const rec = {
    id: 'F-' + crypto.randomUUID().slice(0, 8),
    agent: String(args.agent || 'AGENT').toUpperCase(),
    title: args.title && args.title !== true ? String(args.title).slice(0, 200) : '',
    type: normType(args.type),
    severity: cvss ? cvss.band : normSeverity(args.severity),
    cvss_vector: cvss ? cvss.cvss_vector : '',
    cvss_score: cvss ? cvss.cvss_score : null,
    url: args.url && args.url !== true ? String(args.url) : '',
    confidence: String(args.confidence || 'medium').toLowerCase(),
    details: args.details && args.details !== true ? String(args.details) : '',
    impact: args.impact && args.impact !== true ? String(args.impact) : '',
    reproduction: readMaybeFile(args.reproduction, args['reproduction-file']),
    payloads_tried: (() => { const f = readMaybeFile(args.payloads, args['payloads-file']); return f ? f.split('\n').map(s => s.trim()).filter(Boolean) : [] })(),
    relation: args.relation && args.relation !== true ? String(args.relation) : 'same-app',
    parent: args.parent && args.parent !== true ? String(args.parent) : '',
    auth: args.auth && args.auth !== true ? String(args.auth) : 'none',
    tested: listOf(args.tested),
    not_tested: listOf(args['not-tested']),
    emitted_at: new Date().toISOString(),
  }
  return rec
}

function main(argv) {
  const args = parseArgs(argv)
  const file = resolveFile(args)
  const rec = buildRecord(args)
  const result = lockedAppendUnique(file, rec) // dedup-on-write: identical finding → skipped
  if (result === 'duplicate') process.stdout.write(`finding ${rec.id} is a duplicate of one already recorded — skipped (dedup)\n`)
  else process.stdout.write(`finding ${rec.id} (${rec.type}/${rec.severity}) recorded\n`)
}

// ── self-check: 20 concurrent child appends with newline + backslash payloads ──
function selftest() {
  const assert = require('node:assert')
  const os = require('node:os')
  const cp = require('node:child_process')
  const tmp = path.join(os.tmpdir(), `emit-selftest-${process.pid}.jsonl`)
  const repro = path.join(os.tmpdir(), `emit-selftest-repro-${process.pid}.txt`)
  try { fs.unlinkSync(tmp) } catch {}
  fs.writeFileSync(repro, 'GET / HTTP/1.1\nHost: x\n\ngrep -E USER\\|PASS  # backslash + newlines that broke echo-JSON')
  const kids = []
  for (let i = 0; i < 20; i++) {
    kids.push(cp.spawn('node', [__filename, '--file', tmp, '--agent', 'TEST' + i, '--type', 'confirmed',
      '--severity', 'high', '--url', 'http://x/' + i, '--details', `finding ${i}\nwith an inline newline`,
      '--reproduction-file', repro], { stdio: 'ignore' }))
  }
  Promise.all(kids.map(k => new Promise(r => k.on('exit', r)))).then(() => {
    const lines = fs.readFileSync(tmp, 'utf8').split('\n').filter(Boolean)
    assert.strictEqual(lines.length, 20, `expected 20 lines, got ${lines.length} (interleave/loss)`)
    const objs = lines.map(l => JSON.parse(l)) // strict parse — throws on ANY corruption
    assert.ok(objs.every(o => o.reproduction.includes('\n')), 'multi-line reproduction newline lost')
    assert.ok(objs.every(o => o.reproduction.includes('USER\\|PASS')), 'backslash content lost')
    assert.ok(objs.every(o => o.details.includes('\n')), 'inline-newline details flattened')
    // dedup-on-write: emit the SAME finding 5× → only 1 line lands
    const dupFile = path.join(os.tmpdir(), `emit-dedup-${process.pid}.jsonl`)
    try { fs.unlinkSync(dupFile) } catch {}
    const dupKids = []
    for (let i = 0; i < 5; i++) {
      dupKids.push(cp.spawn('node', [__filename, '--file', dupFile, '--agent', 'SENTRY', '--type', 'confirmed',
        '--severity', 'medium', '--details', 'Unauthenticated Flow Execution', '--reproduction', 'POST /api/v1/flow'], { stdio: 'ignore' }))
    }
    Promise.all(dupKids.map(k => new Promise(r => k.on('exit', r)))).then(() => {
      const dl = fs.readFileSync(dupFile, 'utf8').split('\n').filter(Boolean)
      assert.strictEqual(dl.length, 1, `dedup: expected 1 line for 5 identical emits, got ${dl.length}`)
      try { fs.unlinkSync(tmp); fs.unlinkSync(repro); fs.unlinkSync(dupFile) } catch {}
      console.log('ok — 20/20 concurrent appends clean; newlines + backslashes preserved; dedup collapses 5 identical → 1')
    }).catch(e => { console.error('dedup selftest FAILED:', e.message); process.exit(1) })
  }).catch(e => { console.error('selftest FAILED:', e.message); process.exit(1) })
}

if (require.main === module) {
  if (process.argv.includes('--selftest')) selftest()
  else main(process.argv.slice(2))
}

module.exports = { buildRecord, normSeverity, normType, lockedAppend, lockedAppendUnique, findingKey }
