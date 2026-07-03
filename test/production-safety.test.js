// test/production-safety.test.js
// Production-safety guardrails: the destructive detector, the default-safe gate,
// the bounded limits, and that the contract propagates into MUST_GATES.
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const ps = require('../src/safety/production-safety')

test('scanForDestructive blocks the NEVER list', () => {
  const bad = [
    '1; DROP TABLE users--',
    "'; DELETE FROM accounts--",
    'TRUNCATE TABLE logs',
    "UPDATE users SET role='admin'",
    'curl -X DELETE https://api.example.com/users/1',
    'curl --request PUT https://api.example.com/x',
    'rm -rf /tmp/x',
    'shutdown -h now',
  ]
  for (const s of bad) assert.equal(ps.scanForDestructive(s).blocked, true, `should block: ${s}`)
})

test('scanForDestructive allows benign detection (reads, boolean/time SQLi, read-POST)', () => {
  const ok = [
    'curl https://api.example.com/users/2',            // IDOR read of another object
    "curl \"https://x/search?q=1' OR '1'='1\"",        // boolean SQLi probe (read-only)
    'curl "https://x?id=1 AND SLEEP(5)"',              // time-based probe (read-only)
    'curl -d "q=test" https://x/graphql',              // read POST (search/query)
    'SELECT * FROM users WHERE id=1',                  // read query
  ]
  for (const s of ok) assert.equal(ps.scanForDestructive(s).blocked, false, `should allow: ${s}`)
})

test('guardRequest is safe by default; ARCHON_ALLOW_DESTRUCTIVE=1 opts out', () => {
  const saved = process.env.ARCHON_ALLOW_DESTRUCTIVE
  delete process.env.ARCHON_ALLOW_DESTRUCTIVE
  assert.equal(ps.guardRequest('curl -X DELETE https://x/1').allow, false)
  assert.equal(ps.guardRequest('curl https://x/1').allow, true)
  process.env.ARCHON_ALLOW_DESTRUCTIVE = '1'
  assert.equal(ps.guardRequest('curl -X DELETE https://x/1').allow, true, 'opt-out allows destructive')
  if (saved === undefined) delete process.env.ARCHON_ALLOW_DESTRUCTIVE
  else process.env.ARCHON_ALLOW_DESTRUCTIVE = saved
})

test('contract + bounded limits are present', () => {
  assert.equal(ps.LIMITS.MAX_RATE_LIMIT_ATTEMPTS, 10)
  assert.match(ps.PRODUCTION_SAFETY_CONTRACT, /GATE-14 \[PRODUCTION-SAFE/)
  assert.match(ps.PRODUCTION_SAFETY_CONTRACT, /AT MOST 10 attempts/)
  assert.match(ps.PRODUCTION_SAFETY_CONTRACT, /Never change credentials/)
  assert.match(ps.PRODUCTION_SAFETY_CONTRACT, /No denial of service/)
})

test('the contract propagates into every agent prompt via MUST_GATES', () => {
  const { MUST_GATES } = require('../src/core/squad-framework')
  assert.match(MUST_GATES, /GATE-14 \[PRODUCTION-SAFE/, 'MUST_GATES must include the production-safety contract')
})
