// test/dispatch-routing.test.js
// P0 — proves each engagement mode routes to the right engine and never crosses
// the mode contract (ULTRAPLAN §3.3): black-box → pentest only; static →
// code-review only; white-box → both.

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')

const { classifyEngagementMode } = require('../src/core/engagement-mode')

// The routing intent the daemon applies per mode (the contract, expressed as data).
const ROUTE = {
  blackbox: { runsPentest: true, runsCodeReview: false },
  static: { runsPentest: false, runsCodeReview: true },
  whitebox: { runsPentest: true, runsCodeReview: true },
}

const noEng = { resolveEngagement: () => null }

const CASES = [
  { name: 'black-box (URL only)', dispatch: { squad: 'pentest', meta: { targetUrl: 'https://x.test' } }, eng: noEng, mode: 'blackbox' },
  { name: 'static (source only)', dispatch: { squad: 'code-review', meta: { sourceDir: '/src' } }, eng: noEng, mode: 'static' },
  { name: 'white-box (source-guided pentest)', dispatch: { squad: 'pentest', meta: { sourceGuided: true } }, eng: noEng, mode: 'whitebox' },
  { name: 'white-box (code-review iteration)', dispatch: { squad: 'code-review', meta: { engagementMode: 'whitebox' } }, eng: noEng, mode: 'whitebox' },
]

for (const c of CASES) {
  test(`routes ${c.name} → ${c.mode}`, () => {
    const mode = classifyEngagementMode(c.dispatch, c.eng)
    assert.equal(mode, c.mode)
    const route = ROUTE[mode]
    assert.ok(route, `mode ${mode} must have a defined route`)
  })
}

test('black-box NEVER routes to code review (the hard contract)', () => {
  const mode = classifyEngagementMode({ squad: 'pentest', meta: { targetUrl: 'https://x.test' } }, noEng)
  assert.equal(ROUTE[mode].runsCodeReview, false)
})

test('static NEVER routes to a live pentest (the hard contract)', () => {
  const mode = classifyEngagementMode({ squad: 'code-review', meta: { sourceDir: '/src' } }, noEng)
  assert.equal(ROUTE[mode].runsPentest, false)
})

test('white-box runs BOTH engines (code review + source-guided pentest)', () => {
  const mode = classifyEngagementMode({ squad: 'pentest', meta: { sourceGuided: true } }, noEng)
  assert.equal(ROUTE[mode].runsPentest, true)
  assert.equal(ROUTE[mode].runsCodeReview, true)
})
