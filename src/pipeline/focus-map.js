'use strict'
// focus-map.js — vuln-class → specialist mapping + focus gating. Pure and shared by the
// daemon (event-bus.js) AND the portal (scripts/dashboard.js) so there is ONE source of truth
// for "which specialists a focused scan runs" and "may this agent run under the focus".

// Vuln-class → specialist agent(s). Powers the dispatch "focus" option: a targeted scan
// (e.g. only XSS, or XSS + access-control) instead of the full A→Z roster.
const PENTEST_FOCUS_MAP = {
  'access-control': ['warden'], 'idor': ['warden'], 'bola': ['warden'],
  'sqli': ['drill'], 'injection': ['drill', 'ranger'], 'command-injection': ['ranger'],
  'xss': ['viper'], 'ssrf': ['relay'], 'ssti': ['forge'], 'xxe': ['spectre'],
  'csrf': ['decoy'], 'lfi': ['vault'], 'path-traversal': ['vault'],
  'api': ['gateway'], 'jwt': ['gateway'], 'graphql': ['gateway'],
  'business-logic': ['ledger'], 'auth': ['keyring'], 'session': ['keyring'],
}

// Given focus classes + the live specialist roster, return the de-duped specialists to run
// (intersected with the roster, in roster order). Empty/unknown classes → null (caller runs
// the FULL roster).
function focusedSpecialists(focusClasses, roster) {
  if (!Array.isArray(focusClasses) || !focusClasses.length) return null
  const want = new Set()
  for (const c of focusClasses) for (const a of (PENTEST_FOCUS_MAP[String(c).toLowerCase()] || [])) want.add(a)
  if (!want.size) return null
  const filtered = (Array.isArray(roster) ? roster : []).filter(a => want.has(String(a).toLowerCase()))
  return filtered.length ? filtered : null
}

// May this specialist run under the current focus? focus === null ⇒ full scan ⇒ everyone allowed;
// otherwise ONLY specialists in the focused set. Gates the surface-triggered conditional dispatches
// (SPECTRE/DECOY/RANGER-CMDi) so a focused scan never runs an out-of-focus specialist.
function focusAllows(focus, agent) {
  if (!focus) return true
  return focus.map(a => String(a).toLowerCase()).includes(String(agent).toLowerCase())
}

// The primary specialist a single focus class maps to — for the UI "test plan" chips.
function specialistForClass(cls) {
  const m = PENTEST_FOCUS_MAP[String(cls || '').toLowerCase()]
  return m && m.length ? m[0] : null
}

module.exports = { PENTEST_FOCUS_MAP, focusedSpecialists, focusAllows, specialistForClass }

// self-check: filtering, gating (incl. the reported bug scenario), and class→specialist mapping.
if (require.main === module) {
  const assert = require('node:assert')
  const roster = ['viper', 'drill', 'relay', 'vault', 'warden', 'forge', 'ledger', 'sentry', 'gateway', 'keyring', 'spectre', 'decoy']
  assert.deepStrictEqual(focusedSpecialists(['xss', 'access-control', 'sqli'], roster), ['viper', 'drill', 'warden'])
  assert.strictEqual(focusedSpecialists([], roster), null)
  assert.strictEqual(focusedSpecialists(null, roster), null)
  assert.strictEqual(focusedSpecialists(['nonsense'], roster), null)
  assert.strictEqual(focusAllows(null, 'spectre'), true)                          // full scan → everyone
  assert.strictEqual(focusAllows(['viper', 'warden', 'drill'], 'spectre'), false) // the reported leak
  assert.strictEqual(focusAllows(['viper', 'warden', 'drill'], 'decoy'), false)
  assert.strictEqual(focusAllows(['viper', 'warden', 'drill'], 'ranger'), false)
  assert.strictEqual(focusAllows(['spectre'], 'spectre'), true)
  assert.strictEqual(specialistForClass('xss'), 'viper')
  console.log('ok — focus-map: focusedSpecialists filters, focusAllows gates, specialistForClass maps')
}
