#!/usr/bin/env node
'use strict'
// benchmark/score-task.js — score an already-run task against the Juice Shop ground truth.
// Use this after you dispatch a benchmark run FROM THE PORTAL: grab the task id from the run
// card, then:
//
//   node benchmark/score-task.js <taskId>
//
// It reads the task's board findings, prints a class coverage scorecard, and writes
// benchmark/results-<taskId>.json. No dispatch, no waiting.

const path = require('path')
const fs = require('fs')
const dashboard = require('../scripts/dashboard')
const { scoreFindings } = require('./score')
const GT = require('./juice-shop-ground-truth.json')

const taskId = process.argv[2]
if (!taskId) { console.error('\n  usage: node benchmark/score-task.js <taskId>\n'); process.exit(2) }

const board = dashboard.findingsForTask(taskId)
const findings = board.findings || []
const r = scoreFindings(findings, GT)

console.log(`\n  ═══ ARCHON vs ${GT.target} · task ${taskId} ═══`)
console.log(`  findings on board:  ${findings.length}`)
console.log(`  class coverage:     ${r.found}/${r.totalClasses}  (${r.coverage}%)\n`)
for (const m of r.matched) console.log(`  ✓ ${m.class.padEnd(22)} ← ${String(m.finding).slice(0, 50)}`)
for (const m of r.missed) console.log(`  ✗ ${m.class.padEnd(22)}   (missed) ${m.name}`)
if (r.extra.length) {
  console.log(`\n  extra findings not mapped to a ground-truth class: ${r.extra.length}`)
  for (const e of r.extra.slice(0, 15)) console.log(`    · [${e.severity}] ${String(e.title).slice(0, 56)}`)
}
const out = path.join(__dirname, `results-${taskId}.json`)
fs.writeFileSync(out, JSON.stringify({ target: GT.target, taskId, scoredAt: new Date().toISOString(), findingsOnBoard: findings.length, ...r }, null, 2))
console.log(`\n  results → ${out}\n`)
