'use strict'
// End-to-end fake-agent harness. Drives the REAL dispatch router (dispatchToAgent) with the canned
// `fake` adapter (ADAPTER=fake) so black-box, static, and white-box each run start-to-finish to a
// terminal 'done' — no real claude, no LLM, no live network. Proves "the pentest runs end-to-end and
// gives done" for every mode, including an AUTHENTICATED black-box run (username + password).
//
// Opt-in + slow (real pipeline, ~1–2 min): skipped by the fast gate (test/run-all.js SKIP_FILES),
// run it with `npm run test:e2e` (ARCHON_E2E=1 + --test-force-exit — the pentest pipeline leaves
// unref'd timers, so force-exit is needed to end the process after the tests complete).
//
// The target server runs in a SEPARATE process on purpose: the pentest pipeline uses blocking
// spawnSync for its recon tools (pre-flight / WAF curl), which freezes THIS event loop — an in-process
// server would never get to answer, so the tools would time out. A child-process server serves fine.

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const net = require('node:net')
const http = require('node:http')
const { spawn } = require('node:child_process')

const E2E = process.env.ARCHON_E2E === '1'

// ── one-time hermetic env BEFORE requiring event-bus (paths.js reads env at load) ──
const INTEL = fs.mkdtempSync(path.join(os.tmpdir(), 'archon-e2e-intel-'))
fs.mkdirSync(path.join(INTEL, 'inbox', 'task-actions'), { recursive: true })
const CLAUDE_STUB = path.join(INTEL, 'claude-stub.sh')
fs.writeFileSync(CLAUDE_STUB, "#!/bin/sh\necho '{}'\n"); fs.chmodSync(CLAUDE_STUB, 0o755)
process.env.KURU_INTEL_ROOT = INTEL
process.env.ADAPTER = 'fake'
process.env.ARCHON_SCOPE_OVERRIDE = '1'
process.env.KURU_CLAUDE_BIN = CLAUDE_STUB
for (const m of ['../paths', '../event-bus']) { try { delete require.cache[require.resolve(m)] } catch {} }

const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { dispatchToAgent } = require('../event-bus')

const delay = (ms) => new Promise(r => setTimeout(r, ms))
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
const httpOk = (port) => new Promise(res => { const req = http.get({ host: '127.0.0.1', port, timeout: 1000 }, r => { r.resume(); res(true) }); req.on('error', () => res(false)); req.on('timeout', () => { req.destroy(); res(false) }) })

let serverProc, PORT
before(async () => {
  if (!E2E) return
  PORT = await freePort()
  // A JS-heavy SPA-ish page so JS bundle discovery has something (built-in, no tool needed).
  serverProc = spawn(process.execPath, ['-e',
    `require('http').createServer((_,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end('<html><head><script src="/main.js"></script></head><body>ok</body></html>')}).listen(${PORT},'127.0.0.1')`],
    { stdio: 'ignore' })
  for (let i = 0; i < 50 && !(await httpOk(PORT)); i++) await delay(100) // wait until the child serves
})
after(() => {
  try { serverProc && serverProc.kill('SIGKILL') } catch {}
  for (const d of [INTEL, WB.src, WB.out]) { try { d && fs.rmSync(d, { recursive: true, force: true }) } catch {} }
})

const target = () => `http://127.0.0.1:${PORT}`
const readTasks = () => { try { return JSON.parse(fs.readFileSync(path.join(INTEL, 'tasks.json'), 'utf8')) } catch { return [] } }
const writeJson = (name, obj) => fs.writeFileSync(path.join(INTEL, name), JSON.stringify(obj, null, 2))
const statusOf = (id) => (readTasks().find(t => String(t.id) === String(id)) || {}).status
const upsertTask = (t) => writeJson('tasks.json', [...readTasks().filter(x => x.id !== t.id), t])

// Seed a pentest task so it runs to done without the (slow) crawl: an existing endpoints file makes
// the daemon skip TRACER (the `!fs.existsSync(endpointMapFile)` guard) and keeps early-exit off.
function seedPentestTask(taskId) {
  upsertTask({ id: taskId, status: 'in-progress', squad: 'pentest-squad', createdAt: new Date().toISOString() })
  writeJson('dispatch-queue.json', [{ taskId, squad: 'pentest-squad', status: 'processing' }])
  writeJson(`pentest-endpoints-${taskId}.json`, { endpoints: [{ method: 'GET', path: '/', params: [] }] })
}
function makeSourceDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archon-e2e-src-'))
  fs.writeFileSync(path.join(dir, 'app.js'), `const app=require('express')();\napp.get('/api/users/:id',(q,r)=>{r.json({})});\napp.post('/login',(q,r)=>{});\nmodule.exports=app;\n`)
  fs.writeFileSync(path.join(dir, 'auth.js'), `module.exports={verify:t=>t}\n`)
  return dir
}
// Per-test cap: a hang fails the one test instead of wedging the suite. Generous because this is the
// REAL pipeline — code-review fans out many agents and each daemon spawn carries a ~10s phase gap, so
// a full run legitimately takes ~2–3 min. Opt-in + gated, so wall-clock isn't the concern; done is.
const T = 300000

test('black-box UNAUTH pentest runs end-to-end → done', { skip: !E2E, timeout: T }, async () => {
  const taskId = 'bb-unauth-' + Math.random().toString(36).slice(2, 7)
  seedPentestTask(taskId)
  await dispatchToAgent({ taskId, assignee: 'ATLAS', squad: 'pentest-squad', goal: `Pentest ${target()}/`,
    meta: { targetUrl: target(), testType: 'feature', focusClasses: ['injection'] } })
  assert.equal(statusOf(taskId), 'done', 'black-box unauth reaches a terminal done')
})

test('black-box AUTHENTICATED pentest (username + password) runs end-to-end → done', { skip: !E2E, timeout: T }, async () => {
  const taskId = 'bb-auth-' + Math.random().toString(36).slice(2, 7)
  seedPentestTask(taskId)
  await dispatchToAgent({ taskId, assignee: 'ATLAS', squad: 'pentest-squad', goal: `Pentest ${target()}/ — 1 test account`,
    meta: { targetUrl: target(), testType: 'feature', focusClasses: ['access-control'],
      credentials: [{ username: 'testuser', password: 'testpass', role: 'normal' }] } })
  assert.equal(statusOf(taskId), 'done', 'the AUTHENTICATED dispatch reaches the SAME terminal done as unauth')
})

test('static code-review runs end-to-end → done', { skip: !E2E, timeout: T }, async () => {
  const taskId = 'cr-static-' + Math.random().toString(36).slice(2, 7)
  const src = makeSourceDir(), out = fs.mkdtempSync(path.join(os.tmpdir(), 'archon-e2e-crout-'))
  upsertTask({ id: taskId, status: 'in-progress', squad: 'code-review-squad', createdAt: new Date().toISOString() })
  try {
    await dispatchToAgent({ taskId, assignee: 'CURATOR', squad: 'code-review-squad', goal: 'Review source',
      meta: { sourceDir: src, outputDir: out, features: [{ slug: 'auth', name: 'Auth' }], maxPhase2: 1 } })
    assert.equal(statusOf(taskId), 'done', 'static code-review reaches done')
  } finally { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true }) }
})

// White-box = ONE engagement, two halves run back-to-back (code-review, then the source-guided pentest
// it defers). Split into two tests so each half gets its own cap — the combined run is ~2 full pipelines
// (~310s) which no single per-test cap should have to swallow — and so the output names each half's done.
// node:test runs in-file order, so the pentest half can rely on state the code-review half set up.
const WB = { E: 'cr-wb-' + Math.random().toString(36).slice(2, 7), pId: 'bb-wb-' + Math.random().toString(36).slice(2, 7) }
WB.src = makeSourceDir(); WB.out = fs.mkdtempSync(path.join(os.tmpdir(), 'archon-e2e-wbout-'))
WB.deferred = { action: 'dispatch', taskId: WB.pId, assignee: 'ATLAS', squad: 'pentest-squad', goal: `Pentest ${target()}/`,
  meta: { targetUrl: () => target(), engagementId: WB.E, sourceGuided: true, engagementMode: 'whitebox', testType: 'feature', focusClasses: ['injection'] } }

test('white-box 1/2: code-review half (source + deployUrl) → done + defers the pentest', { skip: !E2E, timeout: T }, async () => {
  WB.deferred.meta.targetUrl = target() // resolve now that the server port is up
  upsertTask({ id: WB.E, status: 'in-progress', squad: 'code-review-squad', createdAt: new Date().toISOString() })
  upsertTask({ id: WB.pId, status: 'in-progress', squad: 'pentest-squad', createdAt: new Date().toISOString() })
  writeJson(`engagement-${WB.E}.json`, { engagementId: WB.E,
    iterations: [{ kind: 'whitebox', taskId: WB.E }, { kind: 'blackbox', taskId: WB.pId, status: 'pending-source-guidance' }],
    deferredPentestDispatch: WB.deferred })
  await dispatchToAgent({ taskId: WB.E, assignee: 'CURATOR', squad: 'code-review-squad', goal: 'White-box review',
    meta: { sourceDir: WB.src, outputDir: WB.out, deployUrl: target(), engagementId: WB.E, features: [{ slug: 'auth', name: 'Auth' }], maxPhase2: 1 } })
  assert.equal(statusOf(WB.E), 'done', 'white-box code-review half reaches done')
  assert.ok(fs.existsSync(path.join(INTEL, 'inbox', 'task-actions', `sg-${WB.pId}.json`)),
    'the deferred source-guided pentest was launched to the inbox (real completion-hook path)')
})

test('white-box 2/2: source-guided pentest half → done (engagement terminal)', { skip: !E2E, timeout: T }, async () => {
  assert.ok(statusOf(WB.E) === 'done', 'depends on the code-review half having completed first')
  seedPentestTask(WB.pId)
  await dispatchToAgent(WB.deferred)
  assert.equal(statusOf(WB.pId), 'done', 'source-guided pentest half reaches done — the whole engagement is terminal')
})
