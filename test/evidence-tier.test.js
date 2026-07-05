'use strict'
// M5: L0–L4 evidence quality tiers + the per-confirmation-level evidence policy.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { evidenceTier, meetsEvidencePolicy, minTierFor } = require('../src/pipeline/evidence-tier')

test('evidenceTier classifies L0 → L4 by evidence richness', () => {
  assert.equal(evidenceTier({}), 'L0')
  assert.equal(evidenceTier({ file: 'a.rb' }), 'L1')
  assert.equal(evidenceTier({ file: 'a.rb', line: 3, vulnerable_code: 'q' }), 'L2')
  assert.equal(evidenceTier({ file: 'a.rb', line: 3, source: 'p', sink: 's', required_blackbox_proof: 'x' }), 'L3')
  assert.equal(evidenceTier({ url: 'https://x/a', reproduction_response: 'HTTP/1.1 200 leaked' }), 'L4')
})

test('minTierFor: runtime→L4, source high-impact→L3, source low→L2, needs-live→L1', () => {
  assert.equal(minTierFor('RUNTIME_CONFIRMED', 'xss'), 'L4')
  assert.equal(minTierFor('SOURCE_CONFIRMED', 'sqli'), 'L3')
  assert.equal(minTierFor('SOURCE_CONFIRMED', 'xss'), 'L2')
  assert.equal(minTierFor('NEEDS_LIVE_VALIDATION', 'xss'), 'L1')
})

test('meetsEvidencePolicy gates the claimed confirmation level by tier', () => {
  // a runtime claim with only source evidence fails
  assert.equal(meetsEvidencePolicy({ confirmation_status: 'RUNTIME_CONFIRMED', file: 'a', line: 1, vulnerable_code: 'q' }), false)
  // sqli source-confirmed needs a trace (L3); a bare code block (L2) fails
  assert.equal(meetsEvidencePolicy({ confirmation_status: 'SOURCE_CONFIRMED', cwe: 'sqli', file: 'a', line: 1, vulnerable_code: 'q' }), false)
  // xss source-confirmed only needs L2 → ok
  assert.equal(meetsEvidencePolicy({ confirmation_status: 'SOURCE_CONFIRMED', cwe: 'xss', file: 'a', line: 1, vulnerable_code: 'q' }), true)
})
