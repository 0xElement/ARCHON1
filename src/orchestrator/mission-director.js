// src/orchestrator/mission-director.js
//
// Block A — the autonomous Mission Director. WRAPS dispatchPentestParallel and
// REUSES the existing modules (ATLAS followup-plan, coverage-map, the KG observe
// surface) — it is NOT a second orchestrator and it never re-implements
// scope/auditor/judge (each hop runs the real pipeline, which calls them).
//
// Modes (paths.flagMode('BLACKBOX_MASTER_AGENT')):
//   off    → run() === dispatchPentestParallel(dispatch)  (byte-for-byte identity)
//   shadow → run hop 0, then OBSERVE + write recommendations to the shadow sink;
//            drives nothing. The deterministic pipeline still owns execution.
//   active → bounded re-plan loop (hop cap = ARCHON_AUTONOMY_HOPS, default 1 ⇒ one
//            hop even active), deterministic + evidence-gated decideNext.
// See ULTRAPLAN.md §5.2.

'use strict'

const fs = require('fs')
const path = require('path')
const agentPaths = require('../../paths')
const shadowSink = require('../shadow/shadow-sink')

let _coverage = null
try { _coverage = require('../core/coverage-map') } catch { /* optional */ }
let _kg = null
try { _kg = require('../intel/knowledge-graph') } catch { /* optional */ }

function _now() { return new Date().toISOString() }
function _readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } }
function _readJsonl(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8').trim()
    return raw ? raw.split('\n').map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) : []
  } catch { return [] }
}

function _engagementId(dispatch) {
  return (dispatch.meta && dispatch.meta.engagementId) || dispatch.taskId
}

// OBSERVE: gaps + unproven candidates + open chains + ATLAS followups → recommended next tasks.
function observeEngagement(dispatch, deps = {}) {
  const intelRoot = deps.intelRoot || agentPaths.INTEL_ROOT
  const taskId = dispatch.taskId
  const recs = []

  // ATLAS already produced a followup plan in Phase 3.087 — reuse it (no new LLM call).
  const followup = _readJson(path.join(intelRoot, `followup-plan-${taskId}.json`))
  for (const f of (followup && Array.isArray(followup.followups) ? followup.followups : [])) {
    recs.push({ source: 'atlas-followup', mode: 'blackbox', type: 'followup', objective: f.objective || f.description || String(f), vuln_class: f.vuln_class || f.class })
  }

  // coverage gaps (deterministic), best-effort over this task's findings.
  if (_coverage && typeof _coverage.computeCoverage === 'function') {
    try {
      const findings = _readJsonl(path.join(intelRoot, `VALIDATED-FINDINGS-${taskId}.jsonl`))
      const cov = _coverage.computeCoverage(findings, [])
      for (const gap of (cov && Array.isArray(cov.uncovered) ? cov.uncovered : [])) {
        recs.push({ source: 'coverage-gap', mode: 'blackbox', type: 'coverage', objective: `Cover ${gap}`, wstg: gap })
      }
    } catch { /* fail-soft */ }
  }

  // KG observe surface (when the KG flag is on).
  if (_kg && agentPaths.flagEnabled && agentPaths.flagEnabled('KNOWLEDGE_GRAPH')) {
    try {
      const o = _kg.observe(_engagementId(dispatch))
      for (const t of (o.recommendedTasks || [])) recs.push({ source: 'kg', ...t })
    } catch { /* fail-soft */ }
  }
  return recs
}

// DECIDE (deterministic, evidence-gated): may we run another hop?
function decideNext({ hop, hopCap, spent, budget, cancelled, awaitingTriage, recommendations }) {
  if (cancelled) return { continue: false, reason: 'cancelled' }
  if (awaitingTriage) return { continue: false, reason: 'awaiting-triage' }
  if (hop >= hopCap) return { continue: false, reason: 'hop-cap' }
  if (budget != null && spent != null && spent >= budget) return { continue: false, reason: 'budget' }
  if (!recommendations || recommendations.length === 0) return { continue: false, reason: 'no-open-work' }
  return { continue: true, reason: 'open-work' }
}

// Map recommendations → focused-hop meta (reuse recon, focus classes).
function deriveFocus(recommendations) {
  const classes = [...new Set((recommendations || []).map(r => r.vuln_class).filter(Boolean))]
  return { skipRecon: true, focusClasses: classes, mdHypotheses: (recommendations || []).slice(0, 12) }
}

function _hopCap() {
  const n = parseInt(process.env.ARCHON_AUTONOMY_HOPS || '1', 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}

// ── Decision log (handoff item 7) ───────────────────────────────────────────
// One structured record per autonomous decision — WHO decided, WHY, on what
// EVIDENCE, what TASK it created, how CONFIDENT, and the OUTCOME. Pure builders
// (tested); written to decision-log.jsonl only while the Director runs (flag on),
// so the flag-off pipeline is untouched. This is the "why did the agent do that?"
// audit trail an operator reads after an autonomous engagement.
function decisionRecord({ hop, mode, agent, decision, why, evidence, task_created, confidence, outcome }) {
  return {
    ts: _now(), hop: hop == null ? null : hop, mode: mode || null,
    agent: agent || 'mission-director',
    decision: decision || null,
    why: why || null,
    evidence: evidence == null ? null : evidence,
    task_created: task_created == null ? null : task_created,
    confidence: confidence == null ? null : confidence,
    outcome: outcome || null,
  }
}
// Each recommendation → a recommend-task decision row, with its source as the
// deciding agent and its objective/class/wstg as the why/evidence.
function recommendationDecisions({ hop, mode, recommendations, queued }) {
  return (recommendations || []).map(r => decisionRecord({
    hop, mode,
    agent: r.source || 'mission-director',
    decision: 'recommend-task',
    why: r.objective || r.description || null,
    evidence: { type: r.type || null, wstg: r.wstg || null, vuln_class: r.vuln_class || null },
    task_created: queued ? (r.objective || r.type || null) : null,
    confidence: r.confidence == null ? null : r.confidence,
    outcome: queued ? 'queued' : 'observed',
  }))
}
function _appendDecisions(eng, records) {
  for (const rec of records) {
    try { shadowSink.append(eng, 'decision-log.jsonl', rec) } catch { /* fail-soft */ }
  }
}

/**
 * The Director entrypoint. deps must provide dispatchPentestParallel; optional
 * getCostBudget, _isTaskCancelled, isAwaitingTriage, scopeValidate, log.
 */
async function run(dispatch, deps = {}) {
  const dpp = deps.dispatchPentestParallel
  if (typeof dpp !== 'function') throw new Error('mission-director.run requires deps.dispatchPentestParallel')
  const mode = agentPaths.flagMode ? agentPaths.flagMode('BLACKBOX_MASTER_AGENT') : 'off'

  // hop 0 — the full, real pipeline (scope/auditor/judge inside).
  const result = await dpp(dispatch)
  if (mode === 'off') return result // strict identity

  const eng = _engagementId(dispatch)
  const log = deps.log || (() => {})
  try {
    const recommendations = observeEngagement(dispatch, deps)
    shadowSink.append(eng, 'director-recommendations.jsonl', { hop: 0, ts: _now(), mode, recommendations })
    _appendDecisions(eng, recommendationDecisions({ hop: 0, mode, recommendations, queued: false }))

    if (mode !== 'active') return result // shadow: observe-only, drives nothing

    // ACTIVE: bounded, deterministic re-plan loop. Default ARCHON_AUTONOMY_HOPS=1 ⇒ no extra hop.
    const hopCap = _hopCap()
    const budget = (deps.getCostBudget && deps.getCostBudget(dispatch.squad)) || null
    let hop = 0, spent = (result && result.totalCost) || 0
    let recs = recommendations
    while (true) {
      const cancelled = deps._isTaskCancelled ? deps._isTaskCancelled(dispatch.taskId) : false
      const awaitingTriage = deps.isAwaitingTriage ? deps.isAwaitingTriage(dispatch.taskId) : false
      const d = decideNext({ hop, hopCap, spent, budget, cancelled, awaitingTriage, recommendations: recs })
      if (!d.continue) {
        log(`🧭 Mission Director: stop after hop ${hop} (${d.reason})`)
        _appendDecisions(eng, [decisionRecord({ hop, mode, decision: 'gate', why: d.reason, evidence: { spent, budget, openWork: recs.length }, outcome: 'stop' })])
        break
      }
      // Scope re-validate before each extra hop (fail-closed).
      if (deps.scopeValidate && !deps.scopeValidate(dispatch)) {
        log('🧭 Mission Director: scope re-validation blocked — stop')
        _appendDecisions(eng, [decisionRecord({ hop, mode, decision: 'scope-gate', why: 'scope re-validation blocked', outcome: 'stop' })])
        break
      }
      hop += 1
      const focus = deriveFocus(recs)
      _appendDecisions(eng, [decisionRecord({ hop, mode, decision: 'launch-hop', why: d.reason, evidence: { openWork: recs.length }, task_created: focus.focusClasses, confidence: null, outcome: 'hop-launched' })])
      const hopDispatch = { ...dispatch, meta: { ...(dispatch.meta || {}), ...focus } }
      const r = await dpp(hopDispatch) // same taskId — no finding-id drift
      spent += (r && r.totalCost) || 0
      recs = observeEngagement(dispatch, deps)
      shadowSink.append(eng, 'director-recommendations.jsonl', { hop, ts: _now(), mode, recommendations: recs })
      _appendDecisions(eng, recommendationDecisions({ hop, mode, recommendations: recs, queued: false }))
    }
  } catch (e) { log(`🧭 Mission Director error (non-fatal): ${e.message}`) }
  return result
}

module.exports = { run, observeEngagement, decideNext, deriveFocus, decisionRecord, recommendationDecisions }
