'use strict'
// S4: the concurrent map→assess pipeline. Runs Phase-1 batch mapping and Phase-2 assessments under ONE
// bounded worker pool so they OVERLAP (spec §11): as soon as a batch finishes fast-mapping, its features'
// assess jobs are enqueued and picked up WHILE the next batch is still mapping. Risk-first: high-risk work
// (map + assess) runs ahead of normal, and assessments (which produce findings) run ahead of maps within a
// risk tier so results stream ASAP. Deterministic + testable — inject runMap / makeAssessJobs / runAssess;
// this drives ONLY ordering + concurrency, never the work itself. Fail-soft: a job that throws is logged
// and never wedges the pool.

// Priority (lower = sooner): high-risk assess 0, high-risk map 1, normal assess 2, normal map 3.
// An assess job only exists after its batch's map completes, so initially only maps are queued; once a
// high-risk batch maps, its assessments jump ahead of the remaining normal maps → overlap + risk-first.
function _mapPrio(batch) { return batch && batch.risk === 'high' ? 1 : 3 }
function _assessPrio(job) { return job && job.risk === 'high' ? 0 : 2 }

async function runMapAssessPipeline({ batches, concurrency = 6, runMap, makeAssessJobs, runAssess, log } = {}) {
  const pending = []
  const push = (job) => {
    // insert keeping the array sorted by prio (stable within a prio for FIFO fairness)
    let i = pending.length
    while (i > 0 && pending[i - 1].prio > job.prio) i--
    pending.splice(i, 0, job)
  }
  const counts = { maps: 0, assesses: 0 }

  for (const b of (batches || [])) {
    push({
      kind: 'map', prio: _mapPrio(b),
      run: async () => {
        await runMap(b)
        counts.maps++
        for (const j of (makeAssessJobs ? (makeAssessJobs(b) || []) : [])) {
          push({ kind: 'assess', prio: _assessPrio(j), run: async () => { await runAssess(j); counts.assesses++ } })
        }
      },
    })
  }

  let inFlight = 0
  await new Promise((resolve) => {
    const pump = () => {
      if (pending.length === 0 && inFlight === 0) return resolve()
      while (inFlight < Math.max(1, concurrency) && pending.length) {
        const job = pending.shift()
        inFlight++
        Promise.resolve().then(job.run)
          .catch(e => { if (typeof log === 'function') log(`⚠️ pipeline ${job.kind} job: ${(e && e.message) || e}`) })
          .finally(() => { inFlight--; pump() })
      }
    }
    pump()
  })
  return counts
}

module.exports = { runMapAssessPipeline }

// self-check
if (require.main === module) {
  const assert = require('node:assert')
  ;(async () => {
    const events = []
    let running = 0, maxConcurrent = 0
    const work = (label) => async () => {
      running++; maxConcurrent = Math.max(maxConcurrent, running)
      await new Promise(r => setTimeout(r, 5)); events.push(label); running--
    }
    const batches = [
      { id: 'auth-1', risk: 'high', features: [{ slug: 'login' }] },
      { id: 'blog-1', risk: 'normal', features: [{ slug: 'blog' }] },
    ]
    const counts = await runMapAssessPipeline({
      batches, concurrency: 4,
      runMap: (b) => work(`map:${b.id}`)(),
      makeAssessJobs: (b) => b.features.map(f => ({ feature: f, cls: 'xss', risk: b.risk })),
      runAssess: (j) => work(`assess:${j.feature.slug}`)(),
    })
    assert.strictEqual(counts.maps, 2, 'both batches mapped')
    assert.strictEqual(counts.assesses, 2, 'both features assessed')
    // every map ran before its own assess (an assess job is only created after its map)
    assert.ok(events.indexOf('map:auth-1') < events.indexOf('assess:login'), 'assess after its map')
    assert.ok(events.indexOf('map:blog-1') < events.indexOf('assess:blog'), 'assess after its map')
    // high-risk batch's map runs before the normal batch's map (risk-first)
    assert.ok(events.indexOf('map:auth-1') < events.indexOf('map:blog-1'), 'high-risk batch maps first')

    // concurrency cap respected + overlap actually happens (max concurrent > 1 with cap 4 and 4 jobs)
    const big = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, risk: 'normal', features: [{ slug: `f${i}` }] }))
    running = 0; maxConcurrent = 0
    await runMapAssessPipeline({ batches: big, concurrency: 3, runMap: (b) => work(b.id)(), makeAssessJobs: (b) => b.features.map(f => ({ feature: f, risk: 'normal' })), runAssess: (j) => work(j.feature.slug)() })
    assert.ok(maxConcurrent > 1 && maxConcurrent <= 3, `overlap within cap (peak ${maxConcurrent})`)

    // cap=1 → strictly serial (no overlap)
    running = 0; maxConcurrent = 0
    await runMapAssessPipeline({ batches: [{ id: 'x', risk: 'normal', features: [{ slug: 'a' }, { slug: 'b' }] }], concurrency: 1, runMap: (b) => work('m')(), makeAssessJobs: (b) => b.features.map(f => ({ feature: f, risk: 'normal' })), runAssess: (j) => work(j.feature.slug)() })
    assert.strictEqual(maxConcurrent, 1, 'cap=1 is serial')
    console.log('ok — mapping-pipeline: overlap under a bounded pool, risk-first, assess-after-map, cap respected')
  })().catch(e => { console.error(e); process.exit(1) })
}
