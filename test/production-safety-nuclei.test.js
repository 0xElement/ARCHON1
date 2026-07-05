// Release-disabled-tool guard: nuclei must be hard-blocked at the PreToolUse chokepoint
// (RANGER's persona can reference it, but the SDK guard denies the actual command).
'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { guardLocalCommand, guardReleaseDisabledTool } = require('../src/safety/production-safety')

test('nuclei command is denied (release-disabled)', () => {
  const r = guardLocalCommand('nuclei -u http://192.168.20.5:3000 -tags xss,sqli -rl 20 -c 5')
  assert.equal(r.allow, false)
  assert.match(r.reason, /nuclei/i)
})

test('piped / chained nuclei is denied too', () => {
  assert.equal(guardLocalCommand('cat urls.txt | nuclei -silent').allow, false)
  assert.equal(guardLocalCommand('echo hi && nuclei -u http://t').allow, false)
})

test('substrings like "nucleic" are NOT false-positives', () => {
  assert.equal(guardLocalCommand('grep nucleic_acid data.txt').allow, true)
  assert.equal(guardReleaseDisabledTool('run_nuclei_helper.sh').allow, true)
})

test('ordinary recon tools stay allowed', () => {
  assert.equal(guardLocalCommand('curl -s http://t/').allow, true)
  assert.equal(guardLocalCommand('ffuf -u http://t/FUZZ -w list').allow, true)
  assert.equal(guardLocalCommand('sqlmap -u "http://t/?id=1" --batch').allow, true)
})

test('the block holds even under ARCHON_ALLOW_DESTRUCTIVE=1', () => {
  process.env.ARCHON_ALLOW_DESTRUCTIVE = '1'
  try { assert.equal(guardLocalCommand('nuclei -u http://t').allow, false) }
  finally { delete process.env.ARCHON_ALLOW_DESTRUCTIVE }
})

test('ARCHON_ENABLE_NUCLEI=1 re-enables it (later phase)', () => {
  process.env.ARCHON_ENABLE_NUCLEI = '1'
  try { assert.equal(guardLocalCommand('nuclei -u http://t').allow, true) }
  finally { delete process.env.ARCHON_ENABLE_NUCLEI }
})
