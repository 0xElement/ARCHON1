// test/evidence-package.test.js
// P7 — Block R evidence packages + the report-quality runner (ULTRAPLAN §5.6).

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const poc = require('../agents/poc-evidence-capture')
const rjv = require('../scripts/run-judge-verifier')

test('writeEvidencePackage repackages a finding into evidence/<candidate_id>/package.json (no new capture)', () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'archon-ev-'))
  const finding = { id: 'F-1', candidate_id: 'F-1', title: 'IDOR', severity: 'High', validation_status: 'CONFIRMED', reproduction_method: 'GET /orders/2', impact: 'cross-tenant read', judge_verdict: 'confirmed', quality_level: 'L2' }
  const out = poc.writeEvidencePackage({ taskId: 't1', finding, intelDir: TMP })
  assert.ok(fs.existsSync(out))
  const pkg = poc.readEvidencePackage('F-1', { intelDir: TMP })
  assert.equal(pkg.candidate_id, 'F-1')
  assert.equal(pkg.validation_status, 'CONFIRMED')
  assert.equal(pkg.reproduction, 'GET /orders/2')
  assert.equal(pkg.auditor_verdict, 'CONFIRMED')
})

test('writeEvidencePackage is idempotent + fail-soft on a null finding', () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'archon-ev2-'))
  const f = { id: 'X', validation_status: 'CONFIRMED', title: 't' }
  const a = poc.writeEvidencePackage({ taskId: 't', finding: f, intelDir: TMP })
  const b = poc.writeEvidencePackage({ taskId: 't', finding: f, intelDir: TMP })
  assert.equal(a, b)
  assert.equal(poc.writeEvidencePackage({ taskId: 't', finding: null, intelDir: TMP }), null)
})

test('runReportQuality annotates every finding; never drops a CONFIRMED (Issue 2)', async () => {
  const findings = [
    { id: 'F-1', validation_status: 'CONFIRMED', severity: 'Critical', title: 'a' },
    { id: 'F-2', validation_status: 'NEEDS-LIVE', severity: 'Low', title: 'b' },
  ]
  // an LLM that tries to EXCLUDE everything
  const out = await rjv.runReportQuality({ findings, callLLM: async () => '{"verdict":"exclude","note":"nuke it"}' })
  assert.equal(out.length, 2)
  const f1 = out.find(f => f.id === 'F-1')
  assert.equal(f1.report_quality_verdict, 'needs_polish', 'CONFIRMED is clamped, never excluded')
  assert.equal(f1.severity, 'Critical', 'severity untouched')
  assert.equal(f1.validation_status, 'CONFIRMED', 'validation_status untouched')
  const f2 = out.find(f => f.id === 'F-2')
  assert.equal(f2.report_quality_verdict, 'exclude', 'a non-CONFIRMED finding may be excluded')
})

test('runReportQuality is fail-safe: LLM error ⇒ needs_polish, never throws', async () => {
  const out = await rjv.runReportQuality({ findings: [{ id: 'F', validation_status: 'CONFIRMED' }], callLLM: async () => { throw new Error('x') } })
  assert.equal(out[0].report_quality_verdict, 'needs_polish')
})
