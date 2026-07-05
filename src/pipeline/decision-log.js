'use strict'
// M6: the agentic decision log. Every meaningful agent decision records the 8 fields the spec requires,
// so a run is auditable — what each agent decided, why, on what evidence, what task it created, how sure
// it was, the result, and its next recommendation. Pure builder + a fail-soft JSONL appender. The
// dashboard can read decisions-<taskId>.jsonl to show the reasoning trail. Never throws.

const FIELDS = Object.freeze(['agent', 'decision', 'reason', 'evidence', 'task_created', 'confidence', 'result', 'next_recommendation'])

// Normalize a decision into the canonical 8-field record (missing → '', extras dropped). No timestamp
// here — the appender stamps ts (kept out of the pure builder so it stays deterministic + testable).
function record(d = {}) {
  const out = {}
  for (const k of FIELDS) out[k] = d[k] == null ? '' : d[k]
  out.agent = String(out.agent || 'UNKNOWN').toUpperCase()
  const c = Number(out.confidence)
  out.confidence = Number.isFinite(c) ? Math.max(0, Math.min(100, c)) : (out.confidence || '')
  return out
}

// Append a decision to decisions-<taskId>.jsonl. Fail-soft. deps.intelRoot + deps.now for tests.
function append(taskId, d, deps = {}) {
  try {
    const intelRoot = deps.intelRoot || require('../../paths').INTEL_ROOT
    const rec = { ts: deps.now || new Date().toISOString(), taskId: String(taskId), ...record(d) }
    require('fs').appendFileSync(`${intelRoot}/decisions-${taskId}.jsonl`, JSON.stringify(rec) + '\n')
    return rec
  } catch { return null }
}

function read(taskId, deps = {}) {
  try {
    const intelRoot = deps.intelRoot || require('../../paths').INTEL_ROOT
    const out = []
    for (const l of require('fs').readFileSync(`${intelRoot}/decisions-${taskId}.jsonl`, 'utf8').split('\n')) {
      const s = l.trim(); if (!s) continue
      try { out.push(JSON.parse(s)) } catch {}
    }
    return out
  } catch { return [] }
}

module.exports = { record, append, read, FIELDS }

// self-check
if (require.main === module) {
  const assert = require('node:assert')
  const r = record({ agent: 'curator', decision: 're-plan', reason: 'novel class surfaced', evidence: 'CAND-3', task_created: 'p2r-sqli-search', confidence: 80, result: 'queued', next_recommendation: 'assess sqli in search' })
  assert.deepStrictEqual(Object.keys(r).sort(), [...FIELDS].sort(), 'exactly the 8 canonical fields')
  assert.strictEqual(r.agent, 'CURATOR', 'agent upcased')
  assert.strictEqual(r.confidence, 80, 'confidence numeric')
  assert.strictEqual(record({}).agent, 'UNKNOWN', 'missing agent → UNKNOWN')
  assert.strictEqual(record({ confidence: 200 }).confidence, 100, 'confidence clamped')
  assert.strictEqual(record({ confidence: 'high' }).confidence, 'high', 'non-numeric confidence kept as-is')
  console.log('ok — decision-log: canonical 8-field record, agent upcased, confidence clamped')
}
