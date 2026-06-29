// src/core/engagement-mode.js
//
// THE engagement-mode contract engine (a flag-INDEPENDENT hard invariant, like
// scope fail-closed). Enforces the operator's three-mode rule:
//
//   BLACK-BOX (live URL only)   → live pentest ONLY            · MUST NOT code-review
//   STATIC    (source only)     → code review ONLY             · MUST NOT make a live hit
//   WHITE-BOX (source + URL)    → code review + source-guided pentest, bidirectional
//
// classifyEngagementMode reads the fields a dispatch ACTUALLY carries at each
// wiring boundary (the pentest dispatch has no sourceDir — it self-identifies as
// white-box via meta.sourceGuided or the resolved engagement record). See
// ULTRAPLAN.md §3. assertModeContract throws on a violation and strips a static
// dispatch's deployUrl so PROBER can never fire a live hit.

'use strict'

const fs = require('fs')
const path = require('path')
const agentPaths = require('../../paths')

// Fail-soft read of engagement-<id>.json (the combined-engagement sidecar). The
// pentest dispatch carries meta.engagementId (dashboard.js:335) even though it has
// no sourceDir, so this is the belt-and-suspenders fallback for white-box.
function _defaultResolveEngagement(engagementId) {
  if (!engagementId) return null
  try {
    const f = path.join(agentPaths.INTEL_ROOT, `engagement-${engagementId}.json`)
    return JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch { return null }
}

function _squad(s) { return String(s || '').replace(/-squad$/, '') }

/**
 * Classify a dispatch into an engagement mode.
 * @returns 'blackbox' | 'static' | 'whitebox' | null (non-mode squad → passthrough)
 * @param opts.resolveEngagement optional injection for tests.
 */
function classifyEngagementMode(dispatch, opts = {}) {
  const dis = dispatch || {}
  const squad = _squad(dis.squad)
  const meta = dis.meta || {}
  const resolveEngagement = opts.resolveEngagement || _defaultResolveEngagement

  if (squad === 'pentest') {
    // The pentest dispatch self-identifies as white-box via an explicit marker
    // (stamped on the deferred source-guided dispatch) or a present sourceDir;
    // fallback = the resolved engagement record's sourceDir.
    if (meta.sourceGuided === true) return 'whitebox'
    if (meta.sourceDir) return 'whitebox'
    if (meta.engagementId) {
      const eng = resolveEngagement(meta.engagementId)
      if (eng && eng.sourceDir) return 'whitebox'
    }
    return 'blackbox'
  }

  if (squad === 'code-review') {
    // The code-review ITERATION of a combined white-box engagement is part of
    // white-box (keeps its deployUrl for PROBER). A standalone source review is
    // static (no live hit).
    if (meta.engagementMode === 'whitebox') return 'whitebox'
    if (meta.engagementId) {
      const eng = resolveEngagement(meta.engagementId)
      if (eng && eng.sourceDir && (eng.targetUrl || meta.deployUrl)) return 'whitebox'
    }
    return 'static'
  }

  // Any other squad is outside the mode contract.
  return null
}

/**
 * Enforce the contract. Throws on a violation (flag-independent, fail-closed).
 * Mutates a static dispatch's meta.deployUrl → null so PROBER cannot fire.
 * @param ctx.meta the dispatch meta (mutated for static)
 * @param ctx.willSpawnCodeReview whether the caller is about to spawn code review
 */
function assertModeContract(mode, ctx = {}) {
  const meta = ctx.meta || {}
  if (mode === 'blackbox' && ctx.willSpawnCodeReview) {
    throw new Error('MODE-CONTRACT violation: black-box engagement must not perform code review')
  }
  if (mode === 'static') {
    // Strip the live target at the boundary (not relying on the caller) so a
    // standalone source review can never make a live hit (PROBER suppressed).
    if (meta.deployUrl) meta.deployUrl = null
    if (ctx.willFireLive) {
      throw new Error('MODE-CONTRACT violation: static analysis must not make a live hit')
    }
  }
  return mode
}

module.exports = { classifyEngagementMode, assertModeContract }
