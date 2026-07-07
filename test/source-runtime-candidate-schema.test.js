'use strict'
// S3 (parity §7): the streamed candidate schema. Every candidate carries mode, vulnerability_class,
// affected_files[], exploit_hypothesis, requires_runtime_validation, a deterministic duplicate_key, and a
// recommendation — and a source-only finding never claims runtime confirmation.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const cr = require('../src/dispatch/code-review-dispatcher')

const feature = { slug: 'file-uploads-attachments', name: 'File uploads' }
const raw = {
  feature: 'file-uploads-attachments', pattern: 'path-traversal', status: 'SOURCE_CONFIRMED',
  file: 'app/uploaders/file_uploader.rb', line: 12, source: 'user-controlled filename',
  sink: 'filesystem path construction', endpoint: 'POST /uploads', severity: 'High', confidence: 0.72,
  hypothesis: 'crafted filename may influence stored path', evidence: 'source→sink flow',
  recommendation: 'normalize filenames and enforce storage path constraints',
}

test('S3: full candidate field set for a static finding', () => {
  const rec = cr.toLiveCandidate(raw, 'path-traversal', feature, 'marshal', '/src', 'static')
  assert.equal(rec.mode, 'static')
  assert.equal(rec.vulnerability_class, 'path-traversal')
  assert.deepEqual(rec.affected_files, ['app/uploaders/file_uploader.rb'])
  assert.equal(rec.affected_endpoint, 'POST /uploads')
  assert.equal(rec.exploit_hypothesis, 'crafted filename may influence stored path')
  assert.equal(rec.recommendation, 'normalize filenames and enforce storage path constraints')
  assert.equal(rec.requires_runtime_validation, true, 'a source-only finding still needs live proof')
  assert.equal(rec.confirmation_status, 'SOURCE_CONFIRMED')
  assert.ok(!rec.url, 'no fabricated runtime evidence')
})

test('S3: duplicate_key is deterministic feature:class:file:sink', () => {
  const a = cr.toLiveCandidate(raw, 'path-traversal', feature, 'marshal', '/src', 'static')
  const b = cr.toLiveCandidate({ ...raw, confidence: 0.9 }, 'path-traversal', feature, 'cipher', '/src', 'white-box')
  assert.equal(a.duplicate_key, 'file-uploads-attachments:path-traversal:app/uploaders/file_uploader.rb:filesystem-path-construction')
  assert.equal(a.duplicate_key, b.duplicate_key, 'same flow → same key regardless of agent/confidence/mode')
})

test('S3: white-box mode is carried; DISPROVEN needs no further validation', () => {
  const wb = cr.toLiveCandidate(raw, 'path-traversal', feature, 'marshal', '/src', 'white-box')
  assert.equal(wb.mode, 'white-box')
  const dead = cr.toLiveCandidate({ ...raw, status: 'DISPROVEN' }, 'path-traversal', feature, 'marshal', '/src', 'static')
  assert.equal(dead.requires_runtime_validation, false)
})

test('S3: an explicit duplicate_key / affected_files[] from the specialist wins', () => {
  const rec = cr.toLiveCandidate({ ...raw, duplicate_key: 'custom-key', affected_files: ['a.rb', 'b.rb'] }, 'path-traversal', feature, 'marshal', '/src', 'static')
  assert.equal(rec.duplicate_key, 'custom-key')
  assert.deepEqual(rec.affected_files, ['a.rb', 'b.rb'])
})

test('S3 FIX: a DISPROVEN candidate stays DISPROVEN — never relabelled SOURCE_CONFIRMED', () => {
  const rec = cr.toLiveCandidate({ ...raw, status: 'DISPROVEN' }, 'path-traversal', feature, 'marshal', '/src', 'static')
  assert.equal(rec.status, 'DISPROVEN')
  assert.equal(rec.confirmation_status, 'DISPROVEN', 'the validation-truth field must NOT read SOURCE_CONFIRMED')
  assert.equal(rec.requires_runtime_validation, false, 'a refuted finding needs no further validation')
  // 'KILLED' is the same verdict in the sibling vocabulary
  assert.equal(cr.toLiveCandidate({ ...raw, status: 'KILLED' }, 'path-traversal', feature, 'm', '/s', 'static').confirmation_status, 'DISPROVEN')
})

test('S3 FIX: an unconfirmed/hypothesis status is NOT over-promoted to SOURCE_CONFIRMED', () => {
  for (const s of ['', undefined, 'matched_candidate', 'needs_blackbox_validation', 'SUSPECTED', 'NEEDS-LIVE']) {
    const rec = cr.toLiveCandidate({ ...raw, status: s }, 'path-traversal', feature, 'marshal', '/src', 'static')
    assert.equal(rec.confirmation_status, 'NEEDS_LIVE_VALIDATION', `status=${JSON.stringify(s)} → hypothesis, not confirmed`)
  }
})

test('S3 FIX: status and confirmation_status never diverge (one source of truth)', () => {
  for (const s of ['SOURCE_CONFIRMED', 'NEEDS_LIVE_VALIDATION', 'DISPROVEN', 'RUNTIME_CONFIRMED', 'garbage', '']) {
    const rec = cr.toLiveCandidate({ ...raw, status: s }, 'path-traversal', feature, 'marshal', '/src', 'static')
    assert.equal(rec.status, rec.confirmation_status, `status=${JSON.stringify(s)}: fields must agree`)
    assert.notEqual(rec.confirmation_status, 'RUNTIME_CONFIRMED', 'a source candidate can never self-claim RUNTIME_CONFIRMED')
  }
})

test('FIX-1: a freehand candidate preserves its emitted vulnerability class (not "freehand")', () => {
  // freehand jobs are dispatched with cls='freehand'; the specialist tags the REAL class in vuln_class.
  const fh = { feature: 'checkout', file: 'app/checkout.rb', line: 8, sink: 'coupon apply', vuln_class: 'business-logic', status: 'SOURCE_CONFIRMED' }
  const rec = cr.toLiveCandidate(fh, 'freehand', { slug: 'checkout' }, 'breaker', '/src', 'static')
  assert.equal(rec.vulnerability_class, 'business-logic', 'the emitted class wins over the freehand dispatch label')
  assert.equal(rec.cwe, 'business-logic')
  assert.ok(rec.duplicate_key.startsWith('checkout:business-logic:'), 'duplicate_key carries the real class, so it lines up with a Phase-2 business-logic hit')
  // vulnerability_class alias is honoured too, and an explicit cwe still wins for cwe
  assert.equal(cr.toLiveCandidate({ ...fh, vuln_class: undefined, vulnerability_class: 'access-control' }, 'freehand', { slug: 'checkout' }, 'b', '/s', 'static').vulnerability_class, 'access-control')
})

test('FIX-2: candidateDedupeKey prefers duplicate_key — same flow, different title → COLLAPSE', () => {
  const a = { cwe: 'xss', file: 'a.rb', line: 1, title: 'Reflected XSS in search', duplicate_key: 'search:xss:a.rb:render' }
  const b = { cwe: 'xss', file: 'a.rb', line: 9, title: 'XSS — attacker injects script via q param', duplicate_key: 'search:xss:a.rb:render' }
  assert.equal(cr.candidateDedupeKey(a), cr.candidateDedupeKey(b), 'same duplicate_key → one record, despite different title/line')
})

test('FIX-2: candidateDedupeKey does NOT collapse different flows that share file/line/title', () => {
  const a = { cwe: 'xss', file: 'a.rb', line: 1, title: 'Injection', duplicate_key: 'f:xss:a.rb:render' }
  const b = { cwe: 'xss', file: 'a.rb', line: 1, title: 'Injection', duplicate_key: 'f:sqli:a.rb:query' }
  assert.notEqual(cr.candidateDedupeKey(a), cr.candidateDedupeKey(b), 'distinct duplicate_key must stay two records even when file/line/title match')
})

test('FIX-2: candidateDedupeKey falls back to cwe|file|line|title when no duplicate_key', () => {
  const a = { cwe: 'xss', file: 'a.rb', line: 3, title: 'X' }
  assert.equal(cr.candidateDedupeKey(a), 'xss|a.rb|3|X')
})
