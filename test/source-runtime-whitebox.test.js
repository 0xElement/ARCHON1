'use strict'
// M7: white-box source→runtime validation. A source review candidate carries the concrete live-validation
// target (endpoint + required_blackbox_proof); those survive to the emitted board record and become a
// suggested_blackbox_task for the deferred black-box run; a source-only finding NEVER becomes
// RUNTIME_CONFIRMED without actual runtime proof.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path')
require('../paths')
const cr = require('../src/dispatch/code-review-dispatcher')
const wb = require('../src/dispatch/whitebox-correlation')

function makeSourceDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm7src-'))
  fs.writeFileSync(path.join(dir, 'orders.rb'), 'class O; def show; Order.find(params[:id]); end; end\n')
  return dir
}

test('M7: a source candidate carries the live-validation target to the board (endpoint + required proof), stays SOURCE_CONFIRMED', async () => {
  const srcDir = makeSourceDir()
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm7out-'))
  const emitted = []
  const deps = {
    spawnAgent: async (agentName, taskId, prompt, sessionSuffix) => {
      if (sessionSuffix && sessionSuffix.includes('-batch')) {
        const dirM = prompt.match(/(\S+)\/phase1-maps\/features\//)
        const slugs = [...prompt.matchAll(/slug:\s*([a-z0-9_-]+)/gi)].map((m) => m[1])
        if (dirM) for (const s of slugs) { fs.mkdirSync(`${dirM[1]}/phase1-maps/features`, { recursive: true }); fs.writeFileSync(`${dirM[1]}/phase1-maps/features/${s}.md`, `# ${s}`) }
      }
      if (sessionSuffix && sessionSuffix.includes('-p2rev-')) {
        for (const m of prompt.matchAll(/(\S+\/phase2\/[^/\s]+\/([^/\s]+)\.candidates\.jsonl)/g)) {
          const [, cf] = m; fs.mkdirSync(path.dirname(cf), { recursive: true })
          fs.writeFileSync(cf, JSON.stringify({ feature: 'orders', pattern: 'idor', file: 'orders.rb', line: 1,
            source: 'params[:id]', sink: 'Order.find', endpoint: 'GET /orders/:id', severity: 'High', confidence: 90,
            hypothesis: 'IDOR — any user reads any order', evidence: 'Order.find(params[:id])',
            status: 'SOURCE_CONFIRMED', required_blackbox_proof: 'GET /orders/2 as user A, observe user B order' }) + '\n')
        }
      }
      return { agentName, code: 0, cost: { totalCost: 0, model: 'm', tokens: { total: 1 } }, output: '{}' }
    },
    trackCosts: () => {}, updateProgress: () => {}, log: () => {}, logActivity: () => {},
    emitCandidate: (tid, rec) => emitted.push(rec),
  }
  await cr.runCodeReview({ taskId: 'm7-wb', squad: 'code-review-squad', projectId: '',
    meta: { sourceDir: srcDir, vulnClasses: ['access-control'], outputDir: outDir, deepMap: false,
      features: [{ slug: 'orders', name: 'Orders', domain: 'orders_checkout', risk_hint: 'high', keywords: 'order' }] } }, deps)

  const rec = emitted.find((r) => r.feature === 'orders')
  assert.ok(rec, 'a source candidate reached the board')
  assert.equal(rec.endpoint, 'GET /orders/:id', 'the affected endpoint (live-validation target) survived')
  assert.equal(rec.required_blackbox_proof, 'GET /orders/2 as user A, observe user B order', 'the required live proof survived')
  assert.equal(rec.confirmation_status, 'SOURCE_CONFIRMED', 'source-only → SOURCE_CONFIRMED')
  assert.ok(!rec.url, 'a source finding carries NO url (never fabricated runtime evidence)')

  fs.rmSync(srcDir, { recursive: true, force: true }); fs.rmSync(outDir, { recursive: true, force: true })
})

test('M7: source findings aim the deferred black-box run, and only real runtime proof promotes them', () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'm7corr-'))
  fs.mkdirSync(path.join(TMP, 'code-review', 'cr7', 'phase1-maps'), { recursive: true })
  fs.writeFileSync(path.join(TMP, 'code-review', 'cr7', 'phase1-maps', 'feature-queue.json'), JSON.stringify({ features: [{ slug: 'orders', name: 'Orders' }] }))
  // a validated source finding with the concrete live-validation target fields
  fs.writeFileSync(path.join(TMP, 'VALIDATED-FINDINGS-cr7.jsonl'), JSON.stringify({
    id: 'SRC-1', title: 'IDOR in /orders', confirmation_status: 'SOURCE_CONFIRMED',
    file: 'orders.rb', line: 1, affected_endpoint: 'GET /orders/:id', required_blackbox_proof: 'GET /orders/2 as user A' }) + '\n')

  const bundle = wb.buildSourceGuidance('cr7', 'pt7', { intelRoot: TMP, now: 'fixed' })
  const target = bundle.candidate_targets.find((c) => c.candidate_id === 'SRC-1')
  assert.ok(target, 'the source finding became a black-box validation target')
  assert.equal(target.suggested_blackbox_task.entry_point, 'GET /orders/:id', 'entry_point came from affected_endpoint')
  assert.equal(target.suggested_blackbox_task.required_evidence, 'GET /orders/2 as user A', 'required_evidence came from required_blackbox_proof')

  // the promotion gate: a live match WITH captured runtime proof promotes; without proof it does NOT.
  const src = { confirmation_status: 'NEEDS_LIVE_VALIDATION' }
  assert.equal(wb.finalizeSourceStatus(src, { confirmation_status: 'RUNTIME_CONFIRMED', reproduction_response: 'HTTP/1.1 200 OK\n\n{"owner":"userB"}' }).status, 'RUNTIME_CONFIRMED')
  assert.notEqual(wb.finalizeSourceStatus(src, { confirmation_status: 'RUNTIME_CONFIRMED', url: 'https://x' }).status, 'RUNTIME_CONFIRMED')
  assert.equal(wb.finalizeSourceStatus({ confirmation_status: 'SOURCE_CONFIRMED' }, null).status, 'SOURCE_CONFIRMED')

  fs.rmSync(TMP, { recursive: true, force: true })
})
