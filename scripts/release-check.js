#!/usr/bin/env node
// scripts/release-check.js — automated release quality gates (item #14).
//
// Runs the gates that DON'T need a live target, fails fast on the first failure, and reminds you
// of the manual gates. Run before tagging / publishing:  npm run release:check
//
// Gates here: seed the data layer → unit + gate suite → secret/PII scan → schema conformance.
// Manual gates (printed at the end): test:bun, test:browser, a mocked smoke dispatch, doctor.
'use strict'

const { spawnSync } = require('child_process')
const path = require('path')
const root = path.join(__dirname, '..')

function run(name, cmd, args) {
  process.stdout.write(`\n\x1b[1m▶ ${name}\x1b[0m\n`)
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
  const ok = r.status === 0
  console.log(ok ? `\x1b[32m✓ ${name}\x1b[0m` : `\x1b[31m✗ FAILED: ${name}\x1b[0m`)
  return ok
}

const GATES = [
  ['Seed data layer (idempotent)', 'node', ['scripts/setup-local.js']],
  ['Unit + gate suite (npm test)', 'node', ['test/run-all.js']],
  ['Secret / PII scan', 'node', ['scripts/scan-secrets.js']],
  ['Schema conformance', 'node', ['test/schema-conformance.test.js']],
]

let failed = false
for (const [name, cmd, args] of GATES) {
  if (!run(name, cmd, args)) { failed = true; break } // fail fast
}

console.log('\n\x1b[1m─ manual gates (run on the release host) ─\x1b[0m')
console.log('  • npm run test:bun        — async runner / bridge / grader suites (needs bun)')
console.log('  • npm run test:browser    — Playwright browser-verifier (needs playwright)')
console.log('  • smoke dispatch          — mocked-agent run (test/code-review-dispatcher-integration.test.js covers the wiring)')
console.log('  • npm run doctor          — Node ≥18, claude login, optional tools')

if (failed) {
  console.log('\n\x1b[31m\x1b[1m❌ Release gates FAILED — do not tag.\x1b[0m')
  process.exit(1)
}
console.log('\n\x1b[32m\x1b[1m✅ Automated release gates passed.\x1b[0m Complete the manual gates above, then tag.')
