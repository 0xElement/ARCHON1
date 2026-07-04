// src/core/coverage-map.js
//
// The WSTG A-Z coverage map (code source of truth; the human/agent-readable copy
// is common/taxonomy/owasp_wstg.yaml). Lets the strategist walk every test
// category against the fingerprint, and lets the report show what was exercised
// vs not reached. Pure — no deps, no I/O.

'use strict'

// id → { name, owner[] }. Mirrors common/taxonomy/owasp_wstg.yaml.
const WSTG = [
  { id: 'WSTG-INFO', name: 'Information Gathering', owner: ['scout', 'tracer'] },
  { id: 'WSTG-CONF', name: 'Configuration & Deployment', owner: ['scout', 'sentry'] },
  { id: 'WSTG-IDNT', name: 'Identity Management', owner: ['keyring'] },
  { id: 'WSTG-ATHN', name: 'Authentication', owner: ['keyring'] },
  { id: 'WSTG-ATHZ', name: 'Authorization', owner: ['warden'] },
  { id: 'WSTG-SESS', name: 'Session Management', owner: ['keyring'] },
  { id: 'WSTG-INPV', name: 'Input Validation', owner: ['viper', 'drill', 'relay', 'vault', 'spectre', 'ranger', 'forge'] },
  { id: 'WSTG-ERRH', name: 'Error Handling', owner: ['all'] },
  { id: 'WSTG-CRYP', name: 'Cryptography', owner: ['sentry'] },
  { id: 'WSTG-BUSL', name: 'Business Logic', owner: ['ledger'] },
  { id: 'WSTG-CLNT', name: 'Client-Side', owner: ['decoy', 'viper'] },
  { id: 'WSTG-APIT', name: 'API Testing', owner: ['gateway'] },
]
const BY_ID = Object.fromEntries(WSTG.map(w => [w.id, w]))

// vuln_class / finding-type → WSTG area.
const CLASS_TO_WSTG = {
  xss: 'WSTG-INPV', sqli: 'WSTG-INPV', 'sql injection': 'WSTG-INPV', nosql: 'WSTG-INPV',
  'command-injection': 'WSTG-INPV', 'command injection': 'WSTG-INPV', rce: 'WSTG-INPV', ldap: 'WSTG-INPV',
  ssrf: 'WSTG-INPV', xxe: 'WSTG-INPV', ssti: 'WSTG-INPV', lfi: 'WSTG-INPV', 'path-traversal': 'WSTG-INPV',
  crlf: 'WSTG-INPV', 'header-injection': 'WSTG-INPV',
  idor: 'WSTG-ATHZ', 'access-control': 'WSTG-ATHZ', bola: 'WSTG-ATHZ', authorization: 'WSTG-ATHZ',
  auth: 'WSTG-ATHN', authentication: 'WSTG-ATHN', 'account-takeover': 'WSTG-ATHN',
  session: 'WSTG-SESS', jwt: 'WSTG-SESS',
  csrf: 'WSTG-CLNT', clickjacking: 'WSTG-CLNT', 'dom-xss': 'WSTG-CLNT', cors: 'WSTG-CLNT', redirect: 'WSTG-CLNT',
  'business-logic': 'WSTG-BUSL', api: 'WSTG-APIT', graphql: 'WSTG-APIT',
  crypto: 'WSTG-CRYP', tls: 'WSTG-CRYP',
  'info-disclosure': 'WSTG-ERRH', 'information-disclosure': 'WSTG-ERRH', secrets: 'WSTG-CONF',
}

// vuln_class → pattern-catalog descriptor file (Autonomous Agent OS Block E).
// PURE const — no I/O here (the actual catalog read lives in src/intel/pattern-catalog.js);
// this only declares which class maps to which catalog so coverage stays a deps-free module.
const CATALOG_BY_CLASS = {
  'access-control': 'access-control.json', idor: 'access-control.json',
  xss: 'xss.json', sqli: 'sqli.json', ssrf: 'ssrf.json', rce: 'rce.json',
  'account-takeover': 'account-takeover.json',
}

// agent name → WSTG area(s) it exercises.
const AGENT_TO_WSTG = {}
for (const w of WSTG) for (const a of w.owner) { if (a !== 'all') (AGENT_TO_WSTG[a] = AGENT_TO_WSTG[a] || []).push(w.id) }

function ownerFor(id) { return (BY_ID[id] && BY_ID[id].owner) || [] }

function wstgForFinding(f) {
  const cls = String(f && (f.vuln_class || f.type || f.title) || '').toLowerCase()
  for (const [k, v] of Object.entries(CLASS_TO_WSTG)) if (cls.includes(k)) return v
  // fall back to the agent that produced it
  const ag = String(f && (f.original_agent || f.agent) || '').toLowerCase()
  const areas = AGENT_TO_WSTG[ag]
  return areas && areas.length ? areas[0] : ''
}

// Per-area coverage SCORE (handoff item 8 — "Authentication: 90%"). Two modes:
//   precise — caller knows how many WSTG sub-checks it attempted vs the area total
//             (attemptedByArea[id] = {attempted, total}); % = attempted/total.
//   signal  — no sub-check tracking: an area is EXERCISED when its owner agent ran
//             (base credit: "tested, nothing surfaced yet") and earns depth credit
//             per finding, capped at 100. A finding with no owner-run still counts
//             as touched. This is an honest proxy, not a claim of exhaustive testing.
const AREA_EXERCISED_BASE = 60   // owner ran, no evidence yet
const AREA_TOUCHED_BASE = 30     // a finding landed but the owner wave didn't run
const AREA_EVIDENCE_STEP = 20    // each finding (capped at 2) adds depth credit
function areaScore({ exercised, findingCount = 0, attempted, total }) {
  if (Number.isFinite(attempted) && Number.isFinite(total) && total > 0) {
    return Math.round(Math.min(Math.max(attempted, 0), total) / total * 100)
  }
  if (!exercised && !findingCount) return 0
  const base = exercised ? AREA_EXERCISED_BASE : AREA_TOUCHED_BASE
  return Math.min(100, base + Math.min(findingCount, 2) * AREA_EVIDENCE_STEP)
}

// Which WSTG areas were exercised (by findings and/or agents that ran), PLUS a
// graded per-area coverage score.
//   findings: [{vuln_class|type|title, original_agent}], agentsRun: ['viper',...]
//   opts.attemptedByArea: { 'WSTG-ATHN': {attempted, total}, ... } (optional, precise mode)
function computeCoverage(findings = [], agentsRun = [], opts = {}) {
  const attemptedByArea = (opts && opts.attemptedByArea) || {}
  const ranAreas = new Set()
  for (const a of agentsRun || []) for (const id of (AGENT_TO_WSTG[String(a).toLowerCase()] || [])) ranAreas.add(id)
  const findingCountByArea = {}
  for (const f of findings || []) { const id = wstgForFinding(f); if (id) findingCountByArea[id] = (findingCountByArea[id] || 0) + 1 }

  const areas = WSTG.map(w => {
    const exercised = ranAreas.has(w.id)
    const findingCount = findingCountByArea[w.id] || 0
    const att = attemptedByArea[w.id] || {}
    const percent = areaScore({ exercised, findingCount, attempted: att.attempted, total: att.total })
    return {
      id: w.id, name: w.name, owner: w.owner,
      exercised, findings: findingCount, percent,
      status: percent === 0 ? 'not-reached' : percent >= 80 ? 'covered' : 'partial',
    }
  })

  // Binary covered set (back-compat): an area is "covered" if it scored anything.
  const coveredIds = areas.filter(a => a.percent > 0).map(a => a.id)
  const notReached = areas.filter(a => a.percent === 0)
  return {
    covered: coveredIds,
    not_reached: notReached.map(a => ({ id: a.id, name: a.name, owner: a.owner })),
    areas,
    total: WSTG.length,
    percent: Math.round((coveredIds.length / WSTG.length) * 100), // % of areas reached (unchanged meaning)
    weighted_percent: Math.round(areas.reduce((s, a) => s + a.percent, 0) / WSTG.length), // mean per-area depth
  }
}

// Compact A-Z checklist for prompt injection.
function checklistText() {
  return WSTG.map(w => `- ${w.id} ${w.name} → ${w.owner.join('/')}`).join('\n')
}

// Human-readable per-area table for reports: "Authentication: 90% (covered)".
function coverageTable(cov) {
  const areas = (cov && cov.areas) || []
  const lines = areas.map(a => `- ${a.name}: ${a.percent}%${a.status === 'not-reached' ? ' (not reached)' : a.status === 'partial' ? ' (partial)' : ''}`)
  if (cov && Number.isFinite(cov.weighted_percent)) lines.push(`\nOverall depth: ${cov.weighted_percent}% · areas reached: ${cov.percent}%`)
  return lines.join('\n')
}

module.exports = { WSTG, ownerFor, wstgForFinding, computeCoverage, areaScore, coverageTable, checklistText, CLASS_TO_WSTG, CATALOG_BY_CLASS }
