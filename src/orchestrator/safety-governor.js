// src/orchestrator/safety-governor.js — Autonomous Agent OS canonical path
// (spec RECOMMENDED_REPO_STRUCTURE). Safety = the reused active-poc 3-gate policy
// (impact-proving exploits fire only behind engagement_mode + token + env) plus
// the goal/baseline scrubbers. Default: nothing offensive fires.
'use strict'
module.exports = {
  activePocPolicy: require('../../agents/active-poc-policy'),
  scrubBaseline: require('../safety/scrub-baseline'),
  scrubGoalPaths: require('../safety/scrub-goal-paths'),
}
