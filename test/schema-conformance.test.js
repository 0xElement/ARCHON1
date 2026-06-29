// test/schema-conformance.test.js
// P1 — Block C: canonical schemas + mapping layer (ULTRAPLAN §2, §5.0 F-Schemas).
// Imports common/schemas/validate.js ONLY — never ajv (invariant 8, hard P1 gate).

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { validate, isValid } = require('../common/schemas/validate')
const mapping = require('../common/schemas/mapping')
const findingSchema = require('../agents/finding-schema')

const taskSchema = require('../common/schemas/task.schema.json')
const candidateSchema = require('../common/schemas/candidate_finding.schema.json')
const evidenceSchema = require('../common/schemas/evidence.schema.json')
const correlationSchema = require('../common/schemas/correlation.schema.json')
const chainSchema = require('../common/schemas/chain.schema.json')

test('the conformance suite imports validate.js, NOT ajv (invariant 8)', () => {
  const src = fs.readFileSync(__filename, 'utf8')
  assert.ok(!/require\(\s*['"]ajv['"]\s*\)/.test(src), 'this test must never require ajv')
})

test('validate.js subset works: type/required/enum/minItems', () => {
  assert.equal(isValid(taskSchema, { task_id: 't1', engagement_id: 'e1', mode: 'blackbox', status: 'in-progress', schemaVersion: '1' }), true)
  assert.deepEqual(validate(taskSchema, { task_id: 't1' }).length > 0, true, 'missing required keys must fail')
  assert.equal(isValid(taskSchema, { task_id: 't1', engagement_id: 'e1', mode: 'NOPE', status: 's', schemaVersion: '1' }), false, 'bad enum must fail')
  assert.equal(isValid(correlationSchema, { correlation_id: 'c', linked_items: [], correlation_type: 'duplicate', schemaVersion: '1' }), false, 'minItems must fail on empty linked_items')
})

test('toCandidateFinding(normalizeFinding) validates against candidate_finding.schema', () => {
  const raw = { id: 'F-1', title: 'Reflected XSS', severity: 'High', validation_status: 'CONFIRMED', original_agent: 'VIPER', taskId: 't1' }
  const cand = mapping.toCandidateFinding(raw)
  const errs = validate(candidateSchema, cand)
  assert.deepEqual(errs, [], `candidate must validate: ${errs.join('; ')}`)
})

test('bidirectional enum round-trip, including severity Info', () => {
  for (const t of mapping.CANONICAL_SEVERITIES) {
    assert.equal(mapping.severityFromSpec(mapping.severityToSpec(t)), t, `severity ${t} must round-trip`)
  }
  assert.equal(mapping.severityToSpec('Info'), 'info')
  assert.equal(mapping.severityFromSpec('info'), 'Info')
  for (const vs of ['CONFIRMED', 'NEEDS-LIVE', 'KILLED', 'SUSPECTED']) {
    assert.equal(mapping.auditorStatusFromSpec(mapping.auditorStatusToSpec(vs)), vs, `auditor status ${vs} must round-trip`)
  }
})

test('INVARIANT: toCandidateFinding never writes/alters validation_status', () => {
  const raw = { id: 'F-2', title: 'IDOR', severity: 'Critical', validation_status: 'CONFIRMED', original_agent: 'WARDEN', taskId: 't1' }
  const before = JSON.parse(JSON.stringify(raw))
  const cand = mapping.toCandidateFinding(raw)
  assert.deepEqual(raw, before, 'input finding must not be mutated')
  assert.equal(cand.validation_status, 'CONFIRMED', 'candidate must carry the original validation_status verbatim')
})

test('INVARIANT (Issue 2): a CONFIRMED finding at any quality_level round-trips without demotion or exclusion', () => {
  // A source/scanner-only CONFIRMED finding scores L1 but stays CONFIRMED.
  const sourceConfirmed = { id: 'F-3', title: 'Hardcoded secret', severity: 'High', validation_status: 'CONFIRMED', original_agent: 'CIPHER', taskId: 't1', file: 'app/config.rb' }
  const cand = mapping.toCandidateFinding(sourceConfirmed)
  assert.equal(cand.quality_level, 'L1', 'source-only CONFIRMED should derive L1')
  assert.equal(cand.validation_status, 'CONFIRMED', 'quality_level must never demote a CONFIRMED finding')
  assert.equal(cand.auditor_status, 'validated')
})

test('auto-repair defaults never reject a sparse legacy record', () => {
  const sparse = { title: 'something' } // no id, no severity, no validation_status
  const cand = mapping.toCandidateFinding(sparse)
  const errs = validate(candidateSchema, cand)
  assert.deepEqual(errs, [], `auto-repaired candidate must validate: ${errs.join('; ')}`)
  assert.ok(cand.candidate_id, 'must synthesize a candidate_id')
  assert.equal(cand.schemaVersion, '1')
})

test('idempotent ID synthesis (evidence_id, correlation_id)', () => {
  assert.equal(mapping.synthesizeEvidenceId('F-1', 'http', 'ref'), mapping.synthesizeEvidenceId('F-1', 'http', 'ref'))
  assert.equal(mapping.synthesizeCorrelationId(['F-2', 'F-1']), mapping.synthesizeCorrelationId(['F-1', 'F-2', 'F-1']), 'order/dupes must not change the id')
  assert.match(mapping.synthesizeEvidenceId('F-1', 'http', 'ref'), /^EV-F-1-[0-9a-f]{8}$/)
  assert.match(mapping.synthesizeCorrelationId(['F-1']), /^CORR-[0-9a-f]{10}$/)
})

test('every legacy fixture finding validates after toCandidateFinding (none rejected)', () => {
  // Build a small representative corpus mirroring real ARCHON finding shapes.
  const corpus = [
    { id: 'A-1', title: 'SQLi', severity: 'critical', validation_status: 'CONFIRMED', original_agent: 'DRILL', taskId: 't', reproduction_result: 'HTTP 500 with sql error' },
    { id: 'A-2', title: 'Missing header', severity: 'low', validation_status: 'NEEDS-LIVE', original_agent: 'SENTRY', taskId: 't' },
    { id: 'A-3', title: 'Test artifact', severity: 'info', validation_status: 'KILLED', original_agent: 'AUDITOR', taskId: 't' },
    { findingId: 'A-4', title: 'No id field', severity: 'High', original_agent: 'RELAY', taskId: 't' },
  ]
  for (const f of corpus) {
    const cand = mapping.toCandidateFinding(f)
    assert.deepEqual(validate(candidateSchema, cand), [], `fixture ${f.id || f.findingId} must validate`)
  }
})
