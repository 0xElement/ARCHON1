#!/usr/bin/env node
const __roots = require('../paths') // portable roots (KURU_*_ROOT) — see paths.js
// Integration test for code-review-dispatcher — phase1-maps methodology.
// Mocks spawnAgent (no real LLM) to assert the full pipeline wiring:
//   Phase 0 validate → 0a inventories → 0b feature queue → 1 per-feature mapping
//   → 1c consolidation → 2 per-feature×class assessment → 2v AUDITOR verify → 3 SCRIBE.
// Run: node test/code-review-dispatcher-integration.test.js

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const cr = require('../src/dispatch/code-review-dispatcher')

let passed = 0, failed = 0
function ok(label, cond, extra = '') {
  if (cond) { console.log(`  ✓ ${label}`); passed++ }
  else { console.log(`  ✗ ${label}${extra ? ' — ' + extra : ''}`); failed++ }
}

function makeSourceDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codereview-'))
  fs.writeFileSync(path.join(dir, 'app.rb'), 'get "/users" do\n  current_user\nend\n')
  fs.writeFileSync(path.join(dir, 'service.rb'), 'class FooService\n  def execute; end\nend\n')
  return dir
}
function stubDeps(spawnCalls, emitted = []) {
  return {
    spawnAgent: async (agentName, taskId, prompt, sessionSuffix) => {
      spawnCalls.push({ agentName, sessionSuffix, promptLen: prompt.length })
      if (sessionSuffix && sessionSuffix.includes('discovery')) {
        return { code: 0, agentName, cost: { totalCost: 0.1, model: 'm', tokens: { total: 1 } },
          output: JSON.stringify([{ slug: 'auth', name: 'Auth', keywords: 'login,token' }, { slug: 'uploads', name: 'Uploads', keywords: 'upload,file' }]) }
      }
      // A real batch mapper writes one feature map per assigned feature; simulate it so the pipeline's
      // "map produced → assess" gate opens (else features stay 'blocked' and nothing is assessed). Pull
      // outDir + the batch's slugs out of the prompt.
      if (sessionSuffix && sessionSuffix.includes('-batch-')) {
        const dirM = prompt.match(/(\S+)\/phase1-maps\/features\//)
        const slugs = [...prompt.matchAll(/slug:\s*([a-z0-9_-]+)/gi)].map(m => m[1])
        if (dirM) for (const slug of slugs) {
          try { fs.mkdirSync(`${dirM[1]}/phase1-maps/features`, { recursive: true }); fs.writeFileSync(`${dirM[1]}/phase1-maps/features/${slug}.md`, `# ${slug}\nfast map`) } catch {}
        }
      }
      // A real Phase-2 specialist also writes a structured candidate JSONL; simulate it so the
      // dispatcher's emitCandidate path is exercised. Pull the exact candidate-file path out of the
      // prompt (robust vs. parsing class/slug from the session suffix).
      if (sessionSuffix && sessionSuffix.includes('-p2-')) {
        const m = prompt.match(/(\S+\.candidates\.jsonl)/)
        if (m) { try {
          fs.mkdirSync(path.dirname(m[1]), { recursive: true })
          fs.writeFileSync(m[1], JSON.stringify({ feature: 'auth', pattern: 'idor', file: 'app.rb', line: 2,
            source: 'params[:id]', sink: 'User.find', severity: 'High', confidence: 80,
            hypothesis: 'IDOR on user object', evidence: 'User.find(params[:id])',
            status: 'SOURCE_CONFIRMED', required_blackbox_proof: '' }) + '\n')
        } catch {} }
      }
      return { code: 0, agentName, cost: { totalCost: 0.2, model: 'm', tokens: { total: 1 } }, output: '{}' }
    },
    trackCosts: () => {}, updateProgress: () => {}, log: () => {}, logActivity: () => {},
    emitCandidate: (tid, rec) => { emitted.push(rec) },
  }
}

;(async () => {
  console.log('code-review-dispatcher integration (phase1-maps methodology):')

  // ── Test 1: explicit features, no deployUrl ──
  {
    const srcDir = makeSourceDir()
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crout-'))
    const calls = []
    const emitted = []
    const res = await cr.runCodeReview(
      { taskId: 'cr-test-1', squad: 'code-review-squad', projectId: '',
        meta: { sourceDir: srcDir, features: ['auth', 'uploads', 'admin'],
                vulnClasses: ['access-control', 'xss'], maxPhase2: 2, outputDir: outDir } },
      stubDeps(calls, emitted))

    ok('returns no error', !res.error, JSON.stringify(res).slice(0, 120))
    ok('stack label present (auto-detected)', typeof res.stack === 'string' && res.stack.length > 0, 'got ' + res.stack)
    ok('3 features mapped', res.featuresMapped === 3, 'got ' + res.featuresMapped)
    ok('inventories written to disk', fs.existsSync(path.join(outDir, 'phase1-maps/inventories/00_MANIFEST.md')))
    ok('phase2 class dirs created', fs.existsSync(path.join(outDir, 'phase2/access-control')) && fs.existsSync(path.join(outDir, 'phase2/xss')))

    const mapCalls = calls.filter(c => c.sessionSuffix.includes('-batch-'))
    ok('S3: mapping runs in domain BATCHES (≤ features), not one-per-feature', mapCalls.length >= 1 && mapCalls.length <= 3, 'got ' + mapCalls.length)
    ok('mapping batches owned by specialist-pool agents', mapCalls.length > 0 && mapCalls.every(c => cr.MAPPER_POOL.includes(c.agentName)))
    ok('CURATOR consolidates', calls.some(c => c.sessionSuffix.includes('consolidate') && c.agentName === 'curator'))

    const p2 = calls.filter(c => c.sessionSuffix.includes('-p2-'))
    ok('phase2 = maxPhase2(2) × classes(2) = 4 calls', p2.length === 4, 'got ' + p2.length)
    // S4 — per-batch pipeline: Phase 2 for a feature runs only AFTER a batch has fast-mapped it (map→review
    // per batch), so review starts as soon as the first batch is mapped, not after all mapping.
    {
      const firstBatch = calls.findIndex(c => c.sessionSuffix.includes('-batch-'))
      const firstP2 = calls.findIndex(c => c.sessionSuffix.includes('-p2-'))
      ok('S4: Phase 2 starts only after a batch has fast-mapped', firstBatch >= 0 && firstP2 > firstBatch, `batch@${firstBatch} p2@${firstP2}`)
    }
    // M0 — each Phase-2 job streams a structured source candidate to the board via emitCandidate.
    ok('M0: each p2 job streamed a candidate → emitCandidate called 4×', emitted.length === 4, 'got ' + emitted.length)
    ok('M0: candidates are source-shaped (type=candidate, NO url)',
      emitted.length > 0 && emitted.every(c => c.type === 'candidate' && !c.url),
      JSON.stringify(emitted[0] || {}).slice(0, 160))
    // P1 — the file path is normalized to ABSOLUTE against sourceDir (so the triager reads the right
    // file), while file_rel keeps the specialist's original relative path.
    ok('P1: candidate file is absolute (resolved vs sourceDir), file_rel keeps the relative',
      emitted.length > 0 && emitted.every(c => path.isAbsolute(c.file) && c.file === path.resolve(srcDir, 'app.rb') && c.file_rel === 'app.rb'),
      JSON.stringify(emitted[0] || {}).slice(0, 200))
    ok('M0: source candidate stays SOURCE_CONFIRMED (never RUNTIME_CONFIRMED)',
      emitted.length > 0 && emitted.every(c => c.status === 'SOURCE_CONFIRMED' && c.confirmation_status === 'SOURCE_CONFIRMED'),
      JSON.stringify(emitted[0] || {}).slice(0, 160))
    // M3 — with every (feature × selected-class) pair assessed, re-plan is correctly a no-op (no -p2r- jobs).
    ok('M3: no spurious re-plan when coverage is complete', !calls.some(c => c.sessionSuffix.includes('-p2r-')), 'unexpected re-plan spawn')
    ok('access-control routed to MARSHAL', p2.some(c => c.sessionSuffix.includes('p2-access-control') && c.agentName === 'marshal'))
    ok('xss routed to CIPHER', p2.some(c => c.sessionSuffix.includes('p2-xss') && c.agentName === 'cipher'))
    ok('AUDITOR verifies', calls.some(c => c.agentName === 'auditor'))
    ok('PROBER skipped (no deployUrl)', !calls.some(c => c.agentName === 'prober'))
    ok('SCRIBE reports last', calls[calls.length - 1].agentName === 'scribe')
  }

  // ── S3: batchMapPrompt scopes an agent to ONLY its batch's features (spec §7/§14) ──
  {
    const batch = { id: 'auth_identity-1', domain: 'auth_identity', risk: 'high', owner: 'marshal',
      features: [{ slug: 'login', name: 'Login' }, { slug: 'reset', name: 'Reset' }] }
    const p = cr.batchMapPrompt('marshal', batch, 't1', '/src', '/out', '/inv')
    ok('S3: batch prompt names each assigned feature', p.includes('login') && p.includes('reset'))
    ok('S3: batch prompt excludes non-batch features', !p.includes('admin-panel'))
    ok('S3: batch prompt enforces map-ONLY-your-batch + followup channel',
      /Map ONLY these 2 features/.test(p) && p.includes('followup-features.jsonl'))
  }

  // ── Test 1b: DEFAULTS map + deep-assess EVERY feature (no caps) ──
  // Guards BOTH silent caps at once with 12 features and NO maxFeatures / maxPhase2:
  //   • old `maxFeatures || 10` floor  → would map only 10   (now: all 12)
  //   • old `maxPhase2  || 6`  cap     → would assess top-6  (now: all 12 → 12×2=24 p2 calls, not 12)
  {
    const srcDir = makeSourceDir()
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crout-'))
    const calls = []
    const twelve = ['auth', 'uploads', 'admin', 'search', 'billing', 'profile', 'api', 'webhooks', 'reports', 'settings', 'notifications', 'exports']
    const res = await cr.runCodeReview(
      { taskId: 'cr-test-1b', squad: 'code-review-squad', projectId: '',
        meta: { sourceDir: srcDir, features: twelve, vulnClasses: ['access-control', 'xss'], outputDir: outDir } }, // NO caps
      stubDeps(calls))
    ok('1b: no error', !res.error, JSON.stringify(res).slice(0, 120))
    ok('1b: DEFAULT maps ALL 12 features (not the old floor-10)', res.featuresMapped === 12, 'got ' + res.featuresMapped)
    const p2b = calls.filter(c => c.sessionSuffix.includes('-p2-'))
    ok('1b: DEFAULT deep-assesses ALL 12 features × 2 classes = 24 (not the old top-6 → 12)', p2b.length === 24, 'got ' + p2b.length)
  }

  // ── Test 2: generic discovery path ──
  {
    const srcDir = makeSourceDir()
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crout-'))
    const calls = []
    await cr.runCodeReview(
      { taskId: 'cr-test-2', squad: 'code-review-squad', projectId: '',
        meta: { sourceDir: srcDir, preset: 'generic', vulnClasses: ['access-control'], outputDir: outDir } },
      stubDeps(calls))
    ok('discovery ran (CURATOR)', calls.some(c => c.sessionSuffix.includes('discovery') && c.agentName === 'curator'))
    ok('discovered 2 features → fast-mapped in batches', calls.filter(c => c.sessionSuffix.includes('-batch-')).length >= 1 && calls.filter(c => c.sessionSuffix.includes('-batch-')).length <= 2, 'got ' + calls.filter(c => c.sessionSuffix.includes('-batch-')).length)
  }

  // ── Test 3: an explicit meta.features queue is used verbatim (capped by maxFeatures); phasesOnly gates ──
  {
    const srcDir = makeSourceDir()
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crout-'))
    const calls = []
    const featureList = Array.from({ length: 43 }, (_, i) => ({ slug: `feature-${i}`, name: `Feature ${i}` }))
    const res = await cr.runCodeReview(
      { taskId: 'cr-test-3', squad: 'code-review-squad', projectId: '',
        meta: { sourceDir: srcDir, features: featureList, maxFeatures: 43, phasesOnly: ['inventories'], outputDir: outDir } },
      stubDeps(calls))
    ok('explicit meta.features queue → 43 features', res.featuresMapped === 43, 'got ' + res.featuresMapped)
    ok('phasesOnly=[inventories] → no agents spawned', calls.length === 0, 'got ' + calls.length)
  }

  // ── Test 4: Phase 0 rejects bad sourceDir ──
  {
    const res = await cr.runCodeReview({ taskId: 'cr-test-4', squad: 'code-review-squad', meta: { sourceDir: '/nonexistent-xyz' } }, stubDeps([]))
    ok('Phase 0 rejects missing sourceDir', res.error && res.phase === 0)
  }

  // ── Test 5: selectVulnClasses derives classes from the discovered surface ──
  {
    const all = cr.selectVulnClasses({ '03_graphql': 12, '07_downloads_exports': 4, '02_auth_checks': 30 })
    ok('graphql surface → graphql class', all.includes('graphql'))
    ok('downloads surface → file-handling class', all.includes('file-handling'))
    ok('auth surface → authentication-session class', all.includes('authentication-session'))
    ok('always keeps the access-control floor', all.includes('access-control'))
    ok('every selected class is a known CLASS', all.every(c => cr.CLASS[c]))
    const empty = cr.selectVulnClasses({})
    ok('empty surface still returns the baseline floor', empty.length >= 5 && empty.includes('xss'))
    ok("CLASS covers every pattern catalog (23 classes)", Object.keys(cr.CLASS).length === 23)
  }

  // ── Test 6: every CLASS module/catalog file reference resolves on disk (no dangling refs) ──
  {
    const METH = path.join(__dirname, '..', 'squads', 'code-review', 'methodology')
    let dangling = 0
    for (const [cls, c] of Object.entries(cr.CLASS)) {
      if (c.module && !fs.existsSync(path.join(METH, 'prompts', c.module))) { dangling++; console.log(`    missing module for ${cls}: ${c.module}`) }
      if (c.catalog && !fs.existsSync(path.join(METH, 'catalogs', c.catalog))) { dangling++; console.log(`    missing catalog for ${cls}: ${c.catalog}`) }
    }
    ok('every CLASS module/catalog file resolves on disk (no dangling refs)', dangling === 0, `${dangling} dangling ref(s)`)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch(e => { console.error('THREW:', e.stack); process.exit(1) })
