'use strict'
// S1: domain grouping + batch fanout for scalable source-review mapping.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { annotate, groupByDomain, createBatches, assignBatches, inferDomain, riskHint, HIGH_RISK_DOMAINS } =
  require('../src/dispatch/feature-batching')

const mk = (n, kw) => ({ slug: n, name: n, keywords: kw || n })

test('annotate: infers domain + risk, respects explicit values', () => {
  assert.equal(inferDomain(mk('password-reset', 'reset,password,token')), 'auth_identity')
  assert.equal(riskHint(mk('password-reset', 'reset,password')), 'high')
  assert.equal(riskHint(mk('faq-page', 'faq,help')), 'medium')
  // explicit values win
  const a = annotate([{ slug: 'x', name: 'x', domain: 'admin', risk_hint: 'low' }])[0]
  assert.equal(a.domain, 'admin'); assert.equal(a.risk_hint, 'low')
})

test('N features → batches, NOT N mapper calls; each feature exactly once; batch ≤ max', () => {
  const features = Array.from({ length: 36 }, (_, i) => mk(`f${i}`, i % 2 ? 'auth,login' : 'search,catalog'))
  const batches = createBatches(features, { maxPerBatch: 8 })
  assert.ok(batches.length < 36, `got ${batches.length} batches, not 36 per-feature`)
  assert.ok(batches.every(b => b.features.length <= 8), 'every batch ≤ 8')
  const seen = new Set(); let total = 0
  for (const b of batches) for (const f of b.features) {
    assert.ok(!seen.has(f.slug), `feature ${f.slug} assigned exactly once`); seen.add(f.slug); total++
  }
  assert.equal(total, 36, 'no feature lost')
})

test('a batch never mixes domains', () => {
  const features = [mk('login', 'auth'), mk('admin1', 'admin'), mk('search1', 'search'), mk('upload1', 'upload')]
  for (const b of createBatches(features, { maxPerBatch: 8 })) {
    const domains = new Set(annotate(b.features).map(f => f.domain))
    assert.equal(domains.size, 1, `batch ${b.id} is single-domain`)
  }
})

test('high-risk domains batch first (Phase 2 starts on risk early)', () => {
  const features = [mk('blog', 'content,article'), mk('login', 'auth,session'), mk('faq', 'help')]
  const batches = createBatches(features, { maxPerBatch: 8 })
  assert.ok(HIGH_RISK_DOMAINS.has(batches[0].domain), 'first batch is a high-risk domain')
})

test('assignBatches round-robins the mapper pool; scales to 150 features', () => {
  const features = Array.from({ length: 150 }, (_, i) => mk(`f${i}`, ['auth', 'admin', 'search', 'upload', 'order', 'profile'][i % 6]))
  const pool = ['marshal', 'siphon', 'cipher', 'quill', 'beacon', 'breaker']
  const assigned = assignBatches(createBatches(features, { maxPerBatch: 8 }), pool)
  assert.ok(assigned.length >= Math.ceil(150 / 8), 'enough batches for 150 features')
  assert.ok(assigned.every(b => pool.includes(b.owner)), 'every batch owned by a pool agent')
  assert.equal(assigned[0].owner, 'marshal'); assert.equal(assigned[6].owner, 'marshal') // wraps at pool size
})
