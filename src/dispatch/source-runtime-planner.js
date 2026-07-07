'use strict'
// M3: the Source Runtime Planner — decides how many persistent Claude-Code-style worker sessions map the
// feature queue, and shards the features across them by domain/risk. Runs AFTER feature discovery and BEFORE
// mapping. Pure + deterministic (no clock/random) so it's fully testable; the dispatcher stamps/writes the
// result to var/intel/code-review/<taskId>/source-runtime-plan.json.
//
// The goal is rate-limit-aware execution: FEW long-running sessions (each maps many features in one context)
// instead of many short-lived spawns. More sessions = more concurrent draw on the one subscription bucket, so
// concurrency is capped hard and shrunk when quota is unhealthy.

// Session ladder by feature count (spec §1). Index by how many features there are.
function baseSessions(total) {
  if (total <= 20) return 1
  if (total <= 60) return 2
  if (total <= 120) return 3
  if (total <= 250) return 4
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

// Greedy domain-aware sharding: keep a domain's features together, balance session sizes (bin-packing by
// fewest-features-first). Related features (same domain) land in the same worker where possible.
function shard(features, sessions) {
  const bins = Array.from({ length: sessions }, (_, i) => ({ session_id: `map-worker-${i + 1}`, feature_count: 0, domain_focus: [], features: [] }))
  // group by domain, largest groups first so they seed the bins evenly
  const byDomain = new Map()
  for (const f of features) {
    const d = (f && (f.domain || (f.batch && f.batch.domain))) || 'misc'
    if (!byDomain.has(d)) byDomain.set(d, [])
    byDomain.get(d).push(f)
  }
  const groups = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length)
  for (const [domain, feats] of groups) {
    // place the whole domain group in the currently-smallest bin (ties → lowest index for determinism)
    let target = bins[0]
    for (const b of bins) if (b.feature_count < target.feature_count) target = b
    if (!target.domain_focus.includes(domain)) target.domain_focus.push(domain)
    for (const f of feats) target.features.push(f.slug)
    target.feature_count += feats.length
  }
  // drop empty bins (more sessions than domains) so we never report a worker with nothing to do
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
  if (total === 0) mapping_sessions = 0

  const max_concurrent_sessions = Math.min(mapping_sessions, DEFAULT_MAX_CONCURRENT)
  const sessions = mapping_sessions > 0 ? shard(features, mapping_sessions) : []
  // the ladder may have wanted N sessions but sharding collapsed empty bins (fewer domains than N)
  const effective = sessions.length || mapping_sessions

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
  assert.strictEqual(baseSessions(20), 1); assert.strictEqual(baseSessions(21), 2); assert.strictEqual(baseSessions(120), 3)
  assert.strictEqual(baseSessions(250), 4); assert.strictEqual(baseSessions(500), 5); assert.strictEqual(baseSessions(9999), 6)
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
  // quota cooling → 1 session, paused strategy
  p = planSourceRuntime({ features: mk(200, 'a'), quota: 'cooling' })
  assert.strictEqual(p.mapping_sessions, 1); assert.strictEqual(p.strategy, 'paused_rate_limit')
  // operator override caps sessions
  p = planSourceRuntime({ features: [...mk(50, 'a'), ...mk(50, 'b'), ...mk(50, 'c'), ...mk(50, 'd')], maxSessions: 2 })
  assert.strictEqual(p.mapping_sessions, 2)
  console.log('ok — source-runtime-planner: session ladder, quota adjustment, domain-aware sharding, caps')
}
