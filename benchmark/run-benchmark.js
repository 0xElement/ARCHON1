#!/usr/bin/env node
'use strict'
// benchmark/run-benchmark.js — dispatch a real ARCHON pentest against OWASP Juice Shop and
// score the findings against the ground truth catalog. This is a LIVE run: it needs the daemon
// running and Juice Shop reachable, and it uses real LLM agents, so it takes a while.
//
//   node benchmark/run-benchmark.js [url] [--timeout-min N]
//   npm run benchmark
//
// Default target http://localhost:3000. It dispatches a full black box pentest, waits for the
// run to reach awaiting-triage or done, then prints a class level coverage scorecard and writes
// benchmark/results-<taskId>.json.

const fs = require('fs')
const path = require('path')
const http = require('http')
const { execFileSync } = require('child_process')
const agentPaths = require('../paths')
const INTEL = agentPaths.INTEL_ROOT
const dashboard = require('../scripts/dashboard')
const { scoreFindings } = require('./score')
const GT = require('./juice-shop-ground-truth.json')

const args = process.argv.slice(2)
const URL = args.find(a => /^https?:\/\//.test(a)) || GT.url || 'http://localhost:3000'
const timeoutMin = parseInt(args[args.indexOf('--timeout-min') + 1] || '120', 10)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const readTasks = () => { try { const t = JSON.parse(fs.readFileSync(path.join(INTEL, 'tasks.json'), 'utf8')); return Array.isArray(t) ? t : (t.tasks || []) } catch { return [] } }
const httpCode = (url) => new Promise(res => { const r = http.get(url, x => { res(x.statusCode); x.resume() }); r.on('error', () => res(0)); r.setTimeout(4000, () => { r.destroy(); res(0) }) })
const daemonUp = () => { try { return execFileSync('pgrep', ['-f', 'event-bus.js'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().length > 0 } catch { return false } }

;(async () => {
  console.log(`\n  ═══ ARCHON benchmark · ${GT.target} ═══`)
  console.log(`  target:  ${URL}`)

  const code = await httpCode(URL)
  if (code !== 200 && code !== 302) {
    console.error(`\n  ✗ target not reachable (HTTP ${code}).`)
    console.error(`    Start it:  docker run -d --name juice-shop -p 3000:3000 bkimminich/juice-shop\n`)
    process.exit(2)
  }
  console.log(`  target:  reachable (HTTP ${code})`)
  if (!daemonUp()) {
    console.error(`\n  ✗ the ARCHON daemon is not running, so the dispatch will never execute.`)
    console.error(`    Start it in another shell:  node event-bus.js\n`)
    process.exit(3)
  }
  console.log(`  daemon:  running`)

  const disp = dashboard.createDispatch({ squad: 'pentest-squad', assignee: 'ATLAS', meta: { targetUrl: URL, testType: 'full', severityProfile: 'comprehensive', inScope: [], outOfScope: [], credentials: [] } })
  const taskId = disp.taskId
  console.log(`  task:    ${taskId} dispatched`)
  console.log(`  waiting for the run (up to ${timeoutMin} min) …\n`)

  const deadline = Date.now() + timeoutMin * 60000
  const startAt = Date.now()
  let last = '', warnedIdle = false
  while (Date.now() < deadline) {
    await sleep(30000)
    const t = readTasks().find(t => String(t.id) === taskId)
    if (!t) continue
    const line = `${t.status} ${t.progress || 0}% ${t.statusMessage || ''}`.trim()
    if (line !== last) { console.log(`  … ${new Date().toISOString().slice(11, 19)}  ${line}`); last = line }
    if (['awaiting-triage', 'done', 'completed', 'failed', 'cancelled'].includes(t.status)) break
    if (!warnedIdle && (t.status === 'backlog' || t.status === 'pending') && Date.now() - startAt > 5 * 60000) {
      console.log(`  ⚠️  still not started after 5 min — is the daemon picking up the queue?`); warnedIdle = true
    }
  }

  // score the board findings against the ground truth
  const board = dashboard.findingsForTask(taskId)
  const findings = board.findings || []
  const r = scoreFindings(findings, GT)

  console.log(`\n  ─── scorecard ───`)
  console.log(`  findings on board:  ${findings.length}`)
  console.log(`  class coverage:     ${r.found}/${r.totalClasses}  (${r.coverage}%)\n`)
  for (const m of r.matched) console.log(`  ✓ ${m.class.padEnd(22)} ← ${String(m.finding).slice(0, 50)}`)
  for (const m of r.missed) console.log(`  ✗ ${m.class.padEnd(22)}   (missed) ${m.name}`)
  if (r.extra.length) {
    console.log(`\n  extra findings not mapped to a ground-truth class: ${r.extra.length}`)
    for (const e of r.extra.slice(0, 12)) console.log(`    · [${e.severity}] ${String(e.title).slice(0, 56)}`)
  }

  const out = { target: GT.target, url: URL, taskId, ranAt: new Date().toISOString(), durationMin: Math.round((Date.now() - startAt) / 60000), findingsOnBoard: findings.length, ...r }
  const outPath = path.join(__dirname, `results-${taskId}.json`)
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(`\n  results → ${outPath}\n`)
  process.exit(0)
})().catch(e => { console.error('  benchmark error:', e.message); process.exit(1) })
