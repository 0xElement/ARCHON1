'use strict'
// M3: the source-review planner — the "Mission Director" for a code review. Pure + tested. Two pieces:
//  (1) rankJobs — order the Phase-2 feature×class cartesian by CURATOR's ranked review queue, so the
//      highest-value leads run (and stream to the board) FIRST. Parity with the black-box attack plan
//      ordering (Phase 1.9). Never adds or drops a job — pure reorder.
//  (2) replanJobs — after a wave, extend the queue with any feature×class the LIVE findings point at
//      but that wasn't assessed. The run tasks itself from its own evidence (parity with re-plan 3.087).

// Feature slugs in ranked order, by FIRST mention in CURATOR's consolidated phase2_review_queue.md.
// Unmentioned features keep their original order, after the ranked ones.
function parseRankedFeatures(reviewQueueMd, featureSlugs) {
  const md = String(reviewQueueMd || '')
  const mentioned = []
  for (const slug of featureSlugs || []) { const at = md.indexOf(slug); if (at >= 0) mentioned.push({ slug, at }) }
  mentioned.sort((a, b) => a.at - b.at)
  const ranked = []
  const seen = new Set()
  for (const m of mentioned) { if (!seen.has(m.slug)) { ranked.push(m.slug); seen.add(m.slug) } }
  for (const slug of featureSlugs || []) { if (!seen.has(slug)) { ranked.push(slug); seen.add(slug) } }
  return ranked
}

function _slug(feature) { return feature && (feature.slug || feature) }

// Reorder feature×class jobs so jobs whose feature ranks earlier run first; stable otherwise.
function rankJobs(jobs, rankedFeatureSlugs) {
  const rank = new Map((rankedFeatureSlugs || []).map((s, i) => [s, i]))
  const idx = (j) => rank.has(_slug(j && j.feature)) ? rank.get(_slug(j.feature)) : Number.MAX_SAFE_INTEGER
  return (jobs || []).map((j, i) => ({ j, i })).sort((a, b) => (idx(a.j) - idx(b.j)) || (a.i - b.i)).map(x => x.j)
}

// Follow-up jobs the LIVE findings imply but that weren't assessed: any (feature, class) pair a finding
// references (by feature slug + vuln class) that isn't already a done job, bounded to KNOWN features +
// classes (an unknown class has no specialist, so it can't be assessed). Deduped.
function replanJobs(doneJobs, liveFindings, allFeatures, allClasses) {
  const featBySlug = new Map((allFeatures || []).map(f => [_slug(f), f]))
  const classes = new Set(allClasses || [])
  const done = new Set((doneJobs || []).map(j => `${j.cls}|${_slug(j.feature)}`))
  const add = new Map()
  for (const f of liveFindings || []) {
    if (!f || typeof f !== 'object') continue
    const slug = f.feature
    const cls = f.cwe || f.vuln_class || f.class
    if (!slug || !cls || !featBySlug.has(slug) || !classes.has(cls)) continue
    const key = `${cls}|${slug}`
    if (done.has(key) || add.has(key)) continue
    add.set(key, { cls, feature: featBySlug.get(slug) })
  }
  return [...add.values()]
}

module.exports = { parseRankedFeatures, rankJobs, replanJobs }

// self-check
if (require.main === module) {
  const assert = require('node:assert')
  const feats = [{ slug: 'auth' }, { slug: 'search' }, { slug: 'admin' }]
  // ranking: review queue mentions admin then auth → admin/auth rank before the unmentioned search
  const ranked = parseRankedFeatures('Leads: 1. admin panel … 2. auth/login …', feats.map(f => f.slug))
  assert.deepStrictEqual(ranked, ['admin', 'auth', 'search'], 'ranked by first mention, rest appended')
  const jobs = [{ cls: 'xss', feature: feats[0] }, { cls: 'xss', feature: feats[1] }, { cls: 'xss', feature: feats[2] }]
  const ordered = rankJobs(jobs, ranked).map(j => _slug(j.feature))
  assert.deepStrictEqual(ordered, ['admin', 'auth', 'search'], 'jobs reordered by feature rank')
  // rankJobs never drops a job
  assert.strictEqual(rankJobs(jobs, ranked).length, jobs.length, 'no job dropped')
  // replan: a finding on (search, sqli) not yet assessed becomes a follow-up job
  const done = [{ cls: 'xss', feature: feats[1] }]
  const extra = replanJobs(done, [{ feature: 'search', cwe: 'sqli' }, { feature: 'search', cwe: 'xss' }], feats, ['xss', 'sqli'])
  assert.strictEqual(extra.length, 1, 'only the un-done (search, sqli) pair is added')
  assert.strictEqual(extra[0].cls, 'sqli')
  assert.strictEqual(_slug(extra[0].feature), 'search')
  // replan ignores unknown class / unknown feature
  assert.strictEqual(replanJobs(done, [{ feature: 'ghost', cwe: 'sqli' }, { feature: 'search', cwe: 'rce' }], feats, ['xss', 'sqli']).length, 0, 'unknown feature/class ignored')
  console.log('ok — source-planner: rankJobs reorders (never drops), replanJobs self-tasks bounded to known features/classes')
}
