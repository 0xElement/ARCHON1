'use strict'
// C1: static source-review SMOKE against a realistic vulnerable FIXTURE (a tiny app with a known IDOR +
// XSS). Deterministic/offline (stub adapter): proves discovery → batch fast-map → Phase 2 → structured
// source candidates flow end-to-end with correct metadata (absolute file, class, SOURCE_CONFIRMED, no
// url), the ledger accounts for every feature, the audit gate is written, and the completion invariant
// is clean. The LIVE smoke (real adapter / daemon) runs the SAME fixture — the operator's next step.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path')
const cr = require('../src/dispatch/code-review-dispatcher')
const { runCompletionInvariant } = require('../src/pipeline/completion-invariant')
const L = require('../src/dispatch/mapping-ledger')

function vulnerableFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crfix-'))
  fs.mkdirSync(path.join(dir, 'app'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'app', 'orders.rb'), 'class OrdersController\n  def show\n    @order = Order.find(params[:id]) # IDOR: no ownership check\n  end\nend\n')
  fs.writeFileSync(path.join(dir, 'app', 'profile.erb'), '<div><%= raw @user.bio %></div> <!-- XSS: unescaped -->\n')
  return dir
}

// class → the candidate a Phase-2 specialist would emit for the fixture's known vuln.
const KNOWN = {
  'access-control': { feature: 'orders', pattern: 'idor', file: 'app/orders.rb', line: 3, source: 'params[:id]', sink: 'Order.find', severity: 'High', confidence: 90, hypothesis: 'IDOR — any user reads any order', evidence: 'Order.find(params[:id])', status: 'SOURCE_CONFIRMED', required_blackbox_proof: 'GET /orders/2 as user A, observe user B order' },
  'xss': { feature: 'profile', pattern: 'stored-xss', file: 'app/profile.erb', line: 1, source: '@user.bio', sink: 'raw', severity: 'High', confidence: 85, hypothesis: 'Stored XSS via unescaped bio', evidence: '<%= raw @user.bio %>', status: 'SOURCE_CONFIRMED', required_blackbox_proof: 'set bio=<script>, load profile, observe execution' },
}

function fixtureStub(calls, emitted) {
  return {
    spawnAgent: async (agentName, taskId, prompt, sessionSuffix) => {
      calls.push({ sessionSuffix })
      if (sessionSuffix.includes('discovery')) return { code: 0, output: JSON.stringify([
        { slug: 'orders', name: 'Orders', domain: 'orders_checkout', risk_hint: 'high', keywords: 'order,find' },
        { slug: 'profile', name: 'Profile', domain: 'user_profile', risk_hint: 'high', keywords: 'profile,bio' },
      ]) }
      if (sessionSuffix.includes('-batch')) {
        const dirM = prompt.match(/(\S+)\/phase1-maps\/features\//)
        const slugs = [...prompt.matchAll(/slug:\s*([a-z0-9_-]+)/gi)].map(m => m[1])
        if (dirM) for (const s of slugs) { fs.mkdirSync(`${dirM[1]}/phase1-maps/features`, { recursive: true }); fs.writeFileSync(`${dirM[1]}/phase1-maps/features/${s}.md`, `# ${s}`) }
      }
      if (sessionSuffix.includes('-p2-')) {
        const cm = prompt.match(/(\S+\.candidates\.jsonl)/)
        const cls = (sessionSuffix.match(/-p2-([a-z-]+)-/) || [])[1]
        if (cm && KNOWN[cls]) { fs.mkdirSync(path.dirname(cm[1]), { recursive: true }); fs.writeFileSync(cm[1], JSON.stringify(KNOWN[cls]) + '\n') }
      }
      return { code: 0, output: '{}' }
    },
    trackCosts: () => {}, updateProgress: () => {}, log: () => {}, logActivity: () => {},
    emitCandidate: (tid, rec) => emitted.push(rec),
  }
}

test('Finding 1+3: follow-ups reach the return payload; a feature whose Phase-2 all fail → blocked, not assessed', async () => {
  const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crf13-'))
  fs.writeFileSync(path.join(srcDir, 'app.rb'), 'class A; def show; Order.find(params[:id]); end; end\n')
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crf13o-'))
  const emitted = []
  const stub = {
    spawnAgent: async (agentName, taskId, prompt, sessionSuffix) => {
      if (sessionSuffix.includes('discovery')) return { code: 0, output: JSON.stringify([
        { slug: 'alpha', name: 'Alpha', domain: 'auth_identity', risk_hint: 'high', keywords: 'a' },
        { slug: 'beta', name: 'Beta', domain: 'search_browse', risk_hint: 'normal', keywords: 'b' },
      ]) }
      if (sessionSuffix.includes('-batch')) {
        const dirM = prompt.match(/(\S+)\/phase1-maps\/features\//)
        const slugs = [...prompt.matchAll(/slug:\s*([a-z0-9_-]+)/gi)].map(m => m[1])
        if (dirM) {
          for (const s of slugs) { fs.mkdirSync(`${dirM[1]}/phase1-maps/features`, { recursive: true }); fs.writeFileSync(`${dirM[1]}/phase1-maps/features/${s}.md`, `# ${s}`) }
          if (slugs.includes('alpha')) fs.appendFileSync(`${dirM[1]}/phase1-maps/followup-features.jsonl`, JSON.stringify({ slug: 'gamma', name: 'Gamma', domain: 'misc', reason: 'discovered shared sink' }) + '\n')
        }
      }
      if (sessionSuffix.includes('-p2-')) {
        if (sessionSuffix.includes('-alpha')) throw new Error('specialist crashed') // Finding 3: ALL of alpha's Phase-2 jobs throw
        const cm = prompt.match(/(\S+\.candidates\.jsonl)/)
        if (cm) { fs.mkdirSync(path.dirname(cm[1]), { recursive: true }); fs.writeFileSync(cm[1], JSON.stringify({ pattern: 'idor', file: 'app.rb', line: 1, source: 'params[:id]', sink: 'Order.find', severity: 'High', status: 'SOURCE_CONFIRMED', required_blackbox_proof: 'p' }) + '\n') }
      }
      return { code: 0, output: '{}' }
    },
    trackCosts: () => {}, updateProgress: () => {}, log: () => {}, logActivity: () => {}, emitCandidate: (t, r) => emitted.push(r),
  }
  const res = await cr.runCodeReview({ taskId: 'cr-f13', squad: 'code-review-squad', projectId: '',
    meta: { sourceDir: srcDir, vulnClasses: ['access-control'], outputDir: outDir } }, stub)

  // Finding 1: the follow-up feature is in the ledger AND reaches the downstream/return feature list
  assert.ok(res.features.includes('gamma'), 'follow-up gamma reached the return payload')
  // Finding 3: alpha's only specialist threw → blocked, NOT silently counted as reviewed
  assert.ok(!res.phase2Features.includes('alpha'), 'alpha not counted assessed')
  assert.ok(res.blockers >= 1, 'alpha reported as a blocker')
  const led = JSON.parse(fs.readFileSync(path.join(outDir, 'phase1-maps', 'mapping-ledger.json'), 'utf8'))
  assert.equal(led.features.alpha.status, 'blocked')
  assert.ok(res.phase2Features.includes('gamma'), 'the healthy follow-up WAS assessed')
  // the failed job is recorded (audit trail, not swallowed)
  assert.ok(fs.existsSync(path.join(outDir, 'phase1-maps', 'phase2-failures.jsonl')), 'failed job recorded')

  fs.rmSync(srcDir, { recursive: true, force: true }); fs.rmSync(outDir, { recursive: true, force: true })
})

test('static smoke: a fixture IDOR + XSS flow through map → Phase 2 → structured source candidates', async () => {
  const srcDir = vulnerableFixture()
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crout-'))
  const calls = [], emitted = []
  const res = await cr.runCodeReview({ taskId: 'cr-smoke', squad: 'code-review-squad', projectId: '',
    meta: { sourceDir: srcDir, vulnClasses: ['access-control', 'xss'], outputDir: outDir } }, fixtureStub(calls, emitted))

  const idor = emitted.find(c => c.file && c.file.endsWith('orders.rb'))
  const xss = emitted.find(c => c.file && c.file.endsWith('profile.erb'))
  assert.ok(idor, 'IDOR candidate emitted'); assert.ok(xss, 'XSS candidate emitted')
  // source-shaped: SOURCE_CONFIRMED, absolute path resolved vs the fixture, NO url
  assert.equal(idor.confirmation_status, 'SOURCE_CONFIRMED'); assert.ok(!idor.url)
  assert.equal(idor.file, path.resolve(srcDir, 'app/orders.rb'))
  // ledger accounts for every feature; coverage is ledger-derived
  const led = JSON.parse(fs.readFileSync(path.join(outDir, 'phase1-maps', 'mapping-ledger.json'), 'utf8'))
  assert.ok(L.isComplete(led), 'every feature terminal')
  assert.equal(res.featuresMapped, 2)
  assert.equal(res.blockers, 0)
  // deterministic gate at the SCRIBE path
  assert.ok(fs.existsSync(path.join(outDir, 'phase1-maps', 'consolidated', 'phase1_completion_gate.md')))
  // completion invariant clean on the emitted candidates (valid status + real evidence) + terminal ledger
  const inv = runCompletionInvariant({ findings: emitted, ledger: led, TERMINAL: L.TERMINAL })
  assert.ok(inv.ok, 'completion invariant clean: ' + JSON.stringify(inv.violations))

  fs.rmSync(srcDir, { recursive: true, force: true }); fs.rmSync(outDir, { recursive: true, force: true })
})
