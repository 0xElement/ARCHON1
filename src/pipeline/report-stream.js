// src/pipeline/report-stream.js
//
// Block R — continuous (streaming) report assembler. DETERMINISTIC, no-LLM,
// idempotent. Keyed on the live→VALIDATED→JUDGED JSONL streams the pipeline
// already writes. Terminal SCRIBE stays authoritative until parity; this builds
// the same content-digest in parallel for the shadow diff. Report inclusion is
// CATEGORICAL (every CONFIRMED finding, any quality_level — audit Issue 2).
// See ULTRAPLAN.md §5.6.

'use strict'

const shadowSink = require('../shadow/shadow-sink')
const { meetsReportInclusion } = require('./evidence-completeness')

const SECTION_ORDER = Object.freeze(['summary', 'findings', 'coverage', 'evidence', 'appendix'])
const SEV_ORDER = ['Critical', 'High', 'Medium', 'Low', 'Info']
function _sevRank(s) { const i = SEV_ORDER.indexOf(String(s || 'Info')); return i < 0 ? SEV_ORDER.length : i }

// Deterministic content digest = the set of report-INCLUDED findings + severities
// + coverage rows. Parity with terminal SCRIBE is "same cited findings", not byte prose.
function reportContentDigest(findings, opts = {}) {
  const included = (findings || []).filter(f => meetsReportInclusion(f, opts).include)
  const ids = included.map(f => String(f.id || f.candidate_id || '')).filter(Boolean).sort()
  const severities = {}
  for (const f of included) { const s = f.severity || 'Info'; severities[s] = (severities[s] || 0) + 1 }
  return { count: included.length, ids, severities }
}

// Deterministic markdown assembly (idempotent — same findings → identical text).
function assembleReport(findings, opts = {}) {
  const included = (findings || []).filter(f => meetsReportInclusion(f, opts).include)
    .slice().sort((a, b) => _sevRank(a.severity) - _sevRank(b.severity) || String(a.id || '').localeCompare(String(b.id || '')))
  const digest = reportContentDigest(findings, opts)
  const lines = []
  lines.push('# Report (streaming)')
  lines.push('')
  lines.push('## Summary')
  lines.push(`Confirmed findings: ${digest.count}`)
  lines.push(SEV_ORDER.filter(s => digest.severities[s]).map(s => `- ${s}: ${digest.severities[s]}`).join('\n') || '- (none)')
  lines.push('')
  lines.push('## Findings')
  for (const f of included) {
    lines.push(`### [${f.severity || 'Info'}] ${f.title || f.id} (${f.id || ''})`)
    if (f.quality_level) lines.push(`_quality: ${f.quality_level}_`)
    lines.push('')
  }
  return lines.join('\n')
}

// Shadow-only stream hook. flag-gated by the caller; writes to the shadow sink only.
function appendStream(engagementId, section, payload) {
  try { shadowSink.append(engagementId, 'report-stream.jsonl', { ts: new Date().toISOString(), section, payload }) } catch { /* fail-soft */ }
}

module.exports = { SECTION_ORDER, reportContentDigest, assembleReport, appendStream }
