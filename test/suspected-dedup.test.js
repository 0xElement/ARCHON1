// test/suspected-dedup.test.js
//
// Pre-AUDITOR dedup: collapse the raw live-findings pile (specialists emit the same
// finding 100–270×, plus progress noise) into ONE line per DISTINCT finding so AUDITOR
// validates each instead of drowning in thousands of near-duplicate lines and confirming
// only two. Regression for task ee08 (2737 raw → 2 confirmed; RCE + cmd-injection lost).

const assert = require('node:assert')
const { test } = require('node:test')
const { dedupeSuspected, canonicalKey, isCandidate } = require('../src/pipeline/suspected-dedup')

test('digit-collapsing key merges "PCAP 33/34/35" into one finding', () => {
  const a = canonicalKey({ agent: 'VAULT', cwe: 'CWE-200', details: 'FTP creds in PCAP 33 download' })
  const b = canonicalKey({ agent: 'VAULT', cwe: 'CWE-200', details: 'FTP creds in PCAP 34 download' })
  assert.strictEqual(a, b, 'per-item numbering must not create distinct findings')
})

test('progress/status noise is dropped, real findings kept', () => {
  assert.strictEqual(isCandidate({ type: 'info', details: 'DISCOVERY' }), false)
  assert.strictEqual(isCandidate({ type: 'in-progress', details: 'RECON Complete' }), false)
  assert.strictEqual(isCandidate({ type: 'confirmed', details: 'python3' }), false) // noise title
  assert.strictEqual(isCandidate({ type: 'confirmed', severity: 'High', details: 'IDOR on /data/N' }), true)
})

test('270 identical emits collapse to 1 distinct finding with a merge count', () => {
  const raw = Array.from({ length: 270 }, (_, i) => ({ type: 'confirmed', agent: 'VAULT', severity: 'High', cwe: 'CWE-200', details: `FTP Credentials Exposed in PCAP ${i}` }))
  const out = dedupeSuspected(raw)
  assert.strictEqual(out.distinct, 1)
  assert.strictEqual(out.findings[0]._merged_count, 270)
})

test('worst severity sorts first — the RCE that was being lost survives', () => {
  const raw = [
    { type: 'confirmed', agent: 'A', severity: 'Low', details: 'verbose error message' },
    { type: 'confirmed', agent: 'FORGE', severity: 'Critical', details: 'Unauthenticated Root-Level Code Execution' },
    { type: 'confirmed', agent: 'DECOY', severity: 'Medium', details: 'missing rate limit on /capture' },
  ]
  const out = dedupeSuspected(raw)
  assert.strictEqual(out.distinct, 3)
  assert.strictEqual(out.findings[0].severity, 'Critical')
  assert.match(out.findings[0].title, /Code Execution/)
})

test('cap keeps the worst-severity findings and reports the drop', () => {
  const raw = [{ type: 'confirmed', agent: 'A', severity: 'Critical', details: 'keep me' }]
    .concat(Array.from({ length: 50 }, (_, i) => ({ type: 'confirmed', agent: 'A', severity: 'Low', details: `low finding ${String.fromCharCode(65 + i)}` })))
  const out = dedupeSuspected(raw, { cap: 5 })
  assert.strictEqual(out.findings.length, 5)
  assert.strictEqual(out.findings[0].severity, 'Critical')
  assert.ok(out.capped > 0)
})

test('empty / garbage input never throws', () => {
  assert.deepStrictEqual(dedupeSuspected([]).findings, [])
  assert.deepStrictEqual(dedupeSuspected(null).findings, [])
  assert.deepStrictEqual(dedupeSuspected([null, 5, {}]).findings, [])
})
