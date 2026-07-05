'use strict'
// M1: shape a triaged streaming finding into a VALIDATED-FINDINGS record — the ONE place that decides
// source vs live. A source finding (file/line, no url) ALWAYS carries the source location +
// SOURCE_CONFIRMED and NEVER a url, so deriveConfirmationStatus (finding-schema.js) can never promote
// it to RUNTIME_CONFIRMED. A live finding keeps the url/method shape. Pure + tested because a wrong
// guess fabricates runtime proof for a source-only bug — the whole "never mark source-only as
// runtime-confirmed" rule lives here.

// A finding is source-shaped when it has a source location and NO live url.
function isSourceFinding(f) {
  return !!(f && typeof f === 'object' && !f.url && (f.file || f.code_block || f.vulnerable_code))
}

/**
 * Build the VALIDATED record from a triaged finding.
 * @param f the original live-findings record (the candidate)
 * @param d the triager's written detail object
 * @param meta { id, title, agent, taskId }
 */
function shapeStreamValidated(f, d, meta = {}) {
  d = d || {}; f = f || {}
  const { id, title, agent, taskId } = meta
  const base = {
    id, title: d.title || title, severity: d.severity || f.severity || 'Medium',
    validation_status: 'CONFIRMED', original_agent: agent,
    cvss_vector: d.cvss_vector || '', cvss_score: (typeof d.cvss_score === 'number' ? d.cvss_score : null),
    cwe: d.cwe || f.cwe || '', taskId: String(taskId), source: 'streaming-triage',
  }
  // Source finding → source shape, ALWAYS. Even if the triager tried to write a url/response, a
  // source candidate stays SOURCE_CONFIRMED with no url (that fabrication is exactly what this guards).
  if (isSourceFinding(f)) {
    const needsLive = d.confirmation_status === 'NEEDS_LIVE_VALIDATION'
    return {
      ...base,
      file: d.file || f.file || '', line: d.line ?? f.line ?? '',
      confirmation_status: needsLive ? 'NEEDS_LIVE_VALIDATION' : 'SOURCE_CONFIRMED',
      validation_status: needsLive ? 'NEEDS-LIVE' : 'CONFIRMED',
      // M4: carry the live-validation task so white-box source→runtime (buildSourceGuidance) can aim the
      // deferred pentest at this candidate with the specialist's own required evidence.
      required_blackbox_proof: d.required_blackbox_proof || f.required_blackbox_proof || '',
      affected_endpoint: d.endpoint || f.endpoint || '',
    }
  }
  return { ...base, url: f.url || d.url || '', method: f.method || '' }
}

module.exports = { isSourceFinding, shapeStreamValidated }

// self-check: the #1 M1 risk — a source finding can NEVER carry a url / become RUNTIME_CONFIRMED.
if (require.main === module) {
  const assert = require('node:assert')
  const meta = { id: 'T-1', title: 't', agent: 'CIPHER', taskId: 'task-1' }
  const src = { agent: 'cipher', file: 'app.rb', line: 3, severity: 'High' }
  const r1 = shapeStreamValidated(src, { title: 'IDOR', severity: 'High' }, meta)
  assert.strictEqual(r1.url, undefined, 'source record must NOT carry a url')
  assert.strictEqual(r1.confirmation_status, 'SOURCE_CONFIRMED', 'source → SOURCE_CONFIRMED')
  assert.strictEqual(r1.file, 'app.rb', 'source location preserved')
  // even if the triager fabricates a url in its detail, a source finding stays source-shaped
  const r2 = shapeStreamValidated(src, { url: 'https://evil.test', title: 'x' }, meta)
  assert.strictEqual(r2.url, undefined, 'fabricated url on a source finding is DROPPED')
  assert.strictEqual(r2.confirmation_status, 'SOURCE_CONFIRMED', 'still SOURCE_CONFIRMED')
  // needs-live source candidate is demoted, not confirmed
  const r3 = shapeStreamValidated(src, { confirmation_status: 'NEEDS_LIVE_VALIDATION' }, meta)
  assert.strictEqual(r3.validation_status, 'NEEDS-LIVE', 'NEEDS_LIVE_VALIDATION → NEEDS-LIVE')
  // a live finding (has url) keeps the runtime shape
  const live = { agent: 'drill', url: 'https://x.test/a', method: 'POST', severity: 'Critical' }
  const r4 = shapeStreamValidated(live, { title: 'SQLi' }, meta)
  assert.strictEqual(r4.url, 'https://x.test/a', 'live record keeps its url')
  assert.strictEqual(r4.confirmation_status, undefined, 'live record status derived downstream, not forced here')
  console.log('ok — stream-record: source stays SOURCE_CONFIRMED (never a url), live keeps runtime shape')
}
