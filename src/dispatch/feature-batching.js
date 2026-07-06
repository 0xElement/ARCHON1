'use strict'
// S1: scalable source-review mapping — domain grouping + batch fanout. Pure + tested. Instead of one
// mapper agent per feature, the dispatcher fast-maps features in domain-grouped BATCHES (≤ maxPerBatch
// each), assigned round-robin to the mapper pool. Every feature lands in exactly ONE batch — no overlap,
// nothing lost — and high-risk domains batch first so Phase 2 starts on the risky features early.

// Canonical domains (spec §5). Features carry an explicit `domain`; when absent we INFER from
// name/keywords so every feature still groups (only truly unclassifiable ones fall to 'misc').
const DOMAINS = ['auth_identity', 'admin', 'user_profile', 'payments_billing', 'orders_checkout',
  'search_browse', 'files_uploads', 'notifications_webhooks', 'background_jobs', 'integrations_api',
  'reporting_analytics', 'config_infra', 'misc']

// Ordered most-specific first so e.g. an "admin login" classifies as admin before auth on a tie is
// avoided — matched top-to-bottom, first hit wins.
const DOMAIN_HINTS = [
  ['payments_billing', /\b(payment|billing|invoice|wallet|card|charge|subscription|refund|payout|stripe|paypal|checkout.?pay)\b/i],
  ['orders_checkout', /\b(order|checkout|cart|basket|purchase|fulfil|shipping)\b/i],
  ['files_uploads', /\b(upload|download|file|attachment|export|import|media|storage|avatar|s3)\b/i],
  ['notifications_webhooks', /\b(notification|webhook|email|sms|push|callback)\b/i],
  ['background_jobs', /\b(worker|queue|cron|schedul|\bjob\b|async.?task)\b/i],
  ['reporting_analytics', /\b(report|analytic|metric|dashboard|\bstat\b)\b/i],
  ['integrations_api', /\b(webhook.?in|integration|graphql|\bgrpc\b|third.?party|connector|\bapi.?key\b)\b/i],
  ['admin', /\b(admin|superuser|backoffice|moderation|impersonat)\b/i],
  ['auth_identity', /\b(auth|login|logout|session|password|reset|\btoken\b|oauth|\bsso\b|\bmfa\b|2fa|two.?factor|credential|signup|register|lockout)\b/i],
  ['search_browse', /\b(search|browse|catalog|filter|listing|product)\b/i],
  ['user_profile', /\b(profile|account|\buser\b|settings|preference|address|contact)\b/i],
  ['config_infra', /\b(config|setting|infra|deploy|\benv\b|feature.?flag|health)\b/i],
]

// Domains where any feature is high-risk by default.
const HIGH_RISK_DOMAINS = new Set(['auth_identity', 'admin', 'payments_billing', 'orders_checkout', 'files_uploads', 'integrations_api'])
const HIGH_RISK_HINTS = /\b(auth|admin|password|reset|token|payment|billing|wallet|checkout|order|upload|download|export|ssrf|sql|graphql|webhook|tenant|permission|role|secret|api.?key)\b/i

function _hay(f) { return `${f.slug || ''} ${f.name || ''} ${f.keywords || ''}` }

function inferDomain(feature) {
  const hay = _hay(feature || {})
  for (const [dom, re] of DOMAIN_HINTS) if (re.test(hay)) return dom
  return 'misc'
}

function riskHint(feature) {
  const f = feature || {}
  if (['high', 'medium', 'low'].includes(f.risk_hint)) return f.risk_hint
  const dom = f.domain || inferDomain(f)
  if (HIGH_RISK_DOMAINS.has(dom) || HIGH_RISK_HINTS.test(_hay(f))) return 'high'
  return 'medium'
}

// Annotate features with domain + risk_hint (idempotent — explicit values win).
function annotate(features) {
  return (features || []).map(f => ({ ...f, domain: f.domain || inferDomain(f), risk_hint: riskHint(f) }))
}

function groupByDomain(features) {
  const g = {}
  for (const f of annotate(features)) (g[f.domain] = g[f.domain] || []).push(f)
  return g
}

// Domain-grouped batches, ≤ maxPerBatch each, high-risk domains first (Phase 2 starts on risk early),
// then by size desc, 'misc' last. Each feature appears in exactly one batch; a batch never mixes domains.
function createBatches(features, { maxPerBatch = 8 } = {}) {
  const cap = Math.max(1, maxPerBatch | 0)
  const groups = groupByDomain(features)
  const rank = (d) => HIGH_RISK_DOMAINS.has(d) ? 0 : (d === 'misc' ? 2 : 1)
  const domains = Object.keys(groups).sort((a, b) => rank(a) - rank(b) || groups[b].length - groups[a].length || a.localeCompare(b))
  const batches = []
  for (const dom of domains) {
    const feats = groups[dom]
    for (let i = 0, n = 1; i < feats.length; i += cap, n++) {
      batches.push({ id: `${dom}-${n}`, domain: dom, risk: HIGH_RISK_DOMAINS.has(dom) ? 'high' : 'normal', features: feats.slice(i, i + cap) })
    }
  }
  return batches
}

// Round-robin a mapper pool across the batches (owner is a label; a batch is still one agent's work).
function assignBatches(batches, pool) {
  const p = (Array.isArray(pool) && pool.length) ? pool : ['marshal']
  return (batches || []).map((b, i) => ({ ...b, owner: p[i % p.length] }))
}

module.exports = { DOMAINS, inferDomain, riskHint, annotate, groupByDomain, createBatches, assignBatches, HIGH_RISK_DOMAINS }

// self-check
if (require.main === module) {
  const assert = require('node:assert')
  const mk = (n, kw) => ({ slug: n, name: n, keywords: kw || n })
  const feats = [mk('password-reset', 'reset,password,token'), mk('login', 'auth,session'), mk('admin-users', 'admin'),
    mk('product-search', 'search,catalog'), mk('file-upload', 'upload,file'), mk('profile', 'account,user'),
    mk('checkout', 'order,cart'), mk('webhooks', 'webhook,callback')]
  const ann = annotate(feats)
  assert.ok(ann.every(f => f.domain && f.risk_hint), 'every feature annotated')
  assert.strictEqual(ann.find(f => f.slug === 'password-reset').domain, 'auth_identity')
  assert.strictEqual(ann.find(f => f.slug === 'password-reset').risk_hint, 'high')
  // 36 features → batches, NOT 36; each feature exactly once; ≤ maxPerBatch
  const many = Array.from({ length: 36 }, (_, i) => mk(`f${i}`, i % 2 ? 'auth' : 'search'))
  const batches = createBatches(many, { maxPerBatch: 8 })
  assert.ok(batches.length < 36 && batches.length > 0, `batched (${batches.length}), not one-per-feature`)
  assert.ok(batches.every(b => b.features.length <= 8), 'batch size ≤ 8')
  const seen = new Set(); let total = 0
  for (const b of batches) for (const f of b.features) { assert.ok(!seen.has(f.slug), `feature ${f.slug} appears once`); seen.add(f.slug); total++ }
  assert.strictEqual(total, 36, 'no feature lost')
  // high-risk domain batches first
  assert.ok(HIGH_RISK_DOMAINS.has(batches[0].domain), 'high-risk domain batched first')
  // assignment round-robins the pool
  const assigned = assignBatches(batches, ['marshal', 'siphon', 'cipher'])
  assert.strictEqual(assigned[0].owner, 'marshal'); assert.strictEqual(assigned[1].owner, 'siphon')
  console.log('ok — feature-batching: domain-grouped batches, ≤cap, high-risk first, each feature once')
}
