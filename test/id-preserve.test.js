'use strict'
// P3: streamed finding IDs survive the AUDITOR overwrite (matched by source location, robust to
// absolute-vs-relative path forms) — so the board doesn't churn T-*→CR-* and triage verdicts aren't orphaned.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { locKey, buildStreamIdMap, remapIds } = require('../src/pipeline/id-preserve')

test('locKey: basename + line, path-form independent', () => {
  assert.equal(locKey({ file: '/proj/app/orders.rb', line: 42 }), 'orders.rb|42')
  assert.equal(locKey({ file: 'app/orders.rb', line: 42 }), 'orders.rb|42')
  assert.equal(locKey({ file: '' }), '')
})

test('buildStreamIdMap: only streaming-triage records seed the map', () => {
  const m = buildStreamIdMap([
    { id: 'T-1', file: '/a/x.rb', line: 1, source: 'streaming-triage' },
    { id: 'CR-9', file: '/a/y.rb', line: 2, source: 'code-review-normalizer' }, // ignored
  ])
  assert.equal(m.size, 1)
  assert.equal(m.get('x.rb|1'), 'T-1')
})

test('remapIds: restores streamed id on the matching authoritative record (across path forms)', () => {
  const map = buildStreamIdMap([{ id: 'T-3', file: '/proj/app/orders.rb', line: 42, source: 'streaming-triage' }])
  const { records, changed } = remapIds([
    { id: 'CR-1', file: 'app/orders.rb', line: 42, title: 'IDOR' }, // matches → T-3
    { id: 'CR-2', file: 'app/search.rb', line: 7, title: 'SQLi' },  // new → CR-2
  ], map)
  assert.equal(changed, 1)
  assert.equal(records[0].id, 'T-3')
  assert.equal(records[0].superseded_id, 'CR-1')
  assert.equal(records[1].id, 'CR-2')
})

test('remapIds: no streamed findings → no change (empty map)', () => {
  const { records, changed } = remapIds([{ id: 'CR-1', file: 'a.rb', line: 1 }], new Map())
  assert.equal(changed, 0)
  assert.equal(records[0].id, 'CR-1')
})
