// test/feature-flags.test.js
// P0 — the ARCHON_ENABLE_* flag resolver in paths.js (ULTRAPLAN §4.1/§5.0).

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const paths = require('../paths')

// Snapshot + clear every ARCHON_* env so tests are hermetic.
function withEnv(env, fn) {
  const touched = ['ARCHON_ENABLE_AUTONOMOUS_OS', 'ARCHON_ENABLE_STRICT_SCHEMA', 'ARCHON_DRIVE_STRICT_SCHEMA',
    'ARCHON_ENABLE_KNOWLEDGE_GRAPH']
  const saved = {}
  for (const k of touched) { saved[k] = process.env[k]; delete process.env[k] }
  try { Object.assign(process.env, env); fn() } finally {
    for (const k of touched) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
  }
}

test('flags default to off when nothing is set', () => {
  withEnv({}, () => {
    assert.equal(paths.flagMode('STRICT_SCHEMA'), 'off')
    assert.equal(paths.flagMode('KNOWLEDGE_GRAPH'), 'off')
    assert.equal(paths.flagMode('AUTONOMOUS_OS'), 'off')
    assert.equal(paths.flagEnabled('STRICT_SCHEMA'), false)
  })
})

test('master off forces every block off even when the block ENABLE is set', () => {
  withEnv({ ARCHON_ENABLE_STRICT_SCHEMA: '1' }, () => {
    assert.equal(paths.flagMode('STRICT_SCHEMA'), 'off', 'master gate must override block enable')
  })
})

test('ENABLE-only (master on) resolves to shadow; ENABLE+DRIVE resolves to active', () => {
  withEnv({ ARCHON_ENABLE_AUTONOMOUS_OS: '1', ARCHON_ENABLE_STRICT_SCHEMA: '1' }, () => {
    assert.equal(paths.flagMode('STRICT_SCHEMA'), 'shadow')
    assert.equal(paths.flagEnabled('STRICT_SCHEMA'), true)
  })
  withEnv({ ARCHON_ENABLE_AUTONOMOUS_OS: '1', ARCHON_ENABLE_STRICT_SCHEMA: '1', ARCHON_DRIVE_STRICT_SCHEMA: '1' }, () => {
    assert.equal(paths.flagMode('STRICT_SCHEMA'), 'active')
  })
})

test('the master flag itself is active when truthy, off otherwise', () => {
  withEnv({ ARCHON_ENABLE_AUTONOMOUS_OS: 'enabled' }, () => assert.equal(paths.flagMode('AUTONOMOUS_OS'), 'active'))
  withEnv({}, () => assert.equal(paths.flagMode('AUTONOMOUS_OS'), 'off'))
})

test('truthy synonyms are accepted; junk is falsy', () => {
  for (const v of ['1', 'true', 'enabled', 'on', 'yes', 'TRUE', 'On']) {
    withEnv({ ARCHON_ENABLE_AUTONOMOUS_OS: v }, () => assert.equal(paths.flagMode('AUTONOMOUS_OS'), 'active', `"${v}" should be truthy`))
  }
  for (const v of ['0', 'false', 'off', '', 'no', 'disabled']) {
    withEnv({ ARCHON_ENABLE_AUTONOMOUS_OS: v }, () => assert.equal(paths.flagMode('AUTONOMOUS_OS'), 'off', `"${v}" should be falsy`))
  }
})

test('shadowDir is under INTEL_ROOT/shadow/<engagementId> and never the data root itself', () => {
  const d = paths.shadowDir('t-123')
  assert.ok(d.startsWith(path.join(paths.INTEL_ROOT, 'shadow')), 'shadowDir must live under INTEL_ROOT/shadow')
  assert.ok(d.endsWith(path.join('shadow', 't-123')))
  assert.notEqual(path.resolve(d), path.resolve(paths.INTEL_ROOT))
})
