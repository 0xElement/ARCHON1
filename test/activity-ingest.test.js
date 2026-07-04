'use strict'
// Regression guard for the activity → live-findings ingester idempotency.
// The bug: the 15s ingester re-appended every finding on every tick (key mismatch between
// write and lookup), ballooning live-findings ~250× and wedging the run. This asserts the
// permanent contract: re-ingesting the same findings adds nothing; only genuinely-new ones pass.
const assert = require('assert')
const { newFindingsFromActivity, candidateFrom } = require('../src/pipeline/activity-ingest')
const { normalizeFinding } = require('../agents/finding-schema')
const { canonicalKey } = require('../src/pipeline/suspected-dedup')

const isFindingEntry = e => /^(confirmed|suspected)\s+finding:/i.test(String(e && e.action || '')) || (e && e.type === 'finding')
const opts = { normalizeFinding, isFindingEntry }

// realistic activity entries — note the `details` field is present (the exact case the bug hit)
const acts = [
  { agent: 'DRILL', taskId: 't1', action: 'CONFIRMED Finding: SQL Injection in /rest/user/login', details: 'auth bypass via email field payload', severity: 'critical' },
  { agent: 'VIPER', taskId: 't1', action: 'CONFIRMED Finding: Stored XSS in product review', details: 'script executes on view', severity: 'high' },
  { agent: 'RELAY', taskId: 't2', action: 'CONFIRMED Finding: SSRF in webhook', details: 'internal metadata read', severity: 'high' }, // other task
  { agent: 'NEXUS', taskId: 't1', action: 'phase 3 complete', details: 'not a finding' }, // not a finding entry
]

let pass = 0
const ok = (name, cond) => { assert.ok(cond, name); console.log('  ✓ ' + name); pass++ }

// tick 1 on an empty live-findings → the 2 distinct t1 findings are ingested (t2 + non-finding excluded)
const fresh1 = newFindingsFromActivity([], acts, 't1', opts)
ok('tick 1 ingests the 2 distinct t1 findings (task-isolated, noise-filtered)', fresh1.length === 2)

// append them, then re-run with the SAME activity → 0 new (THE regression: was unbounded)
const live = fresh1.slice()
ok('re-ingesting the same findings adds ZERO (idempotent)', newFindingsFromActivity(live, acts, 't1', opts).length === 0)

// stays idempotent across many ticks (production ran ~276 ticks and added ~94 each = the bug)
let stable = true
for (let i = 0; i < 300; i++) if (newFindingsFromActivity(live, acts, 't1', opts).length !== 0) { stable = false; break }
ok('stays idempotent across 300 ticks (no growth)', stable)

// a genuinely new finding appears → only it is ingested
const acts2 = acts.concat([{ agent: 'WARDEN', taskId: 't1', action: 'CONFIRMED Finding: IDOR in /api/basket/{id}', details: 'read another user basket', severity: 'high' }])
ok('a distinct new finding IS ingested (dedup does not over-suppress)', newFindingsFromActivity(live, acts2, 't1', opts).length === 1)

// canonicalKey round-trips through normalizeFinding (the property the fix relies on)
const rec = candidateFrom(acts[0], 't1', normalizeFinding)
const recAgain = candidateFrom(acts[0], 't1', normalizeFinding)
ok('canonicalKey is stable across the normalize round-trip', !!canonicalKey(rec) && canonicalKey(rec) === canonicalKey(recAgain))

console.log(`\n${pass} passed — activity-ingest is idempotent (live-findings cannot balloon)`)
