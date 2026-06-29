// src/evidence/evidence-validator.js — Autonomous Agent OS canonical path
// (spec RECOMMENDED_REPO_STRUCTURE). "No replayable evidence → not CONFIRMED" is
// the reused evidence-contract; severity caps + the L0–L4 inclusion gate live in
// evidence-completeness (Block R).
'use strict'
module.exports = {
  ...require('../pipeline/evidence-contract'),
  completeness: require('../pipeline/evidence-completeness'),
}
