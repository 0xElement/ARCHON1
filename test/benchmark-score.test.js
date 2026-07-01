// test/benchmark-score.test.js
//
// Deterministic tests for the Juice Shop benchmark scorer: the ground truth is well formed, a
// finding maps to its class by CWE or keyword, and class coverage is computed correctly.

const assert = require('node:assert')
const { test } = require('node:test')
const { scoreFindings, matches } = require('../benchmark/score')
const GT = require('../benchmark/juice-shop-ground-truth.json')

test('ground truth catalog is well formed', () => {
  assert.ok(GT.classes.length >= 12, `expected >=12 classes, got ${GT.classes.length}`)
  for (const c of GT.classes) {
    assert.ok(c.id && c.name, `class missing id/name: ${JSON.stringify(c)}`)
    assert.ok((Array.isArray(c.cwe) && c.cwe.length) || c.keywords, `class ${c.id} has no match rule`)
  }
})

test('a finding maps to its class by CWE', () => {
  const by = id => GT.classes.find(c => c.id === id)
  assert.ok(matches({ cwe: 'CWE-89' }, by('sqli')))
  assert.ok(matches({ cwe: 'CWE-79' }, by('xss')))
  assert.ok(matches({ cwe: 'CWE-639' }, by('access_control')))
  assert.ok(!matches({ cwe: 'CWE-89' }, by('jwt')), 'a SQLi CWE must not match the JWT class')
})

test('keyword match works when the CWE is absent', () => {
  const by = id => GT.classes.find(c => c.id === id)
  assert.ok(matches({ title: 'Open redirect via returnUrl' }, by('open_redirect')))
  assert.ok(matches({ description: 'JSON Web Token accepts the none algorithm' }, by('jwt')))
  assert.ok(matches({ title: 'Directory traversal in /ftp' }, by('path_traversal')))
})

test('scoreFindings computes class coverage and extras', () => {
  const findings = [
    { title: 'SQL injection login bypass', cwe: 'CWE-89' },
    { title: 'Stored XSS in product review', cwe: 'CWE-79' },
    { title: 'IDOR on another user basket', cwe: 'CWE-639' },
    { title: 'Missing security headers', cwe: 'CWE-693' },
    { title: 'A finding that maps to nothing', cwe: 'CWE-1234' },
  ]
  const r = scoreFindings(findings, GT)
  assert.strictEqual(r.totalClasses, GT.classes.length)
  assert.ok(r.found >= 4, `expected at least 4 classes covered, got ${r.found}`)
  assert.strictEqual(r.extra.length, 1, 'the unmapped finding is an extra')
  assert.ok(r.coverage > 0 && r.coverage <= 100)
})

test('empty findings yield zero coverage and every class missed', () => {
  const r = scoreFindings([], GT)
  assert.strictEqual(r.found, 0)
  assert.strictEqual(r.coverage, 0)
  assert.strictEqual(r.missed.length, GT.classes.length)
})
