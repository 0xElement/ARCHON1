// test/report-stream.test.js
// P7 — Block R continuous report + the CATEGORICAL inclusion gate (ULTRAPLAN §5.6,
// audit Issue 2): every CONFIRMED finding is included at ANY quality_level.

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')

const rs = require('../src/pipeline/report-stream')
const ec = require('../src/pipeline/evidence-completeness')

const findings = [
  { id: 'F-1', title: 'SQLi', severity: 'Critical', validation_status: 'CONFIRMED', reproduction_result: 'HTTP 500', quality_level: 'L2' },
  { id: 'F-2', title: 'Source-only secret', severity: 'High', validation_status: 'CONFIRMED', file: 'config.rb', quality_level: 'L1' }, // L1 CONFIRMED
  { id: 'F-3', title: 'Maybe XSS', severity: 'Medium', validation_status: 'NEEDS-LIVE', quality_level: 'L0' },
  { id: 'F-4', title: 'Test artifact', severity: 'Info', validation_status: 'KILLED' },
]

test('ISSUE 2: meetsReportInclusion includes EVERY CONFIRMED finding at any quality_level (incl. L1)', () => {
  assert.equal(ec.meetsReportInclusion(findings[0]).include, true)
  assert.equal(ec.meetsReportInclusion(findings[1]).include, true, 'L1 source-only CONFIRMED must still be included')
  assert.equal(ec.meetsReportInclusion(findings[2]).include, false, 'NEEDS-LIVE not in main report')
  assert.equal(ec.meetsReportInclusion(findings[3]).include, false, 'KILLED excluded')
})

test('reportContentDigest cites exactly the CONFIRMED set (drops ZERO confirmed)', () => {
  const d = rs.reportContentDigest(findings)
  assert.equal(d.count, 2)
  assert.deepEqual(d.ids, ['F-1', 'F-2'])
  assert.deepEqual(d.severities, { Critical: 1, High: 1 })
})

test('assembleReport is idempotent (same findings → identical text)', () => {
  assert.equal(rs.assembleReport(findings), rs.assembleReport(findings))
})

test('digest is order-independent (parity is set-based, not list-order)', () => {
  const shuffled = [findings[3], findings[1], findings[0], findings[2]]
  assert.deepEqual(rs.reportContentDigest(shuffled).ids, rs.reportContentDigest(findings).ids)
})

test('fail-soft: empty / garbage input', () => {
  assert.deepEqual(rs.reportContentDigest([]).ids, [])
  assert.equal(typeof rs.assembleReport(null), 'string')
})

test('quality levels enum + deriveQualityLevelFallback', () => {
  assert.equal(ec.QUALITY_LEVELS.length, 5)
  assert.equal(ec.deriveQualityLevelFallback({ proof_of_execution: { confirmed: true }, chain_id: 'c', file: 'x' }), 'L4')
  assert.equal(ec.deriveQualityLevelFallback({ file: 'x' }), 'L1')
  assert.equal(ec.deriveQualityLevelFallback({}), 'L0')
})
