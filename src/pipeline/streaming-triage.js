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

/**
 * How many triager "hands" (parallel TRIAGER workers) to run for the current backlog.
 * Pure so it's unit-testable; event-bus.js supplies base/cap/step from squad.json caps.
 * `base + floor(backlog/step)`, clamped to [1, cap]. Default base=2 ⇒ two hands work by default,
 * a 3rd walks up once the backlog crosses `step` (20). cap=1 forces 1 (the old serial drain).
 * (runWithConcurrency only actually spawns min(workers, batch size), so 2 hands on a 1-finding
 * batch still runs just 1 — no wasted agent.)
 * @param {number} cap - hard max workers (default 3 if invalid)
 * @param {number} step - add one worker per `step` queued findings (default 20 if invalid)
 * @param {number} backlog - number of findings waiting to be triaged this tick
 * @param {number} base - baseline workers before any scaling (default 2 if invalid)
 * @returns {number} worker count in [1, cap]
 */
function triageWorkers(cap, step, backlog, base) {
  const c = Number.isInteger(cap) && cap > 0 ? cap : 3
  const s = Number.isInteger(step) && step > 0 ? step : 20
  const b = Number.isInteger(base) && base > 0 ? base : 2
  const bl = Number(backlog) > 0 ? Number(backlog) : 0
  return Math.max(1, Math.min(c, b + Math.floor(bl / s)))
}

module.exports = { nextBatch, triageWorkers }

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
  // triageWorkers: default base=2 → two hands by default, a 3rd walks up at 20+, capped; cap=1 stays serial
  assert.strictEqual(triageWorkers(3, 20, 5), 2)
  assert.strictEqual(triageWorkers(3, 20, 20), 3)
  assert.strictEqual(triageWorkers(3, 20, 500), 3)
  assert.strictEqual(triageWorkers(1, 20, 500), 1)
  assert.strictEqual(triageWorkers(3, 20, 5, 1), 1)   // explicit base=1 restores the old 1→serial start
  console.log('ok — streaming-triage nextBatch tails + dedups; triageWorkers base+scale+cap')
}
