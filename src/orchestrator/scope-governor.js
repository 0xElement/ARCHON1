// src/orchestrator/scope-governor.js — Autonomous Agent OS canonical path
// (spec RECOMMENDED_REPO_STRUCTURE). Scope enforcement is the reused, fail-closed
// agents/scope-prevalidator.js (Phase 0.0) + the engagement-mode contract.
'use strict'
module.exports = {
  ...require('../../agents/scope-prevalidator'),
  engagementMode: require('../core/engagement-mode'),
}
