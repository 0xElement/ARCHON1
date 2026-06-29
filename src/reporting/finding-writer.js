// src/reporting/finding-writer.js — Autonomous Agent OS canonical path
// (spec RECOMMENDED_REPO_STRUCTURE). The canonical finding shape + normalizer is
// agents/finding-schema.js; the candidate wrapper + enum mapping is
// common/schemas/mapping.js.
'use strict'
module.exports = {
  ...require('../../agents/finding-schema'),
  mapping: require('../../common/schemas/mapping'),
}
