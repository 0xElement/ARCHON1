'use strict'
// M5: deduped candidate index + black-box validation queue (audit artifacts).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { buildCandidateIndex, buildValidationQueue, renderIndexMd, renderQueueMd } = require('../src/pipeline/candidate-index')

const cands = [
  { feature: 'orders', cwe: 'access-control', file: 'app/orders.rb', line: 42, severity: 'High', status: 'NEEDS_LIVE_VALIDATION', source: 'p', sink: 's', required_blackbox_proof: 'req /orders/2 as A', endpoint: 'GET /orders/:id' },
  { feature: 'orders', cwe: 'access-control', file: 'app/orders.rb', line: 42, severity: 'High', status: 'NEEDS_LIVE_VALIDATION', confidence: 90 }, // thinner dup
  { feature: 'search', cwe: 'sqli', file: 'app/search.rb', line: 7, severity: 'Critical', status: 'SOURCE_CONFIRMED', vulnerable_code: 'q' },
]

test('buildCandidateIndex: dedup by (class,file,line), worst-first, tier-aware representative', () => {
  const idx = buildCandidateIndex(cands)
  assert.equal(idx.length, 2, 'the (access-control, orders.rb:42) dup collapses')
  assert.equal(idx[0].severity, 'Critical', 'Critical sqli is CAND-1 (worst-first)')
  const ac = idx.find(c => c.vuln_class === 'access-control')
  assert.equal(ac.cand_id, 'CAND-2')
  assert.equal(ac.merge_count, 2)
  assert.equal(ac.required_blackbox_proof, 'req /orders/2 as A', 'richest rep (L3) keeps its required-proof, not the thin dup')
})

test('buildValidationQueue: only NEEDS-LIVE candidates, carrying the required live proof', () => {
  const q = buildValidationQueue(buildCandidateIndex(cands))
  assert.equal(q.length, 1)
  assert.equal(q[0].cand_id, 'CAND-2')
  assert.equal(q[0].required_proof, 'req /orders/2 as A')
})

test('render: markdown tables for the index + queue', () => {
  const idx = buildCandidateIndex(cands)
  assert.match(renderIndexMd(idx), /Candidate Findings Index/)
  assert.match(renderIndexMd(idx), /CAND-1/)
  assert.match(renderQueueMd(buildValidationQueue(idx)), /Required live proof/)
})
