'use strict'
// streaming-triage.js — pure core for the "triage during the run" flow.
//
// While specialists are still firing (Phase 2), a background worker tails the raw
// live-findings file and hands each NEW distinct finding to the triager one-by-one, so a
// fully-written finding lands on the Findings tab mid-scan instead of all at once at the
// end. This module holds ONLY the deterministic decision — "given everything emitted so far
// and what I've already processed, what's new to triage now?" — so it's unit-testable. The
// agent calls + file writes live in event-bus.js (startStreamingTriage), which calls this.

const { canonicalKey, isCandidate } = require('./suspected-dedup')

/**
 * Which freshly-emitted findings still need triage.
 * @param {object[]} records - ALL live-findings records parsed so far (append-only file)
 * @param {Set<string>} seen - canonical keys already picked up (MUTATED: new keys added)
 * @returns {object[]} fresh distinct candidate findings, first-seen order
 */
function nextBatch(records, seen) {
  const fresh = []
  for (const r of (records || [])) {
    if (!isCandidate(r)) continue          // drop progress/status noise
    const k = canonicalKey(r)              // digit-collapsed identity → 270 emits = 1
    if (seen.has(k)) continue              // already triaged (or in flight)
    seen.add(k)
    fresh.push(r)
  }
  return fresh
}

module.exports = { nextBatch }

// self-check: the tail-and-dedup contract across successive polls.
if (require.main === module) {
  const assert = require('node:assert')
  const seen = new Set()
  // poll 1: two distinct findings + noise
  let batch = nextBatch([
    { type: 'confirmed', agent: 'VIPER', severity: 'High', details: 'SQLi on /login param user' },
    { type: 'info', agent: 'SCOUT', details: 'DISCOVERY' },                         // noise → skip
    { type: 'confirmed', agent: 'FORGE', severity: 'Critical', details: 'RCE via /capture' },
  ], seen)
  assert.strictEqual(batch.length, 2, `poll1 should surface 2 fresh, got ${batch.length}`)
  // poll 2: file grew — the same two reappear (append-only) + one genuinely new + a dup emit
  batch = nextBatch([
    { type: 'confirmed', agent: 'VIPER', severity: 'High', details: 'SQLi on /login param user' }, // seen
    { type: 'confirmed', agent: 'FORGE', severity: 'Critical', details: 'RCE via /capture' },       // seen
    { type: 'confirmed', agent: 'VAULT', severity: 'High', details: 'FTP creds in PCAP 5' },         // NEW
    { type: 'confirmed', agent: 'VAULT', severity: 'High', details: 'FTP creds in PCAP 6' },         // dup of NEW (digits collapse)
  ], seen)
  assert.strictEqual(batch.length, 1, `poll2 should surface only the 1 genuinely new, got ${batch.length}`)
  assert.match(batch[0].details, /FTP creds/)
  // poll 3: nothing new
  assert.strictEqual(nextBatch([{ type: 'confirmed', agent: 'VIPER', details: 'SQLi on /login param user' }], seen).length, 0)
  console.log('ok — streaming-triage nextBatch tails + dedups across polls')
}
