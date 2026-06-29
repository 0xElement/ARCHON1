// test/mode-contract.test.js
// P0 — the engagement-mode contract engine (ULTRAPLAN §3.1, audit Issues 1/4/5).
// black-box = pentest only; static = code-review only (no live hit); white-box = both.

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')

const { classifyEngagementMode, assertModeContract } = require('../src/core/engagement-mode')

// Inject a fake engagement resolver so tests never touch disk.
const noEng = { resolveEngagement: () => null }
const withEng = (rec) => ({ resolveEngagement: () => rec })

test('pentest dispatch with no source signal classifies blackbox', () => {
  assert.equal(classifyEngagementMode({ squad: 'pentest', meta: { targetUrl: 'https://x.test' } }, noEng), 'blackbox')
  assert.equal(classifyEngagementMode({ squad: 'pentest-squad', meta: {} }, noEng), 'blackbox')
})

test('standalone code-review classifies static', () => {
  assert.equal(classifyEngagementMode({ squad: 'code-review', meta: { sourceDir: '/src' } }, noEng), 'static')
  assert.equal(classifyEngagementMode({ squad: 'code-review-squad', meta: {} }, noEng), 'static')
})

test('white-box: source-guided pentest dispatch classifies whitebox at the event-bus boundary (Issue 1)', () => {
  // The deferred pentest dispatch carries NO sourceDir, only the stamped marker.
  assert.equal(classifyEngagementMode({ squad: 'pentest', meta: { sourceGuided: true } }, noEng), 'whitebox')
})

test('white-box: pentest with sourceDir, or via resolved engagement record, classifies whitebox', () => {
  assert.equal(classifyEngagementMode({ squad: 'pentest', meta: { sourceDir: '/src' } }, noEng), 'whitebox')
  assert.equal(
    classifyEngagementMode({ squad: 'pentest', meta: { engagementId: 'E1' } }, withEng({ sourceDir: '/src' })),
    'whitebox', 'engagement-record fallback must classify whitebox')
})

test('white-box: combined code-review iteration classifies whitebox (keeps deployUrl)', () => {
  assert.equal(classifyEngagementMode({ squad: 'code-review', meta: { engagementMode: 'whitebox', deployUrl: 'https://x.test' } }, noEng), 'whitebox')
  assert.equal(
    classifyEngagementMode({ squad: 'code-review', meta: { engagementId: 'E1', deployUrl: 'https://x.test' } }, withEng({ sourceDir: '/src', targetUrl: 'https://x.test' })),
    'whitebox')
})

test('assertModeContract throws when a black-box engagement would spawn code review', () => {
  assert.throws(() => assertModeContract('blackbox', { meta: {}, willSpawnCodeReview: true }), /MODE-CONTRACT/)
  assert.doesNotThrow(() => assertModeContract('blackbox', { meta: {}, willSpawnCodeReview: false }))
})

test('assertModeContract strips deployUrl for static so PROBER never fires (Issue 5)', () => {
  const meta = { sourceDir: '/src', deployUrl: 'https://x.test' }
  assertModeContract('static', { meta })
  assert.equal(meta.deployUrl, null, 'static dispatch must have deployUrl stripped at the boundary')
})

test('assertModeContract leaves a whitebox code-review deployUrl intact (PROBER legitimate)', () => {
  const meta = { sourceDir: '/src', deployUrl: 'https://x.test' }
  assertModeContract('whitebox', { meta })
  assert.equal(meta.deployUrl, 'https://x.test')
})

test('a non-mode squad is passthrough (null) — contract does not apply', () => {
  assert.equal(classifyEngagementMode({ squad: 'something-else', meta: {} }, noEng), null)
})
