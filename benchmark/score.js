'use strict'
// benchmark/score.js — map ARCHON findings onto the Juice Shop ground truth classes and
// compute class level coverage. Pure and deterministic so it can be unit tested and re run
// against any findings set. A finding matches a class by CWE, by OWASP tag, or by keyword in
// its title and description.

function findingText(f) {
  return [f.title, f.description, f.details, f.cwe, f.owasp, f.type, f.impact]
    .filter(Boolean).join(' ').toLowerCase()
}
function cwesOf(f) {
  return (String(f.cwe || '').toUpperCase().match(/CWE-\d+/g) || [])
}
function matches(f, cls) {
  const fc = cwesOf(f)
  if (cls.cwe && cls.cwe.some(c => fc.includes(c.toUpperCase()))) return true
  if (cls.keywords && new RegExp(cls.keywords, 'i').test(findingText(f))) return true
  return false
}

/**
 * Score a findings set against the ground truth.
 * @param {object[]} findings - ARCHON board findings ({title, description, cwe, owasp, ...})
 * @param {object} gt - the ground truth ({classes:[{id,name,cwe,keywords}]})
 * @returns {{totalClasses,found,coverage,matched,missed,extra}}
 */
function scoreFindings(findings, gt) {
  const classes = (gt && gt.classes) || []
  const list = Array.isArray(findings) ? findings : []
  const used = new Set()
  const matched = [], missed = []
  for (const cls of classes) {
    let hit = null
    for (let i = 0; i < list.length; i++) {
      if (!used.has(i) && matches(list[i], cls)) { hit = list[i]; used.add(i); break }
    }
    if (hit) matched.push({ class: cls.id, name: cls.name, finding: hit.title || hit.id || '' })
    else missed.push({ class: cls.id, name: cls.name })
  }
  const extra = list.filter((_, i) => !used.has(i)).map(f => ({ title: f.title || f.id || '', severity: f.severity || '' }))
  const coverage = classes.length ? Math.round((matched.length / classes.length) * 100) : 0
  return { totalClasses: classes.length, found: matched.length, coverage, matched, missed, extra }
}

module.exports = { scoreFindings, matches, cwesOf }

// self-check
if (require.main === module) {
  const assert = require('node:assert')
  const gt = { classes: [
    { id: 'sqli', name: 'SQLi', cwe: ['CWE-89'], keywords: 'sql injection' },
    { id: 'xss', name: 'XSS', cwe: ['CWE-79'], keywords: 'xss' },
    { id: 'jwt', name: 'JWT', cwe: ['CWE-347'], keywords: 'jwt|json web token' },
  ] }
  const findings = [
    { title: 'SQL Injection in login', cwe: 'CWE-89' },                  // matches sqli by CWE
    { title: 'Reflected scripting bug', description: 'stored XSS in search' }, // matches xss by keyword
    { title: 'Verbose 404 page', cwe: 'CWE-200' },                       // matches nothing → extra
  ]
  const r = scoreFindings(findings, gt)
  assert.strictEqual(r.totalClasses, 3)
  assert.strictEqual(r.found, 2, `expected sqli+xss found, got ${r.found}`)
  assert.deepStrictEqual(r.missed.map(m => m.class), ['jwt'], 'jwt should be missed')
  assert.strictEqual(r.extra.length, 1, 'the CWE-200 finding is an extra')
  assert.strictEqual(r.coverage, 67, `coverage 2/3 = 67, got ${r.coverage}`)
  // one finding is not double counted across classes
  const dup = scoreFindings([{ title: 'sql injection and jwt none-alg', cwe: 'CWE-89' }], gt)
  assert.strictEqual(dup.found, 1, 'a single finding matches at most one class slot')
  console.log('ok — benchmark score maps findings to classes, no double counting')
}
