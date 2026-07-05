// test/whitebox-correlation.test.js
// P6 — white-box source-guided + bidirectional correlation (ULTRAPLAN §3.2/§5.1).
// source→live guidance; live→source matching; NEVER mutates pentest findings;
// launch driven by the persisted signal even if the flag flips off (Issue 3).

'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'archon-wb-'))
const wb = require('../src/dispatch/whitebox-correlation')

function seedFindings(taskId, arr) { fs.writeFileSync(path.join(TMP, `VALIDATED-FINDINGS-${taskId}.jsonl`), arr.map(f => JSON.stringify(f)).join('\n') + '\n') }
function seedFeatureQueue(crTaskId, features) {
  const d = path.join(TMP, 'code-review', String(crTaskId), 'phase1-maps')
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, 'feature-queue.json'), JSON.stringify({ features }))
}

test('SOURCE→LIVE: buildSourceGuidance aims the pentest from code-review candidates', () => {
  seedFeatureQueue('cr1', [{ slug: 'login', name: 'Login' }])
  seedFindings('cr1', [
    { id: 'CR-1', title: 'IDOR in /orders', severity: 'High', validation_status: 'NEEDS-LIVE', file: 'app/orders.rb', line: 42, url: 'https://x.test/orders/1' },
    { id: 'CR-2', title: 'Reflected XSS', severity: 'Medium', validation_status: 'NEEDS-LIVE', file: 'app/views/x.erb' },
  ])
  const bundle = wb.buildSourceGuidance('cr1', 'pt1', { intelRoot: TMP, now: 'fixed' })
  assert.equal(bundle.candidate_targets.length, 2)
  assert.ok(bundle.priority_classes.includes('idor') || bundle.priority_classes.includes('access-control'))
  const c1 = bundle.candidate_targets.find(c => c.candidate_id === 'CR-1')
  assert.ok(c1.suggested_blackbox_task && c1.suggested_blackbox_task.objective)
  assert.ok(fs.existsSync(path.join(TMP, 'source-guidance-pt1.json')), 'guidance file written')
})

test('M4: source candidate required_blackbox_proof + affected_endpoint aim the live-validation task', () => {
  seedFeatureQueue('cr-m4', [{ slug: 'orders', name: 'Orders' }])
  seedFindings('cr-m4', [
    { id: 'CR-7', title: 'IDOR in /orders', severity: 'High', validation_status: 'NEEDS-LIVE',
      confirmation_status: 'NEEDS_LIVE_VALIDATION', file: 'app/orders.rb', line: 42,
      affected_endpoint: 'GET /orders/:id', required_blackbox_proof: 'request /orders/2 as user A, observe user B order' },
  ])
  const bundle = wb.buildSourceGuidance('cr-m4', 'pt-m4', { intelRoot: TMP, now: 'fixed' })
  const c = bundle.candidate_targets.find(x => x.candidate_id === 'CR-7')
  assert.ok(c, 'candidate present')
  assert.equal(c.suggested_blackbox_task.required_evidence, 'request /orders/2 as user A, observe user B order',
    'the specialist required-proof aims the deferred pentest (not the generic fallback)')
  assert.equal(c.suggested_blackbox_task.entry_point, 'GET /orders/:id', 'affected_endpoint → entry_point (no url on a source finding)')
})

test('LIVE→SOURCE: buildRootCauseRequests matches by (vuln_class, locus) and never writes pentest findings', () => {
  seedFindings('pt2', [
    { id: 'BB-1', title: 'IDOR in /orders', severity: 'High', validation_status: 'CONFIRMED', url: 'https://x.test/orders/1' },
    { id: 'BB-2', title: 'Open redirect', severity: 'Low', validation_status: 'CONFIRMED', url: 'https://x.test/go' },
  ])
  seedFindings('cr2', [{ id: 'CR-9', title: 'IDOR in /orders', severity: 'High', validation_status: 'NEEDS-LIVE', file: 'app/orders.rb', line: 42, url: 'https://x.test/orders/1' }])
  const beforeLive = fs.readFileSync(path.join(TMP, 'VALIDATED-FINDINGS-pt2.jsonl'), 'utf8')
  const { matched, unmatched } = wb.buildRootCauseRequests('pt2', 'cr2', { intelRoot: TMP })
  assert.ok(matched.some(m => m.live_id === 'BB-1' && m.source_id === 'CR-9'), 'IDOR live finding matched to source')
  assert.ok(unmatched.some(u => u.live_id === 'BB-2'), 'open redirect has no source match → request')
  // INVARIANT: pentest VALIDATED-FINDINGS untouched
  assert.equal(fs.readFileSync(path.join(TMP, 'VALIDATED-FINDINGS-pt2.jsonl'), 'utf8'), beforeLive, 'must NEVER write pentest findings')
})

test('launch is driven by the persisted signal (fires even if no flag is read)', () => {
  const engId = 'eng-1'
  const deferred = { action: 'dispatch', taskId: 'pt3', squad: 'pentest-squad', meta: { engagementId: engId } }
  fs.writeFileSync(path.join(TMP, `engagement-${engId}.json`), JSON.stringify({
    engagementId: engId, deferredPentestDispatch: deferred,
    iterations: [{ taskId: 'pt3', kind: 'blackbox', status: 'pending-source-guidance' }, { taskId: 'cr3', kind: 'whitebox' }],
  }))
  seedFeatureQueue('cr3', [{ slug: 'a', name: 'A' }])
  seedFindings('cr3', [{ id: 'CR-X', title: 'SSRF in fetch', severity: 'High', validation_status: 'NEEDS-LIVE', file: 'app/fetch.rb' }])
  const inboxWrites = []
  const r = wb.maybeLaunchSourceGuidedPentest('cr3', { intelRoot: TMP, engagementId: engId, writeInbox: (dir, body) => inboxWrites.push(body) })
  assert.equal(r.launched, true)
  assert.equal(inboxWrites.length, 1)
  // the launched dispatch self-identifies as white-box (Issue 1) and is source-guided
  assert.equal(inboxWrites[0].meta.sourceGuided, true)
  assert.equal(inboxWrites[0].meta.engagementMode, 'whitebox')
  assert.equal(inboxWrites[0].meta.sourceGuidanceFile, 'source-guidance-pt3.json')
  // idempotent: the deferral signal is cleared
  const eng = JSON.parse(fs.readFileSync(path.join(TMP, `engagement-${engId}.json`), 'utf8'))
  assert.ok(!eng.deferredPentestDispatch, 'deferral cleared after launch')
  const r2 = wb.maybeLaunchSourceGuidedPentest('cr3', { intelRoot: TMP, engagementId: engId, writeInbox: () => { throw new Error('should not fire twice') } })
  assert.equal(r2.launched, false)
})

test('FALLBACK: launches un-guided when code-review produced no usable candidates', () => {
  const engId = 'eng-2'
  const deferred = { action: 'dispatch', taskId: 'pt4', squad: 'pentest-squad', meta: { engagementId: engId } }
  fs.writeFileSync(path.join(TMP, `engagement-${engId}.json`), JSON.stringify({
    engagementId: engId, deferredPentestDispatch: deferred,
    iterations: [{ taskId: 'pt4', kind: 'blackbox', status: 'pending-source-guidance' }],
  }))
  const inboxWrites = []
  const r = wb.maybeLaunchSourceGuidedPentest('cr-empty', { intelRoot: TMP, engagementId: engId, writeInbox: (dir, body) => inboxWrites.push(body) })
  assert.equal(r.launched, true)
  assert.equal(r.guided, false, 'no candidates ⇒ un-guided launch (live side never dropped)')
  assert.equal(inboxWrites[0].meta.sourceGuided, true)
  assert.ok(!inboxWrites[0].meta.sourceGuidanceFile, 'no guidance file when un-guided')
})

test('fail-soft: missing engagement record ⇒ no launch, no throw', () => {
  const r = wb.maybeLaunchSourceGuidedPentest('cr-none', { intelRoot: TMP, engagementId: 'nope', writeInbox: () => { throw new Error('x') } })
  assert.equal(r.launched, false)
})
