// common/schemas/mapping.js
//
// The enum-mapping + ID layer that wires ARCHON's authoritative records onto the
// Autonomous Agent OS canonical objects. ARCHON enums are AUTHORITATIVE; spec
// enums are DERIVED LABELS. Hard invariants (asserted by tests):
//   - this module NEVER writes/alters `validation_status` (only reads it).
//   - `quality_level` is a LABEL, never a gate — it never demotes/excludes a
//     CONFIRMED finding (audit Issue 2).
// Dependency-free (crypto is stdlib); no ajv, no js-yaml (invariant 8).
// See ULTRAPLAN.md §2.3.

'use strict'

const crypto = require('crypto')
const findingSchema = require('../../agents/finding-schema')

const CANONICAL_SEVERITIES = findingSchema.CANONICAL_SEVERITIES || ['Info', 'Low', 'Medium', 'High', 'Critical']

// ── severity (ARCHON title-case ↔ spec lowercase) ──
function severityToSpec(title) { return String(title || '').toLowerCase() }
function severityFromSpec(lower) {
  const m = { info: 'Info', low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }
  return m[String(lower || '').toLowerCase()] || 'Medium'
}

// ── auditor status (validation_status ↔ spec auditor_status) ──
const _A2S = { CONFIRMED: 'validated', 'NEEDS-LIVE': 'needs_more_evidence', KILLED: 'rejected', SUSPECTED: 'pending' }
const _S2A = { validated: 'CONFIRMED', needs_more_evidence: 'NEEDS-LIVE', rejected: 'KILLED', pending: 'SUSPECTED' }
function auditorStatusToSpec(vs) { return _A2S[String(vs || '').toUpperCase()] || 'pending' }
function auditorStatusFromSpec(as) { return _S2A[String(as || '')] || 'SUSPECTED' }

// ── judge status ──
function judgeStatusToSpec(v) {
  const s = String(v || '').toLowerCase()
  if (s.includes('confirm') || s.includes('accept')) return 'accepted'
  if (s.includes('reject') || s.includes('kill')) return 'rejected'
  return 'pending'
}

// ── quality level (descriptive label; routes off evidence, never disagrees with the gate) ──
function deriveQualityLevel(finding) {
  const f = finding || {}
  const poc = f.proof_of_execution
  const chainBacked = !!(f.chain_verified || f.chain_id || f.part_of_chain)
  const hasLive = !!(f.reproduction_result || (poc && (poc.confirmed || poc.output)) ||
    (f.evidence_completeness && f.evidence_completeness !== 'local_only') || f.http_evidence)
  const hasSource = (Array.isArray(f.source_files) && f.source_files.length > 0) || !!f.file
  if (chainBacked && poc && poc.confirmed === true) return 'L4'
  if (hasLive && hasSource) return 'L3'
  if (hasLive) return 'L2'
  if (hasSource || ['pattern', 'freehand', 'scanner', 'source'].includes(f.source)) return 'L1'
  return 'L0'
}

function _inferSource(f) {
  if ((Array.isArray(f.source_files) && f.source_files.length > 0) || f.file) return 'source'
  if (f.original_agent) return 'specialist'
  return 'unknown'
}

// ── stable, idempotent ID synthesis (the only minted IDs) ──
function _sha1(s) { return crypto.createHash('sha1').update(String(s)).digest('hex') }
function synthesizeEvidenceId(candidateId, type, contentRef) {
  return `EV-${candidateId}-${_sha1(`${type}|${contentRef || ''}`).slice(0, 8)}`
}
function synthesizeCorrelationId(linkedIds) {
  const uniq = [...new Set((linkedIds || []).map(String))].sort()
  return `CORR-${_sha1(uniq.join(',')).slice(0, 10)}`
}

/**
 * Wrap an ARCHON finding into a canonical candidate_finding (superset; every
 * original field passes through). Reads validation_status to derive auditor_status
 * but NEVER writes/alters it. Auto-repair defaults never reject a legacy record.
 */
function toCandidateFinding(finding) {
  const f = findingSchema.normalizeFinding(finding || {}) // fresh object — input not mutated
  const candidate_id = f.id || (finding && finding.findingId) || `F-AUTO-${_sha1(JSON.stringify(f)).slice(0, 8)}`
  return {
    ...f, // passthrough superset (additionalProperties:true) — includes validation_status verbatim
    candidate_id,
    title: f.title || '(untitled)',
    severity: CANONICAL_SEVERITIES.includes(f.severity) ? f.severity : 'Medium',
    auditor_status: auditorStatusToSpec(f.validation_status),
    judge_status: judgeStatusToSpec(f.judge_verdict || f.judge_status),
    quality_level: deriveQualityLevel(f),
    source: f.source || _inferSource(f),
    confidence: f.confidence || 'medium',
    schemaVersion: f.schemaVersion || '1',
  }
}

// ── pattern output state (Block E) ↔ auditor status. NEVER writes validation_status. ──
const _STATE2AUDITOR = {
  matched_candidate: 'pending',
  needs_blackbox_validation: 'needs_more_evidence',
  needs_source_root_cause: 'needs_more_evidence',
  reviewed_no_issue: 'rejected',
  not_applicable: 'rejected',
  false_positive: 'rejected',
  duplicate: 'pending',
}
function mapPatternStateToAuditor(state) { return _STATE2AUDITOR[String(state || '')] || 'pending' }
function mapDispositionToPatternState(disposition) {
  const d = String(disposition || '').toUpperCase()
  if (d === 'CONFIRMED') return 'matched_candidate'
  if (d === 'NEEDS-LIVE') return 'needs_blackbox_validation'
  if (d === 'KILLED' || d === 'DISPROVEN') return 'false_positive'
  if (d === 'SUSPECTED') return 'needs_source_root_cause'
  return 'matched_candidate'
}

// task.mode from dispatch facts (mirrors engagement-mode classifier vocabulary).
function taskModeFrom({ squad, hasSource, hasLive }) {
  const sq = String(squad || '').replace(/-squad$/, '')
  if (sq === 'code-review') return hasLive ? 'whitebox' : 'static'
  if (sq === 'pentest') return hasSource ? 'whitebox' : 'blackbox'
  return 'blackbox'
}

module.exports = {
  CANONICAL_SEVERITIES,
  severityToSpec, severityFromSpec,
  auditorStatusToSpec, auditorStatusFromSpec,
  judgeStatusToSpec,
  deriveQualityLevel,
  synthesizeEvidenceId, synthesizeCorrelationId,
  toCandidateFinding,
  taskModeFrom,
  mapPatternStateToAuditor,
  mapDispositionToPatternState,
}
