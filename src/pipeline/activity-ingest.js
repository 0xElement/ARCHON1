'use strict'
// Pure logic for the activity → live-findings ingester (event-bus.js runs it on a 15s timer
// for every in-progress run). It mirrors findings that agents logged to the ACTIVITY-LOG into
// live-findings.jsonl, so a finding announced in the activity stream but not echoed to the
// findings file still reaches triage.
//
// The whole point of extracting it here is the idempotency contract, which is unit-tested:
//   a finding already present in live-findings (from a specialist's `echo >>` OR a prior
//   ingest tick) is NEVER re-appended.
//
// Regression history (2026-07): the previous inline version derived the dedup key one way when
// building the "seen" set (from the stored record's `details`/`title`) and a DIFFERENT way when
// checking a candidate (from the activity entry's raw `details`). The keys never matched, so the
// 15s timer re-appended the entire finding set on every tick — ballooning live-findings ~250×
// (10+ MB for ~90 real findings) and choking every downstream reader (triage / AUDITOR / writer),
// which wedged the run. The fix: key BOTH sides with the pipeline's canonicalKey(), which
// round-trips deterministically through normalizeFinding (canonicalKey is id-independent, so the
// synthesized id never matters).
const { canonicalKey } = require('./suspected-dedup')

// Build the candidate finding record from one activity-log entry. Deterministic: the same
// entry always yields the same normalized record → the same canonicalKey → idempotent dedup.
function candidateFrom(e, taskId, normalizeFinding) {
  const a = String(e.action || '')
  const title = a.replace(/^(confirmed|suspected)\s+finding:\s*/i, '').slice(0, 120)
  const url = (a + ' ' + (e.details || '')).match(/https?:\/\/[^\s"')]+/)?.[0] || ''
  const sev = e.severity || (a.match(/^(critical|high|medium|low|info)/i) || [])[1] || 'medium'
  const type = e.status || (/^(confirmed|critical|high)/i.test(a) ? 'confirmed' : 'suspected')
  return normalizeFinding({ agent: e.agent, type, severity: sev, url, details: title, reproduction: e.details || '', taskId, source: 'activity-ingest' })
}

/**
 * Findings that should be appended to live-findings for `taskId` — the activity findings NOT
 * already present, by canonical key. Idempotent: appending the result and calling again yields [].
 *
 * @param {object[]} existingRecords - parsed live-findings.jsonl lines (already-present findings)
 * @param {object[]} activityEntries - parsed ACTIVITY-LOG.jsonl entries (recent tail)
 * @param {string}   taskId
 * @param {{normalizeFinding: Function, isFindingEntry: (e:object)=>boolean}} opts
 * @returns {object[]} normalized finding records to append (deduped, first-seen order)
 */
function newFindingsFromActivity(existingRecords, activityEntries, taskId, opts) {
  const { normalizeFinding, isFindingEntry } = opts || {}
  const seen = new Set()
  for (const o of existingRecords || []) { const k = canonicalKey(o); if (k) seen.add(k) }
  const out = []
  for (const e of activityEntries || []) {
    if (String(e && e.taskId) !== String(taskId)) continue
    if (typeof isFindingEntry === 'function' && !isFindingEntry(e)) continue
    const rec = candidateFrom(e, taskId, normalizeFinding)
    const k = canonicalKey(rec)
    if (!k || seen.has(k)) continue           // already in live-findings — never re-append
    seen.add(k)
    out.push(rec)
  }
  return out
}

module.exports = { newFindingsFromActivity, candidateFrom }
