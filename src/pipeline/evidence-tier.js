'use strict'
// M5: evidence QUALITY tiers L0–L4 (replaces the binary has-evidence/not) + a per-confirmation-level
// policy — a finding may only claim a confirmation level its evidence actually supports. Pure + tested.
// Composes the existing gates: hasRuntimeProof (finding-schema) and hasEvidence (evidence-contract).
//
//   L0 no evidence · L1 a located claim (file OR an evidence blurb) · L2 file:line + a code block or
//   source→sink · L3 L2 + a replayable trace / required-proof · L4 runtime-proven (url + captured response)

const { hasRuntimeProof } = require('../../agents/finding-schema')
const { hasEvidence } = require('./evidence-contract')

const TIER_RANK = Object.freeze({ L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 })
const HIGH_IMPACT = new Set(['rce', 'sqli', 'command-injection', 'deserialization', 'ssrf', 'access-control', 'account-takeover', 'path-traversal'])

function _nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0 }
function _hasLoc(f) { return _nonEmpty(f.file) && f.line != null && String(f.line).trim() !== '' }
function _hasCode(f) { return _nonEmpty(f.vulnerable_code) || _nonEmpty(f.code_block) || (_nonEmpty(f.source) && _nonEmpty(f.sink)) }
function _hasTrace(f) { return hasEvidence(f) || _nonEmpty(f.required_blackbox_proof) || (Array.isArray(f.source_trace) && f.source_trace.length > 0) }

// Classify a finding's evidence quality → 'L0'..'L4'.
function evidenceTier(f) {
  if (!f || typeof f !== 'object') return 'L0'
  if (hasRuntimeProof(f)) return 'L4'
  const code = _hasCode(f), loc = _hasLoc(f), trace = _hasTrace(f)
  if ((code || loc) && trace) return 'L3'
  if (code && loc) return 'L2'
  if (loc || _nonEmpty(f.file) || _nonEmpty(f.evidence)) return 'L1'
  return 'L0'
}

// The minimum tier a finding needs to justify its CLAIMED confirmation level. Runtime confirmation
// always needs runtime proof (L4). Source confirmation needs file:line + code (L2), or a trace (L3)
// for high-impact classes. A needs-live hypothesis needs at least a located claim (L1).
function minTierFor(confirmation_status, vuln_class) {
  if (confirmation_status === 'RUNTIME_CONFIRMED') return 'L4'
  if (confirmation_status === 'SOURCE_CONFIRMED') return HIGH_IMPACT.has(vuln_class) ? 'L3' : 'L2'
  if (confirmation_status === 'NEEDS_LIVE_VALIDATION') return 'L1'
  return 'L0'
}

// Does the finding's evidence meet the policy for its claimed confirmation level?
function meetsEvidencePolicy(f) {
  if (!f || typeof f !== 'object') return true
  const need = minTierFor(f.confirmation_status, f.cwe || f.vuln_class)
  return TIER_RANK[evidenceTier(f)] >= TIER_RANK[need]
}

module.exports = { evidenceTier, minTierFor, meetsEvidencePolicy, TIER_RANK, HIGH_IMPACT }

// self-check
if (require.main === module) {
  const assert = require('node:assert')
  assert.strictEqual(evidenceTier({}), 'L0')
  assert.strictEqual(evidenceTier({ file: 'a.rb' }), 'L1')
  assert.strictEqual(evidenceTier({ file: 'a.rb', line: 3, vulnerable_code: 'User.find(params[:id])' }), 'L2')
  assert.strictEqual(evidenceTier({ file: 'a.rb', line: 3, source: 'p', sink: 's', required_blackbox_proof: 'x' }), 'L3')
  assert.strictEqual(evidenceTier({ url: 'https://x/a', reproduction_response: 'HTTP/1.1 200 leaked' }), 'L4')
  // policy: SOURCE_CONFIRMED high-impact (sqli) needs L3; an L2 record fails
  assert.strictEqual(meetsEvidencePolicy({ confirmation_status: 'SOURCE_CONFIRMED', cwe: 'sqli', file: 'a.rb', line: 1, vulnerable_code: 'q' }), false, 'sqli L2 < required L3')
  assert.strictEqual(meetsEvidencePolicy({ confirmation_status: 'SOURCE_CONFIRMED', cwe: 'sqli', file: 'a.rb', line: 1, source: 'p', sink: 's', required_blackbox_proof: 'x' }), true, 'sqli L3 ok')
  // policy: SOURCE_CONFIRMED low-impact (xss) only needs L2
  assert.strictEqual(meetsEvidencePolicy({ confirmation_status: 'SOURCE_CONFIRMED', cwe: 'xss', file: 'a.rb', line: 1, vulnerable_code: 'q' }), true, 'xss L2 ok')
  // policy: RUNTIME_CONFIRMED needs L4 (a source-only record fails)
  assert.strictEqual(meetsEvidencePolicy({ confirmation_status: 'RUNTIME_CONFIRMED', file: 'a.rb', line: 1, vulnerable_code: 'q' }), false, 'runtime claim without runtime proof fails')
  console.log('ok — evidence-tier: L0–L4 classification + per-confirmation-level policy')
}
