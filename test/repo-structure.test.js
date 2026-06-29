// test/repo-structure.test.js
// Verifies the Autonomous Agent OS spec's RECOMMENDED_REPO_STRUCTURE paths resolve
// (canonical modules + non-breaking re-export shims) and the task-lifecycle state
// machine is correct.

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')

const SHIMS = [
  'src/orchestrator/mission-director', 'src/orchestrator/queue-manager', 'src/orchestrator/task-lifecycle',
  'src/orchestrator/agent-router', 'src/orchestrator/scope-governor', 'src/orchestrator/safety-governor',
  'src/intel/knowledge-graph', 'src/intel/coverage-engine', 'src/intel/correlation-engine', 'src/intel/attack-chain-engine',
  'src/source-review/phase1-feature-mapper', 'src/source-review/phase2-pattern-router', 'src/source-review/phase3-freehand-reviewer',
  'src/evidence/evidence-store', 'src/evidence/evidence-validator',
  'src/reporting/report-builder', 'src/reporting/finding-writer', 'src/reporting/remediation-writer',
  'schemas',
]

test('every spec-structure path loads and re-exports something real', () => {
  for (const p of SHIMS) {
    const m = require('../' + p)
    assert.ok(m && typeof m === 'object' && Object.keys(m).length > 0, `${p} must export a non-empty object`)
  }
})

test('the re-export shims point at the canonical implementation', () => {
  assert.equal(require('../src/intel/coverage-engine'), require('../src/core/coverage-map'))
  assert.equal(require('../src/reporting/report-builder'), require('../src/pipeline/report-stream'))
  assert.equal(require('../src/evidence/evidence-store'), require('../agents/poc-evidence-capture'))
  assert.equal(require('../src/source-review/phase1-feature-mapper'), require('../src/dispatch/code-review-dispatcher'))
})

test('task-lifecycle state machine: legal + illegal transitions', () => {
  const lc = require('../src/orchestrator/task-lifecycle')
  assert.equal(lc.STATES.length, 7)
  assert.equal(lc.canTransition('in-progress', 'awaiting-triage'), true)
  assert.equal(lc.canTransition('awaiting-triage', 'done'), true)
  assert.equal(lc.canTransition('done', 'active'), false, 'terminal states have no exit')
  assert.equal(lc.canTransition('backlog', 'done'), false, 'cannot skip straight to done from backlog')
  assert.equal(lc.validateTransition('cancelled', 'active').ok, false)
  assert.equal(lc.validateTransition(undefined, 'active').ok, true, 'first write has no prior state')
  assert.equal(lc.isTerminal('failed'), true)
})
