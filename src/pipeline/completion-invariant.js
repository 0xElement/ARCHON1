'use strict'
// C2: the run-completion invariant — a final gate that a run left no loose ends. Every report finding
// must carry a VALID confirmation status and real evidence (tier > L0), and (for source review) every
// feature must be terminal in the ledger. Pure: given findings + ledger, returns { ok, violations }.
// The dispatcher/daemon logs violations; a clean run has none. This is the "no stuck work, no unvalidated
// finding" check the senior review asked for.
const { CONFIRMATION_STATES } = require('../../agents/finding-schema')
const { evidenceTier } = require('./evidence-tier')

// A report finding must have a recognized confirmation status + more than L0 evidence.
function checkFindings(findings) {
  const violations = []
  for (const f of findings || []) {
    if (!f || typeof f !== 'object') continue
    const id = f.id || f.findingId || '(no id)'
    const cs = f.confirmation_status
    if (!CONFIRMATION_STATES.includes(cs)) violations.push({ id, kind: 'invalid-confirmation-status', value: cs || '(missing)' })
    if ((f.evidence_tier || evidenceTier(f)) === 'L0') violations.push({ id, kind: 'no-evidence' })
  }
  return violations
}

// Every ledger feature must be terminal (no queued/assigned/in_progress left = no stuck work).
function checkLedger(ledger, TERMINAL) {
  const violations = []
  const term = TERMINAL || new Set()
  for (const f of Object.values((ledger && ledger.features) || {})) {
    if (!term.has(f.status)) violations.push({ id: f.slug, kind: 'feature-not-terminal', status: f.status })
  }
  return violations
}

function runCompletionInvariant({ findings, ledger, TERMINAL } = {}) {
  const violations = [...checkFindings(findings), ...(ledger ? checkLedger(ledger, TERMINAL) : [])]
  return { ok: violations.length === 0, violations }
}

module.exports = { runCompletionInvariant, checkFindings, checkLedger }

// self-check
if (require.main === module) {
  const assert = require('node:assert')
  const TERMINAL = new Set(['done', 'blocked'])
  // clean run: valid finding + all features terminal
  const clean = runCompletionInvariant({
    findings: [{ id: 'CR-1', confirmation_status: 'SOURCE_CONFIRMED', file: 'a.rb', line: 1, vulnerable_code: 'x' }],
    ledger: { features: { a: { slug: 'a', status: 'done' } } }, TERMINAL,
  })
  assert.ok(clean.ok, 'clean run has no violations')
  // dirty: a finding with a bogus status + no evidence, and a non-terminal feature
  const dirty = runCompletionInvariant({
    findings: [{ id: 'CR-2', confirmation_status: 'MADE_UP' }],
    ledger: { features: { b: { slug: 'b', status: 'in_progress' } } }, TERMINAL,
  })
  assert.ok(!dirty.ok, 'dirty run flagged')
  assert.ok(dirty.violations.some(v => v.kind === 'invalid-confirmation-status'))
  assert.ok(dirty.violations.some(v => v.kind === 'no-evidence'))
  assert.ok(dirty.violations.some(v => v.kind === 'feature-not-terminal'))
  console.log('ok — completion-invariant: flags invalid status / no-evidence / non-terminal feature')
}
