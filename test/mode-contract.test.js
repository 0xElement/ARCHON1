// test/mode-contract.test.js
// Engagement-mode CLASSIFIER (ULTRAPLAN §3.1): black-box = pentest only; static = source-only code
// review (no live hit); white-box = source + a live URL (code review + PROBER runtime validation).

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')

const { classifyEngagementMode } = require('../src/core/engagement-mode')

// Inject a fake engagement resolver so tests never touch disk.
const noEng = { resolveEngagement: () => null }
const withEng = (rec) => ({ resolveEngagement: () => rec })

test('pentest dispatch with no source signal classifies blackbox', () => {
  assert.equal(classifyEngagementMode({ squad: 'pentest', meta: { targetUrl: 'https://x.test' } }, noEng), 'blackbox')
  assert.equal(classifyEngagementMode({ squad: 'pentest-squad', meta: {} }, noEng), 'blackbox')
})

test('source-only code-review classifies static (no live target)', () => {
  assert.equal(classifyEngagementMode({ squad: 'code-review', meta: { sourceDir: '/src' } }, noEng), 'static')
  assert.equal(classifyEngagementMode({ squad: 'code-review-squad', meta: {} }, noEng), 'static')
})

test('code-review WITH a deployUrl classifies whitebox — source + URL keeps PROBER alive', () => {
  // The exact shape both operator UI flows emit (Code Review form + Pentest > Static Analysis): a
  // standalone code-review carrying a live URL, no engagement marker. It MUST stay white-box so
  // deployUrl survives and PROBER runtime-validates the source findings. (Regression guard: this
  // used to classify 'static' and get its deployUrl stripped, silently disabling PROBER.)
  assert.equal(classifyEngagementMode({ squad: 'code-review', meta: { sourceDir: '/src', deployUrl: 'https://x.test' } }, noEng), 'whitebox')
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

test('a non-mode squad is passthrough (null) — contract does not apply', () => {
  assert.equal(classifyEngagementMode({ squad: 'something-else', meta: {} }, noEng), null)
})
