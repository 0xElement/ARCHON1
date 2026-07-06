'use strict'
// S2: the mapping ledger — every feature tracked, terminal-status completion gate, additive reconciliation.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path')
const L = require('../src/dispatch/mapping-ledger')

const batches = [
  { id: 'auth_identity-1', domain: 'auth_identity', risk: 'high', owner: 'marshal', features: [{ slug: 'login', name: 'Login', risk_hint: 'high' }, { slug: 'reset', name: 'Reset' }] },
  { id: 'search_browse-1', domain: 'search_browse', risk: 'normal', owner: 'cipher', features: [{ slug: 'search', name: 'Search' }] },
]

test('build: every feature tracked with owner/batch/risk, all queued', () => {
  const l = L.build('t1', batches)
  assert.equal(l.features_total, 3); assert.equal(l.features_done, 0); assert.equal(l.batches_total, 2)
  assert.equal(l.features.login.owner, 'marshal'); assert.equal(l.features.login.batch, 'auth_identity-1')
  assert.equal(l.features.login.risk, 'high'); assert.equal(l.features.reset.status, 'queued')
  assert.ok(!L.isComplete(l))
})

test('setFeature rolls up features_done + batches_done; completion gate needs ALL terminal', () => {
  let l = L.build('t1', batches)
  l = L.setFeature(l, 'login', { status: 'done', depth: 'fast' })
  l = L.setFeature(l, 'reset', { status: 'merged' })
  assert.equal(l.features_done, 2)
  assert.equal(l.batches_done, 1, 'auth batch done')
  assert.ok(!L.isComplete(l), 'search still queued')
  l = L.setFeature(l, 'search', { status: 'non_security' })
  assert.ok(L.isComplete(l), 'every feature terminal → complete')
})

test('addFeatures (reconciliation): adds new, never overwrites, reopens the gate', () => {
  let l = L.build('t1', batches)
  for (const s of ['login', 'reset', 'search']) l = L.setFeature(l, s, { status: 'done' })
  assert.ok(L.isComplete(l))
  l = L.addFeatures(l, [{ slug: 'login', name: 'DUP' }, { slug: 'oauth', name: 'OAuth', risk_hint: 'high' }], 'auth_identity-2')
  assert.equal(l.features.login.name, 'Login', 'existing not overwritten')
  assert.equal(l.features.oauth.status, 'queued')
  assert.ok(!L.isComplete(l), 'a new queued feature reopens completion')
})

test('blockers surfaced; save/load round-trip', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'))
  let l = L.build('t1', batches)
  l = L.setFeature(l, 'login', { status: 'blocked' })
  assert.equal(L.blockers(l).length, 1)
  L.save(dir, l)
  const r = L.load(dir)
  assert.equal(r.features.login.status, 'blocked'); assert.equal(r.features_total, 3)
  assert.equal(L.load(path.join(dir, 'nope')), null) // missing → null (fail-soft)
})
