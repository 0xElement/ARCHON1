// schemas/ — Autonomous Agent OS canonical path (spec RECOMMENDED_REPO_STRUCTURE).
// The canonical JSON schemas live at common/schemas/ (wired into the validator +
// mapping layer). This index re-exports them so the spec-structure path resolves
// without duplicating the files (no drift). Validate with common/schemas/validate.js
// (dependency-free — no ajv). See docs/autonomous-agent-os-spec/10_SCHEMAS.
'use strict'
const path = require('path')
const dir = path.join(__dirname, '..', 'common', 'schemas')
module.exports = {
  task: require(path.join(dir, 'task.schema.json')),
  evidence: require(path.join(dir, 'evidence.schema.json')),
  candidate_finding: require(path.join(dir, 'candidate_finding.schema.json')),
  source_feature_map: require(path.join(dir, 'source_feature_map.schema.json')),
  correlation: require(path.join(dir, 'correlation.schema.json')),
  chain: require(path.join(dir, 'chain.schema.json')),
  pattern_catalog: require(path.join(dir, 'pattern_catalog.schema.json')),
  validate: require(path.join(dir, 'validate.js')),
  mapping: require(path.join(dir, 'mapping.js')),
}
