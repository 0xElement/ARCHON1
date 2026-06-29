// src/shadow/shadow-sink.js
//
// The shared shadow-mode sink for the Autonomous Agent OS rollout. Every new
// block, while in `shadow` mode, writes ONLY here — to var/intel/shadow/<engagementId>/
// — and the legacy pipeline/dashboard/SCRIBE never read this subtree. That is what
// keeps real reports byte-stable even with shadow flags on.
//
// Per-engagement file scope; every function is fail-soft (try/catch → no-op) so a
// shadow write can never destabilize a live engagement. See ULTRAPLAN.md §4.3.

'use strict'

const fs = require('fs')
const path = require('path')
const agentPaths = require('../../paths')

function _dir(eng) {
  const d = agentPaths.shadowDir(eng)
  fs.mkdirSync(d, { recursive: true })
  return d
}

function _writeAtomic(file, data) {
  const tmp = `${file}.tmp.${process.pid}`
  fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

// Full-object snapshot (atomic overwrite).
function snapshot(eng, name, obj) {
  try { _writeAtomic(path.join(_dir(eng), name), obj) } catch { /* fail-soft */ }
}

// JSONL append (one record per line).
function append(eng, name, record) {
  try { fs.appendFileSync(path.join(_dir(eng), name), JSON.stringify(record) + '\n') } catch { /* fail-soft */ }
}

// Merge a patch into shadow-manifest.json (what shadow modules ran, when).
function note(eng, patch) {
  try {
    const f = path.join(_dir(eng), 'shadow-manifest.json')
    let cur = {}
    try { cur = JSON.parse(fs.readFileSync(f, 'utf8')) } catch { /* first write */ }
    _writeAtomic(f, { ...cur, ...(patch || {}) })
  } catch { /* fail-soft */ }
}

// Read a JSONL sink back (for offline diffing / tests). Fail-soft → [].
function read(eng, name) {
  try {
    const raw = fs.readFileSync(path.join(_dir(eng), name), 'utf8').trim()
    if (!raw) return []
    return raw.split('\n').map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}

module.exports = { snapshot, append, note, read, _dir }
