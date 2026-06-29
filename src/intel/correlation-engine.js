// src/intel/correlation-engine.js — Autonomous Agent OS canonical path
// (spec RECOMMENDED_REPO_STRUCTURE). Correlation = the deterministic
// cross-view-dedup spine + the typed correlation/chain records (Block F).
'use strict'
module.exports = {
  ...require('../pipeline/cross-view-dedup'),
  ...require('../pipeline/correlation-records'),
}
