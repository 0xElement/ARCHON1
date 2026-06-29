// test/parity-three-phase-source.test.js
// P2 — Block D freehand source review (ULTRAPLAN §5.3). flag-off must be the
// byte-identical 8-phase flow; flag-on inserts 'freehand' between phase2 and verify.

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DISPATCHER = path.join(__dirname, '..', 'src', 'dispatch', 'code-review-dispatcher.js')

// Require the dispatcher fresh under a given flag env (FH_MODE is captured at module load).
function loadUnder(env) {
  const saved = {}
  const keys = ['ARCHON_ENABLE_AUTONOMOUS_OS', 'ARCHON_ENABLE_THREE_PHASE_SOURCE_REVIEW', 'ARCHON_DRIVE_THREE_PHASE_SOURCE_REVIEW']
  for (const k of keys) { saved[k] = process.env[k]; delete process.env[k] }
  Object.assign(process.env, env)
  delete require.cache[require.resolve(DISPATCHER)]
  try { return require(DISPATCHER) } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
    delete require.cache[require.resolve(DISPATCHER)]
  }
}

const ORIGINAL_8 = ['inventories', 'blueprint', 'discovery', 'mapping', 'consolidate', 'phase2', 'verify', 'report']

test('flag-off: PHASES is the original 8-phase flow, byte-identical (no freehand)', () => {
  const mod = loadUnder({})
  assert.deepEqual(mod.PHASES, ORIGINAL_8)
  assert.equal(mod.FH_MODE, 'off')
})

test('flag-on (shadow): freehand is inserted between phase2 and verify', () => {
  const mod = loadUnder({ ARCHON_ENABLE_AUTONOMOUS_OS: '1', ARCHON_ENABLE_THREE_PHASE_SOURCE_REVIEW: '1' })
  assert.equal(mod.FH_MODE, 'shadow')
  assert.deepEqual(mod.PHASES, ['inventories', 'blueprint', 'discovery', 'mapping', 'consolidate', 'phase2', 'freehand', 'verify', 'report'])
  const i = mod.PHASES.indexOf('freehand')
  assert.equal(mod.PHASES[i - 1], 'phase2')
  assert.equal(mod.PHASES[i + 1], 'verify')
})

test('flag-on (active via DRIVE): FH_MODE active, freehand present', () => {
  const mod = loadUnder({ ARCHON_ENABLE_AUTONOMOUS_OS: '1', ARCHON_ENABLE_THREE_PHASE_SOURCE_REVIEW: '1', ARCHON_DRIVE_THREE_PHASE_SOURCE_REVIEW: '1' })
  assert.equal(mod.FH_MODE, 'active')
  assert.ok(mod.PHASES.includes('freehand'))
})

test('freehandPrompt is exported, references the methodology + template, and points at the given fhDir', () => {
  const mod = loadUnder({})
  assert.equal(typeof mod.freehandPrompt, 'function')
  const p = mod.freehandPrompt('marshal', { slug: 'login' }, 't1', '/src', '/out', '/out/phase2/freehand')
  assert.match(p, /phase3_freehand_review_v1\.md/)
  assert.match(p, /phase3_freehand_candidate_template\.md/)
  assert.match(p, /Required black-box proof/)
  assert.match(p, /\/out\/phase2\/freehand\/login\.md/)
})

test('the freehand methodology + template files exist on disk', () => {
  const meth = path.join(__dirname, '..', 'squads', 'code-review', 'methodology')
  assert.ok(fs.existsSync(path.join(meth, 'prompts', 'phase3_freehand_review_v1.md')))
  assert.ok(fs.existsSync(path.join(meth, 'templates', 'phase3_freehand_candidate_template.md')))
})
