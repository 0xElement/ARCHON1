// test/parity-correlation-records.test.js
// P5 — Block F typed correlation + chain records (ULTRAPLAN §5.5). Records mirror
// cross-view-dedup decisions; the advisory delta NEVER weakens the evidence gate.

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')

const cr = require('../src/pipeline/correlation-records')
const { validate } = require('../common/schemas/validate')
const correlationSchema = require('../common/schemas/correlation.schema.json')
const chainSchema = require('../common/schemas/chain.schema.json')
const { correlate } = require('../src/pipeline/cross-view-dedup')

test('correlation records mirror cross-view-dedup decisions (parity) and validate', () => {
  const map = {
    exact_duplicate_groups: [{ vuln_class: 'xss', members: ['F-1', 'F-2'], keep: 'F-1' }],
    cross_view_candidates: [{ vuln_class: 'access-control', whitebox: [{ id: 'WB-1' }], blackbox: [{ id: 'BB-1' }] }],
  }
  const recs = cr.buildCorrelationRecords(map)
  assert.equal(recs.length, 2)
  const dup = recs.find(r => r.correlation_type === 'duplicate')
  const xview = recs.find(r => r.correlation_type === 'source_to_blackbox')
  assert.deepEqual(dup.linked_items.sort(), ['F-1', 'F-2'])
  assert.deepEqual(xview.linked_items.sort(), ['BB-1', 'WB-1'])
  for (const r of recs) assert.deepEqual(validate(correlationSchema, r), [], `record invalid: ${JSON.stringify(r)}`)
})

test('HARD-GATE INVARIANT: building records never mutates a finding or its validation_status', () => {
  const findingsById = { 'BB-1': { id: 'BB-1', validation_status: 'NEEDS-LIVE', title: 'x' } }
  const before = JSON.parse(JSON.stringify(findingsById))
  cr.buildCorrelationRecords({ cross_view_candidates: [{ vuln_class: 'x', whitebox: [], blackbox: [{ id: 'BB-1' }] }] }, findingsById)
  assert.deepEqual(findingsById, before, 'findings must not be mutated by record building')
})

test('confidence_delta is advisory and clamped to [-0.3, +0.3]', () => {
  const conflictDelta = cr._correlationDelta('conflict', [])
  assert.equal(conflictDelta, -0.3)
  const agree = cr._correlationDelta('source_to_blackbox', [{ validation_status: 'CONFIRMED' }])
  assert.ok(agree <= 0.3 && agree > 0)
})

test('correlation_id is idempotent regardless of order/dupes', () => {
  const a = cr.buildCorrelationRecords({ exact_duplicate_groups: [{ vuln_class: 'x', members: ['F-2', 'F-1'] }] })
  const b = cr.buildCorrelationRecords({ exact_duplicate_groups: [{ vuln_class: 'x', members: ['F-1', 'F-2', 'F-1'] }] })
  assert.equal(a[0].correlation_id, b[0].correlation_id)
})

test('chain records carry finding_ids (≥1), confidence, missing_proof; validate against schema', () => {
  const chainResults = [
    { id: 'C1', name: 'verified chain', severity: 'High', finding_ids: ['F-1', 'F-2'], verified: true, stepResults: [{ step_id: 1, matched: true }] },
    { id: 'C2', name: 'partial', severity: 'Medium', finding_ids: ['F-3'], verified: false, stepResults: [{ step_id: 1, matched: true }, { step_id: 2, matched: false, match_failure: { reason: 'no 200' } }] },
    { id: 'C3', name: 'orphan', severity: 'Low', finding_ids: [] }, // dropped — needs ≥1 backing id
  ]
  const recs = cr.buildChainRecords(chainResults)
  assert.equal(recs.length, 2, 'orphan chain (no finding_ids) is dropped')
  const c1 = recs.find(r => r.chain_id === 'C1')
  const c2 = recs.find(r => r.chain_id === 'C2')
  assert.equal(c1.current_confidence, 'high')
  assert.equal(c2.current_confidence, 'medium')
  assert.deepEqual(c2.missing_proof, ['no 200'])
  for (const r of recs) assert.deepEqual(validate(chainSchema, r), [], `chain record invalid: ${JSON.stringify(r)}`)
})

test('recommended_next_task is a PROPOSAL object (no task_id yet — Block A back-fills)', () => {
  const recs = cr.buildCorrelationRecords({ cross_view_candidates: [{ vuln_class: 'idor', whitebox: [{ id: 'WB-1' }], blackbox: [{ id: 'BB-1' }] }] })
  const t = recs[0].recommended_next_task
  assert.ok(t && t.mode && t.type && t.objective)
  assert.ok(!('task_id' in t), 'proposal must not pretend to have a task_id')
})
