// test/helpers/golden.js
//
// Byte-stable golden fixtures for the "flag-off == current behavior" guarantee.
// matchGolden(name, actual) compares `actual` (string or JSON-serializable) to a
// committed fixture under test/fixtures/golden/<name>. Run with UPDATE_GOLDEN=1 to
// (re)write the fixture. See ULTRAPLAN.md §5.0 F-Verification.

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const GOLDEN_DIR = path.join(__dirname, '..', 'fixtures', 'golden')

function _serialize(v) {
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2)
}

function matchGolden(name, actual) {
  const file = path.join(GOLDEN_DIR, name)
  const text = _serialize(actual)
  if (process.env.UPDATE_GOLDEN === '1') {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
    return
  }
  let expected
  try { expected = fs.readFileSync(file, 'utf8') } catch {
    throw new Error(`golden fixture missing: ${file} — run with UPDATE_GOLDEN=1 to create it`)
  }
  assert.equal(text, expected, `golden mismatch for ${name} (flag-off behavior changed)`)
}

module.exports = { matchGolden, GOLDEN_DIR }
