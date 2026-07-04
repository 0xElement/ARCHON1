#!/usr/bin/env node
// scripts/install-hooks.js — enable the secret/PII pre-commit hook (defense in depth for OSS).
//
// This is an EXPLICIT, side-effecting step (it writes git config), run by `npm run setup:hooks`
// and `bash setup.sh`. It is deliberately NOT part of the `pretest` seed, so `npm test` stays
// side-effect-light (no git config writes, no permission warnings in CI). Fail-soft: outside a git
// checkout (e.g. a release tarball) it simply skips. Uses execFileSync (argv, no shell).
'use strict'

const { execFileSync } = require('child_process')
const path = require('path')
const cwd = path.join(__dirname, '..')

try {
  const inGit = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd, stdio: ['ignore', 'pipe', 'ignore'],
  }).toString().trim() === 'true'
  if (!inGit) {
    console.log('ℹ not a git checkout — skipping pre-commit hook install')
    process.exit(0)
  }
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd })
  console.log('🔒 secret-scan pre-commit hook enabled (core.hooksPath=.githooks)')
} catch (e) {
  // Never fail setup on this — just report.
  console.log(`ℹ could not enable the pre-commit hook (skipping): ${e.message}`)
}
