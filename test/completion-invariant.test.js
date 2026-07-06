'use strict'
// C2: the run-completion invariant — every finding validated + tiered, every feature terminal.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { runCompletionInvariant, checkFindings } = require('../src/pipeline/completion-invariant')

const TERMINAL = new Set(['done', 'deep_complete', 'merged', 'duplicate', 'non_security', 'dead_code', 'blocked'])

test('clean run: valid finding + all features terminal → ok', () => {
  const r = runCompletionInvariant({
    findings: [{ id: 'CR-1', confirmation_status: 'SOURCE_CONFIRMED', file: 'a.rb', line: 1, vulnerable_code: 'x' }],
    ledger: { features: { a: { slug: 'a', status: 'done' }, b: { slug: 'b', status: 'blocked' } } }, TERMINAL,
  })
  assert.ok(r.ok, JSON.stringify(r.violations))
})

test('flags an invalid confirmation status + a no-evidence finding', () => {
  const v = checkFindings([
    { id: 'X', confirmation_status: 'MADE_UP' },        // invalid status + L0 evidence
    { id: 'Y', confirmation_status: 'SOURCE_CONFIRMED' }, // valid status but L0 evidence
  ])
  assert.ok(v.some(x => x.id === 'X' && x.kind === 'invalid-confirmation-status'))
  assert.ok(v.some(x => x.id === 'X' && x.kind === 'no-evidence'))
  assert.ok(v.some(x => x.id === 'Y' && x.kind === 'no-evidence'))
})

test('flags a non-terminal (stuck) feature', () => {
  const r = runCompletionInvariant({ findings: [], ledger: { features: { a: { slug: 'a', status: 'in_progress' } } }, TERMINAL })
  assert.ok(!r.ok)
  assert.ok(r.violations.some(v => v.kind === 'feature-not-terminal' && v.id === 'a'))
})
