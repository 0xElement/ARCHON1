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
