'use strict'
// S4: the concurrent map→assess pipeline — overlap under a bounded pool, risk-first ordering,
// assess-only-after-its-map, concurrency cap respected.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { runMapAssessPipeline } = require('../src/dispatch/mapping-pipeline')

function tracker() {
  const events = []; let running = 0, peak = 0
  const work = (label) => async () => { running++; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 4)); events.push(label); running-- }
  return { events, work, peak: () => peak }
}

test('every map + assess runs; assess only after its own map; high-risk batch maps first', async () => {
  const t = tracker()
  const batches = [
    { id: 'auth-1', risk: 'high', features: [{ slug: 'login' }] },
    { id: 'blog-1', risk: 'normal', features: [{ slug: 'blog' }] },
  ]
  const counts = await runMapAssessPipeline({
    batches, concurrency: 4,
    runMap: (b) => t.work(`map:${b.id}`)(),
    makeAssessJobs: (b) => b.features.map(f => ({ feature: f, cls: 'xss', risk: b.risk })),
    runAssess: (j) => t.work(`assess:${j.feature.slug}`)(),
  })
  assert.equal(counts.maps, 2); assert.equal(counts.assesses, 2)
  assert.ok(t.events.indexOf('map:auth-1') < t.events.indexOf('assess:login'), 'assess after its map')
  assert.ok(t.events.indexOf('map:blog-1') < t.events.indexOf('assess:blog'), 'assess after its map')
  assert.ok(t.events.indexOf('map:auth-1') < t.events.indexOf('map:blog-1'), 'high-risk batch maps first')
})

test('overlap happens under the cap (peak concurrency between 1 and cap)', async () => {
  const t = tracker()
  const batches = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, risk: 'normal', features: [{ slug: `f${i}` }] }))
  await runMapAssessPipeline({ batches, concurrency: 3, runMap: (b) => t.work(b.id)(), makeAssessJobs: (b) => b.features.map(f => ({ feature: f, risk: 'normal' })), runAssess: (j) => t.work(j.feature.slug)() })
  assert.ok(t.peak() > 1 && t.peak() <= 3, `overlap within cap, peak ${t.peak()}`)
})

test('cap=1 is strictly serial', async () => {
  const t = tracker()
  await runMapAssessPipeline({ batches: [{ id: 'x', risk: 'normal', features: [{ slug: 'a' }, { slug: 'b' }] }], concurrency: 1, runMap: () => t.work('m')(), makeAssessJobs: (b) => b.features.map(f => ({ feature: f, risk: 'normal' })), runAssess: (j) => t.work(j.feature.slug)() })
  assert.equal(t.peak(), 1)
})

test('a throwing job is fail-soft (logged, never wedges the pool)', async () => {
  const logs = []
  const counts = await runMapAssessPipeline({
    batches: [{ id: 'x', risk: 'normal', features: [{ slug: 'a' }] }],
    concurrency: 2, runMap: async () => { throw new Error('boom') },
    makeAssessJobs: (b) => b.features.map(f => ({ feature: f, risk: 'normal' })),
    runAssess: async () => {}, log: (m) => logs.push(m),
  })
  // map threw → its assess jobs were never enqueued, but the pipeline still completes
  assert.equal(counts.maps, 0)
  assert.ok(logs.some(l => /pipeline map job/.test(l)), 'the failure was logged')
})
