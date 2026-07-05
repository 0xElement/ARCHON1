'use strict'
// M6: syncEngagement builds EVIDENCE + COVERAGE nodes (tier distribution) from the validated findings.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path')
const kg = require('../src/intel/knowledge-graph')

test('EVIDENCE + COVERAGE nodes are derived from findings, with a tier distribution', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-'))
  fs.writeFileSync(path.join(dir, 'VALIDATED-FINDINGS-eng1.jsonl'), [
    { id: 'CR-1', title: 'IDOR', severity: 'High', validation_status: 'NEEDS-LIVE', confirmation_status: 'SOURCE_CONFIRMED', file: 'app/o.rb', line: 4, source: 'p', sink: 's', required_blackbox_proof: 'x', evidence: 'User.find(params[:id])' },
    { id: 'CR-2', title: 'XSS', severity: 'Medium', validation_status: 'CONFIRMED', confirmation_status: 'SOURCE_CONFIRMED', file: 'app/v.erb', line: 2, vulnerable_code: '<%= raw x %>' },
  ].map(f => JSON.stringify(f)).join('\n') + '\n')

  const g = kg.syncEngagement('eng1', { intelRoot: dir, now: 'fixed' })
  const types = Object.values(g.nodes).map(n => n.type)
  assert.ok(types.includes('evidence'), 'EVIDENCE nodes built')
  assert.ok(types.includes('coverage'), 'COVERAGE node built')

  const cov = Object.values(g.nodes).find(n => n.type === 'coverage')
  assert.equal(cov.total_findings, 2)
  assert.equal(cov.confirmed, 1)   // CR-2 CONFIRMED
  assert.equal(cov.candidates, 1)  // CR-1 NEEDS-LIVE
  assert.ok(cov.tiers && Object.keys(cov.tiers).length > 0, 'tier distribution present')

  assert.ok(g.edges.some(e => e.type === 'evidence_supports_candidate' && e.from === 'EV:CR-1' && e.to === 'CR-1'),
    'evidence→candidate edge present')
})
