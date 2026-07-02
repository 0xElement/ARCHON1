// test/attack-graph-bound.test.js
//
// Regression: the attack-graph chain analysis must TERMINATE on a large, densely connected
// graph. A graph built from many findings has an exponential number of simple paths, so the
// all-paths BFS in findPaths must be bounded on both the paths kept and the total work. Without
// the caps, a run with ~76 findings pegged the daemon at ~97% CPU for hours (Phase 3.4 never
// returned, and the run wedged at 75%).

const assert = require('node:assert')
const { test } = require('node:test')
const ag = require('../src/pipeline/attack-graph')
const NT = ag.NODE_TYPES || { ASSET: 'asset', IMPACT: 'impact', VULN: 'vuln', FINDING: 'finding' }

function denseGraph(id, n) {
  const g = new ag.AttackGraph(id)
  g.nodes = new Map(); g.edges = []
  g.nodes.set('A', { type: NT.ASSET, label: 'attacker' })
  g.nodes.set('Z', { type: NT.IMPACT, label: 'rce' })
  for (let i = 0; i < n; i++) g.nodes.set('v' + i, { type: NT.VULN, label: 'v' + i, properties: { validated: true } })
  const ids = [...g.nodes.keys()]
  for (const a of ids) for (const b of ids) if (a !== b) g.edges.push({ from: a, to: b, cost: 1 }) // fully connected
  return g
}

test('findAttackChains terminates fast on a dense graph (was an infinite CPU spin)', () => {
  const g = denseGraph('t-bound', 50)
  const t = Date.now()
  const chains = g.findAttackChains()
  const ms = Date.now() - t
  assert.ok(ms < 3000, `chain analysis must return within 3s, took ${ms}ms`)
  assert.ok(Array.isArray(chains), 'returns an array')
})

test('findPaths honours the maxPaths cap', () => {
  const g = denseGraph('t-bound2', 20)
  const paths = g.findPaths('A', 'Z', 6, 20.0, 10, 20000)
  assert.ok(paths.length <= 10, `maxPaths cap not honoured: got ${paths.length}`)
})

test('findPaths honours the iteration budget on a huge graph', () => {
  const g = denseGraph('t-bound3', 80)
  const t = Date.now()
  const paths = g.findPaths('A', 'Z', 6, 20.0, 40, 20000)
  assert.ok(Date.now() - t < 2000, 'iteration budget must stop the BFS quickly')
  assert.ok(paths.length <= 40)
})
