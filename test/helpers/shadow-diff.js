// test/helpers/shadow-diff.js
//
// Parity helper for shadow-vs-legacy tests. assertParity(actual, expected, msg)
// is a deep-equal that ignores key order and is tolerant of undefined-vs-absent.
// Used by the per-block parity-*.test.js suites. See ULTRAPLAN.md §5.0.

'use strict'

const assert = require('node:assert/strict')

function _canon(v) {
  if (Array.isArray(v)) return v.map(_canon)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).sort()) {
      if (v[k] === undefined) continue
      out[k] = _canon(v[k])
    }
    return out
  }
  return v
}

function assertParity(actual, expected, msg) {
  assert.deepEqual(_canon(actual), _canon(expected), msg || 'parity mismatch')
}

module.exports = { assertParity, _canon }
