#!/usr/bin/env node
// scripts/doctor.js — ARCHON setup preflight.
//
// Reports PASS / MISSING for the prerequisites, so a fresh user sees exactly
// what's missing in one command instead of a failed dispatch. Read-only: it
// never starts the daemon and never runs `claude` (which could prompt/hang).
//
// The ONE hard gate is the `claude` CLI logged in against an active Claude
// subscription — ARCHON runs on your subscription via OAuth, no API key.
// Recon tools are optional (black-box only) and fail-soft. A static
// code-review run needs only Node + the claude CLI.
//
//   npm run doctor      (also invoked at the end of `bash setup.sh`)
//
// Exit code = number of hard blockers (0 = ready to run).
'use strict'

const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', B = '\x1b[1m', X = '\x1b[0m'
const pass = (m) => console.log(`  ${G}✓${X} ${m}`)
const warn = (m) => console.log(`  ${Y}⚠${X} ${m}`)
const fail = (m) => console.log(`  ${R}✗${X} ${m}`)
const head = (m) => console.log(`\n${B}${m}${X}`)

// Resolve a binary on PATH cross-platform (no deps). Returns its path or null.
function onPath(bin) {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  const r = spawnSync(cmd, [bin], { encoding: 'utf8' })
  return r.status === 0 && r.stdout ? r.stdout.trim().split(/\r?\n/)[0].trim() : null
}

let blockers = 0

console.log(`${B}ARCHON doctor${X} — setup preflight\n`)

// 1. Node >= 18 (hard)
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10)
if (nodeMajor >= 18) pass(`Node ${process.version}`)
else { fail(`Node ${process.version} — need >= 18. Install from https://nodejs.org and re-run.`); blockers++ }

// 2. npm (needed to install deps)
const npm = onPath('npm')
if (npm) pass(`npm (${npm})`)
else warn(`npm not found on PATH — it ships with Node; reinstall Node if it's missing.`)

// 3. Claude CLI + login — THE hard gate
head('Claude access (ARCHON runs on your Claude subscription via OAuth — no API key):')
const envBin = process.env.KURU_CLAUDE_BIN
const claudeBin = envBin && fs.existsSync(envBin) ? envBin : onPath('claude')
const homeClaude = path.join(os.homedir(), '.claude')
if (claudeBin) {
  pass(`claude CLI found (${claudeBin})`)
  if (fs.existsSync(homeClaude)) pass(`~/.claude present — looks logged in`)
  else { fail(`~/.claude not found — run \`claude\` once to log in (needs an active Claude Pro/Max subscription). Agents cannot run until you do.`); blockers++ }
} else {
  fail(`claude CLI NOT found. Install Claude Code (https://claude.ai/code), run \`claude\` to log in (needs an active Claude Pro/Max subscription), then re-run. Agents cannot run without it.`)
  blockers++
}

// 4. Data layer seeded
head('Data layer:')
const intelRoot = process.env.KURU_INTEL_ROOT || path.join(__dirname, '..', 'var', 'intel')
if (fs.existsSync(path.join(intelRoot, 'tasks.json'))) pass(`var/intel seeded (${intelRoot})`)
else warn(`var/intel not seeded — run \`npm run setup\` (or \`bash setup.sh\`).`)

// 5. Optional recon tools (black-box recon + browser proof; all fail-soft)
head('Optional recon tools (black-box recon + browser proof; absent ⇒ those steps skip, everything else runs):')
for (const t of ['nmap', 'naabu', 'httpx', 'katana', 'gau', 'ffuf', 'subfinder']) {
  const p = onPath(t)
  if (p) pass(`${t} (${p})`); else warn(`${t} — MISSING (optional)`)
}
try { require.resolve('playwright'); pass('playwright (npm optional dep installed)') }
catch { warn('playwright — MISSING (optional; `npm i playwright` for Phase 3.8 browser proof)') }

// Squad layout — the two trees are easy to confuse (see CONTRIBUTING § "The two squad trees"):
//   squads/<sq>/agents/<name>/    = persona CONTENT (SOUL.md + skills)
//   agents/squads/<sq>/squad.json = operational CONFIG (enabledPhases, caps)
// Flag files that landed in the wrong tree (fail-soft — warns, never blocks).
head('Squad layout (persona content vs operational config):')
{
  const repo = path.join(__dirname, '..')
  const walk = (dir, hit, acc = []) => {
    let ents = []
    try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return acc }
    for (const e of ents) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p, hit, acc)
      else if (hit(e.name)) acc.push(p)
    }
    return acc
  }
  const personaFile = /^(SOUL|IDENTITY|AGENTS|TOOLS|MISTAKES)\.md$/i
  const misplacedPersona = walk(path.join(repo, 'agents', 'squads'), (n) => personaFile.test(n))
  const misplacedConfig = walk(path.join(repo, 'squads'), (n) => n === 'squad.json')
  if (!misplacedPersona.length && !misplacedConfig.length) {
    pass('squad trees consistent (no persona files under agents/squads/, no squad.json under squads/)')
  } else {
    for (const p of misplacedPersona) warn(`persona file in the OPERATIONAL tree — move under squads/…: ${path.relative(repo, p)}`)
    for (const p of misplacedConfig) warn(`squad.json in the PERSONA tree — move under agents/squads/…: ${path.relative(repo, p)}`)
  }
}

// Summary
console.log()
if (blockers === 0) {
  console.log(`${G}${B}Ready.${X} All hard prerequisites present. Lightest first run: a ${B}static code-review${X} (source dir only) — needs no recon tools.`)
} else {
  console.log(`${R}${B}${blockers} blocker(s).${X} Fix the ${R}✗${X} line(s) above, then re-run \`npm run doctor\`. (A static code-review needs only Node + the claude CLI.)`)
}
process.exit(blockers)
