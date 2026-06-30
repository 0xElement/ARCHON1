// agents/finding-schema.js
//
// Sprint A.2 (2026-05-09): canonical FindingSchema normalizer.
//
// Production audit on /root/intel/pentest/VALIDATED-FINDINGS.jsonl (48 findings)
// found 22 distinct key signatures, severity in 3 case variants, 42/48 missing
// `title`, and two schema families (SENTRY-style / adversary-style). Downstream
// components silently broke on the variance (e.g., severity case-sensitive
// comparisons skipped half the findings; missing `title` produced "(no title)"
// in judge prompts that anchored Stage A on absence of context).
//
// This module is the SINGLE source of truth for finding-record shape between
// the specialist→AUDITOR write boundary and any downstream reader (judge, browser
// verifier, SCRIBE). Belt-and-suspenders with judge-verifier's extractEvidence:
// normalize the record once, stringify object fields in the prompt builder.

const fs = require('node:fs')
const { wrap: _envelopeWrap } = require('./phase-envelope')

const CANONICAL_SEVERITIES = ['Info', 'Low', 'Medium', 'High', 'Critical']

const REQUIRED_FIELDS = ['id', 'title', 'severity', 'validation_status', 'original_agent', 'taskId']

let _autoIdCounter = 0
function _autoId() {
  _autoIdCounter += 1
  return `F-AUTO-${Date.now()}-${_autoIdCounter}`
}

/**
 * Coerce severity to title-case canonical form.
 * Unknown/missing → 'Medium' (safe default — too low fails Stage B; too high primes false-confidence).
 */
function normalizeSeverity(s) {
  if (s == null) return 'Medium'
  const m = String(s).match(/^(critical|high|medium|low|info)/i)
  if (!m) return 'Medium'
  const lc = m[1].toLowerCase()
  return lc.charAt(0).toUpperCase() + lc.slice(1)
}

// Pattern-review output states (Autonomous Agent OS Block E). Additive — does not
// affect normalizeFinding/validateFinding. Unknown/missing → 'matched_candidate'.
const PATTERN_OUTPUT_STATES = Object.freeze([
  'matched_candidate', 'needs_blackbox_validation', 'needs_source_root_cause',
  'reviewed_no_issue', 'not_applicable', 'false_positive', 'duplicate',
])
function normalizePatternState(s) {
  const v = String(s == null ? '' : s).toLowerCase().trim().replace(/[\s-]+/g, '_')
  return PATTERN_OUTPUT_STATES.includes(v) ? v : 'matched_candidate'
}

// Confirmation status (handoff item 3, 2026-06-30). DERIVED from validation_status
// + whether replayable RUNTIME evidence exists — a strict, presentational refinement
// that NEVER replaces validation_status (the Issue-2 CONFIRMED gate keys on that and
// must stay untouched). The point: a source-only review can confirm a bug by READING
// code, but that is SOURCE_CONFIRMED, not the same as proving it against a running
// app (RUNTIME_CONFIRMED). Don't over-claim a source hypothesis as fully confirmed.
const CONFIRMATION_STATES = Object.freeze([
  'RUNTIME_CONFIRMED',     // CONFIRMED + replayable live proof (exploit-prover nonce / captured response)
  'SOURCE_CONFIRMED',      // CONFIRMED by code reading, but never fired at a live target
  'NEEDS_LIVE_VALIDATION', // a hypothesis (NEEDS-LIVE / SUSPECTED / unknown) — needs a live target to settle
  'DISPROVEN',             // checked and refuted (KILLED)
])
// True when the finding carries evidence that it was actually exercised against a
// running target (not merely a suggested repro recipe).
function hasRuntimeProof(f) {
  if (f.runtime_confirmed === true) return true
  if (f.proof_of_execution && f.proof_of_execution.confirmed === true) return true
  // a captured live RESPONSE is runtime evidence; a reproduction_request alone is
  // just the recipe (the curl to run), so it does NOT by itself prove runtime.
  if (typeof f.reproduction_response === 'string' && f.reproduction_response.trim()) return true
  const ev = f.evidence
  if (ev && typeof ev === 'object' && (ev.runtime || ev.live || ev.http_response || ev.response)) return true
  return false
}
function deriveConfirmationStatus(f) {
  const vs = String(f.validation_status == null ? '' : f.validation_status).toUpperCase().trim()
  if (vs === 'KILLED' || vs === 'DISPROVEN') return 'DISPROVEN'
  if (vs === 'CONFIRMED') return hasRuntimeProof(f) ? 'RUNTIME_CONFIRMED' : 'SOURCE_CONFIRMED'
  return 'NEEDS_LIVE_VALIDATION' // NEEDS-LIVE / SUSPECTED / unknown / anything else
}

/**
 * Normalize a finding record to canonical schema. Non-destructive: returns
 * a fresh object; original input is not mutated. Object-shaped fields like
 * `evidence` are PRESERVED (judge-verifier's extractEvidence handles them).
 *
 * Canonical fields (always present after normalize):
 *   - id        — falls back to findingId, then synthesized "anon-{n}"
 *   - title     — falls back to id-based label, then type, then "Untitled finding"
 *   - severity  — title-cased canonical (Critical/High/Medium/Low/Info)
 *
 * All other input fields are passed through unchanged.
 */
function normalizeFinding(finding) {
  const f = finding && typeof finding === 'object' ? { ...finding } : {}

  f.severity = normalizeSeverity(f.severity)

  // id: map findingId first (so the title fallback below can reference it)
  if (!f.id && f.findingId) {
    f.id = f.findingId
  }

  // title: prefer existing, then synthesize from id/type (uses the ORIGINAL id state)
  if (!f.title || (typeof f.title === 'string' && !f.title.trim())) {
    if (f.id) {
      f.title = `Finding ${f.id}`
    } else if (f.type) {
      f.title = `Untitled ${f.type} finding`
    } else {
      f.title = 'Untitled finding'
    }
  }

  // id (last resort): synthesize AFTER the title fallback so a record with neither id nor
  // findingId still ends up with an id — downstream dedup/judge/report key off it, and a
  // missing id silently drops the finding.
  if (!f.id) {
    f.id = _autoId()
  }

  // Autonomy fields (optional, pass through via the spread above):
  //   impact            — concrete attacker gain (always set on CONFIRMED findings)
  //   proof_of_execution — { type, command, output, nonce, confirmed:bool } from the gated exploit-prover
  //   payloads_tried    — every payload incl WAF-bypass mutations + which landed
  // Coerce their types defensively so downstream consumers can trust them.
  if (f.proof_of_execution != null && typeof f.proof_of_execution === 'object') {
    f.proof_of_execution.confirmed = f.proof_of_execution.confirmed === true
  }
  if (f.payloads_tried != null && !Array.isArray(f.payloads_tried)) {
    f.payloads_tried = [String(f.payloads_tried)]
  }

  // confirmation_status: keep an explicit valid value (e.g. the exploit-prover
  // stamping RUNTIME_CONFIRMED), otherwise derive it from validation_status + proof.
  if (!CONFIRMATION_STATES.includes(f.confirmation_status)) {
    f.confirmation_status = deriveConfirmationStatus(f)
  }

  return f
}

/**
 * Validates + auto-repairs a finding for safe consumption by downstream phases.
 *
 * Returns { valid, finding, warnings }.
 *   - valid=false only when input isn't a plain object (cannot be repaired).
 *   - finding is the (possibly-repaired) shallow clone — never the input ref.
 *   - warnings is an array of human-readable strings describing each auto-repair.
 *
 * Policy: never reject a salvageable finding. Schema drift is logged, not
 * silently dropped. The original_agent + taskId provenance is preserved
 * even when other fields are synthesized.
 */
function validateFinding(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, finding: null, warnings: ['input is not a plain object'] }
  }

  const warnings = []
  const finding = { ...input }

  if (!finding.id) {
    finding.id = _autoId()
    warnings.push(`missing id — synthesized ${finding.id}`)
  }
  if (!finding.title) {
    finding.title = finding.id
    warnings.push(`missing title — defaulted to id (${finding.title})`)
  }
  if (!finding.severity) {
    finding.severity = 'Medium'
    warnings.push('missing severity — defaulted to Medium')
  } else {
    finding.severity = normalizeSeverity(finding.severity)
  }
  if (!finding.validation_status) {
    finding.validation_status = 'unknown'
    warnings.push('missing validation_status — defaulted to unknown')
  }
  if (!finding.original_agent) {
    finding.original_agent = 'UNKNOWN'
    warnings.push('missing original_agent — defaulted to UNKNOWN')
  }
  if (!finding.taskId) {
    finding.taskId = ''
    warnings.push('missing taskId — defaulted to empty string')
  }

  return { valid: true, finding, warnings }
}

/**
 * Read a JSONL findings file, parse each line, normalize each record.
 * Skips malformed lines (logs to stderr in dev). Returns [] for missing file.
 *
 * Use this at every read boundary instead of inline fs.readFileSync + JSON.parse,
 * so downstream code never sees raw specialist output drift.
 */
function readFindingsFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return []
  const raw = fs.readFileSync(filePath, 'utf-8')
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  const findings = []
  for (const line of lines) {
    try {
      findings.push(normalizeFinding(JSON.parse(line)))
    } catch {
      // malformed line — skip silently (typical when AUDITOR writes mid-flush)
    }
  }
  return findings
}

/**
 * Wrap a finding in a typed PhaseEnvelope.
 *
 * Bridges the new envelope system without breaking existing validateFinding callers.
 * The finding is normalized before wrapping.
 *
 * @param {object} finding          - Raw or pre-validated finding object
 * @param {object} opts
 * @param {string} opts.source      - Agent name who produced this (e.g. 'AUDITOR')
 * @param {string} opts.taskId      - The dispatch task ID
 * @returns {object} PhaseEnvelope with type='finding'
 */
function wrapFinding(finding, { source = 'UNKNOWN', taskId = '' } = {}) {
  const normalized = normalizeFinding(finding)
  return _envelopeWrap('finding', normalized, { source, taskId })
}

module.exports = {
  normalizeFinding,
  normalizeSeverity,
  normalizePatternState,
  deriveConfirmationStatus,
  hasRuntimeProof,
  readFindingsFile,
  validateFinding,
  wrapFinding,
  CANONICAL_SEVERITIES,
  PATTERN_OUTPUT_STATES,
  CONFIRMATION_STATES,
  REQUIRED_FIELDS,
}
