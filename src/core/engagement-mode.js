// src/core/engagement-mode.js
//
// Engagement-mode classifier. Labels a dispatch by the operator's three-mode rule
// (observability — the 🧭 mode line in the activity log):
//
//   BLACK-BOX (live URL only)   → live pentest, no source
//   STATIC    (source only)     → code review, no live hit (no deployUrl ⇒ PROBER can't fire)
//   WHITE-BOX (source + URL)    → code review + runtime validation (deployUrl kept ⇒ PROBER runs)
//
// Behaviour is driven by the dispatch's OWN fields — squad → dispatchType (routing) and
// meta.deployUrl → PROBER — so a code-review that carries a deployUrl IS white-box, and
// source-only is static. This module only names that; it enforces nothing the routing +
// deployUrl gate don't already guarantee. classifyEngagementMode reads the fields a dispatch
// ACTUALLY carries at each wiring boundary (the pentest dispatch has no sourceDir — it self-
// identifies as white-box via meta.sourceGuided or the resolved engagement record). ULTRAPLAN §3.

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
    // Source + a live URL = WHITE-BOX: keep deployUrl so PROBER runtime-validates the source
    // findings against the running target (the operator UI advertises exactly this). Source ONLY,
    // no URL = static. A combined-engagement iteration carries the marker/engagementId; a standalone
    // review carries deployUrl directly — both are white-box.
    if (meta.engagementMode === 'whitebox') return 'whitebox'
    if (meta.deployUrl) return 'whitebox'
    if (meta.engagementId) {
      const eng = resolveEngagement(meta.engagementId)
      if (eng && eng.sourceDir && (eng.targetUrl || meta.deployUrl)) return 'whitebox'
    }
    return 'static'
  }

  // Any other squad is outside the mode contract.
  return null
}

module.exports = { classifyEngagementMode }
