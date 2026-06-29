// src/orchestrator/task-lifecycle.js
//
// Formal task-lifecycle state machine (Autonomous Agent OS, spec
// 02_AUTONOMOUS_DECISION_ENGINE/AUTONOMOUS_TASK_LIFECYCLE.md). Deterministic core:
// declares the canonical task states + the legal transitions so the daemon's
// status writes are checkable. Pure + dependency-free; advisory (the existing
// tasks.json writers in event-bus remain the writers — this is the contract they
// can be validated against). See docs/autonomous-agent-os-spec.

'use strict'

// Canonical task states (superset that maps ARCHON's existing tasks.json statuses).
const STATES = Object.freeze(['backlog', 'active', 'in-progress', 'awaiting-triage', 'done', 'failed', 'cancelled'])

// Legal forward transitions. Terminal states (done/failed/cancelled) have none.
const TRANSITIONS = Object.freeze({
  backlog: ['active', 'in-progress', 'cancelled', 'failed'],
  active: ['in-progress', 'awaiting-triage', 'done', 'failed', 'cancelled'],
  'in-progress': ['awaiting-triage', 'done', 'failed', 'cancelled'],
  'awaiting-triage': ['done', 'failed', 'cancelled'],
  done: [],
  failed: [],
  cancelled: [],
})

const TERMINAL = Object.freeze(['done', 'failed', 'cancelled'])

function isState(s) { return STATES.includes(s) }
function isTerminal(s) { return TERMINAL.includes(s) }
function canTransition(from, to) {
  if (!isState(from) || !isState(to)) return false
  if (from === to) return true // idempotent re-write of the same status is allowed
  return (TRANSITIONS[from] || []).includes(to)
}

// Validate an intended transition; returns { ok, reason }.
function validateTransition(from, to) {
  if (!isState(to)) return { ok: false, reason: `unknown target state "${to}"` }
  if (!isState(from)) return { ok: true, reason: 'no prior state (initial)' } // first write
  if (isTerminal(from) && from !== to) return { ok: false, reason: `${from} is terminal` }
  if (!canTransition(from, to)) return { ok: false, reason: `illegal ${from} → ${to}` }
  return { ok: true, reason: 'ok' }
}

module.exports = { STATES, TRANSITIONS, TERMINAL, isState, isTerminal, canTransition, validateTransition }
