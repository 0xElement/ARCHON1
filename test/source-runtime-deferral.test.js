'use strict'
// M2: a rate-limited mapper marks its feature deferred_rate_limit (NOT blocked), and the dispatcher's
// drainDeferred loop resumes it after cooldown → the feature ends 'done'. A transient limit never becomes
// a coverage gap and is never counted as mapped while it's paused.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path')
require('../paths')
const cr = require('../src/dispatch/code-review-dispatcher')

function makeSourceDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm2src-'))
  fs.writeFileSync(path.join(dir, 'app.rb'), 'get "/users" do\n  current_user\nend\n')
  return dir
}

test('M2: a rate-limited mapper is deferred then resumed to done — never blocked', async () => {
  const srcDir = makeSourceDir()
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm2out-'))
  const calls = []
  let deferredOnce = false
  const writeMaps = (prompt) => {
    const dirM = prompt.match(/(\S+)\/phase1-maps\/features\//)
    const slugs = [...prompt.matchAll(/slug:\s*([a-z0-9_-]+)/gi)].map((m) => m[1])
    if (dirM) for (const s of slugs) { fs.mkdirSync(`${dirM[1]}/phase1-maps/features`, { recursive: true }); fs.writeFileSync(`${dirM[1]}/phase1-maps/features/${s}.md`, `# ${s}\nfast map`) }
  }
  const deps = {
    spawnAgent: async (agentName, taskId, prompt, sessionSuffix) => {
      calls.push({ agentName, sessionSuffix })
      const isInitialBatch = sessionSuffix && sessionSuffix.includes('-batch-') && !sessionSuffix.includes('-batchR')
      const isResume = sessionSuffix && sessionSuffix.includes('-defer')
      const isMap = isInitialBatch || isResume || (sessionSuffix && sessionSuffix.includes('-batchR'))
      // First initial mapping batch → rate-limited (retryable, cooldown already elapsed so no real wait).
      if (isInitialBatch && !deferredOnce) {
        deferredOnce = true
        return { agentName, code: 429, cost: null, output: '', ok: false, retryable: true, reason: 'rate_limited', cooldownUntil: new Date(Date.now() - 1000).toISOString() }
      }
      if (isMap) writeMaps(prompt) // fast-map success (and every resume) writes the map file
      return { agentName, code: 0, cost: { totalCost: 0, model: 'm', tokens: { total: 1 } }, output: '{}' }
    },
    trackCosts: () => {}, updateProgress: () => {}, log: () => {}, logActivity: () => {},
  }

  const res = await cr.runCodeReview({ taskId: 'm2-defer', squad: 'code-review-squad', projectId: '',
    meta: { sourceDir: srcDir, vulnClasses: ['access-control'], outputDir: outDir,
      features: [{ slug: 'auth', name: 'Auth', domain: 'auth_identity', risk_hint: 'high', keywords: 'login' },
                 { slug: 'uploads', name: 'Uploads', domain: 'files_uploads', risk_hint: 'medium', keywords: 'upload' }] } }, deps)

  assert.ok(deferredOnce, 'the stub rate-limited a mapping batch at least once')
  assert.ok(calls.some((c) => /-defer\d/.test(c.sessionSuffix || '')), 'drainDeferred resumed with a -defer session')
  assert.equal(res.featuresMapped, 2, 'both features resumed to mapped (done) after the rate limit')
  assert.equal(res.featuresDeferred, 0, 'nothing left deferred at the end')
  assert.equal(res.blockers, 0, 'a transient rate limit is NEVER turned into a blocked coverage gap')

  const led = JSON.parse(fs.readFileSync(path.join(outDir, 'phase1-maps', 'mapping-ledger.json'), 'utf8'))
  assert.equal(led.features_mapped, 2)
  assert.ok(Object.values(led.features).every((f) => f.status === 'done' || f.status === 'reviewed'), 'every feature terminally mapped')

  fs.rmSync(srcDir, { recursive: true, force: true }); fs.rmSync(outDir, { recursive: true, force: true })
})

test('M2: retry budget exhausted → deferred becomes a REPORTED blocked_coverage_gap (never silent, never mapped)', async () => {
  const srcDir = makeSourceDir()
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm2out2-'))
  const deps = {
    // ALWAYS rate-limited (cooldown in the past → no real wait) and never writes a map → the feature can
    // never map. After DEFER_MAX_RETRIES it must become blocked_coverage_gap, not loop forever or vanish.
    spawnAgent: async (agentName, taskId, prompt, sessionSuffix) => {
      const isMap = sessionSuffix && (sessionSuffix.includes('-batch') || sessionSuffix.includes('-defer'))
      if (isMap) return { agentName, code: 429, cost: null, output: '', ok: false, retryable: true, reason: 'rate_limited', cooldownUntil: new Date(Date.now() - 1000).toISOString() }
      return { agentName, code: 0, cost: { totalCost: 0, model: 'm', tokens: { total: 1 } }, output: '{}' }
    },
    trackCosts: () => {}, updateProgress: () => {}, log: () => {}, logActivity: () => {},
  }
  const res = await cr.runCodeReview({ taskId: 'm2-exhaust', squad: 'code-review-squad', projectId: '',
    meta: { sourceDir: srcDir, vulnClasses: ['access-control'], outputDir: outDir,
      features: [{ slug: 'auth', name: 'Auth', domain: 'auth_identity', risk_hint: 'high', keywords: 'login' }] } }, deps)

  assert.equal(res.featuresMapped, 0, 'never mapped — a rate limit is not progress')
  assert.equal(res.featuresDeferred, 0, 'no longer deferred — resolved to a coverage gap')
  assert.equal(res.blockers, 1, 'exhausted rate-limit retries → a reported blocked coverage gap')
  const led = JSON.parse(fs.readFileSync(path.join(outDir, 'phase1-maps', 'mapping-ledger.json'), 'utf8'))
  assert.equal(led.features.auth.status, 'blocked_coverage_gap')

  fs.rmSync(srcDir, { recursive: true, force: true }); fs.rmSync(outDir, { recursive: true, force: true })
})
