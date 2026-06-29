// test/report-quality-judge.test.js
// P7 — Block R report-quality gate (ULTRAPLAN §5.6). Annotates only; never excludes
// a CONFIRMED finding (Issue 2 never-drop floor); LLM error ⇒ needs_polish; the
// Raptor judge is untouched.

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')

const jv = require('../agents/judge-verifier')
const { validate } = require('../common/schemas/validate')

test('the Raptor 4-stage judge exports are intact (untouched)', () => {
  for (const k of ['judgeFindings', 'JUDGE_SCHEMA', 'applyJudgeResult', 'judgeWithConsensus']) {
    assert.ok(jv[k], `Raptor export ${k} must remain`)
  }
})

test('applyReportQuality annotates only — never writes severity or validation_status', () => {
  const f = { id: 'F-1', title: 'x', severity: 'High', validation_status: 'CONFIRMED' }
  const out = jv.applyReportQuality(f, { verdict: 'needs_polish', note: 'tighten repro' })
  assert.equal(out.severity, 'High')
  assert.equal(out.validation_status, 'CONFIRMED')
  assert.equal(out.report_quality_verdict, 'needs_polish')
  // input not mutated
  assert.equal(f.report_quality_verdict, undefined)
})

test('NEVER-DROP FLOOR (Issue 2): an exclude verdict on a CONFIRMED finding is clamped to needs_polish', () => {
  const f = { id: 'F-1', severity: 'Critical', validation_status: 'CONFIRMED' }
  const out = jv.applyReportQuality(f, { verdict: 'exclude', note: 'editor wanted it gone' })
  assert.equal(out.report_quality_verdict, 'needs_polish', 'CONFIRMED can never be excluded by report-quality')
})

test('a NON-CONFIRMED finding may be excluded by report-quality', () => {
  const f = { id: 'F-2', validation_status: 'NEEDS-LIVE' }
  assert.equal(jv.applyReportQuality(f, { verdict: 'exclude' }).report_quality_verdict, 'exclude')
})

test('judgeReportQuality: LLM error ⇒ needs_polish (fail-safe)', async () => {
  const v = await jv.judgeReportQuality({ id: 'F', title: 't' }, { callLLM: async () => { throw new Error('boom') } })
  assert.equal(v.verdict, 'needs_polish')
})

test('judgeReportQuality: parses a clean verdict', async () => {
  const v = await jv.judgeReportQuality({ id: 'F', title: 't', validation_status: 'CONFIRMED' }, { callLLM: async () => '{"verdict":"ok","note":"clear"}' })
  assert.equal(v.verdict, 'ok')
})

test('REPORT_QUALITY_SCHEMA validates a verdict', () => {
  assert.deepEqual(validate(jv.REPORT_QUALITY_SCHEMA, { verdict: 'ok', note: 'x' }), [])
  assert.ok(validate(jv.REPORT_QUALITY_SCHEMA, { verdict: 'nope' }).length > 0)
})
