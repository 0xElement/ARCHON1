// test/whitebox-deferral.test.js
// P6 white-box deferral (ULTRAPLAN §3.2): flag-off ⇒ a combined engagement writes
// BOTH dispatches (byte-stable); flag ACTIVE ⇒ the pentest dispatch is DEFERRED
// (only code-review queued; pentest stashed as a source-guided white-box dispatch).

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

test('flag-OFF: a combined engagement queues BOTH the pentest and code-review dispatches', () => {
  const { d, TMP, restore } = loadDashboardWith({})
  try {
    const src = path.join(__dirname, '..')
    const r = d.createDispatch(combinedBody(src))
    const inbox = inboxDispatches(TMP)
    assert.ok(inbox.some(x => x.taskId === r.taskId && x.squad === 'pentest-squad'), 'pentest dispatch queued (flag-off)')
    assert.ok(inbox.some(x => x.squad === 'code-review-squad'), 'code-review dispatch queued')
    const eng = JSON.parse(fs.readFileSync(path.join(TMP, `engagement-${r.taskId}.json`), 'utf8'))
    assert.ok(!eng.deferredPentestDispatch, 'no deferral when flag off')
  } finally { restore() }
})

test('flag-ACTIVE: the pentest dispatch is DEFERRED (only code-review queued; pentest stashed white-box)', () => {
  const { d, TMP, restore } = loadDashboardWith({ ARCHON_ENABLE_AUTONOMOUS_OS: '1', ARCHON_ENABLE_SOURCE_GUIDED_PENTEST: '1', ARCHON_DRIVE_SOURCE_GUIDED_PENTEST: '1' })
  try {
    const src = path.join(__dirname, '..')
    const r = d.createDispatch(combinedBody(src))
    assert.equal(r.deferred, true, 'createDispatch reports the pentest was deferred')
    const inbox = inboxDispatches(TMP)
    assert.ok(!inbox.some(x => x.taskId === r.taskId && x.squad === 'pentest-squad'), 'pentest dispatch NOT queued yet (deferred)')
    assert.ok(inbox.some(x => x.squad === 'code-review-squad'), 'code-review still queued immediately')
    const eng = JSON.parse(fs.readFileSync(path.join(TMP, `engagement-${r.taskId}.json`), 'utf8'))
    assert.ok(eng.deferredPentestDispatch, 'pentest dispatch stashed on the engagement')
    assert.equal(eng.deferredPentestDispatch.meta.sourceGuided, true, 'stashed dispatch stamped source-guided')
    assert.equal(eng.deferredPentestDispatch.meta.engagementMode, 'whitebox')
    const bb = (eng.iterations || []).find(i => i.kind === 'blackbox')
    assert.equal(bb.status, 'pending-source-guidance')
  } finally { restore() }
})
