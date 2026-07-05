'use strict'
// M3: the source-review planner — rankJobs (order by CURATOR's ranked queue, never drop) + replanJobs
// (self-task from live findings, bounded to known features/classes).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseRankedFeatures, rankJobs, replanJobs } = require('../src/dispatch/source-planner')

const feats = [{ slug: 'auth' }, { slug: 'search' }, { slug: 'admin' }]
const slugs = feats.map(f => f.slug)

test('parseRankedFeatures: rank by first mention, unmentioned appended in original order', () => {
  assert.deepEqual(parseRankedFeatures('1. admin panel … 2. auth/login …', slugs), ['admin', 'auth', 'search'])
  assert.deepEqual(parseRankedFeatures('', slugs), ['auth', 'search', 'admin']) // none mentioned → original
})

test('rankJobs reorders by feature rank and NEVER drops a job', () => {
  const jobs = [{ cls: 'xss', feature: feats[0] }, { cls: 'xss', feature: feats[1] }, { cls: 'xss', feature: feats[2] }]
  const ranked = ['admin', 'auth', 'search']
  const out = rankJobs(jobs, ranked)
  assert.deepEqual(out.map(j => j.feature.slug), ['admin', 'auth', 'search'])
  assert.equal(out.length, jobs.length)
})

test('rankJobs is stable within a feature (class order preserved)', () => {
  const jobs = [{ cls: 'a', feature: feats[0] }, { cls: 'b', feature: feats[0] }]
  assert.deepEqual(rankJobs(jobs, ['auth']).map(j => j.cls), ['a', 'b'])
})

test('replanJobs: a finding on an un-assessed (feature, class) becomes a follow-up job', () => {
  const done = [{ cls: 'xss', feature: feats[1] }] // only (search, xss) assessed
  const findings = [{ feature: 'search', cwe: 'sqli' }, { feature: 'search', cwe: 'xss' }]
  const extra = replanJobs(done, findings, feats, ['xss', 'sqli'])
  assert.equal(extra.length, 1)
  assert.equal(extra[0].cls, 'sqli')
  assert.equal(extra[0].feature.slug, 'search')
})

test('replanJobs: a NOVEL class surfaced by a freehand finding self-tasks a structured assessment', () => {
  // full cartesian assessed for the selected classes; a freehand finding names a class OUTSIDE them
  const done = [{ cls: 'xss', feature: feats[0] }, { cls: 'access-control', feature: feats[0] }]
  const findings = [{ feature: 'auth', vuln_class: 'account-takeover' }] // not in the selected set
  const extra = replanJobs(done, findings, feats, ['xss', 'access-control', 'account-takeover'])
  assert.equal(extra.length, 1)
  assert.equal(extra[0].cls, 'account-takeover')
})

test('replanJobs ignores unknown feature / unknown class / already-done', () => {
  const done = [{ cls: 'xss', feature: feats[0] }]
  assert.equal(replanJobs(done, [{ feature: 'ghost', cwe: 'sqli' }], feats, ['sqli']).length, 0) // unknown feature
  assert.equal(replanJobs(done, [{ feature: 'auth', cwe: 'nope' }], feats, ['sqli']).length, 0) // unknown class
  assert.equal(replanJobs(done, [{ feature: 'auth', cwe: 'xss' }], feats, ['xss']).length, 0)   // already done
})
