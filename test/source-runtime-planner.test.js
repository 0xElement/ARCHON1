'use strict'
// M3: the Source Runtime Planner — session ladder by feature count, quota adjustment, domain-aware sharding,
// concurrency caps. Pure + deterministic.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const P = require('../src/dispatch/source-runtime-planner')

const mk = (n, domain = 'misc') => Array.from({ length: n }, (_, i) => ({ slug: `${domain}-${i}`, domain }))

test('session ladder by feature count', () => {
  assert.equal(P.baseSessions(0), 1)
  assert.equal(P.baseSessions(20), 1)
  assert.equal(P.baseSessions(21), 2)
  assert.equal(P.baseSessions(60), 2)
  assert.equal(P.baseSessions(61), 3)
  assert.equal(P.baseSessions(120), 3)
  assert.equal(P.baseSessions(250), 4)
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

test('never exceeds the hard ceiling of 6 sessions', () => {
  const domains = Array.from({ length: 12 }, (_, i) => mk(60, `d${i}`)).flat() // 720 features, 12 domains
  const p = P.planSourceRuntime({ features: domains })
  assert.ok(p.mapping_sessions <= P.HARD_MAX_SESSIONS)
  assert.equal(p.mapping_sessions, 6)
})
