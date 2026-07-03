'use strict'
// Verifies the secret/PII scanner (scripts/scan-secrets.js) — the pre-commit + CI control.
// It must CATCH real leaks and PASS synthetic/placeholder/example data.

const assert = require('node:assert')
const { test } = require('node:test')
const { scanContent, DENY } = require('../scripts/scan-secrets')

const ids = (rel, text) => scanContent(rel, text).map((f) => f.id)

test('CATCHES real secrets/PII in normal source', () => {
  assert.ok(ids('src/x.js', 'const k = "-----BEGIN PRIVATE KEY-----MIIabc"').includes('private-key'))
  assert.ok(ids('src/x.js', 'aws = "AKIA' + 'Z'.repeat(16) + '"').includes('aws-key'))
  assert.ok(ids('src/x.js', 'const t = "ghp_' + 'a'.repeat(30) + '"').includes('github-token'))
  assert.ok(ids('src/x.js', 'contact: security@realbankcorp.com').includes('real-email'))
  assert.ok(ids('src/x.js', 'target = "https://45.33.32.156/admin"').includes('public-ip'))
  assert.ok(ids('src/x.js', 'const p = "/Users/alice/Documents/keys"').includes('home-path'))
})

test('CATCHES client denylist terms EVERYWHERE (incl. KB dirs)', () => {
  // Derive a sample term from DENY's own source so no sensitive literal is added to this file.
  assert.ok(DENY.flags.includes('i'), 'denylist must be case-insensitive')
  const term = (DENY.source.match(/\(([a-z]+)\|/i) || [])[1] // first alternative in the group
  assert.ok(term && term.length > 3)
  assert.ok(ids('common/patterns/x.json', `reviewing the ${term} portal`).includes('client-denylist'))
  assert.ok(ids('src/deep/file.js', `host: sub.${term}.com`).includes('client-denylist'))
})

test('PASSES synthetic / placeholder / doc values', () => {
  assert.deepStrictEqual(ids('src/x.js', 'to = "attacker@evil.com"'), [])
  assert.deepStrictEqual(ids('src/x.js', 'url = "https://api.example.com/v1"'), [])
  assert.deepStrictEqual(ids('src/x.js', 'ssrf = "http://169.254.169.254/latest"'), [])
  assert.deepStrictEqual(ids('src/x.js', 'doc example: 192.0.2.10'), [])
  assert.deepStrictEqual(ids('ui/index.html', 'placeholder: /Users/you/Documents/project'), [])
  assert.deepStrictEqual(ids('src/x.js', 'ua = "Chrome/131.0.0.0 Safari/537.36"'), [])
})

test('PASSES example secrets ONLY inside KB/skill/doc/test dirs', () => {
  // canonical AWS example key in a pattern KB → allowed
  assert.deepStrictEqual(ids('common/patterns/cloud-infra.json', 'AKIAIOSFODNN7EXAMPLE'), [])
  // same shape in normal source → still caught
  assert.ok(ids('src/x.js', 'k = "AKIA' + 'B'.repeat(16) + '"').includes('aws-key'))
  // a line marked EXAMPLE is exempt for secret detectors even outside KB
  assert.deepStrictEqual(ids('src/x.js', 'AKIAIOSFODNN7EXAMPLE // example key'), [])
})

test('respects a trailing scan-allow suppression', () => {
  assert.deepStrictEqual(ids('src/x.js', 'const p = "/Users/alice/x" // scan-allow known-fixture'), [])
})

console.log('✔ scan-secrets: catches real leaks, passes synthetic/example data')
