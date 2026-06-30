// test/coverage-map.test.js
//
// WSTG coverage map: category→owner lookup, finding→WSTG area mapping, and the
// covered/not-reached computation that drives the report's coverage section.

const assert = require('node:assert')
const { test } = require('node:test')
const { WSTG, ownerFor, wstgForFinding, computeCoverage, areaScore, coverageTable, checklistText } = require('../src/core/coverage-map')

test('every WSTG area has a name + owner', () => {
  assert.ok(WSTG.length >= 12)
  for (const w of WSTG) { assert.ok(w.id.startsWith('WSTG-')); assert.ok(w.name); assert.ok(Array.isArray(w.owner) && w.owner.length) }
})

test('ownerFor returns the owning specialists', () => {
  assert.deepStrictEqual(ownerFor('WSTG-ATHZ'), ['warden'])
  assert.deepStrictEqual(ownerFor('WSTG-APIT'), ['gateway'])
  assert.deepStrictEqual(ownerFor('nope'), [])
})

test('wstgForFinding maps class + title + agent to an area', () => {
  assert.strictEqual(wstgForFinding({ vuln_class: 'sqli' }), 'WSTG-INPV')
  assert.strictEqual(wstgForFinding({ title: 'IDOR on /api/invoices' }), 'WSTG-ATHZ')
  assert.strictEqual(wstgForFinding({ vuln_class: 'csrf' }), 'WSTG-CLNT')
  assert.strictEqual(wstgForFinding({ original_agent: 'keyring' }), 'WSTG-IDNT') // falls back to agent
})

test('computeCoverage reports covered + not_reached + percent', () => {
  const cov = computeCoverage(
    [{ vuln_class: 'sqli' }, { title: 'IDOR' }],   // → INPV, ATHZ
    ['sentry']                                     // → CONF, CRYP
  )
  assert.ok(cov.covered.includes('WSTG-INPV'))
  assert.ok(cov.covered.includes('WSTG-ATHZ'))
  assert.ok(cov.covered.includes('WSTG-CRYP'))
  assert.ok(cov.not_reached.some(a => a.id === 'WSTG-BUSL')) // nothing touched business logic
  assert.strictEqual(cov.total, WSTG.length)
  assert.ok(cov.percent > 0 && cov.percent < 100)
})

test('empty input → 0% covered, all not_reached', () => {
  const cov = computeCoverage([], [])
  assert.strictEqual(cov.covered.length, 0)
  assert.strictEqual(cov.not_reached.length, WSTG.length)
  assert.strictEqual(cov.percent, 0)
})

test('checklistText lists every area with owners', () => {
  const t = checklistText()
  assert.match(t, /WSTG-ATHZ Authorization → warden/)
  assert.match(t, /WSTG-INPV Input Validation/)
})

// ── handoff item 8: graded per-area coverage scoring ─────────────────────────
test('areaScore: signal model — not reached / exercised / with evidence', () => {
  assert.strictEqual(areaScore({ exercised: false, findingCount: 0 }), 0)        // untouched
  assert.strictEqual(areaScore({ exercised: true, findingCount: 0 }), 60)        // owner ran, nothing surfaced
  assert.strictEqual(areaScore({ exercised: true, findingCount: 1 }), 80)        // + one finding
  assert.strictEqual(areaScore({ exercised: true, findingCount: 5 }), 100)       // capped
  assert.strictEqual(areaScore({ exercised: false, findingCount: 1 }), 50)       // touched by a finding only
})

test('areaScore: precise model when sub-checks are known (Authentication: 90%)', () => {
  assert.strictEqual(areaScore({ attempted: 9, total: 10 }), 90)
  assert.strictEqual(areaScore({ attempted: 10, total: 10 }), 100)
  assert.strictEqual(areaScore({ attempted: 0, total: 10 }), 0)
})

test('computeCoverage exposes per-area scores + weighted depth', () => {
  const cov = computeCoverage([{ vuln_class: 'sqli' }, { vuln_class: 'sqli' }], ['keyring']) // INPV findings; keyring→IDNT/ATHN/SESS
  const inpv = cov.areas.find(a => a.id === 'WSTG-INPV')
  assert.strictEqual(inpv.findings, 2)
  assert.ok(inpv.percent >= 70 && inpv.status !== 'not-reached')
  const athn = cov.areas.find(a => a.id === 'WSTG-ATHN')
  assert.strictEqual(athn.percent, 60) // exercised by keyring, no findings
  const busl = cov.areas.find(a => a.id === 'WSTG-BUSL')
  assert.strictEqual(busl.percent, 0)
  assert.strictEqual(busl.status, 'not-reached')
  assert.ok(cov.weighted_percent > 0 && cov.weighted_percent < 100)
  assert.strictEqual(cov.areas.length, WSTG.length)
})

test('coverageTable renders "<area>: <pct>%" lines', () => {
  const cov = computeCoverage([{ vuln_class: 'sqli' }], ['keyring'])
  const t = coverageTable(cov)
  assert.match(t, /Authentication: 60%/)
  assert.match(t, /Business Logic: 0% \(not reached\)/)
  assert.match(t, /Overall depth: \d+%/)
})
