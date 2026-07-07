'use strict'
// M3: the Source Runtime Planner — session ladder by feature count, quota adjustment, domain-aware sharding,
// concurrency caps. Pure + deterministic.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const P = require('../src/dispatch/source-runtime-planner')

const mk = (n, domain = 'misc') => Array.from({ length: n }, (_, i) => ({ slug: `${domain}-${i}`, domain }))

test('session ladder by feature count (spec §1: 1-30→1, 31-90→3, 91-200→4, 201-500→5, 500+→6)', () => {
  assert.equal(P.baseSessions(0), 1)
  assert.equal(P.baseSessions(30), 1)
  assert.equal(P.baseSessions(31), 3)   // no 2-session tier: 1 jumps straight to 3
  assert.equal(P.baseSessions(90), 3)
  assert.equal(P.baseSessions(91), 4)
  assert.equal(P.baseSessions(200), 4)
  assert.equal(P.baseSessions(201), 5)
  assert.equal(P.baseSessions(500), 5)
  assert.equal(P.baseSessions(501), 6)
  assert.equal(P.baseSessions(100000), 6)
})

test('20 features → 1 single persistent worker', () => {
  const p = P.planSourceRuntime({ features: mk(20) })
  assert.equal(p.mapping_sessions, 1)
  assert.equal(p.max_concurrent_sessions, 1)
  assert.equal(p.strategy, 'single_persistent_worker')
})

test('75 features across 3 domains → 3 sessions, 3 concurrent, all features sharded, none dropped', () => {
  const feats = [...mk(25, 'auth'), ...mk(25, 'api'), ...mk(25, 'files')]
  const p = P.planSourceRuntime({ features: feats })
  assert.equal(p.mapping_sessions, 3)
  assert.equal(p.max_concurrent_sessions, 3)
  assert.equal(p.strategy, 'persistent_sharded_mapping')
  assert.equal(p.sessions.length, 3)
  const placed = p.sessions.reduce((s, x) => s + x.feature_count, 0)
  assert.equal(placed, 75, 'every feature landed in exactly one session')
  const slugs = new Set(p.sessions.flatMap((s) => s.features))
  assert.equal(slugs.size, 75, 'no duplicate placement')
})

test('200 features → 4 shards but only 3 run concurrently (rate-limit guard)', () => {
  const p = P.planSourceRuntime({ features: [...mk(50, 'a'), ...mk(50, 'b'), ...mk(50, 'c'), ...mk(50, 'd')] })
  assert.equal(p.mapping_sessions, 4)
  assert.equal(p.max_concurrent_sessions, 3)
})

test('sharding keeps a domain together in one session', () => {
  const p = P.planSourceRuntime({ features: [...mk(25, 'auth'), ...mk(25, 'api'), ...mk(25, 'files')] })
  for (const domain of ['auth', 'api', 'files']) {
    const owners = p.sessions.filter((s) => s.features.some((sl) => sl.startsWith(domain + '-')))
    assert.equal(owners.length, 1, `${domain} lives in exactly one session`)
  }
})

test('quota adjustment: warm shaves one, constrained caps at 2, cooling pauses to 1', () => {
  const big = [...mk(50, 'a'), ...mk(50, 'b'), ...mk(50, 'c'), ...mk(50, 'd')] // base 4
  assert.equal(P.planSourceRuntime({ features: big, quota: 'warm' }).mapping_sessions, 3)
  assert.equal(P.planSourceRuntime({ features: big, quota: 'constrained' }).mapping_sessions, 2)
  const cooling = P.planSourceRuntime({ features: big, quota: 'cooling' })
  assert.equal(cooling.mapping_sessions, 1)
  assert.equal(cooling.strategy, 'paused_rate_limit')
})

test('operator maxSessions caps but never raises', () => {
  const big = [...mk(50, 'a'), ...mk(50, 'b'), ...mk(50, 'c'), ...mk(50, 'd')] // base 4
  assert.equal(P.planSourceRuntime({ features: big, maxSessions: 2 }).mapping_sessions, 2)
  assert.equal(P.planSourceRuntime({ features: mk(20), maxSessions: 5 }).mapping_sessions, 1, 'cap never raises above the ladder')
})

test('single broad domain still follows the feature-count ladder (no same-domain collapse)', () => {
  // the bug: 200 features all in "misc" used to collapse to 1 session. Now they fan out per the ladder.
  assert.equal(P.planSourceRuntime({ features: mk(20, 'misc') }).mapping_sessions, 1)
  assert.equal(P.planSourceRuntime({ features: mk(75, 'misc') }).mapping_sessions, 3)
  assert.equal(P.planSourceRuntime({ features: mk(200, 'misc') }).mapping_sessions, 4)
  assert.equal(P.planSourceRuntime({ features: mk(500, 'misc') }).mapping_sessions, 5)
  assert.equal(P.planSourceRuntime({ features: mk(1000, 'misc') }).mapping_sessions, 6)
})

test('oversized domain is split into balanced ~targetPerSession chunks', () => {
  const p = P.planSourceRuntime({ features: mk(200, 'misc') })
  assert.equal(p.sessions.length, 4)
  const placed = p.sessions.reduce((s, x) => s + x.feature_count, 0)
  assert.equal(placed, 200, 'every feature placed exactly once')
  assert.equal(new Set(p.sessions.flatMap(s => s.features)).size, 200, 'no duplicates')
  assert.ok(p.sessions.every(s => s.feature_count >= 40 && s.feature_count <= 60), 'balanced ~50 per session')
  assert.ok(p.sessions.every(s => s.domain_focus.includes('misc')), 'same-domain sessions are fine')
})

test('one huge domain + small domains → still balanced, ladder-count sessions', () => {
  // 75 features: a 60-feature "big" domain + 15 across small domains → base ladder 3 sessions, balanced.
  const feats = [...mk(60, 'big'), ...mk(5, 's1'), ...mk(5, 's2'), ...mk(5, 's3')]
  const p = P.planSourceRuntime({ features: feats })
  assert.equal(p.mapping_sessions, 3)
  assert.equal(p.sessions.length, 3)
  assert.equal(p.sessions.reduce((s, x) => s + x.feature_count, 0), 75)
  assert.ok(p.sessions.every(s => s.feature_count >= 20 && s.feature_count <= 30), 'balanced ~25 each despite one huge domain')
})

test('max_concurrent_sessions NEVER exceeds mapping_sessions (fixes {1,3})', () => {
  for (const n of [1, 5, 20, 21, 75, 200, 500, 1000]) {
    for (const quota of ['healthy', 'warm', 'constrained', 'cooling']) {
      const p = P.planSourceRuntime({ features: mk(n, 'misc'), quota })
      assert.ok(p.max_concurrent_sessions <= p.mapping_sessions, `n=${n} quota=${quota}: ${p.max_concurrent_sessions} > ${p.mapping_sessions}`)
      assert.ok(p.max_concurrent_sessions >= 1)
    }
  }
})

test('never exceeds the hard ceiling of 6 sessions', () => {
  const domains = Array.from({ length: 12 }, (_, i) => mk(60, `d${i}`)).flat() // 720 features, 12 domains
  const p = P.planSourceRuntime({ features: domains })
  assert.ok(p.mapping_sessions <= P.HARD_MAX_SESSIONS)
  assert.equal(p.mapping_sessions, 6)
})
