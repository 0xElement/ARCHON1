// test/mission-director.test.js
// P6 — Block A Mission Director (ULTRAPLAN §5.2). flag-off MUST be identity;
// shadow drives nothing; active respects the hop cap; decideNext is deterministic.

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')

const md = require('../src/orchestrator/mission-director')

function withEnv(env, fn) {
  const keys = ['ARCHON_ENABLE_AUTONOMOUS_OS', 'ARCHON_ENABLE_BLACKBOX_MASTER_AGENT', 'ARCHON_DRIVE_BLACKBOX_MASTER_AGENT', 'ARCHON_AUTONOMY_HOPS', 'KNOWLEDGE_GRAPH']
  const saved = {}
  for (const k of keys) { saved[k] = process.env[k]; delete process.env[k] }
  Object.assign(process.env, env)
  return Promise.resolve(fn()).finally(() => {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
  })
}

const dispatch = { taskId: 't1', squad: 'pentest', meta: {} }
function fakeDpp(calls) { return async (d) => { calls.push(d); return { totalCost: 1, allCosts: [1] } } }

test('flag-off: run() is byte-for-byte identity — calls dispatchPentestParallel once, returns its result', async () => {
  await withEnv({}, async () => {
    const calls = []
    const r = await md.run(dispatch, { dispatchPentestParallel: fakeDpp(calls) })
    assert.equal(calls.length, 1, 'exactly one pipeline call when off')
    assert.deepEqual(r, { totalCost: 1, allCosts: [1] })
  })
})

test('shadow: run() runs the pipeline ONCE and drives nothing (no extra hops)', async () => {
  await withEnv({ ARCHON_ENABLE_AUTONOMOUS_OS: '1', ARCHON_ENABLE_BLACKBOX_MASTER_AGENT: '1' }, async () => {
    const calls = []
    const r = await md.run(dispatch, { dispatchPentestParallel: fakeDpp(calls) })
    assert.equal(calls.length, 1, 'shadow must not drive extra hops')
    assert.deepEqual(r, { totalCost: 1, allCosts: [1] })
  })
})

test('active with default ARCHON_AUTONOMY_HOPS=1: still one hop (cap respected)', async () => {
  await withEnv({ ARCHON_ENABLE_AUTONOMOUS_OS: '1', ARCHON_ENABLE_BLACKBOX_MASTER_AGENT: '1', ARCHON_DRIVE_BLACKBOX_MASTER_AGENT: '1' }, async () => {
    const calls = []
    await md.run(dispatch, { dispatchPentestParallel: fakeDpp(calls), getCostBudget: () => 100, _isTaskCancelled: () => false })
    assert.equal(calls.length, 1, 'hop cap default 1 ⇒ one hop even active')
  })
})

test('decideNext is deterministic + evidence-gated (caps, cancel, triage, no-work)', () => {
  const base = { hop: 0, hopCap: 3, spent: 0, budget: 100, cancelled: false, awaitingTriage: false, recommendations: [{ x: 1 }] }
  assert.equal(md.decideNext(base).continue, true)
  assert.equal(md.decideNext({ ...base, cancelled: true }).continue, false)
  assert.equal(md.decideNext({ ...base, awaitingTriage: true }).continue, false)
  assert.equal(md.decideNext({ ...base, hop: 3 }).continue, false, 'hop cap')
  assert.equal(md.decideNext({ ...base, spent: 100 }).continue, false, 'budget')
  assert.equal(md.decideNext({ ...base, recommendations: [] }).continue, false, 'no open work')
})

test('decideNext never extends past the cap even with open work (LLM cannot override)', () => {
  assert.equal(md.decideNext({ hop: 1, hopCap: 1, spent: 0, budget: 100, cancelled: false, awaitingTriage: false, recommendations: [{ a: 1 }, { b: 2 }] }).continue, false)
})

test('deriveFocus reuses recon and focuses on the recommended classes', () => {
  const f = md.deriveFocus([{ vuln_class: 'xss' }, { vuln_class: 'idor' }, { vuln_class: 'xss' }])
  assert.equal(f.skipRecon, true)
  assert.deepEqual(f.focusClasses.sort(), ['idor', 'xss'])
})

test('run throws clearly if deps.dispatchPentestParallel is missing', async () => {
  await assert.rejects(() => md.run(dispatch, {}), /dispatchPentestParallel/)
})
