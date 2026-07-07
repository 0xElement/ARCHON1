'use strict'
// M3: the Source Runtime Planner — decides how many persistent Claude-Code-style worker sessions map the
// feature queue, and shards the features across them by domain/risk. Runs AFTER feature discovery and BEFORE
// mapping. Pure + deterministic (no clock/random) so it's fully testable; the dispatcher stamps/writes the
// result to var/intel/code-review/<taskId>/source-runtime-plan.json.
//
// The goal is rate-limit-aware execution: FEW long-running sessions (each maps many features in one context)
// instead of many short-lived spawns. More sessions = more concurrent draw on the one subscription bucket, so
// concurrency is capped hard and shrunk when quota is unhealthy.

// Session ladder by feature count (spec §1). Index by how many features there are. This is the CEILING when
// quota is healthy; applyQuota() shrinks it under rate-limit pressure. No 2-session tier by design — the spec
// jumps 1→3 so mid-size scans still parallelise, and the quota gate is what protects the rate limit.
function baseSessions(total) {
  if (total <= 30) return 1
  if (total <= 90) return 3
  if (total <= 200) return 4
  if (total <= 500) return 5
  return 6
}

const DEFAULT_MAX_CONCURRENT = 3 // default cap on ACTIVE Claude sessions at once
const HARD_MAX_SESSIONS = 6      // absolute ceiling regardless of feature count/quota

// Quota health → how aggressively we open sessions. 'cooling' means a live cooldown is in effect.
function applyQuota(base, quota) {
  switch (quota) {
    case 'warm': return Math.max(1, base - 1)
    case 'constrained': return Math.min(base, 2)
    case 'cooling': return 1
    case 'healthy':
    default: return base
  }
}

const riskRank = (f) => { const r = String((f && (f.risk_hint || f.risk)) || '').toLowerCase(); return r === 'high' ? 0 : r === 'medium' ? 1 : 2 }

// Domain-aware balanced sharding. Keep a domain's features together WHERE POSSIBLE, but an oversized domain is
// SPLIT into chunks of ~targetPerSession so a single broad domain (e.g. everything tagged "misc") still fans
// out across all the sessions the feature-count ladder asked for — never collapses to one worker. Chunks are
// greedily packed into the fewest-features bin so sessions stay balanced.
function shard(features, sessions) {
  sessions = Math.max(1, Math.min(sessions, features.length || 1))
  const targetPerSession = Math.max(1, Math.ceil(features.length / sessions))
  // group by domain
  const byDomain = new Map()
  for (const f of features) {
    const d = (f && (f.domain || (f.batch && f.batch.domain))) || 'misc'
    if (!byDomain.has(d)) byDomain.set(d, [])
    byDomain.get(d).push(f)
  }
  // build chunks: within a domain, order high-risk-first then by slug (keeps related features adjacent), then
  // slice into ≤ targetPerSession pieces. A domain ≤ targetPerSession stays a single chunk (locality preserved).
  const chunks = []
  for (const [domain, feats] of byDomain) {
    feats.sort((a, b) => riskRank(a) - riskRank(b) || String(a.slug).localeCompare(String(b.slug)))
    for (let i = 0; i < feats.length; i += targetPerSession) {
      const slice = feats.slice(i, i + targetPerSession)
      chunks.push({ domain, feats: slice, highRisk: slice.some((f) => riskRank(f) === 0) })
    }
  }
  // place high-risk + larger chunks first so greedy balancing has room to even out
  chunks.sort((a, b) => (Number(b.highRisk) - Number(a.highRisk)) || (b.feats.length - a.feats.length))
  const bins = Array.from({ length: sessions }, (_, i) => ({ session_id: `map-worker-${i + 1}`, feature_count: 0, domain_focus: [], features: [] }))
  for (const ch of chunks) {
    let target = bins[0]
    for (const b of bins) if (b.feature_count < target.feature_count) target = b
    if (!target.domain_focus.includes(ch.domain)) target.domain_focus.push(ch.domain)
    for (const f of ch.feats) target.features.push(f.slug)
    target.feature_count += ch.feats.length
  }
  // drop only genuinely-empty bins (possible when features.length < sessions) — never a same-domain collapse
  return bins.filter((b) => b.feature_count > 0)
}

// input: { features:[{slug,domain,risk_hint}], vulnClasses?, fileCount?, quota?, maxSessions? }
// returns the source-runtime-plan object (spec §1).
function planSourceRuntime(input) {
  const features = (input && input.features) || []
  const total = features.length
  const quota = (input && input.quota) || 'healthy'
  const base = baseSessions(total)
  let mapping_sessions = applyQuota(base, quota)
  // operator override caps (never raises above what the ladder/quota chose)
  if (input && Number.isFinite(input.maxSessions)) mapping_sessions = Math.min(mapping_sessions, Math.max(1, input.maxSessions))
  mapping_sessions = Math.max(1, Math.min(mapping_sessions, HARD_MAX_SESSIONS))
  // never ask for more sessions than there are features to map
  mapping_sessions = Math.min(mapping_sessions, total)
  if (total === 0) mapping_sessions = 0

  // shard FIRST (splitting oversized domains into balanced chunks), then derive concurrency from what actually
  // got built — so max_concurrent can never exceed the real session count (fixes {sessions:1, concurrent:3}).
  const sessions = mapping_sessions > 0 ? shard(features, mapping_sessions) : []
  const effective = sessions.length || mapping_sessions
  const max_concurrent_sessions = Math.min(effective, DEFAULT_MAX_CONCURRENT)

  const strategy = quota === 'cooling' ? 'paused_rate_limit'
    : effective <= 1 ? 'single_persistent_worker'
    : 'persistent_sharded_mapping'

  const reasonBits = [`${total} feature(s)`]
  if (quota !== 'healthy') reasonBits.push(`quota ${quota} → ${quota === 'cooling' ? 'pause/1 session' : 'reduced'}`)
  reasonBits.push(effective <= 1 ? 'one persistent session maps all features'
    : `${effective} sharded sessions, ${max_concurrent_sessions} concurrent to stay under the rate limit`)

  return {
    features_total: total,
    mapping_sessions: effective,
    max_concurrent_sessions,
    strategy,
    quota,
    reason: reasonBits.join('; '),
    // review-session strategy (spec §6) — persistent specialist sessions, capped; M6 consumes this.
    review: { max_concurrent_sessions: Math.min(effective || DEFAULT_MAX_CONCURRENT, DEFAULT_MAX_CONCURRENT), strategy: 'persistent_specialist_sessions' },
    sessions,
  }
}

module.exports = { planSourceRuntime, baseSessions, applyQuota, shard, DEFAULT_MAX_CONCURRENT, HARD_MAX_SESSIONS }

// self-check
if (require.main === module) {
  const assert = require('node:assert')
  const mk = (n, domain = 'misc') => Array.from({ length: n }, (_, i) => ({ slug: `${domain}-${i}`, domain }))
  assert.strictEqual(baseSessions(30), 1); assert.strictEqual(baseSessions(31), 3); assert.strictEqual(baseSessions(90), 3)
  assert.strictEqual(baseSessions(200), 4); assert.strictEqual(baseSessions(500), 5); assert.strictEqual(baseSessions(9999), 6)
  // 20 → single session
  let p = planSourceRuntime({ features: mk(20) })
  assert.strictEqual(p.mapping_sessions, 1); assert.strictEqual(p.strategy, 'single_persistent_worker')
  // 75 across 3 domains → 3 sessions, 3 concurrent
  p = planSourceRuntime({ features: [...mk(25, 'auth'), ...mk(25, 'api'), ...mk(25, 'files')] })
  assert.strictEqual(p.mapping_sessions, 3); assert.strictEqual(p.max_concurrent_sessions, 3)
  assert.strictEqual(p.sessions.length, 3); assert.strictEqual(p.sessions.reduce((s, x) => s + x.feature_count, 0), 75)
  // 200 → 4 shards but only 3 concurrent
  p = planSourceRuntime({ features: [...mk(50, 'a'), ...mk(50, 'b'), ...mk(50, 'c'), ...mk(50, 'd')] })
  assert.strictEqual(p.mapping_sessions, 4); assert.strictEqual(p.max_concurrent_sessions, 3)
  // single broad domain must STILL follow the ladder (the collapse bug): 200 misc → 4 balanced ~50 sessions
  p = planSourceRuntime({ features: mk(200, 'misc') })
  assert.strictEqual(p.mapping_sessions, 4); assert.strictEqual(p.sessions.length, 4)
  assert.ok(p.sessions.every(s => s.feature_count >= 40 && s.feature_count <= 60), 'balanced ~50 each')
  assert.ok(p.max_concurrent_sessions <= p.mapping_sessions)
  assert.strictEqual(planSourceRuntime({ features: mk(1000, 'misc') }).mapping_sessions, 6)
  // quota cooling → 1 session, paused strategy
  p = planSourceRuntime({ features: mk(200, 'a'), quota: 'cooling' })
  assert.strictEqual(p.mapping_sessions, 1); assert.strictEqual(p.strategy, 'paused_rate_limit')
  // operator override caps sessions
  p = planSourceRuntime({ features: [...mk(50, 'a'), ...mk(50, 'b'), ...mk(50, 'c'), ...mk(50, 'd')], maxSessions: 2 })
  assert.strictEqual(p.mapping_sessions, 2)
  console.log('ok — source-runtime-planner: session ladder, quota adjustment, domain-aware sharding, caps')
}
