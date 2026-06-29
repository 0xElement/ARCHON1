// test/knowledge-graph.test.js
// P4 — Block B Knowledge Graph (ULTRAPLAN §5.0 F-KG). Derived-from-JSONL, idempotent,
// fail-soft, engagement-scoped, read-pure.

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

// Point INTEL_ROOT at a throwaway dir so the KG never touches the real data layer.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'archon-kg-'))
process.env.KURU_INTEL_ROOT = TMP
delete require.cache[require.resolve('../paths')]
const kg = require('../src/intel/knowledge-graph')

function seedFindings(taskId, arr) {
  fs.writeFileSync(path.join(TMP, `VALIDATED-FINDINGS-${taskId}.jsonl`), arr.map(f => JSON.stringify(f)).join('\n') + '\n')
}
function seedEngagement(id, rec) { fs.writeFileSync(path.join(TMP, `engagement-${id}.json`), JSON.stringify(rec)) }
function seedCorrelation(taskId, map) { fs.writeFileSync(path.join(TMP, `correlation-${taskId}.json`), JSON.stringify(map)) }

test('syncEngagement derives one finding-node per JSONL finding (id parity)', () => {
  seedFindings('e-1', [
    { id: 'F-1', title: 'XSS', severity: 'High', validation_status: 'CONFIRMED', original_agent: 'VIPER', taskId: 'e-1' },
    { id: 'F-2', title: 'IDOR', severity: 'Critical', validation_status: 'NEEDS-LIVE', original_agent: 'WARDEN', taskId: 'e-1' },
  ])
  const g = kg.syncEngagement('e-1', { now: 'fixed' })
  const findingNodes = Object.values(g.nodes).filter(n => n.type === 'confirmed' || n.type === 'candidate')
  assert.equal(findingNodes.length, 2)
  assert.deepEqual(findingNodes.map(n => n.id).sort(), ['F-1', 'F-2'])
  assert.equal(g.nodes['F-1'].type, 'confirmed')
  assert.equal(g.nodes['F-2'].type, 'candidate')
})

test('syncEngagement is idempotent (same inputs → identical graph)', () => {
  const a = kg.syncEngagement('e-1', { now: 'fixed' })
  const b = kg.syncEngagement('e-1', { now: 'fixed' })
  assert.deepEqual(a, b)
})

test('every correlation edge maps to a cross-view-dedup merge decision (parity)', () => {
  seedEngagement('e-2', { engagementId: 'e-2', iterations: [{ taskId: 'e-2', kind: 'blackbox' }, { taskId: 'cr-2', kind: 'whitebox' }] })
  seedFindings('e-2', [{ id: 'BB-1', title: 'IDOR live', severity: 'High', validation_status: 'CONFIRMED', original_agent: 'WARDEN', taskId: 'e-2' }])
  seedFindings('cr-2', [{ id: 'WB-1', title: 'IDOR source', severity: 'High', validation_status: 'NEEDS-LIVE', original_agent: 'MARSHAL', taskId: 'cr-2', source_files: ['app/x.rb'] }])
  seedCorrelation('e-2', {
    exact_duplicate_groups: [],
    cross_view_candidates: [{ vuln_class: 'access-control', whitebox: [{ id: 'WB-1' }], blackbox: [{ id: 'BB-1' }] }],
  })
  const g = kg.syncEngagement('e-2', { now: 'fixed' })
  const corrNodes = Object.values(g.nodes).filter(n => n.type === 'correlation')
  assert.equal(corrNodes.length, 1)
  assert.ok(g.edges.some(e => e.from === 'WB-1' && e.type === 'candidate_correlates_with_source'))
  assert.ok(g.edges.some(e => e.from === 'BB-1' && e.type === 'candidate_correlates_with_blackbox'))
})

test('observe() is read-pure and returns the Director surface', () => {
  const before = JSON.parse(fs.readFileSync(path.join(TMP, 'kg', 'e-2', 'graph.json'), 'utf8'))
  const o = kg.observe('e-2')
  const after = JSON.parse(fs.readFileSync(path.join(TMP, 'kg', 'e-2', 'graph.json'), 'utf8'))
  assert.deepEqual(before, after, 'observe must not mutate the graph')
  assert.ok(Array.isArray(o.unprovenCandidates) && Array.isArray(o.recommendedTasks) && Array.isArray(o.openChains))
  // WB-1 is NEEDS-LIVE ⇒ unproven
  assert.ok(o.unprovenCandidates.some(n => n.id === 'WB-1'))
})

test('engagement-scoped: each engagement gets its own kg/<id>/graph.json', () => {
  assert.ok(fs.existsSync(path.join(TMP, 'kg', 'e-1', 'graph.json')))
  assert.ok(fs.existsSync(path.join(TMP, 'kg', 'e-2', 'graph.json')))
})

test('fail-soft: an unknown engagement yields an empty graph, never throws', () => {
  const g = kg.syncEngagement('nope-xyz', { now: 'fixed' })
  assert.equal(typeof g, 'object')
  assert.deepEqual(Object.keys(g.nodes), [])
})

test('upsertNode / upsertEdge are idempotent', () => {
  const g = { nodes: {}, edges: [] }
  kg.upsertNode(g, 'X', 'feature', { a: 1 })
  kg.upsertNode(g, 'X', 'feature', { b: 2 })
  assert.deepEqual(g.nodes['X'], { id: 'X', type: 'feature', a: 1, b: 2 })
  kg.upsertEdge(g, 'X', 'Y', 'rel')
  kg.upsertEdge(g, 'X', 'Y', 'rel')
  assert.equal(g.edges.length, 1)
})
