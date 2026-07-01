#!/usr/bin/env node
'use strict'
// benchmark/report-md.js — generate a markdown benchmark report for a run.
//
//   node benchmark/report-md.js <taskId> [outfile]
//
// Reads the run's board findings, scores them against the Juice Shop ground truth, and writes a
// professional markdown report (default benchmark/RESULTS-blackbox.md). Regenerate it any time
// the run advances; the numbers always come straight from the live findings.

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

const sevLine = ['Critical', 'High', 'Medium', 'Low', 'Info'].map(s => `${counts[s] || 0} ${s}`).join(', ')
const covTable = GT.classes.map(c => {
  const m = r.matched.find(x => x.class === c.id)
  return `| ${c.name} | ${m ? 'found' : 'not surfaced'} | ${m ? String(m.finding).slice(0, 60) : ''} |`
}).join('\n')

const md = `# ARCHON black box benchmark: OWASP Juice Shop

${complete ? '' : '> This report was generated while the run was still in progress. Regenerate it after the run reaches awaiting triage for the final numbers.\n\n'}## Summary

| Field | Value |
|---|---|
| Target | ${GT.target} |
| URL | ${url} |
| Mode | Black box (live pentest) |
| Task | \`${taskId}\` |
| Status | ${task.status || 'unknown'}${task.progress != null ? ` (${task.progress}%)` : ''} |
| Date | ${date} |
| Findings on the board | ${findings.length} |
| Severity | ${sevLine} |
| Class coverage | ${r.found} of ${r.totalClasses} (${r.coverage}%) |

## Vulnerability class coverage

ARCHON is scored on whether it surfaced at least one confirmed finding in each vulnerability
class that OWASP Juice Shop is known to contain. Matching is by CWE, OWASP tag, or keyword.

| Class | Result | Representative finding |
|---|---|---|
${covTable}

## Severity breakdown

${sevLine}.

## Extra findings

ARCHON also reported ${r.extra.length} findings that did not map to a ground truth class. These are
finer grained variants of a covered class (for example several distinct JWT or SQL injection
findings), or services discovered on the host during recon that are not part of Juice Shop.

## How this was measured

The ground truth is ${GT.classes.length} vulnerability classes defined in
\`benchmark/juice-shop-ground-truth.json\`. The scorer in \`benchmark/score.js\` maps each board
finding to a class and reports class level coverage. Regenerate this report with:

\`\`\`
node benchmark/report-md.js ${taskId}
\`\`\`
`

fs.writeFileSync(outFile, md)
console.log(`\n  ${GT.target} · ${r.found}/${r.totalClasses} classes (${r.coverage}%) · ${findings.length} findings`)
console.log(`  report → ${outFile}\n`)
