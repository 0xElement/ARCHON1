// test/whitebox-deferral.test.js
// White-box contract: a combined engagement (pentest squad + sourceDir) ALWAYS defers the
// live pentest — code review runs FIRST, then a source-guided pentest verifies its findings
// against the box. So only the code-review dispatch is queued immediately; the pentest is
// stashed on the engagement (source-guided, iteration pending-source-guidance) and launched by
// the code-review completion hook. A plain pentest (no sourceDir) still dispatches immediately.

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

function loadDashboardWith(env) {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'archon-defer-'))
  const keys = ['KURU_INTEL_ROOT', 'KURU_AGENTS_ROOT', 'ARCHON_ENABLE_AUTONOMOUS_OS', 'ARCHON_ENABLE_SOURCE_GUIDED_PENTEST', 'ARCHON_DRIVE_SOURCE_GUIDED_PENTEST']
  const saved = {}
  for (const k of keys) saved[k] = process.env[k]
  process.env.KURU_INTEL_ROOT = TMP
  process.env.KURU_AGENTS_ROOT = path.join(__dirname, '..')
  Object.assign(process.env, env)
  for (const m of ['../paths', '../scripts/dashboard']) delete require.cache[require.resolve(m)]
  const d = require('../scripts/dashboard')
  const restore = () => { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
    for (const m of ['../paths', '../scripts/dashboard']) delete require.cache[require.resolve(m)] }
  return { d, TMP, restore }
}

const combinedBody = (srcDir) => ({ squad: 'pentest', meta: {
  targetUrl: 'https://wb.test', inScope: ['wb.test'], sourceDir: srcDir,
  credentials: [{ username: 'u', password: 'p', role: 'admin' }],
} })

function inboxDispatches(TMP) {
  const dir = path.join(TMP, 'inbox', 'task-actions')
  try { return fs.readdirSync(dir).map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) } catch { return null } }).filter(Boolean) } catch { return [] }
}

test('combined white-box ALWAYS defers the pentest (code review first, then source-guided verify)', () => {
  // Default behavior — no autonomous-OS flags set. The pentest must be deferred so the
  // code review runs first and its findings aim the live verification against the box.
  const { d, TMP, restore } = loadDashboardWith({})
  try {
    const src = path.join(__dirname, '..')
    const r = d.createDispatch(combinedBody(src))
    assert.equal(r.deferred, true, 'createDispatch reports the pentest was deferred')
    const inbox = inboxDispatches(TMP)
    assert.ok(!inbox.some(x => x.taskId === r.taskId && x.squad === 'pentest-squad'), 'pentest dispatch NOT queued yet (deferred until code review completes)')
    assert.ok(inbox.some(x => x.squad === 'code-review-squad'), 'code-review dispatch queued immediately (runs first)')
    const eng = JSON.parse(fs.readFileSync(path.join(TMP, `engagement-${r.taskId}.json`), 'utf8'))
    assert.ok(eng.deferredPentestDispatch, 'pentest dispatch stashed on the engagement')
    assert.equal(eng.deferredPentestDispatch.meta.sourceGuided, true, 'stashed dispatch stamped source-guided')
    assert.equal(eng.deferredPentestDispatch.meta.engagementMode, 'whitebox')
    const bb = (eng.iterations || []).find(i => i.kind === 'blackbox')
    assert.equal(bb.status, 'pending-source-guidance')
  } finally { restore() }
})

test('a plain pentest (no sourceDir) is NOT deferred — dispatches immediately', () => {
  const { d, TMP, restore } = loadDashboardWith({})
  try {
    const r = d.createDispatch({ squad: 'pentest', meta: {
      targetUrl: 'https://bb.test', inScope: ['bb.test'],
      credentials: [{ username: 'u', password: 'p', role: 'admin' }],
    } })
    assert.notEqual(r.deferred, true, 'a black-box pentest is not deferred')
    const inbox = inboxDispatches(TMP)
    assert.ok(inbox.some(x => x.taskId === r.taskId && x.squad === 'pentest-squad'), 'pentest dispatch queued immediately')
    const eng = JSON.parse(fs.readFileSync(path.join(TMP, `engagement-${r.taskId}.json`), 'utf8'))
    assert.ok(!eng.deferredPentestDispatch, 'no deferral for a source-less pentest')
  } finally { restore() }
})
