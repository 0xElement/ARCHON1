// src/pipeline/shadow-recorder.js
//
// Production face for offline shadow-vs-legacy diffing. A block in shadow mode
// records where its output diverges from the legacy path; the divergence log is
// reviewed before a flag is ever flipped to drive execution. NO-OP unless the
// caller passes through (callers gate on flagMode before recording). Fail-soft.
// See ULTRAPLAN.md §4.3.

'use strict'

const shadowSink = require('../shadow/shadow-sink')

// Record one divergence record under <kind>-divergence.jsonl for an engagement.
function recordDivergence(engagementId, kind, record) {
  try {
    shadowSink.append(engagementId, `${String(kind)}-divergence.jsonl`, {
      ts: new Date().toISOString(),
      kind: String(kind),
      ...(record || {}),
    })
  } catch { /* fail-soft */ }
}

function readDivergences(engagementId, kind) {
  return shadowSink.read(engagementId, `${String(kind)}-divergence.jsonl`)
}

module.exports = { recordDivergence, readDivergences }
