'use strict'
// M5: deterministic audit artifacts from the streamed source candidates — a deduped, CAND-numbered
// candidate index and the black-box validation queue (the NEEDS-LIVE subset, keyed to CAND-ids for
// white-box). Pure + tested.

const { evidenceTier, TIER_RANK } = require('./evidence-tier')

const SEV = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
const sevRank = (c) => SEV[String(c.severity || 'medium').toLowerCase()] ?? 2
const tierRank = (c) => TIER_RANK[evidenceTier(c)] ?? 0
const _key = (c) => `${String(c.cwe || c.vuln_class || '').toLowerCase()}|${String(c.file || '').toLowerCase()}|${String(c.line || '')}`

// Dedup by (class, file, line); keep the richest representative (severity, then evidence tier, then
// confidence) so the queue carries the best required-proof; count merges; number CAND-1…N worst-first.
function buildCandidateIndex(candidates) {
  const groups = new Map()
  for (const c of candidates || []) {
    if (!c || typeof c !== 'object') continue
    const k = _key(c)
    const g = groups.get(k)
    if (!g) { groups.set(k, { rep: c, count: 1 }); continue }
    g.count++
    const better = sevRank(c) < sevRank(g.rep) ||
      (sevRank(c) === sevRank(g.rep) && tierRank(c) > tierRank(g.rep)) ||
      (sevRank(c) === sevRank(g.rep) && tierRank(c) === tierRank(g.rep) && (Number(c.confidence) || 0) > (Number(g.rep.confidence) || 0))
    if (better) g.rep = c
  }
  return [...groups.values()]
    .sort((a, b) => sevRank(a.rep) - sevRank(b.rep) || b.count - a.count)
    .map((g, i) => {
      const c = g.rep
      return {
        cand_id: `CAND-${i + 1}`, feature: c.feature || '', vuln_class: c.cwe || c.vuln_class || '',
        file: c.file || '', line: c.line ?? '', endpoint: c.endpoint || c.affected_endpoint || '',
        severity: c.severity || 'Medium', status: c.status || c.confirmation_status || 'SOURCE_CONFIRMED',
        tier: evidenceTier(c), required_blackbox_proof: c.required_blackbox_proof || '', merge_count: g.count,
        title: c.title || c.hypothesis || '',
      }
    })
}

// The NEEDS-LIVE subset → structured validation tasks (white-box hands these to the deferred pentest).
function buildValidationQueue(index) {
  return (index || [])
    .filter(c => c.status === 'NEEDS_LIVE_VALIDATION' || c.status === 'NEEDS-LIVE')
    .map(c => ({ cand_id: c.cand_id, vuln_class: c.vuln_class, file: c.file, line: c.line, endpoint: c.endpoint,
      required_proof: c.required_blackbox_proof || 'a live request/sequence that observes the predicted behavior' }))
}

function renderIndexMd(index) {
  const rows = (index || []).map(c => `| ${c.cand_id} | ${c.severity} | ${c.vuln_class} | ${c.feature} | \`${c.file}:${c.line}\` | ${c.tier} | ${c.status} | ${c.merge_count} |`)
  return `# Candidate Findings Index\n\n${(index || []).length} distinct candidate(s), worst-first. Evidence tier L0–L4.\n\n| ID | Severity | Class | Feature | Location | Evidence | Status | Merged |\n|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`
}

function renderQueueMd(queue) {
  const rows = (queue || []).map(t => `| ${t.cand_id} | ${t.vuln_class} | \`${t.file}:${t.line}\` | ${t.endpoint || '—'} | ${t.required_proof} |`)
  return `# Black-box Validation Queue\n\n${(queue || []).length} candidate(s) need live validation (white-box).\n\n| CAND | Class | Source | Endpoint | Required live proof |\n|---|---|---|---|---|\n${rows.join('\n')}\n`
}

module.exports = { buildCandidateIndex, buildValidationQueue, renderIndexMd, renderQueueMd }

// self-check
if (require.main === module) {
  const assert = require('node:assert')
  const cands = [
    { feature: 'orders', cwe: 'access-control', file: 'app/orders.rb', line: 42, severity: 'High', status: 'NEEDS_LIVE_VALIDATION', source: 'p', sink: 's', required_blackbox_proof: 'req /orders/2 as A', endpoint: 'GET /orders/:id' },
    { feature: 'orders', cwe: 'access-control', file: 'app/orders.rb', line: 42, severity: 'High', status: 'NEEDS_LIVE_VALIDATION', confidence: 90 }, // dup, thinner → collapses, first (L3) wins
    { feature: 'search', cwe: 'sqli', file: 'app/search.rb', line: 7, severity: 'Critical', status: 'SOURCE_CONFIRMED', vulnerable_code: 'q' },
  ]
  const idx = buildCandidateIndex(cands)
  assert.strictEqual(idx.length, 2, 'dup (class,file,line) collapses')
  assert.strictEqual(idx[0].severity, 'Critical', 'worst severity first')
  const ac = idx.find(c => c.vuln_class === 'access-control')
  assert.strictEqual(ac.merge_count, 2, 'merge counted')
  assert.strictEqual(ac.required_blackbox_proof, 'req /orders/2 as A', 'richest rep (L3) kept its required-proof')
  const q = buildValidationQueue(idx)
  assert.strictEqual(q.length, 1, 'only the NEEDS-LIVE candidate is queued')
  assert.strictEqual(q[0].required_proof, 'req /orders/2 as A')
  assert.ok(renderIndexMd(idx).includes('CAND-1') && renderQueueMd(q).includes('Required live proof'))
  console.log('ok — candidate-index: tier-aware dedup + CAND index + NEEDS-LIVE validation queue')
}
