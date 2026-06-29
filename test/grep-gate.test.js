// test/grep-gate.test.js
// P0 — enforces two Autonomous-OS invariants statically (ULTRAPLAN §4.1, Issue 8):
//   1. No net-new module reads process.env.ARCHON_ENABLE_* / ARCHON_DRIVE_* directly
//      (paths.js is the only authority — that is what makes the master kill-switch
//      unbypassable).
//   2. No net-new module requires ajv or js-yaml (no new runtime dependency).
// As the build grows, append new module paths to NEW_MODULES.

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')

// Net-new Autonomous-OS modules (grows phase by phase). Only files that exist are checked.
const NEW_MODULES = [
  'src/shadow/shadow-sink.js',
  'src/core/engagement-mode.js',
  'src/pipeline/shadow-recorder.js',
  'src/intel/knowledge-graph.js',
  'src/intel/pattern-catalog.js',
  'src/orchestrator/mission-director.js',
  'src/dispatch/whitebox-correlation.js',
  'src/pipeline/correlation-records.js',
  'src/pipeline/report-stream.js',
  'common/schemas/validate.js',
  'common/schemas/mapping.js',
]

function existingModules() {
  return NEW_MODULES.map(p => path.join(ROOT, p)).filter(f => fs.existsSync(f))
}

test('no net-new module reads process.env.ARCHON_ENABLE_*/ARCHON_DRIVE_* directly (paths.js is the authority)', () => {
  const offenders = []
  for (const f of existingModules()) {
    const src = fs.readFileSync(f, 'utf8')
    if (/process\.env\.ARCHON_(ENABLE|DRIVE)_/.test(src)) offenders.push(path.relative(ROOT, f))
  }
  assert.deepEqual(offenders, [], `these modules read ARCHON flags directly instead of via paths.flagMode(): ${offenders.join(', ')}`)
})

test('no net-new module requires ajv or js-yaml (no new runtime dependency — Issue 8)', () => {
  const offenders = []
  for (const f of existingModules()) {
    const src = fs.readFileSync(f, 'utf8')
    if (/require\(\s*['"](ajv|js-yaml)['"]\s*\)/.test(src)) offenders.push(path.relative(ROOT, f))
  }
  assert.deepEqual(offenders, [], `forbidden dependency required in: ${offenders.join(', ')}`)
})

test('package.json declares neither ajv nor js-yaml as a dependency', () => {
  const pkg = require('../package.json')
  const deps = { ...(pkg.dependencies || {}), ...(pkg.optionalDependencies || {}) }
  assert.ok(!('ajv' in deps), 'ajv must not be a dependency')
  assert.ok(!('js-yaml' in deps), 'js-yaml must not be a dependency')
})
