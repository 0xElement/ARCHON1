'use strict'
// Code-review (static + white-box source) dispatcher — SCENARIO tests with FAKE agents + fed data.
// Goal (the operator's ask): prove a run NEVER hangs, blocks, or breaks — it always returns a
// terminal outcome (a normal result / {error} / {cancelled}), across happy-path, bad-input, empty
// queue, cancellation, every-agent-times-out, and a throwing agent. Uses runCodeReview's dependency
// injection (deps.spawnAgent, …) — no real `claude` spawns, no network, no daemon. node:test's
// per-test timeout is itself the "did it hang?" guard: a hang fails the test instead of the suite.

// isolate the data layer before requiring the module (it reads KURU_INTEL_ROOT at load)
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
process.env.KURU_INTEL_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'archon-cr-intel-'))
for (const m of ['../paths', '../src/dispatch/code-review-dispatcher']) { try { delete require.cache[require.resolve(m)] } catch {} }

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { runCodeReview } = require('../src/dispatch/code-review-dispatcher')

// A small real source tree — validateSourceDir + inventories read the filesystem.
function makeSourceDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archon-crsrc-'))
  fs.writeFileSync(path.join(dir, 'app.js'),
    `const express=require('express');const app=express();\n` +
    `app.get('/api/users/:id',(req,res)=>{const q="SELECT * FROM users WHERE id="+req.params.id;db.query(q,(e,r)=>res.json(r))});\n` +
    `app.post('/login',(req,res)=>{ /* auth */ });\napp.post('/api/orders',(req,res)=>{});\nmodule.exports=app;\n`)
  fs.writeFileSync(path.join(dir, 'auth.js'), `const jwt=require('jsonwebtoken');\nfunction verify(t){return jwt.verify(t,process.env.SECRET)}\nmodule.exports={verify}\n`)
  fs.writeFileSync(path.join(dir, 'db.js'), `module.exports={query:(q,cb)=>cb(null,[])}\n`)
  return dir
}
const rm = (d) => { try { fs.rmSync(d, { recursive: true, force: true }) } catch {} }

// Fake deps: records agent calls / progress / onFindingsReady; spawnBehavior injects errors/throws.
function harness(opts = {}) {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'archon-crout-'))
  const calls = [], progress = [], findingsReady = []
  const deps = {
    spawnAgent: async (agent, taskId, prompt, suffix) => {
      calls.push({ agent, suffix })
      if (opts.spawnBehavior) { const r = await opts.spawnBehavior({ agent, suffix }); if (r !== undefined) return r }
      return { code: 0, output: 'ok', cost: 0, model: 'test' }
    },
    trackCosts: () => {},
    updateProgress: (p, msg) => progress.push({ p, msg }),
    log: () => {}, logActivity: () => {},
    _isTaskCancelled: opts.isCancelled || (() => false),
    onFindingsReady: async (tid, oDir) => { findingsReady.push({ tid, oDir }) },
  }
  return { TMP, calls, progress, findingsReady, deps }
}
const dispatchFor = (srcDir, outDir, extraMeta = {}) => ({
  taskId: 't-crtest-' + Math.random().toString(36).slice(2, 8),
  squad: 'code-review-squad', projectId: null,
  meta: { sourceDir: srcDir, outputDir: outDir, features: [{ slug: 'auth', name: 'Auth' }, { slug: 'users', name: 'Users' }], maxPhase2: 2, ...extraMeta },
})

test('happy path: a valid review COMPLETES (never hangs) → terminal result + findings surfaced', async () => {
  const src = makeSourceDir(); const h = harness()
  try {
    const r = await runCodeReview(dispatchFor(src, h.TMP), h.deps)
    assert.ok(r && r.outputDir, 'returns a normal result with outputDir')
    assert.ok(!r.error && !r.cancelled, 'not error/cancel')
    assert.ok(h.calls.length > 0, 'agents spawned (blueprint → mapping → phase2 → auditor → scribe)')
    assert.equal(h.findingsReady.length, 1, 'onFindingsReady fired once (live-board parity)')
    assert.equal(h.progress.at(-1).p, 100, 'progress reached 100%')
  } finally { rm(src) }
})

test('bad sourceDir → {error} at phase 0, ZERO agents spawned (no hang, no wasted spawns)', async () => {
  const h = harness()
  const r = await runCodeReview(dispatchFor(path.join(os.tmpdir(), 'archon-does-not-exist-xyz'), h.TMP), h.deps)
  assert.equal(r.phase, 0)
  assert.ok(r.error, 'returns {error} for an invalid source dir')
  assert.equal(h.calls.length, 0, 'no agents spawned')
})

test('empty feature queue → {error} (aborts cleanly, never hangs)', async () => {
  const src = makeSourceDir(); const h = harness()
  try {
    const r = await runCodeReview(dispatchFor(src, h.TMP, { features: undefined }), h.deps)
    assert.ok(r.error && /feature queue/i.test(r.error), 'aborts on empty feature queue')
  } finally { rm(src) }
})

test('cancellation halts early → {cancelled}, no further phases, no hang', async () => {
  const src = makeSourceDir(); const h = harness({ isCancelled: () => true })
  try {
    const r = await runCodeReview(dispatchFor(src, h.TMP), h.deps)
    assert.equal(r.cancelled, true, 'returns {cancelled}')
    assert.equal(h.findingsReady.length, 0, 'no findings surfaced on a cancelled run')
  } finally { rm(src) }
})

test('every agent times out (exit 143) → fail-soft, the run STILL COMPLETES (never hangs)', async () => {
  const src = makeSourceDir()
  const h = harness({ spawnBehavior: () => ({ code: 143, output: '', cost: 0, model: 'test' }) })
  try {
    const r = await runCodeReview(dispatchFor(src, h.TMP), h.deps)
    assert.ok(r && r.outputDir, 'completes to a terminal result even when every agent times out')
    assert.ok(!r.error && !r.cancelled)
  } finally { rm(src) }
})

test('a throwing agent PROPAGATES (so the daemon catch marks the run failed) — it is not swallowed into a hang', async () => {
  const src = makeSourceDir()
  const h = harness({ spawnBehavior: ({ suffix }) => { if (/blueprint/.test(suffix)) throw new Error('agent boom') } })
  try {
    await assert.rejects(() => runCodeReview(dispatchFor(src, h.TMP), h.deps), /agent boom/,
      'the throw surfaces to the daemon (which marks the task failed + releases the leader slot)')
  } finally { rm(src) }
})
