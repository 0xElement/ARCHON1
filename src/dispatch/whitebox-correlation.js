// src/dispatch/whitebox-correlation.js
//
// White-box source-guided + bidirectional correlation (Autonomous Agent OS, the
// MODE CONTRACT's white-box upgrade). Black-box = pentest only; static = code
// review only; WHITE-BOX = code review THEN a SOURCE-GUIDED pentest (the live
// attacks are AIMED by the code-review candidates), with bidirectional flow:
//   SOURCE→LIVE  buildSourceGuidance  — source candidates aim the live attacks
//   LIVE→SOURCE  buildRootCauseRequests — live findings get a source root cause
//
// CRITICAL: a source candidate is a HYPOTHESIS — it is NEVER written into the
// pentest's live-findings/VALIDATED-FINDINGS; it must independently pass scope +
// AUDITOR + the evidence contract to become CONFIRMED. The launch is driven by a
// PERSISTED signal (deferredPentestDispatch + pending-source-guidance), never a
// flag re-read, so the live side can never be silently dropped (audit Issue 3).
// Reuses cross-view-dedup's classifiers verbatim. See ULTRAPLAN.md §3.2 / §5.1.

'use strict'

const fs = require('fs')
const path = require('path')
const agentPaths = require('../../paths')
const shadowSink = require('../shadow/shadow-sink')
const xview = require('../pipeline/cross-view-dedup')

function _readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } }
function _readJsonl(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8').trim()
    return raw ? raw.split('\n').map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) : []
  } catch { return [] }
}
function _writeAtomic(file, data) {
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`
  fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

/**
 * SOURCE→LIVE. Read the code-review outputs and build the guidance bundle that
 * aims the live pentest. Deterministic, fail-soft. Writes
 * source-guidance-<pentestTaskId>.json and returns the bundle (or a minimal empty
 * bundle — the caller still launches the pentest un-guided in that case).
 */
function buildSourceGuidance(crTaskId, pentestTaskId, deps = {}) {
  const intelRoot = deps.intelRoot || agentPaths.INTEL_ROOT
  const fq = _readJson(path.join(intelRoot, 'code-review', String(crTaskId), 'phase1-maps', 'feature-queue.json'))
  const feature_targets = (fq && Array.isArray(fq.features) ? fq.features : [])
    .map(f => ({ feature_id: `FEATURE-${f.slug || f.name}`, name: f.name || f.slug }))

  const findings = _readJsonl(path.join(intelRoot, `VALIDATED-FINDINGS-${crTaskId}.jsonl`))
  const candidate_targets = findings.map(f => {
    const vuln_class = xview.deriveVulnClass(f.title)
    return {
      candidate_id: f.id || f.findingId || '',
      vuln_class,
      severity: f.severity || '',
      file: f.file || (Array.isArray(f.source_files) ? f.source_files[0] : undefined),
      line: f.line,
      url: f.url || undefined,
      suggested_blackbox_task: {
        objective: `Live-confirm the source ${vuln_class} candidate`,
        vuln_class,
        entry_point: f.url || f.affected_endpoint || undefined,
        required_evidence: f.required_blackbox_proof || 'a live request/sequence that observes the predicted behavior',
      },
    }
  }).filter(c => c.candidate_id)

  const priority_classes = [...new Set(candidate_targets.map(c => c.vuln_class).filter(Boolean))]
  const bundle = { pentestTaskId: String(pentestTaskId), crTaskId: String(crTaskId), generatedAt: deps.now || new Date().toISOString(),
    feature_targets, candidate_targets, priority_classes }

  try { _writeAtomic(path.join(intelRoot, `source-guidance-${pentestTaskId}.json`), bundle) } catch { /* fail-soft */ }
  return bundle
}

/**
 * LIVE→SOURCE. Match each live pentest finding to a source candidate by
 * (vuln_class, locus). Matched → the live finding inherits the source file:line
 * (no spawn). Unmatched → a root-cause-request file (only if non-empty). Returns
 * { matched, unmatched }. NEVER writes pentest live-findings/VALIDATED-FINDINGS.
 */
function buildRootCauseRequests(pentestTaskId, crTaskId, deps = {}) {
  const intelRoot = deps.intelRoot || agentPaths.INTEL_ROOT
  const live = _readJsonl(path.join(intelRoot, `VALIDATED-FINDINGS-${pentestTaskId}.jsonl`))
  const source = _readJsonl(path.join(intelRoot, `VALIDATED-FINDINGS-${crTaskId}.jsonl`))
  const srcIndex = source.map(f => ({ f, cls: xview.deriveVulnClass(f.title), locus: xview.findingLocus(f) }))

  const matched = [], unmatched = []
  for (const lf of live) {
    const cls = xview.deriveVulnClass(lf.title)
    const locus = xview.findingLocus(lf)
    const hit = srcIndex.find(s => s.cls === cls && s.locus && s.locus === locus) || srcIndex.find(s => s.cls === cls)
    if (hit) {
      matched.push({ live_id: lf.id, source_id: hit.f.id, vuln_class: cls, file: hit.f.file || (Array.isArray(hit.f.source_files) ? hit.f.source_files[0] : undefined), line: hit.f.line })
    } else {
      unmatched.push({ live_id: lf.id, vuln_class: cls, locus, objective: `Trace live ${cls} finding ${lf.id} to its source root cause` })
    }
  }
  if (unmatched.length) {
    try { _writeAtomic(path.join(intelRoot, `root-cause-request-${pentestTaskId}.json`), { pentestTaskId: String(pentestTaskId), crTaskId: String(crTaskId), requests: unmatched }) } catch {}
  }
  return { matched, unmatched }
}

// Shadow-mode: write the source-guided plan for offline review; drives nothing.
function shadowRecommend(engagementId, bundle) {
  try { shadowSink.snapshot(engagementId, `whitebox-plan-${engagementId}.json`, bundle) } catch {}
}

/**
 * Completion-hook launcher. Driven ENTIRELY by the persisted deferral signal — it
 * does NOT re-read the flag, so flag/env skew can never orphan the live side. If
 * the engagement has a deferredPentestDispatch whose iteration is still
 * 'pending-source-guidance', build the guidance bundle (fail-soft → un-guided)
 * and writeInbox the deferred pentest dispatch. Idempotent (clears the signal).
 */
function maybeLaunchSourceGuidedPentest(crTaskId, deps = {}) {
  const intelRoot = deps.intelRoot || agentPaths.INTEL_ROOT
  const writeInbox = deps.writeInbox
  const engId = deps.engagementId
  if (!writeInbox || !engId) return { launched: false, reason: 'missing-deps' }
  const engFile = path.join(intelRoot, `engagement-${engId}.json`)
  const eng = _readJson(engFile)
  if (!eng || !eng.deferredPentestDispatch) return { launched: false, reason: 'no-deferral' }
  const iter = (eng.iterations || []).find(it => it.kind === 'blackbox')
  if (iter && iter.status && iter.status !== 'pending-source-guidance') return { launched: false, reason: 'already-launched' }

  const disp = eng.deferredPentestDispatch
  const pentestTaskId = disp.taskId
  // SOURCE→LIVE (fail-soft: empty bundle ⇒ launch un-guided)
  let bundle = null
  try { bundle = buildSourceGuidance(crTaskId, pentestTaskId, { intelRoot }) } catch { bundle = null }
  const meta = { ...(disp.meta || {}), sourceGuided: true, engagementMode: 'whitebox' }
  if (bundle && bundle.candidate_targets && bundle.candidate_targets.length) {
    meta.sourceGuidanceFile = `source-guidance-${pentestTaskId}.json`
  }
  try { writeInbox('inbox/task-actions', { ...disp, meta }) } catch (e) { return { launched: false, reason: 'writeInbox-failed', error: e.message } }

  // clear the deferral signal (idempotent)
  try {
    if (iter) iter.status = 'launched'
    delete eng.deferredPentestDispatch
    _writeAtomic(engFile, eng)
  } catch {}
  return { launched: true, pentestTaskId, guided: !!(meta.sourceGuidanceFile) }
}

/**
 * Recovery sweep (audit Issue 3 + ⚠️#6). Scans every engagement-*.json for an
 * orphaned deferral (deferredPentestDispatch still present, iteration still
 * pending-source-guidance) and launches it — covering the case where the
 * code-review branch threw before the completion hook fired, or a flag/env skew
 * prevented the normal launch. Driven by the persisted signal (no flag check).
 * Returns the list of engagement ids it launched. Fail-soft.
 */
function sweepOrphanedDeferrals(deps = {}) {
  const intelRoot = deps.intelRoot || agentPaths.INTEL_ROOT
  const writeInbox = deps.writeInbox
  if (!writeInbox) return []
  const launched = []
  // The deferral + 'pending-source-guidance' flags are set at dispatch-creation time and are
  // ALSO both true while the code review is still running (they're only cleared by the CR
  // completion hook). So the sweep must additionally confirm the CR actually FINISHED before
  // launching — otherwise a daemon restart mid-review fires the pentest un-guided and loses the
  // source→live correlation. Gate on the whitebox iteration's task being terminal-done, or its
  // AUDITOR verdicts existing (a zero-finding CR is still 'done' and legitimately has no
  // VALIDATED-FINDINGS, so we must NOT gate on that file).
  let tasksRaw = null
  try { tasksRaw = _readJson(path.join(intelRoot, 'tasks.json')) } catch {}
  const tasks = Array.isArray(tasksRaw) ? tasksRaw : (tasksRaw && tasksRaw.tasks) || []
  const crFinished = (crIt) => {
    if (!crIt) return false
    const t = tasks.find(x => String(x.id) === String(crIt.taskId))
    if (t && ['done', 'completed'].includes(String(t.status || '').toLowerCase())) return true
    try { return fs.existsSync(path.join(intelRoot, 'code-review', String(crIt.taskId), 'phase2', 'AUDITOR-VERDICTS.md')) } catch { return false }
  }
  let files = []
  try { files = fs.readdirSync(intelRoot).filter(f => /^engagement-.*\.json$/.test(f)) } catch { return [] }
  for (const f of files) {
    try {
      const eng = _readJson(path.join(intelRoot, f))
      if (!eng || !eng.deferredPentestDispatch) continue
      const it = (eng.iterations || []).find(i => i.kind === 'blackbox')
      if (it && it.status && it.status !== 'pending-source-guidance') continue
      const engId = eng.engagementId || f.replace(/^engagement-/, '').replace(/\.json$/, '')
      const crIt = (eng.iterations || []).find(i => i.kind === 'whitebox')
      if (!crFinished(crIt)) continue // code review still running (or unknown) — let its completion hook launch it
      const r = maybeLaunchSourceGuidedPentest(crIt ? crIt.taskId : '', { intelRoot, engagementId: engId, writeInbox })
      if (r.launched) launched.push(engId)
    } catch { /* fail-soft per engagement */ }
  }
  return launched
}

/**
 * Terminal cleanup when the code-review branch ends WITHOUT launching the deferred pentest — it
 * failed, returned {error}, or threw before the verdicts existed. Without this the black-box half is
 * orphaned forever: the sweep gates on crFinished (needs 'done' OR an AUDITOR-VERDICTS.md), which
 * stays false for a failed CR, so a still-present deferral is skipped every pass and the engagement
 * never completes. Delete deferredPentestDispatch + mark the black-box iteration terminal so the
 * sweep early-returns 'no-deferral' and the engagement is consistently terminal. Idempotent, fail-soft.
 * Returns { neutralized }.
 */
function neutralizeDeferral(engagementId, blackboxStatus, deps = {}) {
  const intelRoot = deps.intelRoot || agentPaths.INTEL_ROOT
  const engFile = path.join(intelRoot, `engagement-${engagementId}.json`)
  try {
    const eng = _readJson(engFile)
    if (!eng || !eng.deferredPentestDispatch) return { neutralized: false }
    delete eng.deferredPentestDispatch
    const it = (eng.iterations || []).find(i => i.kind === 'blackbox')
    if (it) it.status = String(blackboxStatus || 'failed')
    _writeAtomic(engFile, eng)
    return { neutralized: true }
  } catch { return { neutralized: false } }
}

module.exports = { buildSourceGuidance, buildRootCauseRequests, shadowRecommend, maybeLaunchSourceGuidedPentest, sweepOrphanedDeferrals, neutralizeDeferral }
