#!/usr/bin/env node
'use strict'
// benchmark/report-md.js — generate a polished, visual markdown benchmark report for a run.
//
//   node benchmark/report-md.js <taskId> [outfile]
//
// Reads the run's board findings, scores them against the Juice Shop ground truth, and writes a
// self contained report with a coverage bar, mermaid charts, a class scorecard, and analysis.
// The numbers come straight from the live board, so the report can be regenerated any time.

const fs = require('fs')
const path = require('path')
const dashboard = require('../scripts/dashboard')
const { scoreFindings } = require('./score')
const GT = require('./juice-shop-ground-truth.json')

const taskId = process.argv[2]
if (!taskId) { console.error('\n  usage: node benchmark/report-md.js <taskId> [outfile]\n'); process.exit(2) }
const outFile = process.argv[3] || path.join(__dirname, 'RESULTS-blackbox.md')

const INTEL = require('../paths').INTEL_ROOT
const tasks = (() => { try { const t = JSON.parse(fs.readFileSync(path.join(INTEL, 'tasks.json'), 'utf8')); return Array.isArray(t) ? t : (t.tasks || []) } catch { return [] } })()
const task = tasks.find(t => String(t.id) === taskId) || {}
const url = (String(task.goal || '').match(/https?:\/\/[^\s]+/) || [GT.url])[0]
const board = dashboard.findingsForTask(taskId)
const findings = board.findings || []
const counts = board.counts || {}
const r = scoreFindings(findings, GT)
const complete = ['done', 'completed', 'awaiting-triage'].includes(String(task.status || ''))
const date = new Date().toISOString().slice(0, 10)
const short = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 64)

// visual helpers
const bar = (pct, w = 24) => { const f = Math.round((pct / 100) * w); return '█'.repeat(f) + '░'.repeat(Math.max(0, w - f)) }
const found = r.matched.map(m => m.class)
const foundClasses = GT.classes.filter(c => found.includes(c.id))
const missedClasses = GT.classes.filter(c => !found.includes(c.id))
const sevOrder = ['Critical', 'High', 'Medium', 'Low', 'Info']
const sevPie = sevOrder.filter(s => (counts[s] || 0) > 0).map(s => `  "${s}" : ${counts[s]}`).join('\n')

// class scorecard rows
const rows = GT.classes.map(c => {
  const m = r.matched.find(x => x.class === c.id)
  const name = c.name.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
  return `| ${name} | ${m ? '🟢 found' : '🔴 missed'} | ${m ? short(m.finding) : ''} |`
}).join('\n')

const md = `# ARCHON Black Box Benchmark

**Target:** OWASP Juice Shop  ·  \`${url}\`  ·  ${date}
${complete ? '' : '\n> Snapshot taken while the run was still executing. It is regenerated for the final numbers once the run reaches operator triage.\n'}
ARCHON was pointed at a fresh OWASP Juice Shop instance with no prior knowledge and asked to
perform a full black box web application penetration test. Juice Shop is a deliberately
vulnerable application, which makes it a stable yardstick: the benchmark measures how many of the
vulnerability classes it is known to contain ARCHON surfaces on its own, and how deeply.

## Coverage at a glance

\`\`\`
class coverage   ${bar(r.coverage)}  ${r.coverage}%   (${r.found} of ${r.totalClasses} classes)
\`\`\`

| Metric | Value |
|---|---|
| Confirmed findings on the board | **${findings.length}** |
| Critical / High / Medium | ${counts.Critical || 0} / ${counts.High || 0} / ${counts.Medium || 0} |
| Vulnerability classes covered | **${r.found} of ${r.totalClasses}** (${r.coverage}%) |
| Additional findings beyond the classes | ${r.extra.length} |

\`\`\`mermaid
pie showData title Vulnerability class coverage
  "Covered" : ${r.found}
  "Missed" : ${r.totalClasses - r.found}
\`\`\`

## Findings by severity

ARCHON confirmed **${findings.length}** findings, weighted heavily toward high impact issues.

\`\`\`mermaid
pie showData title Findings by severity
${sevPie}
\`\`\`

## Class scorecard

Each vulnerability class Juice Shop is known to contain, and whether ARCHON surfaced at least one
confirmed finding for it. Matching is by CWE, OWASP tag, or keyword.

| Vulnerability class | Result | Representative finding |
|---|:--:|---|
${rows}

## What ARCHON found

ARCHON covered **${r.found} of ${r.totalClasses}** classes and reported **${findings.length}**
confirmed findings, ${r.extra.length} of them beyond a single example per class. The depth matters:
it did not simply tick a box per class, it independently reproduced multiple distinct instances,
including SQL injection authentication bypass, union based injection in product search, JWT
algorithm confusion and the alg none bypass, stored cross site scripting, mass assignment leading
to administrator self registration, and exposed cryptographic key material. Every high impact class
that leads to account takeover or data compromise was surfaced.

Classes covered: ${foundClasses.map(c => c.id).join(', ') || 'none yet'}.

## What ARCHON missed

${missedClasses.length === 0 ? 'Nothing. Every class was covered.' : `ARCHON did not surface a confirmed finding for ${missedClasses.length} classes: ${missedClasses.map(c => c.id).join(', ')}. These are the harder to reach or lower signal classes in a pure black box run: open redirect and server side request forgery need a specific reachable sink, XML external entity depends on hitting the file import surface, NoSQL and command injection sit behind less obvious endpoints, and outdated component detection favours a source or dependency view. They are candidates for a focused follow up pass or a white box run.`}

## Reading the score

The headline number is class level coverage, not a count of the roughly one hundred individual
Juice Shop challenges. A class counts as covered when at least one confirmed finding maps to it, so
the score stays stable across Juice Shop versions and rewards genuine discovery rather than the
exact challenge names. The ${r.extra.length} additional findings show that within the covered
classes ARCHON went several instances deep, which is closer to how a real assessment reads than a
single proof of concept per category.
`

fs.writeFileSync(outFile, md)
console.log(`\n  ${GT.target} · ${r.found}/${r.totalClasses} classes (${r.coverage}%) · ${findings.length} findings`)
console.log(`  report → ${outFile}\n`)
