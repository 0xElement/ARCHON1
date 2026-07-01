// test/streaming-triage.test.js
//
// The "triage during the run" worker tails an append-only live-findings file across polls.
// nextBatch must return each DISTINCT finding exactly once (never re-triage a finding that
// reappears as the file grows, never re-triage the same issue emitted under a different
// number), and drop progress/status noise.

const assert = require('node:assert')
const { test } = require('node:test')
const { nextBatch } = require('../src/pipeline/streaming-triage')

test('a finding is surfaced once, even as the append-only file redelivers it', () => {
  const seen = new Set()
  const f = { type: 'confirmed', agent: 'VIPER', severity: 'High', details: 'SQLi on /login param user' }
  assert.strictEqual(nextBatch([f], seen).length, 1)        // poll 1: new
  assert.strictEqual(nextBatch([f, f], seen).length, 0)     // poll 2: same finding, file grew → nothing new
})

test('noise rows never reach the triager', () => {
  const seen = new Set()
  const batch = nextBatch([
    { type: 'info', agent: 'SCOUT', details: 'DISCOVERY' },
    { type: 'in-progress', agent: 'RANGER', details: 'RECON Complete' },
    { type: 'confirmed', agent: 'FORGE', severity: 'Critical', details: 'RCE via /capture' },
  ], seen)
  assert.strictEqual(batch.length, 1)
  assert.match(batch[0].details, /RCE/)
})

test('same issue emitted under different numbers collapses to one triage', () => {
  const seen = new Set()
  const batch = nextBatch([
    { type: 'confirmed', agent: 'VAULT', severity: 'High', details: 'FTP creds in PCAP 5' },
    { type: 'confirmed', agent: 'VAULT', severity: 'High', details: 'FTP creds in PCAP 6' },
    { type: 'confirmed', agent: 'VAULT', severity: 'High', details: 'FTP creds in PCAP 7' },
  ], seen)
  assert.strictEqual(batch.length, 1, 'digit-collapsed identity → one triage, not three')
})

test('across polls, only genuinely new distinct findings are returned', () => {
  const seen = new Set()
  nextBatch([{ type: 'confirmed', agent: 'A', details: 'XSS in search box' }], seen)
  const batch = nextBatch([
    { type: 'confirmed', agent: 'A', details: 'XSS in search box' },   // seen
    { type: 'confirmed', agent: 'B', details: 'IDOR on /invoice/1' },  // new
  ], seen)
  assert.strictEqual(batch.length, 1)
  assert.match(batch[0].details, /IDOR/)
})

test('empty / garbage input is safe', () => {
  assert.deepStrictEqual(nextBatch([], new Set()), [])
  assert.deepStrictEqual(nextBatch(null, new Set()), [])
})
