'use strict'
// P3: preserve streamed finding IDs across the authoritative AUDITOR overwrite. The streaming triager
// writes T-* records to VALIDATED-FINDINGS-<taskId>.jsonl DURING the run; the AUDITOR normalize then
// OVERWRITES that file with fresh CR-* records. Without this, the board's IDs churn T-*→CR-*, and any
// operator triage verdict keyed to a T-* id is orphaned. We match by SOURCE LOCATION (basename(file) |
// line — robust to absolute-vs-relative path forms) and restore the streamed id on the matching
// authoritative record, stamping superseded_id for the audit trail. Pure + tested.
const path = require('path')

// Location identity of a finding: file basename + line. basename() makes it robust to the streamed
// records' absolute paths (P1) vs the AUDITOR records' possibly-relative paths.
function locKey(f) {
  const file = String((f && f.file) || '').trim()
  if (!file) return ''
  return `${path.basename(file).toLowerCase()}|${(f.line != null && f.line !== '') ? f.line : ''}`
}

// Build location → streamed-id from the pre-overwrite (streaming-triage) records. First id wins.
function buildStreamIdMap(streamedRecords) {
  const m = new Map()
  for (const r of streamedRecords || []) {
    if (!r || !r.id) continue
    if (r.source && r.source !== 'streaming-triage') continue
    const k = locKey(r)
    if (k && !m.has(k)) m.set(k, r.id)
  }
  return m
}

// Restore streamed ids on the authoritative records that match by location. Non-matching records keep
// their new id. Returns { records, changed }.
function remapIds(records, idMap) {
  let changed = 0
  const out = (records || []).map(r => {
    if (!r || typeof r !== 'object') return r
    const sid = (idMap && typeof idMap.get === 'function') ? idMap.get(locKey(r)) : null
    if (sid && r.id !== sid) { changed++; return { ...r, superseded_id: r.id, id: sid } }
    return r
  })
  return { records: out, changed }
}

module.exports = { locKey, buildStreamIdMap, remapIds }

// self-check
if (require.main === module) {
  const assert = require('node:assert')
  // streamed record has an absolute path (P1); AUDITOR record has a relative one — must still match.
  const streamed = [{ id: 'T-3', file: '/proj/app/orders.rb', line: 42, source: 'streaming-triage' }]
  const map = buildStreamIdMap(streamed)
  const authoritative = [
    { id: 'CR-1', file: 'app/orders.rb', line: 42, title: 'IDOR' },   // same location → restore T-3
    { id: 'CR-2', file: 'app/search.rb', line: 7, title: 'SQLi' },    // new → keep CR-2
  ]
  const { records, changed } = remapIds(authoritative, map)
  assert.strictEqual(changed, 1, 'one id restored')
  assert.strictEqual(records[0].id, 'T-3', 'streamed id restored across absolute/relative path forms')
  assert.strictEqual(records[0].superseded_id, 'CR-1', 'audit trail kept')
  assert.strictEqual(records[1].id, 'CR-2', 'genuinely new finding keeps its authoritative id')
  // an AUDITOR-sourced record in the "streamed" snapshot is ignored (only streaming-triage seeds the map)
  assert.strictEqual(buildStreamIdMap([{ id: 'CR-9', file: 'a.rb', line: 1, source: 'code-review-normalizer' }]).size, 0)
  console.log('ok — id-preserve: streamed IDs survive the AUDITOR overwrite, matched by source location')
}
