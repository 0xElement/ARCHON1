// src/source-review/phase2-pattern-router.js — Autonomous Agent OS canonical path
// (spec RECOMMENDED_REPO_STRUCTURE). Phase 2 pattern review routes each feature ×
// class to the class specialist + its catalog. The structured catalog engine is
// src/intel/pattern-catalog.js; the per-class routing lives in the dispatcher.
'use strict'
module.exports = {
  patternCatalog: require('../intel/pattern-catalog'),
  dispatcher: require('../dispatch/code-review-dispatcher'),
}
