'use strict'
// M1: the source-vs-live VALIDATED record decision — the guard that a source-only finding can never
// carry a url / become RUNTIME_CONFIRMED.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { isSourceFinding, shapeStreamValidated } = require('../src/pipeline/stream-record')

const meta = { id: 'T-1', title: 't', agent: 'CIPHER', taskId: 'task-1' }
const src = { agent: 'cipher', file: 'app.rb', line: 3, severity: 'High' }

test('isSourceFinding: file + no url = source; a url = live', () => {
  assert.equal(isSourceFinding({ file: 'a.rb' }), true)
  assert.equal(isSourceFinding({ code_block: 'x' }), true)
  assert.equal(isSourceFinding({ file: 'a.rb', url: 'https://x' }), false)
  assert.equal(isSourceFinding({ url: 'https://x' }), false)
  assert.equal(isSourceFinding({}), false)
})

test('source finding → SOURCE_CONFIRMED, NO url, source location kept', () => {
  const r = shapeStreamValidated(src, { title: 'IDOR', severity: 'High' }, meta)
  assert.equal(r.url, undefined)
  assert.equal(r.confirmation_status, 'SOURCE_CONFIRMED')
  assert.equal(r.validation_status, 'CONFIRMED')
  assert.equal(r.file, 'app.rb')
})

test('#1 GUARD: a fabricated url on a source finding is dropped (never RUNTIME_CONFIRMED)', () => {
  const r = shapeStreamValidated(src, { url: 'https://evil.test', title: 'x' }, meta)
  assert.equal(r.url, undefined)
  assert.equal(r.confirmation_status, 'SOURCE_CONFIRMED')
})

test('NEEDS_LIVE_VALIDATION source candidate → NEEDS-LIVE', () => {
  const r = shapeStreamValidated(src, { confirmation_status: 'NEEDS_LIVE_VALIDATION' }, meta)
  assert.equal(r.validation_status, 'NEEDS-LIVE')
  assert.equal(r.confirmation_status, 'NEEDS_LIVE_VALIDATION')
})

test('a live finding keeps the runtime shape (url/method); status derived downstream', () => {
  const r = shapeStreamValidated({ agent: 'drill', url: 'https://x.test/a', method: 'POST' }, { title: 'SQLi' }, meta)
  assert.equal(r.url, 'https://x.test/a')
  assert.equal(r.method, 'POST')
  assert.equal(r.confirmation_status, undefined)
})
