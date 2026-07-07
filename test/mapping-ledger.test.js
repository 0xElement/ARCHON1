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

test('M1 honest counters: mapped counts only done/reviewed; rate-limit is deferred not mapped/blocked', () => {
  let l = L.build('t1', batches) // login, reset, search
  l = L.setFeature(l, 'login', { status: 'done' })
  l = L.setFeature(l, 'reset', { status: 'deferred_rate_limit' }) // paused by a rate limit
  l = L.setFeature(l, 'search', { status: 'in_progress' })
  assert.equal(l.features_mapped, 1, 'only login is mapped')
  assert.equal(l.features_deferred, 1, 'reset is deferred (rate-limit), NOT blocked')
  assert.equal(l.features_blocked, 0, 'a rate limit is never a coverage gap')
  assert.equal(l.features_in_progress, 1)
  assert.equal(l.features_accounted, 1, 'only the mapped one is accounted for')
  assert.equal(l.features_done, l.features_accounted, 'features_done stays a back-compat alias for accounted')
  assert.ok(!L.isComplete(l), 'deferred + in_progress keep the gate open')
  assert.equal(L.deferred(l).length, 1)
  // real coverage gap after retry budget vs legacy alias — both count as blocked, neither counts as mapped
  l = L.setFeature(l, 'reset', { status: 'blocked_coverage_gap' })
  l = L.setFeature(l, 'search', { status: 'done' })
  assert.equal(l.features_mapped, 2)
  assert.equal(l.features_blocked, 1)
  assert.ok(L.isComplete(l), 'done + blocked_coverage_gap are terminal → gate closes')
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

test('S6 reconcileFollowups: new vs duplicate vs invalid (A3 — no-slug is surfaced, never dropped)', () => {
  const led = L.build('t', [{ id: 'b1', domain: 'auth_identity', owner: 'marshal', features: [{ slug: 'login', name: 'Login' }] }])
  const { newFeatures, duplicates, invalid } = L.reconcileFollowups([
    { slug: 'login', name: 'dup of existing' },
    { slug: 'oauth', name: 'OAuth' },
    { slug: 'oauth', name: 'OAuth again' }, // dedup within the list
    { name: 'no slug here' },               // invalid → surfaced (becomes a blocker downstream)
  ], led)
  assert.equal(newFeatures.length, 1); assert.equal(newFeatures[0].slug, 'oauth')
  assert.equal(duplicates.length, 1); assert.equal(duplicates[0].slug, 'login')
  assert.equal(invalid.length, 1)
})

test('S6 pending: non-terminal features feed the completion gate', () => {
  let led = L.build('t', [{ id: 'b1', domain: 'x', owner: 'a', features: [{ slug: 'a' }, { slug: 'b' }] }])
  led = L.setFeature(led, 'a', { status: 'done' })
  assert.equal(L.pending(led).length, 1)       // b still queued
  assert.equal(L.pending(led)[0].slug, 'b')
  led = L.setFeature(led, 'b', { status: 'blocked' }) // gate marks it a coverage gap
  assert.equal(L.pending(led).length, 0); assert.ok(L.isComplete(led))
})

test('S7 renderGateMd: counts, coverage gaps, ledger table', () => {
  let led = L.build('t', [{ id: 'b1', domain: 'auth_identity', risk: 'high', owner: 'marshal', features: [{ slug: 'login' }, { slug: 'reset' }] }])
  led = L.setFeature(led, 'login', { status: 'done', depth: 'deep_complete' })
  led = L.setFeature(led, 'reset', { status: 'blocked' })
  const md = L.renderGateMd(led)
  assert.match(md, /Phase 1 Completion Gate/)
  assert.match(md, /Coverage gaps \(blocked: 1\)/)
  assert.match(md, /login/); assert.match(md, /reset/)
  led = L.setFeature(led, 'reset', { status: 'done' })
  assert.match(L.renderGateMd(led), /No coverage gaps/)
})

test('S2: review_status is independent — a failed review never clobbers a done map (parity §4)', () => {
  let l = L.build('t', [{ id: 'b', domain: 'x', owner: 'a', features: [{ slug: 'up', name: 'Uploads', risk_hint: 'high' }] }])
  l = L.setFeature(l, 'up', { status: 'done', depth: 'deep' })      // mapping finished
  assert.equal(l.features.up.mapping_status, 'done', 'projected mapping_status')
  assert.equal(l.features.up.review_status, 'pending', 'review not started yet')
  assert.equal(l.features_mapped, 1)
  l = L.setReview(l, 'up', 'failed', { status: 'blocked', assigned_agent: 'marshal', error: 'timeout' }) // review dies
  assert.equal(l.features.up.status, 'done', 'mapping status UNTOUCHED by a review write')
  assert.equal(l.features.up.mapping_status, 'done')
  assert.equal(l.features.up.review_status, 'failed')
  assert.equal(l.features.up.assigned_agent, 'marshal')  // per-item review field carried
  assert.equal(l.features_mapped, 1, 'still counts as mapped')
  assert.equal(l.features_review_failed, 1)
  assert.equal(l.features_deep_mapped, 1)
})

test('S2: review rollups — reviewed_no_issue / candidate_found / reviewed count', () => {
  let l = L.build('t', [{ id: 'b', domain: 'x', owner: 'a', features: [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }] }])
  for (const s of ['a', 'b', 'c']) l = L.setFeature(l, s, { status: 'done' })
  l = L.setReview(l, 'a', 'reviewed_no_issue')
  l = L.setReview(l, 'b', 'candidate_found', { duplicate_key: 'b:xss:f.rb:sink' })
  // c stays review pending
  assert.equal(l.features_reviewed, 2, 'a + b reached a review conclusion')
  assert.equal(l.features_reviewed_no_issue, 1)
  assert.equal(l.features_candidates, 1)
  assert.equal(l.features_review_pending, 1, 'c not yet reviewed')
  assert.equal(l.features.b.duplicate_key, 'b:xss:f.rb:sink')
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
