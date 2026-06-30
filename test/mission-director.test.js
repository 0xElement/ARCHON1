// test/mission-director.test.js
// P6 — Block A Mission Director (ULTRAPLAN §5.2). flag-off MUST be identity;
// shadow drives nothing; active respects the hop cap; decideNext is deterministic.

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

// Shadow/active mode writes director-recommendations.jsonl to INTEL_ROOT/shadow.
// Redirect INTEL_ROOT to a throwaway dir so the suite NEVER pollutes the real
// var/intel — that keeps the CI flag-off byte-stability check (no shadow/kg
// artifacts) honest. Set before the first require that loads paths.
process.env.KURU_INTEL_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'archon-md-'))
for (const m of ['../paths', '../src/shadow/shadow-sink', '../src/orchestrator/mission-director']) {
  try { delete require.cache[require.resolve(m)] } catch {}
}
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

// ── handoff item 7: structured decision log ──────────────────────────────────
test('decisionRecord captures agent/why/evidence/task/confidence/outcome', () => {
  const r = md.decisionRecord({
    hop: 2, mode: 'active', agent: 'atlas-followup', decision: 'launch-hop',
    why: 'open work', evidence: { openWork: 3 }, task_created: ['xss'], confidence: 0.8, outcome: 'hop-launched',
  })
  assert.equal(r.agent, 'atlas-followup')
  assert.equal(r.decision, 'launch-hop')
  assert.equal(r.why, 'open work')
  assert.deepEqual(r.task_created, ['xss'])
  assert.equal(r.confidence, 0.8)
  assert.equal(r.outcome, 'hop-launched')
  assert.ok(r.ts) // every decision is timestamped
})

test('decisionRecord defaults agent to mission-director and nulls absent fields', () => {
  const r = md.decisionRecord({ hop: 0, mode: 'shadow', decision: 'gate', why: 'no-open-work', outcome: 'stop' })
  assert.equal(r.agent, 'mission-director')
  assert.equal(r.task_created, null)
  assert.equal(r.confidence, null)
  assert.equal(r.evidence, null)
})

test('recommendationDecisions maps each rec to a decision row with source as agent', () => {
  const recs = [
    { source: 'atlas-followup', type: 'followup', objective: 'chase SSRF', vuln_class: 'ssrf' },
    { source: 'coverage-gap', type: 'coverage', objective: 'Cover WSTG-ATHN-01', wstg: 'WSTG-ATHN-01' },
  ]
  const rows = md.recommendationDecisions({ hop: 1, mode: 'active', recommendations: recs, queued: true })
  assert.equal(rows.length, 2)
  assert.equal(rows[0].agent, 'atlas-followup')
  assert.equal(rows[0].decision, 'recommend-task')
  assert.equal(rows[0].why, 'chase SSRF')
  assert.equal(rows[0].evidence.vuln_class, 'ssrf')
  assert.equal(rows[0].task_created, 'chase SSRF') // queued ⇒ a task was created
  assert.equal(rows[0].outcome, 'queued')
  assert.equal(rows[1].evidence.wstg, 'WSTG-ATHN-01')
  // not queued ⇒ observed only, no task created
  const observed = md.recommendationDecisions({ hop: 0, mode: 'shadow', recommendations: recs, queued: false })
  assert.equal(observed[0].task_created, null)
  assert.equal(observed[0].outcome, 'observed')
})
