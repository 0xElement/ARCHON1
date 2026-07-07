'use strict'
// M5: the dispatcher emits Source Runtime events (var/intel/source-runtime-<taskId>.jsonl) that drive the UI
// card — a planning event with the session decision, and one mapping event per feature carrying honest
// mapped_count / assigned_total.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path')
const __roots = require('../paths')
const cr = require('../src/dispatch/code-review-dispatcher')

function makeSourceDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm5src-'))
  fs.writeFileSync(path.join(dir, 'app.rb'), 'get "/x" do\n 1\nend\n')
  return dir
}

test('M5: planning + per-feature mapping events are emitted with honest counts', async () => {
  const srcDir = makeSourceDir()
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm5out-'))
  const taskId = 'm5-events'
  const deps = {
    spawnAgent: async (agentName, taskId2, prompt, sessionSuffix) => {
      if (sessionSuffix && sessionSuffix.includes('-batch')) {
        const dirM = prompt.match(/(\S+)\/phase1-maps\/features\//)
        const slugs = [...prompt.matchAll(/slug:\s*([a-z0-9_-]+)/gi)].map((m) => m[1])
        if (dirM) for (const s of slugs) { fs.mkdirSync(`${dirM[1]}/phase1-maps/features`, { recursive: true }); fs.writeFileSync(`${dirM[1]}/phase1-maps/features/${s}.md`, `# ${s}`) }
      }
      return { agentName, code: 0, cost: { totalCost: 0, model: 'm', tokens: { total: 1 } }, output: '{}' }
    },
    trackCosts: () => {}, updateProgress: () => {}, log: () => {}, logActivity: () => {},
  }
  await cr.runCodeReview({ taskId, squad: 'code-review-squad', projectId: '',
    meta: { sourceDir: srcDir, vulnClasses: ['access-control'], outputDir: outDir, deepMap: false,
      features: [{ slug: 'login', name: 'Login', domain: 'auth_identity', risk_hint: 'high', keywords: 'auth' },
                 { slug: 'search', name: 'Search', domain: 'search_browse', risk_hint: 'low', keywords: 'q' },
                 { slug: 'upload', name: 'Upload', domain: 'files_uploads', risk_hint: 'medium', keywords: 'file' }] } }, deps)

  const evFile = path.join(__roots.INTEL_ROOT, `source-runtime-${taskId}.jsonl`)
  const events = fs.readFileSync(evFile, 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))

  const planning = events.find((e) => e.phase === 'planning' && e.status === 'planned')
  assert.ok(planning, 'a planning event was emitted')
  assert.ok(planning.mapping_sessions >= 1 && planning.max_concurrent_sessions >= 1)
  assert.ok(events.every((e) => typeof e.ts === 'string' && e.taskId === taskId), 'every event is timestamped + task-scoped')

  const done = events.filter((e) => e.phase === 'mapping' && e.status === 'done')
  assert.equal(done.length, 3, 'one done event per mapped feature')
  assert.ok(done.every((e) => e.feature && typeof e.mapped_count === 'number' && typeof e.assigned_total === 'number'))
  assert.deepEqual(done.map((e) => e.feature).sort(), ['login', 'search', 'upload'])

  fs.rmSync(evFile, { force: true })
  fs.rmSync(srcDir, { recursive: true, force: true }); fs.rmSync(outDir, { recursive: true, force: true })
})
