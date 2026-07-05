'use strict'
// M6: the agentic decision log — canonical 8-field records + fail-soft JSONL round-trip.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path')
const dl = require('../src/pipeline/decision-log')

test('record: exactly the 8 canonical fields, agent upcased, confidence clamped', () => {
  const r = dl.record({ agent: 'curator', decision: 're-plan', confidence: 200 })
  assert.deepEqual(Object.keys(r).sort(), [...dl.FIELDS].sort())
  assert.equal(r.agent, 'CURATOR')
  assert.equal(r.confidence, 100)
  assert.equal(dl.record({}).agent, 'UNKNOWN')
  assert.equal(dl.record({ confidence: 'high' }).confidence, 'high')
})

test('append + read round-trip; missing file → [] (fail-soft)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-'))
  const w = dl.append('t1', { agent: 'CURATOR', decision: 'x', evidence: 'CAND-3', confidence: 70 }, { intelRoot: dir, now: 'fixed' })
  assert.equal(w.taskId, 't1'); assert.equal(w.ts, 'fixed'); assert.equal(w.evidence, 'CAND-3')
  const rows = dl.read('t1', { intelRoot: dir })
  assert.equal(rows.length, 1); assert.equal(rows[0].agent, 'CURATOR')
  assert.deepEqual(dl.read('nope', { intelRoot: dir }), [])
})
