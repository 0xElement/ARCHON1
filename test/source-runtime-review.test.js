'use strict'
// M6: Phase 2 runs as FEW persistent specialist review sessions (one per agent, each working many jobs),
// not one fresh spawn per (feature × class). The full job set is still queued + streamed per job.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path')
require('../paths')
const cr = require('../src/dispatch/code-review-dispatcher')

function makeSourceDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm6src-'))
  fs.writeFileSync(path.join(dir, 'app.rb'), 'get "/x" do\n 1\nend\n')
  return dir
}

test('M6: 5 features × 2 classes = 10 jobs run as 2 persistent specialist sessions, streaming per job', async () => {
  const srcDir = makeSourceDir()
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm6out-'))
  const features = ['a', 'b', 'c', 'd', 'e'].map((s) => ({ slug: s, name: s.toUpperCase(), domain: 'misc', risk_hint: 'medium', keywords: s }))
  const reviewCalls = []
  const emitted = []
  const deps = {
    spawnAgent: async (agentName, taskId, prompt, sessionSuffix) => {
      if (sessionSuffix && sessionSuffix.includes('-batch')) {
        const dirM = prompt.match(/(\S+)\/phase1-maps\/features\//)
        const slugs = [...prompt.matchAll(/slug:\s*([a-z0-9_-]+)/gi)].map((m) => m[1])
        if (dirM) for (const s of slugs) { fs.mkdirSync(`${dirM[1]}/phase1-maps/features`, { recursive: true }); fs.writeFileSync(`${dirM[1]}/phase1-maps/features/${s}.md`, `# ${s}`) }
      }
      if (sessionSuffix && sessionSuffix.includes('-p2rev-')) {
        const jobPaths = [...prompt.matchAll(/(\S+\/phase2\/[^/\s]+\/([^/\s]+)\.candidates\.jsonl)/g)]
        reviewCalls.push({ agentName, jobs: jobPaths.length })
        for (const m of jobPaths) { const [, cf] = m; fs.mkdirSync(path.dirname(cf), { recursive: true }); fs.writeFileSync(cf, JSON.stringify({ pattern: 'p', file: 'app.rb', line: 1, source: 's', sink: 'k', severity: 'Low', status: 'SOURCE_CONFIRMED', required_blackbox_proof: '' }) + '\n') }
      }
      return { agentName, code: 0, cost: { totalCost: 0, model: 'm', tokens: { total: 1 } }, output: '{}' }
    },
    trackCosts: () => {}, updateProgress: () => {}, log: () => {}, logActivity: () => {},
    emitCandidate: (tid, rec) => emitted.push(rec),
  }

  const res = await cr.runCodeReview({ taskId: 'm6-review', squad: 'code-review-squad', projectId: '',
    meta: { sourceDir: srcDir, vulnClasses: ['access-control', 'xss'], outputDir: outDir, deepMap: false, features } }, deps)

  const rq = fs.readFileSync(path.join(outDir, 'phase2-review-queue.jsonl'), 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  assert.equal(rq.length, 10, '5 features × 2 classes = 10 review jobs queued (full coverage)')
  assert.equal(reviewCalls.length, 2, 'ran as 2 persistent specialist sessions (marshal + cipher), not 10 spawns')
  assert.ok(reviewCalls.every((c) => c.jobs === 5), 'each session worked all 5 of its class jobs in one call')
  assert.equal(emitted.length, 10, 'every job still streamed its own candidate to the board')
  assert.equal(res.featuresMapped, 5)

  fs.rmSync(srcDir, { recursive: true, force: true }); fs.rmSync(outDir, { recursive: true, force: true })
})
