// src/pipeline/correlation-records.js
//
// Block F — typed correlation + attack-chain records. Formalizes ARCHON's existing
// (implicit) correlation/chain substance into first-class records the Mission
// Director can act on and the Knowledge Graph can store. PURE + read-only over
// findings/chains. confidence_delta / current_confidence are ADVISORY, derived
// from EXISTING signals only — this module NEVER calls enforceContract and NEVER
// writes/alters validation_status (the categorical evidence gate is untouched).
// See ULTRAPLAN.md §5.5.

'use strict'

const mapping = require('../../common/schemas/mapping')

function _clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)) }

// Advisory delta in [-0.3, +0.3]. Source↔live agreement nudges up; a contradiction down.
function _correlationDelta(type, linkedFindings) {
  if (type === 'conflict') return -0.3
  if (type === 'duplicate') return 0.1
  // cross-view: both a source and a live member that agree ⇒ +0.3
  const hasConfirmed = linkedFindings.some(f => String(f && f.validation_status || '').toUpperCase() === 'CONFIRMED')
  return _clamp(hasConfirmed ? 0.3 : 0.15, -0.3, 0.3)
}

function _summaryFor(type, vulnClass) {
  switch (type) {
    case 'duplicate': return `Duplicate ${vulnClass} finding across views/iterations`
    case 'source_to_blackbox': return `Source ${vulnClass} candidate corroborated by a live finding`
    case 'blackbox_to_source': return `Live ${vulnClass} finding root-caused in source`
    case 'conflict': return `Conflicting verdicts for ${vulnClass}`
    default: return `${type} ${vulnClass}`
  }
}

// recommended_next_task is a PROPOSAL object (no task_id yet — Block A back-fills it).
function _recommendNext(type, vulnClass, linkedItems) {
  if (type === 'source_to_blackbox') {
    return { mode: 'whitebox', type: 'validate.source_candidate_live', vuln_class: vulnClass, targets: linkedItems,
      objective: `Fire a live proof for the source ${vulnClass} candidate(s)` }
  }
  if (type === 'blackbox_to_source') {
    return { mode: 'whitebox', type: 'rootcause.live_in_source', vuln_class: vulnClass, targets: linkedItems,
      objective: `Trace the live ${vulnClass} finding to its source root cause` }
  }
  return null
}

/**
 * Build typed Correlation records from a cross-view-dedup correlation map.
 * @param correlationMap output of cross-view-dedup.buildCorrelationMap
 * @param findingsById optional {id: finding} for confidence derivation
 * @returns Correlation[] (schema: common/schemas/correlation.schema.json)
 */
function buildCorrelationRecords(correlationMap, findingsById = {}) {
  const out = []
  const map = correlationMap || {}
  const lookup = (id) => findingsById[id] || null

  for (const g of (map.exact_duplicate_groups || [])) {
    const linked = (g.members || []).map(String)
    if (linked.length < 1) continue
    const type = 'duplicate'
    out.push({
      correlation_id: mapping.synthesizeCorrelationId(linked),
      linked_items: linked,
      correlation_type: type,
      confidence_delta: _correlationDelta(type, linked.map(lookup)),
      summary: _summaryFor(type, g.vuln_class || 'finding'),
      schemaVersion: '1',
    })
  }

  for (const cand of (map.cross_view_candidates || [])) {
    const wb = (cand.whitebox || []).map(x => String(x.id))
    const bb = (cand.blackbox || []).map(x => String(x.id))
    const linked = [...wb, ...bb]
    if (linked.length < 1) continue
    const type = 'source_to_blackbox' // both directions are represented by the linked set
    out.push({
      correlation_id: mapping.synthesizeCorrelationId(linked),
      linked_items: linked,
      correlation_type: type,
      confidence_delta: _correlationDelta(type, linked.map(lookup)),
      summary: _summaryFor(type, cand.vuln_class || 'finding'),
      recommended_next_task: _recommendNext(type, cand.vuln_class || 'finding', linked),
      schemaVersion: '1',
    })
  }
  return out
}

// Derived chain confidence from existing verification signals only.
function _chainConfidence(chain) {
  if (chain && chain.verified === true) return 'high'
  const steps = (chain && chain.stepResults) || []
  const matched = steps.filter(s => s && s.matched).length
  if (steps.length && matched === steps.length) return 'high'
  if (matched > 0) return 'medium'
  return 'low'
}

function _missingProof(chain) {
  const steps = (chain && chain.stepResults) || []
  return steps.filter(s => s && s.matched === false)
    .map(s => (s.match_failure && (s.match_failure.reason || s.match_failure.expected)) || `step ${s.step_id || '?'} unproven`)
}

/**
 * Build typed Chain records from chain results (chain-verifier output projection).
 * @returns Chain[] (schema: common/schemas/chain.schema.json)
 */
function buildChainRecords(chainResults) {
  const out = []
  for (const ch of (chainResults || [])) {
    const finding_ids = Array.isArray(ch.finding_ids) ? ch.finding_ids.filter(Boolean).map(String) : []
    if (finding_ids.length < 1) continue // schema requires ≥1 backing id
    const missing = _missingProof(ch)
    const rec = {
      chain_id: String(ch.id || ch.chain_id || ch.name || 'chain'),
      name: ch.name || '',
      severity: ch.severity || 'Unknown',
      finding_ids,
      steps: ch.stepResults || ch.steps || [],
      current_confidence: _chainConfidence(ch),
      missing_proof: missing,
      schemaVersion: '1',
    }
    // only present when there IS a gap (schema next_validation_task is type:object — never null)
    if (missing.length) rec.next_validation_task = { mode: 'blackbox', type: 'prove.chain_step', chain: String(ch.id || ch.name || ''), objective: 'Obtain the missing chain-step proof' }
    out.push(rec)
  }
  return out
}

module.exports = { buildCorrelationRecords, buildChainRecords, _correlationDelta, _chainConfidence, _missingProof }
