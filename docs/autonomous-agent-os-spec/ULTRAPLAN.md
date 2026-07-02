Verified the four load-bearing anchors the audit fixes hinge on: (1) `buildPentestMeta` (dashboard.js:178) emits a pentest meta with no `sourceDir`; the pentest dispatch carries only `meta.engagementId` (set at :335) while `sourceDir` lands on the engagement record at :361 — Issue 1 confirmed. (2) `phaseEnabled` (pentest-phases.js:81-89) returns false for any id absent from an explicit `enabledPhases` list; 3.088/3.95 are not in `PHASE_MANIFEST` — Issue 6 confirmed. (3) `writeValidatedFindingsFile` (auditor-validated-builder.js:234-239) is tmp+rename truncate-rebuild fed by `buildFromActivityLog` — Issue 7 confirmed. (4) PROBER fires on any truthy `meta.deployUrl` (code-review-dispatcher.js:410, deployUrl from meta at :308, passthrough at dashboard.js:160) — Issue 5 confirmed. Folding all fixes in.

---

# ARCHON Autonomous Agent OS — Ultraplan (Wired Implementation Plan) — FINAL

> Single authoritative, build-ready integration plan. Weaves the locked FOUNDATION contracts (data model + IDs, feature-flags/shadow, Knowledge Graph, verification) and the SIX block designs (mode-routing/white-box, Director, freehand, patterns, correlation, reporting) into ONE sequenced, end-to-end-wired build. Every new path is additive, fail-soft, and flag-gated; **flag-off == today, byte-for-byte.** This revision folds in every adversarial-audit fix directly; the **Audit resolution log** at the end maps each issue to the section that resolves it.
>
> **Verification note:** `event-bus.js` is ~10K lines and its line numbers drift between edits — every `event-bus.js:NNNN` below is an **anchor hint**, not a contract; wire by the named function/region, then confirm the line. All other file/line citations were spot-checked against the working tree on 2026-06-30 and hold (including the audit-cited anchors: `dashboard.js` `buildPentestMeta:178`/`buildCodeReviewMeta:148`/combined branch `334`/`engagementId:335`/`writeInbox:137,398`; `pentest-phases.js phaseEnabled:81-89`; `auditor-validated-builder.js writeValidatedFindingsFile:234-239`/`buildFromActivityLog:224`; `code-review-dispatcher.js PROBER:410`/`deployUrl:308`). Residual uncertainties are flagged inline with ⚠️ and tracked in the closing section.

---

## 1. North-star & invariants

**North-star.** ARCHON becomes an *Autonomous Agent OS*: a durable, engagement-scoped control system where (a) a bounded **Mission Director** drives the live pentest loop, (b) source review is a true **three-phase** engine (map → pattern → freehand), (c) white-box runs as a **source-guided, bidirectional** engagement (not two blind runs), (d) all engines write into **one typed data model** with stable IDs flowing task→evidence→candidate→finding→correlation→chain→**Knowledge Graph**, and (e) reporting is **continuous + evidence-package-backed** behind a report-quality gate — all without ever regressing the current product.

**The hard invariants (must never break — characterization-tested, not just hoped):**

1. **Golden spine.** The deterministic pentest pipeline order is authoritative: scope `0.0` → recon `1/1.5/1.6/1.8` → env-fingerprint `0.6` → strategist `1.9` → specialists `2` → fast-verify `2.5/2.9` → AUDITOR `3` → challenger/severity/active-poc `3.05–3.08` → exploit-prover `3.085` → re-plan `3.087` → chains `3.5/3.6/3.8` → ARBITER `3.9` → SCRIBE `4`. Essential phases `['0.0','1','2','3','3.05','3.9','4','5']` are always `phaseEnabled`; new phases are **optional and config/flag-gated**. **New phases `3.088` (live→source root-cause) and `3.95` (report-quality gate) are registered in `src/pipeline/pentest-phases.js` `PHASE_MANIFEST` as `tier:'optional'`** (audit fix — see §1a), so a squad with an explicit `enabledPhases` list can address them and the flag-on path is never silently disabled by `phaseEnabled` fail-closed. The Director may reorder/select **only optional** phases.
2. **Evidence gate (categorical).** "No replayable evidence → not CONFIRMED" is enforced in `agents/auditor-validated-builder.js` via `src/pipeline/evidence-contract.js` (`enforceContract`, hard demotion). No new numeric/advisory signal (`confidence_delta`, `quality_level`, `report_quality_verdict`) may ever flip a demotion or mutate `validation_status`. **Corollary (audit fix, Issue 2): a level signal may never *exclude* a finding the categorical gate already CONFIRMED — `quality_level` may *label* a CONFIRMED finding but report inclusion is keyed on `validation_status==='CONFIRMED'`, never on `quality_level>=L2`.**
3. **Scope fail-closed.** `agents/scope-prevalidator.js` `validateDispatch` returns `blocked` when scope config is missing (verified: only `ARCHON_SCOPE_OVERRIDE=1` downgrades to `warned`). Phase 0.0 blocks. The Director re-validates scope **before every extra hop**.
4. **Active-poc 3-gate.** Real impact payloads fire only behind `engagement_mode + permission token + ARCHON_ACTIVE_POC` (`agents/active-poc-policy.js`/`active-poc-runner.js`). No new component sets `engagement_mode='active-poc'` or raises test intensity.
5. **Engagement-mode contract** (§3) — a **flag-independent hard invariant** like scope fail-closed; no bypass env is provided by design. **Its enforcement reads a field the dispatch actually carries at *both* wiring boundaries** (audit fix, Issue 1) — never a field that only exists on a sibling dispatch or the engagement record alone.
6. **Flag-off == current.** Every `ARCHON_ENABLE_*` defaults off; master `ARCHON_ENABLE_AUTONOMOUS_OS` off forces all off. Flag-off means: new modules never `require`d, no new files/dirs created, no new log lines, prompt strings byte-identical, `reports/<taskId>.md` byte-stable. Proven by `test/flag-off-byte-stable.test.js` + the CI flag-off job.
7. **Single-writer state.** `tasks.json` / `dispatch-queue.json` / `ACTIVITY-LOG.jsonl` are written only via `writeAtomic` + `withFileLock`. New stores (KG, shadow) use **their own** lock files / per-engagement file scope and **never** contend with the state locks.
8. **No new runtime dependency** (audit fix, Issue 8 — now a hard invariant, not a note). `package.json` ships no `ajv` and no `js-yaml`; this build adds neither. Schema validation is the dependency-free `common/schemas/validate.js`; pattern catalogs are JSON. The grep-gate (§4.1) forbids `require('ajv')`/`require('js-yaml')` in any net-new module as well as direct `process.env.ARCHON_ENABLE_*` reads.

### 1a. New optional phases — manifest registration (audit fix, Issue 6)

`phaseEnabled(phaseId, squad)` (pentest-phases.js:81-89) returns `true` for essential ids, `true` for any id when the squad has **no** `enabledPhases` list (parity default), and `list.includes(id)` when a list **is** present — i.e. an unknown id is **fail-closed off** under an explicit list. Both new phases are therefore added to `PHASE_MANIFEST` as `tier:'optional'`:

```
{ id: '3.088', name: 'Live→source root-cause',   tier: 'optional' },
{ id: '3.95',  name: 'Report-quality gate',      tier: 'optional' },
```

The **dual gate** for each new phase is: `phaseEnabled(id, squad) && flagMode(<flag>) !== 'off'` — registered so an explicit-list squad can opt in, *and* flag-gated so flag-off is byte-stable. (Chosen approach, applied consistently to both phases: register in `PHASE_MANIFEST`, then AND with the flag. The alternative — flag-only, bypassing `phaseEnabled` — was rejected because it would make the two new phases the only optional phases not visible to `enabledPhases`, an inconsistency.)

---

## 2. The unified data model & ID flow (the wiring spine)

This is the spine every other section references. It is delivered by **Foundation Block C** (`common/schemas/` + `validate.js` + `mapping.js`). **No new IDs are minted except `evidence_id` and `correlation_id`** (deterministic hashes → idempotent re-runs); every other ID **aliases an existing ARCHON identifier**.

### 2.1 Canonical objects (six schemas, draft-2020-12 subset, self-contained, no `$ref`)

| Schema (`common/schemas/`) | Aliases / derives from | Required keys |
|---|---|---|
| `task.schema.json` | `taskId` + `engagement-<E>.json` iterations + dashboard dispatch (derived at read-time; **tasks.json NOT migrated**) | `task_id, engagement_id, mode, status, schemaVersion` |
| `evidence.schema.json` | inline finding evidence + `poc-evidence/{taskId}/{findingId}.json` (addressable, not moved) | `evidence_id, candidate_id, type, quality_level, schemaVersion` |
| `candidate_finding.schema.json` | wraps `normalizeFinding()` output (superset; `additionalProperties:true`) | `candidate_id, title, severity, schemaVersion, auditor_status, judge_status` |
| `source_feature_map.schema.json` | `feature-queue.json` `{slug,name,keywords}` + `features/<slug>.md` | `feature_id, feature_name, coverage_status, schemaVersion` |
| `correlation.schema.json` | `cross-view-dedup.correlate()` + Phase 2.9 contradiction report | `correlation_id, linked_items, correlation_type, schemaVersion` |
| `chain.schema.json` | `chain-verifier.js` `CHAIN_OUTPUT_SCHEMA` widened (new fields **optional**) | `chain_id, name, severity, finding_ids, steps` |

All six validate against `common/schemas/validate.js` only. **No schema or test imports `ajv`** (invariant 8).

### 2.2 Stable ID flow (one line per hop — the spine)

```
task_id (= existing taskId)                                   ── stamped on every live finding (taskId)
  └─ candidate_id (= normalizeFinding(finding).id:            F-NNN | AGENT-NNN | AUDITOR-FN-<hex> | F-AUTO-<ts>-<n>)
       └─ evidence_id = EV-<candidate_id>-<sha1(type|content_ref)[:8]>            (synthesized, idempotent)
            └─ AUDITOR promotes candidate→VALIDATED, keeps candidate_id, sets auditor_status
                 └─ judge writes JUDGED, sets judge_status
                      └─ correlation_id = CORR-<sha1(sorted unique linked candidate_ids)[:10]>   (synthesized, idempotent)
                           └─ chain_id (= chains[].id, alias)  references finding_ids (= candidate_ids, minItems:1)
                                └─ KG upserts nodes keyed by {engagement_id, candidate_id, evidence_id, feature_id, correlation_id, chain_id}
feature_id = FEATURE-<slug>   (from feature-queue.json)
engagement_id = engagement-<E>.json key (= root pentest taskId for a combined engagement)
```

KG edges: `EVIDENCE_SUPPORTS_CANDIDATE`, `CANDIDATE_CORRELATES_WITH_{SOURCE,BLACKBOX}`, `FINDING_PART_OF_ATTACK_CHAIN`, `HYPOTHESIS_TARGETS_FEATURE`, `FEATURE_HANDLED_BY_SOURCE_FILE`.

### 2.3 The enum-mapping layer (`common/schemas/mapping.js`) — ARCHON stays authoritative

The spec enums are **derived labels**; ARCHON enums are authoritative. Mapping is **bidirectional** (ARCHON→spec for KG/export; spec→ARCHON for ingest) and **never writes `validation_status`** (asserted invariant).

| ARCHON (authoritative) | → spec (derived label) |
|---|---|
| `validation_status` CONFIRMED / NEEDS-LIVE / KILLED / SUSPECTED | `auditor_status` validated / needs_more_evidence / rejected / pending |
| judge verdict confirmed/downgraded / indeterminate / rejected | `judge_status` accepted / pending / rejected |
| severity title-case `Info/Low/Medium/High/Critical` ✅ (verified: `Info`, not `Informational`) | lowercase `info/low/…/critical` |
| `evidence_completeness` full/partial/local_only **+** `evidence-contract.hasEvidence` + proof/chain | `quality_level` L0–L4 (routes through `hasEvidence` → can never disagree with the gate) |
| squad + kind + hasSource/hasLive | `task.mode` ∈ {blackbox, static, whitebox, hybrid} |
| AC catalog "Result Values" + dispositions | `pattern_output_state` (7-state, §5 Block E) |

`deriveQualityLevel(finding)`: L4 if chain-backed && `proof_of_execution.confirmed`; L3 if live evidence && `source_files`; L2 if live evidence; L1 if source/scanner-only; else L0. **Auto-repair defaults never reject** a legacy record (`candidate_id←id, severity←Medium, auditor_status←pending, judge_status←pending, source←inferred, confidence←medium, quality_level←L0, schemaVersion←'1'`).

**`quality_level` is a label, never a gate (audit fix, Issue 2):** `deriveQualityLevel` is descriptive only. It is consumed by reporting for ordering/labeling and by the KG for context, but **no consumer may use `quality_level` to exclude, demote, or alter a finding whose `validation_status==='CONFIRMED'`.** A source/scanner-only CONFIRMED finding (which `deriveQualityLevel` scores L1) is still a CONFIRMED finding and is included in the main report; `quality_level` only decorates it (e.g. "source-confirmed"). This is the precise downstream contract Block R consumes (§5.6).

**Non-breaking guarantee:** `normalizeFinding()` is byte-for-byte untouched; candidate enrichment lives in a **new** exported `toCandidateFinding(finding)` invoked only under `ARCHON_ENABLE_STRICT_SCHEMA`. `validate.js` is a ~60-line **dependency-free** subset validator (`required/type/enum/minItems/minLength/properties/items`); **ajv is not installed and is not added** (invariant 8). The earlier cross-block inconsistency (verification block assumed ajv for `test/schema-conformance.test.js`) is **resolved**: the conformance test imports `common/schemas/validate.js`, never ajv, and "no new runtime dep" is a hard P1 exit gate enforced by the grep-gate. If full draft-2020-12 conditionals/`$ref`/format assertions are ever genuinely required, that is an explicit owner-override decision to add ajv — see **OPEN DECISION D-1** below; it is *not* assumed by any test or module in this plan.

> **OPEN DECISION D-1 (low-stakes, deferred):** the six schemas are authored to the `validate.js` feature subset (no `$ref`, no conditional `if/then`, no `format` assertions). If a future schema genuinely needs draft-2020-12 conditionals, the owner chooses between (a) extending `validate.js` with the needed keyword, or (b) approving an `ajv` dependency. Default until then: stay on `validate.js`. No part of this build depends on the outcome.

---

## 3. Engagement-mode orchestration (the MODE CONTRACT engine + bidirectional white-box)

### 3.1 The contract (hard invariant; `src/core/engagement-mode.js`, Phase 0)

`classifyEngagementMode({squad, meta})` — **input contract pinned to fields the dispatch actually carries at each boundary** (audit fix, Issue 1):

| Input the dispatch actually carries | Mode | Routes to | MUST NOT |
|---|---|---|---|
| `squad:'pentest'`, AND none of {`meta.sourceDir`, `meta.sourceGuided===true`, resolved `engagement-<meta.engagementId>.json.sourceDir`} | **blackbox** | `parallel-phases` → `dispatchPentestParallel` only | spawn code-review |
| `squad:'code-review'` (standalone, no parent pentest engagement) | **static** | `code-review` → `runCodeReview` only; **`assertModeContract` strips `meta.deployUrl`→null at the boundary** so PROBER is suppressed (audit fix, Issue 5) | make any live hit |
| `squad:'pentest'` AND (`meta.sourceDir` present **OR** `meta.sourceGuided===true` **OR** resolved `engagement-<meta.engagementId>.json.sourceDir` truthy) | **whitebox** | code-review **then** source-guided pentest, bidirectionally correlated | run two blind parallel runs (the upgrade) |

**Why the whitebox row reads three fields, not just `meta.sourceDir` (audit fix, Issue 1):** `buildPentestMeta` (dashboard.js:178) produces a pentest meta with **no `sourceDir`** — `sourceDir` lives only on the code-review `crMeta` and on `engagement-<E>.json` (written at dashboard.js:361 in the combined branch). At the **second** wiring boundary (`event-bus.js dispatchToAgent`, where the deferred/source-guided pentest dispatch is classified) the dispatch meta has no `sourceDir`. So:
- The combined-dispatch fork in `createDispatch` **stamps `meta.sourceGuided=true`** (and `meta.engagementMode='whitebox'`) on the stashed `deferredPentestDispatch` (§3.2). This is the primary, self-contained signal the daemon reads.
- As a belt-and-suspenders fallback, `classifyEngagementMode` resolves `engagement-<meta.engagementId>.json` (`meta.engagementId` **is** present on the pentest dispatch — dashboard.js:335) and checks its `sourceDir`. Fail-soft: if the engagement file is unreadable, the explicit `sourceGuided` marker still decides.

`assertModeContract(mode, {meta, willSpawnCodeReview})` **throws** on violation — flag-independent, mirrors `scope-prevalidator` fail-closed. It additionally **mutates `meta.deployUrl→null` for `static`** so a standalone code-review with an operator-supplied `deployUrl` cannot fire PROBER (the strip happens at the boundary, not relying on the caller — audit fix, Issue 5). Wired at **both dispatch boundaries**: `scripts/dashboard.js createDispatch` and `event-bus.js dispatchToAgent`. No bypass env (intentionally not provided). Note `task-config engagement_mode='active-poc'` is a **different axis** (permission level) — do not conflate.

**`code-review + deployUrl` resolution (audit fix, Issue 5):** there are exactly two legitimate ways a code-review dispatch carries a live `deployUrl`:
1. **Combined/whitebox** — `createDispatch` sets `crMeta.deployUrl = meta.targetUrl` (dashboard.js:343) because the parent pentest engagement legitimately owns the live target; here PROBER **should** run (runtime validation). The contract classifies the *code-review iteration* of a whitebox engagement as part of `whitebox`, and does **not** strip `deployUrl`.
2. **Standalone code-review with operator-supplied `deployUrl`** (buildCodeReviewMeta:160 passthrough) — this is `static`; `assertModeContract` **strips `deployUrl`**, suppressing the PROBER live hit (code-review-dispatcher.js:410 sees a falsy `deployUrl`). Test `test/mode-contract.test.js` asserts: a standalone code-review dispatch with `meta.deployUrl` set ⇒ PROBER never spawns.

### 3.2 White-box today (verified) vs. the upgrade

**Today** (`dashboard.js createDispatch` combined branch, verified `334–398`): writes **both** the pentest inbox dispatch (root `taskId`, writeInbox at `398`) AND the code-review dispatch (`crTaskId`, writeInbox at `367`) at once → they run blind/independent → `cross-view-dedup.buildCorrelationMap` merges only at report time. Two iterations are recorded: `kind:'blackbox'` (root) + `kind:'whitebox'` (code-review). 

**Upgrade** (gated by `ARCHON_ENABLE_SOURCE_GUIDED_PENTEST`; flag-off = today verbatim) — owned by **`src/dispatch/whitebox-correlation.js`** + Director (Block A).

**Dual-process flag coupling — resolved (audit fix, Issue 3):** the deferral **decision** runs in the dashboard process (createDispatch); the **launch** runs in the event-bus daemon (completion hook). These are two processes that could read `ARCHON_ENABLE_SOURCE_GUIDED_PENTEST` at different times / from different env. The contract is therefore split so the two halves cannot disagree:

- **The flag gates ONLY the one-time deferral fork in `createDispatch`.** When `flagMode('SOURCE_GUIDED_PENTEST')==='active'`, createDispatch **defers** (writes only the code-review dispatch, stashes the pentest dispatch, marks `pending-source-guidance`). Otherwise createDispatch behaves **exactly as today** (writes both dispatches). The writeInbox skip at dashboard.js:398 is **surgical**: it is suppressed **only** in the combined-pentest-when-active case. Non-combined pentest, standalone static code-review, and all generic dispatches keep their `398` writeInbox byte-identical (flag-off byte-stability for every non-combined path).
- **The daemon's launch is driven by the PERSISTED signal, not a flag re-read** — the completion hook launches the deferred pentest whenever it finds `engagement.deferredPentestDispatch` present **and** the pentest iteration `status==='pending-source-guidance'`. It does **not** re-read the flag. Consequence: if the flag is toggled off (or the daemon started with different env) between dispatch and completion, the daemon **still honors** the deferred dispatch it finds — the live side is **never silently dropped**. The flag skew that the audit identified is structurally impossible because only one process (dashboard) ever consults the flag.

**Sequencing (ACTIVE):**
1. `createDispatch` combined branch (flag active) writes **only** the code-review dispatch; stashes the fully-built pentest dispatch as `engagement.deferredPentestDispatch` on `engagement-<root>.json` (mode `0600`), **stamps `meta.sourceGuided=true` + `meta.engagementMode='whitebox'`** on that stashed dispatch (so the daemon classifies it whitebox — §3.1), and marks the pentest iteration `status:'pending-source-guidance'`. Code-review iteration keeps `deployUrl=targetUrl` (PROBER still runtime-validates; this is the whitebox case, §3.1).
2. Code-review completion hook (`event-bus.js`, right after `normalizeCodeReviewFindings`, ~`8657`) fires fail-soft `whiteboxCorrelation.maybeLaunchSourceGuidedPentest(crTaskId, deps)`. This function **launches the deferred dispatch on the persisted-signal condition above regardless of the live flag value** → builds the source-guidance bundle (if code-review output is usable) → `writeInbox` the deferred pentest dispatch with `meta.sourceGuidanceFile` + `meta.sourceGuided=true`. Existing inbox dedup guard (~`10474`) prevents double-dispatch.

**SOURCE→LIVE** (source review *aims* the live attacks) — `buildSourceGuidance(crTaskId, pentestTaskId)` deterministically reads code-review outputs the dispatcher already writes:
- `code-review/<crTaskId>/phase1-maps/feature-queue.json` → `feature_targets` / `FEATURE-<slug>`
- `VALIDATED-FINDINGS-<crTaskId>.jsonl` (CR-`n` source candidates) → `candidate_targets[{candidate_id, vuln_class=deriveVulnClass(title), severity, file, line, url?, param?, suggested_blackbox_task{objective, vuln_class, entry_point, required_evidence}}]`
- `phase2/AUDITOR-VERDICTS.md` + `consolidated/phase2_review_queue.md` (best-effort prose; the authoritative candidate set is the JSONL)

→ writes `source-guidance-<pentestTaskId>.json`, injected at **two existing points**: `runAttackPlanner` (~`2886`) passes `sourceGuidance` to `attack-planner.buildAttackPlanPrompt` (ATLAS seeds priority hypotheses targeting the exact endpoints/params), and `buildPentestSpecialistPrompt` (~`3653–3691`) gains a `sourceGuidanceBlock`. **CRITICAL:** a source candidate is a **hypothesis only** — never written into the pentest's `live-findings`/`VALIDATED-FINDINGS`; it must independently pass scope 0.0 + AUDITOR + the evidence contract to become CONFIRMED.

**LIVE→SOURCE** (live results root-cause/confirm source findings) — new Phase **3.088** (after `runReplanLoop`, ~`5955`). **Hard-guarded (audit fix, Issue 4):** Phase 3.088 is a **no-op** unless the pipeline classifies `classifyEngagementMode(...) === 'whitebox'` **AND** a non-empty `crTaskId`/`meta.sourceGuidanceFile` is present. It is gated by `phaseEnabled('3.088', squad) && flagMode('SOURCE_GUIDED_PENTEST')!=='off'` **and** this per-engagement whitebox+source guard. A black-box pipeline (even with the flag globally on, even under any residual mis-classification) can therefore **never** reach the source-tracer spawn — black-box MUST NOT run code review, enforced structurally here as well as at the dispatch boundary. `buildRootCauseRequests(pentestTaskId, crTaskId)` matches each live finding to a source candidate by `(deriveVulnClass, findingLocus)` (reusing `cross-view-dedup` classifiers, verified at lines 19/34/40). **Matched** → hybrid finding inherits source `file:line` root-cause (no spawn). **Unmatched** → `root-cause-request-<pentestTaskId>.json`; only if non-empty, **one** focused source-tracer spawn → `root-cause-<pentestTaskId>.md`. SCRIBE's cross-view prompt (`hasWhitebox` branch, ~`8303–8311`) gains this artifact so every hybrid finding carries live proof + source root cause + feature + repro + impact + fix. `buildCorrelationMap` is reused **unchanged** — data simply flows both ways now.

**FALLBACK invariant:** if code-review produced no usable output, `maybeLaunchSourceGuidedPentest` **still launches the deferred pentest un-guided** (using the persisted `deferredPentestDispatch`, with `meta.sourceGuidanceFile` omitted) — white-box must never silently drop the live side. ⚠️ If the code-review branch *throws* before the completion hook ever runs, the hook never fires; mitigation = the recovery sweep below.

**Recovery sweep (audit fix, Issue 3 + ⚠️#6):** a daemon-side sweep launches any `deferredPentestDispatch` whose iteration is still `pending-source-guidance` after a timeout — covering **both** the code-review-throws case **and** any flag/env skew that prevented the normal hook from firing. Because the launch is driven entirely by the persisted signal, the sweep needs no flag check; it simply honors orphaned deferrals (un-guided fallback). This closes the orphan window the audit identified as broader than the throw-path alone.

### 3.3 The Director's role in modes (Block A)

The Director is wired **only** into the `parallel-phases` (live) branch, so by construction: black-box loops the live engine only (never spawns code-review, `assertModeContract(willSpawnCodeReview:false)`); static is routed to the code-review branch where the Director is **not** wired (stays code-review-only, no live hit — and `deployUrl` is stripped for static, §3.1); white-box's pentest iteration becomes the **source-guided** loop under `ARCHON_ENABLE_SOURCE_GUIDED_PENTEST`. Because the source-guided pentest dispatch now classifies `whitebox` at the event-bus boundary (via `meta.sourceGuided`, §3.1), the Director observes it as a whitebox engagement and the §3.2 LIVE→SOURCE / Phase-3.088 path is reachable; a plain black-box dispatch classifies `blackbox` and Phase 3.088 stays a no-op (Issue 4).

---

## 4. The feature-flag matrix & shadow-mode harness

### 4.1 Resolver (Phase 0, `paths.js` — net-new helpers; verified absent today)

One chokepoint in `paths.js` (the env authority that already autoloads `.env.local`, verified `32–46`). Tri-state via an **ENABLE+DRIVE** pair: `flagMode(name) → 'off' | 'shadow' | 'active'`; `flagEnabled(name)` = `flagMode !== 'off'`. `off` = exact current behavior; `shadow` = module runs, writes ONLY to `var/intel/shadow/<engagementId>/`, drives nothing; `active` requires a second `ARCHON_DRIVE_<name>`. Master `ARCHON_ENABLE_AUTONOMOUS_OS` off ⇒ every block forced `off`. Truthy = `1|true|enabled|on|yes`. **No reader touches `process.env.ARCHON_ENABLE_*` directly** — a grep-gate enforces this (this is what makes the master kill-switch unbypassable). **The same grep-gate forbids `require('ajv')` and `require('js-yaml')` in net-new modules** (invariant 8, audit fix Issue 8).

### 4.2 The matrix

| Flag | Block | Phase | DRIVE pair | Flag-off guarantee | Shadow mechanism |
|---|---|---|---|---|---|
| `ARCHON_ENABLE_AUTONOMOUS_OS` | **MASTER** | P0 | — | everything off | — |
| `ARCHON_ENABLE_STRICT_SCHEMA` | C (schemas/IDs) | P1 | — | `validate.js`/`mapping.js` never on hot path; `normalizeFinding` unchanged; reports byte-stable | validate-and-log → `schema-divergence.jsonl` |
| `ARCHON_ENABLE_KNOWLEDGE_GRAPH` | B (KG) | P4 | — | no `kg/` dir, no log lines | passive-listener (derives at phase boundaries; no engine reads it) |
| `ARCHON_ENABLE_THREE_PHASE_SOURCE_REVIEW` (alias `FREEHAND_REVIEW`) | D (freehand) | P2 | `ARCHON_DRIVE_…` | `freehand` absent from `PHASES`; prompt byte-identical | candidates → non-globbed sibling dir (excluded from AUDITOR/SCRIBE) |
| `ARCHON_ENABLE_PATTERN_REVIEW` | E (catalogs) | P3 | `ARCHON_DRIVE_…` | loader never `require`d; `phase2Prompt` byte-identical; `correlate()` keys on `deriveVulnClass` | observer-recommender → `pattern-recommendations.jsonl` |
| `ARCHON_ENABLE_CORRELATION_ENGINE` | F (typed records) | P5 | `ARCHON_DRIVE_…` | module never `require`d; SCRIBE uses `correlation-<taskId>.json` spine | observer → `correlation-records.jsonl` + `chain-records.jsonl` |
| `ARCHON_ENABLE_SOURCE_GUIDED_PENTEST` | white-box bidirectional | P6 | — (behavioral) | two-independent-dispatch path verbatim; **flag gates only the createDispatch deferral fork** (Issue 3) | observer-recommender → `whitebox-plan-<eng>.md` |
| `ARCHON_ENABLE_BLACKBOX_MASTER_AGENT` | A (Director) | P6 | `ARCHON_DRIVE_…` | `run()` = `dispatchPentestParallel(dispatch)` (identity) | observer-recommender → `director-recommendations.jsonl` |
| `ARCHON_ENABLE_CONTINUOUS_REPORT` | R (streaming) | P7 | `ARCHON_DRIVE_…` | `report-stream.js` never called; `reports/<taskId>.md` byte-stable | observer → `shadowDir/report-stream.md` |
| `ARCHON_ENABLE_STRICT_JUDGE_GATE` | R (report-quality) | P7 | `ARCHON_DRIVE_…` | Phase 3.95 skipped; `buildscribeReportPrompt` byte-identical | validate-and-log → `REPORT-QUALITY-<taskId>.jsonl` (annotate only) |
| `ARCHON_ENABLE_STRICT_AUDITOR_GATE` | — | reserved/no-op | — | AUDITOR already strict | — |

### 4.3 Shadow harness (Phase 0)

One shared sink **`src/shadow/shadow-sink.js`** (~40 lines): `snapshot(eng, name, obj)` (writeAtomic), `append(eng, name, record)` (JSONL append), `note(eng)` (merge `shadow-manifest.json`). Per-engagement file scope, every fn try/catch → no-op. Backs the three §09 mechanisms: **validate-and-log** (C, R-judge), **passive-listener** (B, F-into-KG), **observer-recommender** (A, E, F, white-box, R-stream). The whole `var/intel/shadow/` subtree is **never read** by the legacy pipeline/dashboard/SCRIBE → reports stay byte-stable even with shadow on. Runtime divergence logger `src/pipeline/shadow-recorder.js` (`recordDivergence`/`readDivergences`) is the production face for offline diffing; NO-OP unless the relevant shadow flag is on.

### 4.4 Docker (Phase 0, optional)

Spec's 4-mount layout collapses onto ARCHON's single data root: mount `./var/intel:/app/var/intel`, `KURU_INTEL_ROOT=/app/var/intel`. `Dockerfile` (`node:lts-slim`, `npm ci --omit=dev`, all `ARCHON_ENABLE_*=false`, `HEALTHCHECK` → `/api/health`), `docker-compose.yml`, spec vendored to `docs/autonomous-agent-os-spec/` via `ARCHON_AGENT_SPEC_DIR` (fail-soft if absent).

---

## 5. Component build specs (implementation-ready)

> Format per component: **new files · modified files (named anchors) · in/out contract · flag · shadow · verification.** Reused-verbatim modules are named, never re-implemented.

### 5.0 Foundation

#### F-Flags (Phase 0)
- **New:** `src/shadow/shadow-sink.js`, `src/core/engagement-mode.js` (§3.1), `test/feature-flags.test.js`; optional `Dockerfile`, `docker-compose.yml`, `docs/autonomous-agent-os-spec/`.
- **Modified:** `paths.js` — add `flagMode/flagEnabled/shadowDir` (§4.1), export in the existing exports block (verified anchor `140` `INTEL_ROOT,`). Add grep-gate to enforce no direct `process.env.ARCHON_ENABLE_*` reads **and no `require('ajv')`/`require('js-yaml')` in net-new modules** (Issue 8). Register `3.088`/`3.95` in `src/pipeline/pentest-phases.js PHASE_MANIFEST` as `tier:'optional'` (§1a, Issue 6).
- **In/out:** in = dispatch body/meta + env; out = `flagMode/flagEnabled` decisions, engagement `kind`, `shadowDir` paths.
- **Verify:** `test/feature-flags.test.js` — all blocks `false` when unset; master-off forces all off; `flagMode` returns `shadow` on ENABLE-only, `active` only with ENABLE+DRIVE; classifier maps 3 cases **at both boundaries**; **source-guided pentest dispatch (carrying `meta.sourceGuided=true`) classifies whitebox at the event-bus boundary** (Issue 1); `assertModeContract` throws for blackbox+codeReview and **strips `deployUrl` for static** (Issue 5); createDispatch byte-stable vs golden for all non-combined paths (Issue 3); `phaseEnabled('3.088'/'3.95')` resolvable under an explicit `enabledPhases` list (Issue 6).

#### F-Schemas / IDs (Block C, Phase 1)
- **New:** `common/schemas/{task,evidence,candidate_finding,source_feature_map,correlation,chain}.schema.json`, `validate.js`, `mapping.js`; `test/schema-conformance.test.js`.
- **Modified:** none on the hot path. `finding-schema.js` left untouched; the new `toCandidateFinding` lives in `mapping.js`.
- **In/out:** in = at-rest ARCHON records (read via `finding-schema.readFindingsFile`, verified export `154/189`); out (flag-on only) = candidate enrichment + shadow `task` mirror + `schema-divergence.jsonl`. Flag-off: zero output.
- **Flag:** `ARCHON_ENABLE_STRICT_SCHEMA` (validate-and-log).
- **Verify:** `test/schema-conformance.test.js` — **imports `common/schemas/validate.js`, never ajv** (Issue 8, hard P1 gate); `normalizeFinding()` output validates; bidirectional enum round-trip (incl. severity `Info`); every legacy fixture validates after auto-repair (no record rejected); **invariant: mapping never writes `validation_status`**; **invariant (Issue 2): a CONFIRMED record at any `quality_level` (incl. L0/L1) round-trips without demotion or exclusion.**

#### F-KG (Block B, Phase 4)
- **New:** `src/intel/knowledge-graph.js`, `test/knowledge-graph.test.js`.
- **Modified:** `src/pipeline/attack-graph.js` — widen `NODE_TYPES`/`EDGE_TYPES` keys additively (verified `16/34`); keys are inert when off.
- **Reuses verbatim:** `attack-graph.findAttackChains` (verified `160`), `buildGraphFromFindings` (`237`), `getSummary` (`211`); `writeAtomic`/`acquireLock`/`withFileLock` **copied** from `event-bus.js:192–246` (precedent: `versioned-memory.js` already copies it); **own** lock `graph.json.lock`.
- **In/out:** in = on-disk artifacts (recon/fingerprint/endpoint-models/attack-plan/findings JSONL/correlation/code-review maps), `taskId`, `engagementId`. Out = `var/intel/kg/<engagementId>/graph.json`. **Derived-from-JSONL — never owns truth.** Write API `upsertNode/upsertEdge/syncEngagement/resolveEngagement` (idempotent); read API `getContext/query/observe/findChains` (pure). `observe()` = `{coverageGaps, unprovenCandidates, openChains, recommendedTasks}` — the Director's observe surface.
- **Flag:** `ARCHON_ENABLE_KNOWLEDGE_GRAPH` (passive-listener); flag-off ⇒ no `kg/` dir.
- **Verify:** `test/knowledge-graph.test.js` (idempotency, fail-soft, engagement-scoping, atomic/isolation, derived parity, read-purity) + `test/kg-jsonl-parity.test.js` (Phase-4 exit: finding-node count/id parity with JSONL; every correlation/chain edge maps to a `cross-view-dedup` merge decision).

#### F-Verification (cross-cutting)
- **New:** `test/helpers/shadow-diff.js` (`assertParity`), `test/helpers/golden.js` (`matchGolden`, `UPDATE_GOLDEN=1`), `test/flag-off-byte-stable.test.js`, `test/mode-contract.test.js`, `test/dispatch-routing.test.js`, `test/fixtures/{golden,kg,schema}/`, `.github/workflows/ci.yml`; per-block `parity-*.test.js` created **with** each block.
- **Modified:** `test/run-all.js` — one-line startup banner logging active `ARCHON_ENABLE_*` (auto-glob already picks up new `*.test.js`, verified).
- **CI gate (none today):** Job A `npm test` (all off) = merge floor; Job B flag-off byte-stable (goldens are the wall); Job C flag-on shadow (all set, run-all green) — **Job C also greps for `require('ajv')`/`require('js-yaml')` and fails on any hit** (Issue 8). UI e2e (`scripts/e2e.sh`) nightly.

### 5.1 Block-Mode-Routing + white-box (§3)
- **New:** `src/dispatch/whitebox-correlation.js` (`buildSourceGuidance`, `maybeLaunchSourceGuidedPentest`, `buildRootCauseRequests`, `shadowRecommend`); `test/whitebox-correlation.test.js`.
- **Modified:** `scripts/dashboard.js` createDispatch combined branch (`334–398`) — ACTIVE: defer the pentest dispatch onto the sidecar (stamp `meta.sourceGuided=true`/`engagementMode='whitebox'`), **surgically skip ONLY the combined-pentest writeInbox at `398`** (Issue 3), write only code-review; ALL modes call `classifyEngagementMode`+`assertModeContract` before any inbox write. `event-bus.js`: completion hook (~`8657`, **launch driven by persisted `deferredPentestDispatch`+`pending-source-guidance`, no flag re-read** — Issue 3), `runAttackPlanner` (~`2886`), `buildPentestSpecialistPrompt` (~`3653–3691`), new Phase 3.088 (~`5955`, **hard-guarded on `eMode==='whitebox'` && non-empty crTaskId/sourceGuidanceFile** — Issue 4), SCRIBE cross-view prompt (~`8303–8311`), **daemon recovery sweep for orphaned `pending-source-guidance` iterations** (Issue 3/⚠️#6). `src/pipeline/attack-planner.js` `buildAttackPlanPrompt` — optional `sourceGuidance` param (verified the function exists; undefined ⇒ byte-identical). `src/pipeline/pentest-phases.js` — `PHASE_MANIFEST` `3.088 tier:'optional'` (Issue 6).
- **Reuses verbatim:** `cross-view-dedup.deriveVulnClass/findingLocus/findingParam` (verified `19/34/40/87`), `dispatchPentestParallel`, `code-review-dispatcher`, `buildCorrelationMap`.
- **Flag:** `ARCHON_ENABLE_SOURCE_GUIDED_PENTEST` (off=two blind dispatches; shadow=write bundle+plan to shadowDir, legacy drives; active=defer+sequence + bidirectional). Flag is read **only** in createDispatch's deferral fork; the daemon honors the persisted deferral regardless (Issue 3).
- **Verify:** `test/whitebox-correlation.test.js` (mode contract at both boundaries incl. `sourceGuided` whitebox classification; source→live bundle; live→source matching; **Phase 3.088 no-op when not whitebox / no crTaskId** — Issue 4; **evidence-contract invariant: never writes pentest live-findings/VALIDATED-FINDINGS**; fail-soft; fallback un-guided launch from persisted signal; **launch fires even when flag flipped off post-deferral** — Issue 3; recovery sweep adopts orphaned deferral; flag-off byte-stable for non-combined paths) + `test/mode-contract.test.js` (static `deployUrl`-strip ⇒ PROBER never spawns — Issue 5).

### 5.2 Block A — Mission Director
- **New:** `src/orchestrator/mission-director.js` (`run`, `observeEngagement`, `decideNext`, `deriveFocus`, `planNextHops`); `prompts/mission-director/v1.md` (advisory only); `test/mission-director.test.js`; `test/parity-mission-director.test.js`.
- **Modified:** `event-bus.js` `dispatchToAgent` `parallel-phases` branch — **wrap the single `dispatchPentestParallel(dispatch)` call** (~`8680–8683`) with `missionDirector.run(dispatch, deps)`; all deps already in scope (`dispatchPentestParallel`, `focusedSpecialists`, `getCostBudget`, `_isTaskCancelled`, `log/logActivity/readJSON/TASKS_FILE`). `runReplanLoop` (verified `2913`) — **no code change**; the Director reads its `followup-plan-<taskId>.json` (verified `2939`); the dead "re-dispatch" log (`2950`) is now fulfilled. Optional `var/intel/prompts-config.json` `"mission-director":"v1"`.
- **The loop (1:1 onto existing modules, no new intelligence):** observe = `coverage-map.computeCoverage` (gaps) + findings JSONL + `followup-plan` + `KG.observe` (when on); hypothesize = reuse ATLAS `followup-plan` (no new hot-path LLM call); assign = `focusedSpecialists`/`PENTEST_FOCUS_MAP` + `CLASS_TO_WSTG` → `meta.focusClasses` + `meta.skipRecon=true` (focused hop reuses recon); validate = each hop's own AUDITOR+judge+evidence-contract; update-KG = `KG.syncEngagement`; **decide = DETERMINISTIC, evidence-gated** (continue iff `hop<ARCHON_AUTONOMY_HOPS` && `spent<getCostBudget(squad)` && !cancelled && !awaitingTriage && (high-value followups || coverage gaps || sourceHypotheses)). `early-exit/goal-evaluator` consulted only to **confirm** a stop; the LLM prompt is advisory and can never extend past cap.
- **Caps (all reuse):** hop = `ARCHON_AUTONOMY_HOPS` (default 1 ⇒ one hop even active); cost = `getCostBudget(squad)` summed; scope = `scope-prevalidator.validateDispatch` before each extra hop (abort fail-closed on `blocked`); active-poc inherited per-hop; stop on `awaiting-triage` + `_isTaskCancelled`. Same `taskId` across hops (no finding-id drift).
- **Multi-hop annotation/archival survival (audit fix, Issue 7 — confirmed root cause):** `writeValidatedFindingsFile` (auditor-validated-builder.js:234-239) is tmp+rename **truncate-rebuild**, and Phase 3.05 rebuilds the whole file from the cumulative append-only `ACTIVITY-LOG` via `buildFromActivityLog` (`224`). Therefore across same-`taskId` Director hops, **CONFIRMED findings survive** (re-derived from the log), but every **in-place annotation from later phases is blown away** on the next hop's rebuild — challenger flags (3.055), severity-filter archival (3.075), and `chain_verified` (3.6, ~`6207`) are lost, and severity-filtered/archived findings are **resurrected**. Resolution: **at the Director's terminal hop, before SCRIBE, re-run the annotation/archival phases (3.055 challenger, 3.075 severity-filter, 3.6 chain-verify) over the cumulative `VALIDATED-FINDINGS` union** so the final report reflects union-level annotations, not hop-0's overwritten state. With the default `ARCHON_AUTONOMY_HOPS=1` this is a no-op (single hop = today's behavior); it is **required only for multi-hop** and is a precondition for raising hops under DRIVE.
- **Flag:** `ARCHON_ENABLE_BLACKBOX_MASTER_AGENT` (+ `ARCHON_DRIVE_…` for active). Off = identity passthrough.
- **Verify:** `test/mission-director.test.js` (flag-off identity, shadow drives nothing, active loop respects cap, decideNext caps, scope fail-closed aborts, mode contract, evidence-gated stop ignores "CONTINUE") + `test/parity-mission-director.test.js` (hop-0 identical; recommendations ⊇ deterministic followup coverage; caps hold; coverage stop not LLM-discretionary; **multi-hop: CONFIRMED findings survive AND challenger/severity-archival/chain_verified annotations survive across hops, archived findings NOT resurrected** — Issue 7).
- ⚠️ **Primary multi-hop correctness gate (now scoped by Issue 7):** the truncate-rebuild behavior is confirmed; the parity test above must prove annotation+archival survival, not merely finding survival, before flipping `ARCHON_DRIVE_BLACKBOX_MASTER_AGENT` for `hops>1`. Single-hop (default) is unaffected.

### 5.3 Block D — Freehand source review
- **New:** `squads/code-review/methodology/prompts/phase3_freehand_review_v1.md` (15-question senior-pentester methodology), `squads/code-review/methodology/templates/phase3_freehand_candidate_template.md` (9 fields incl. **Required black-box proof**), `test/parity-three-phase-source.test.js`.
- **Modified:** `src/dispatch/code-review-dispatcher.js` (verified anchors): add `const FH_MODE = __roots.flagMode ? __roots.flagMode('THREE_PHASE_SOURCE_REVIEW') : 'off'` above `PHASES` (line 59); **flag-conditional spread** `['…','phase2', ...(FH_MODE!=='off'?['freehand']:[]), 'verify','report']` (flag-off ⇒ byte-identical 8-element array, verified current shape); new `freehandPrompt(...)` beside `phase2Prompt` (verified `249`); new execution block between Phase 2 (`397–406`) and verify (`408`) guarded by `if (FH_MODE!=='off' && runPhase('freehand'))`, reusing `MAPPER_POOL`+`runWaves(WAVE=3)` (verified `58/59`); doc + `module.exports` add `freehandPrompt` + `maxFreehand`.
- **Key move:** active mode writes candidates to `${outDir}/phase2/freehand/<slug>.md` — every downstream consumer already globs `phase2/**/*.md` (AUDITOR `auditorPrompt` `273`, SCRIBE `scribePrompt` `283`, `normalizeCodeReviewFindings`), so candidates route through the **existing** gate with **zero** verifier/reporter edits. The template's "Required black-box proof" makes source-only novel candidates inherently **NEEDS-LIVE**, not CONFIRMED.
- **Flag:** `ARCHON_ENABLE_THREE_PHASE_SOURCE_REVIEW`. Off=phase absent; shadow=candidates to non-globbed sibling (`shadowDir/freehand-candidates/` or `${outDir}/phase3-freehand-shadow/`); active=`phase2/freehand/`. Cost cap `meta.maxFreehand` (default `maxPhase2`).
- **Verify:** `test/parity-three-phase-source.test.js` (flag-off PHASES deep-equals original 8-element array; flag-on inserts `freehand` between `phase2` and `verify`; active fhDir under `phase2/`, shadow fhDir outside; prompt contract; cost cap; evidence gate untouched).

### 5.4 Block E — Pattern catalogs as an engine
- **New:** `common/schemas/pattern_catalog.schema.json` (9 fields + 7-state enum, validated by `validate.js`), `common/patterns/index.json` (registry), `common/patterns/{access-control,xss}.json` (thin **descriptors** — markdown stays the single source of truth, IDs extracted by regex), `common/patterns/{sqli,ssrf,rce,account-takeover}.json` (full 9-field — the 4 verified `null`-catalog classes), `src/intel/pattern-catalog.js` (the only I/O; mtime-cached, fail-soft), `test/pattern-catalog.test.js`.
- **Modified:** `agents/finding-schema.js` — add frozen `PATTERN_OUTPUT_STATES` (7 states) + `normalizePatternState` near `normalizeSeverity` (verified `34`), export both; `normalizeFinding/validateFinding` untouched. `common/schemas/mapping.js` — add `mapDispositionToPatternState`/`mapPatternStateToAuditor` (never writes `validation_status`). `src/core/coverage-map.js` — add **pure** const `CATALOG_BY_CLASS` (no I/O — preserves the "Pure — no deps, no I/O" contract). `src/dispatch/code-review-dispatcher.js` `phase2Prompt` `catalogLine` (verified `254`) — gate catalog resolution via `pattern-catalog.catalogPathFor(cls)` only when active (fills the 4 null classes); flag-off keeps the literal `c.catalog ? … : '(no catalog…)'` (CLASS map nulls untouched). `src/pipeline/cross-view-dedup.js` — under flag, merge key = `f.pattern_id || deriveVulnClass(title)` (verified `correlate` `47`, `buildCorrelationMap` `75–76`); off = `deriveVulnClass` verbatim. `common/payloads/*.yaml` (verified 18 files) — additive `pattern_id/blackbox_indicators/false_positive_checks/suggested_validation_task` (agent-prompt only; **no JS parses YAML** — verified no `js-yaml` dep; ARCHON has only `parseYamlIsh` for handoff markers; invariant 8 keeps it that way).
- **Catalog format = JSON** (not YAML — no `js-yaml`, invariant 8/locked decision 6). Engine ships now (schema + loader + 4 gap classes + 2 descriptors + registry); the other ~14 spec categories are pure data added incrementally behind the same flag.
- **Flag:** `ARCHON_ENABLE_PATTERN_REVIEW` (off=byte-stable; shadow=load+validate+`pattern-recommendations.jsonl`, legacy markdown still injected; active=structured catalogs injected + pattern-ID merge).
- **Verify:** `test/pattern-catalog.test.js` (schema conformance via `validate.js` not ajv; **decision-5 parity: `patternIds('access-control').length===40` and `('xss')===50`** via markdown regex; `validationTaskFor` validates against `task.schema.json`; enum round-trip; flag-off byte-stable `phase2Prompt` + `correlate()`; fail-soft). + `test/parity-pattern-catalog.test.js`.

### 5.5 Block F — Typed correlation + chain records
- **New:** `src/pipeline/correlation-records.js` (`buildCorrelationRecords`, `buildChainRecords`, `_correlationDelta`, `_chainConfidence` — pure, read-only over findings); `test/parity-correlation-records.test.js`.
- **Modified:** `event-bus.js` — after `buildCorrelationMap` in the `hasWhitebox` branch (~`8307`): flag-gated `buildCorrelationRecords` → `shadowSink.append(eng,'correlation-records.jsonl', r)`; SCRIBE prompt + `correlation-<taskId>.json` spine unchanged. **Hook coverage (audit fix, Issue 9):** `buildCorrelationMap` is reached on the **operator generate-report path** (white-box default routes triage ON → awaiting-triage → operator → generate-report, so it normally fires). To close the non-triaged gap, **the same flag-gated `buildCorrelationRecords` hook is also added to the auto `extractAndSavePentestReport` path** where a correlation map is built, so triage-off white-box runs still emit `correlation-records.jsonl`. Documented: Block F records exist only on a **correlation-bearing report path** (a run that never builds a correlation map produces none — acceptable, shadow/observer-only). After Phase 3.6 chain block (~`6245`, `chainResults` in scope from ~`6175`): `buildChainRecords` → `chain-records.jsonl`. Phase 3.5 constructor prompt (~`6102–6104`): append the spec's 5-question chain checklist **only** under the flag (off = byte-identical).
- **Records:** Correlation `{correlation_id=CORR-<sha1[:10]>, linked_items, correlation_type∈[source_to_blackbox, blackbox_to_source, chain, duplicate, conflict], confidence_delta(advisory, clamped ±0.3), summary, recommended_next_task}`; Chain `{chain_id(alias), name, severity, finding_ids(≥1), steps, current_confidence(low/med/high), missing_proof(from step match_failure), next_validation_task}`. `current_confidence`/`missing_proof`/`next_validation_task` are **derived post-verification** — they live on the typed record, NOT the LLM `CHAIN_OUTPUT_SCHEMA` (kept minimal).
- **Confidence without weakening the gate:** `confidence_delta`/`current_confidence` are deterministic functions of existing signals only (`hasEvidence`, `validation_status`, judge verdict, `chain.verified`), **advisory**; the module never calls `enforceContract` and never writes `validation_status`.
- **`recommended_next_task` is a PROPOSAL object** (mode+dotted type+targets+objective) — diverges from the foundation's `task_id` string because **no task exists to reference yet**; Block A mints the task and back-fills `task_id`. Documented owner-override; consumers stay tolerant of the proposal shape until A lands.
- **Flag:** `ARCHON_ENABLE_CORRELATION_ENGINE` (off=never required; shadow=records to shadowDir + ingested by KG passive-listener when KG also on; active matters only to consumers A/white-box).
- **Verify:** `test/parity-correlation-records.test.js` (merge parity vs `correlate()`; **hard-gate invariant: positive `confidence_delta` + no evidence ⇒ `enforceContract` still NEEDS-LIVE, `validation_status` byte-identical**; ID idempotency; chain confidence/missing_proof; schema conformance via `validate.js`; fail-soft; flag-off no shadow writes; **records emitted on BOTH the operator-generate-report and the auto extractAndSavePentestReport correlation paths** — Issue 9).

### 5.6 Block R — Continuous reporting + evidence packages + report-quality gate
- **New:** `src/pipeline/report-stream.js` (`assembleReport`, `appendStream`, `reportContentDigest`, `SECTION_ORDER` — deterministic, no-LLM, idempotent); `test/report-stream.test.js`, `test/report-quality-judge.test.js`, `test/parity-continuous-report.test.js`.
- **Modified:** `agents/poc-evidence-capture.js` — add `writeEvidencePackage/readEvidencePackage` (repackages existing flat `poc-evidence/{taskId}/{findingId}.json` into `evidence/<candidate_id>/` tree; **no new capture**; `candidate_id`=existing finding id). `src/pipeline/evidence-completeness.js` — add `QUALITY_LEVELS` + **`meetsReportInclusion(finding, {engagementMode})` keyed on `validation_status` (audit fix, Issue 2)** + local `deriveQualityLevelFallback` (used only if STRICT_SCHEMA off); existing caps untouched. `agents/judge-verifier.js` — add `REPORT_QUALITY_SCHEMA` + `buildReportQualityPrompt` + `judgeReportQuality` + `applyReportQuality` (the Raptor 4-stage judge **completely untouched**); **never-drop floor keyed on `validation_status==='CONFIRMED'` (audit fix, Issue 2)**; never writes severity/`validation_status`. `scripts/run-judge-verifier.js` — add `runReportQuality` mirroring `runJudge`'s OAuth subprocess. `event-bus.js` — new Phase **3.95** (between judge 3.9 ~`6456` and SCRIBE 4 ~`6479`; **gated by `phaseEnabled('3.95',squad) && flagMode('STRICT_JUDGE_GATE')!=='off'`** — Issue 6); `appendStream` hooks at 3 phase boundaries; one conditional `buildscribeReportPrompt` block (flag-on only). `src/pipeline/pentest-phases.js` — `PHASE_MANIFEST` `3.95 tier:'optional'` (Issue 6).
- **Report inclusion is categorical, not numeric (audit fix, Issue 2 — the load-bearing change):**
  - `meetsReportInclusion(finding, {engagementMode})` returns **`true` for every `validation_status==='CONFIRMED'` finding regardless of `quality_level`** (incl. L0/L1 source/scanner-only CONFIRMED). `quality_level` is used only to **label/order** findings (e.g. tag a CONFIRMED L1 as "source-confirmed") and to gate **non-CONFIRMED** advisory items (a NEEDS-LIVE L0 may be omitted from the main report and surfaced in an appendix). It can **never exclude a CONFIRMED finding.**
  - **Never-drop floor:** `applyReportQuality` clamps any report-quality `exclude` verdict to `needs_polish` **whenever `validation_status==='CONFIRMED'`** — independent of `quality_level`. The earlier `quality_level>=L2` keying is removed; it would have let a level signal exclude a finding the categorical evidence gate already CONFIRMED, violating invariant 2 in spirit. The Raptor judge and `validation_status` are untouched; report-quality only annotates.
- **Parity is structural:** a deterministic assembler can't byte-match LLM prose — parity = `reportContentDigest` (finding-set/severities/coverage rows) ≡ terminal SCRIBE's cited findings. Terminal SCRIBE stays authoritative until the parity gate is green.
- **Flags:** `ARCHON_ENABLE_CONTINUOUS_REPORT` + `ARCHON_ENABLE_STRICT_JUDGE_GATE` (both off=current; shadow=stream to shadowDir + report-quality validate-and-log; active owner-gated post-parity).
- **Verify:** `test/report-stream.test.js` (idempotency, **CONFIRMED-always-included gate at any quality_level incl. L0/L1** — Issue 2, never-drop, flag-off no file, fail-soft, digest parity); `test/report-quality-judge.test.js` (annotates only, **every CONFIRMED finding never excluded regardless of quality_level** — Issue 2, LLM error ⇒ needs_polish); `test/parity-continuous-report.test.js` (streaming digest ≡ terminal; evidence-package completeness; **drops ZERO CONFIRMED findings at any quality_level**).

---

## 6. Sequenced roadmap

### 6.0 Tier-1 cleanup prerequisite (locked decision 8)
**Before any schema-touching work (P1+):** complete Tier-1 cleanup. Schema/mapping work assumes a clean `finding-schema.js`/`cross-view-dedup.js`/`coverage-map.js` surface; doing it on drift multiplies the parity-golden churn. **Gate: Tier-1 done → P1 may start.**

### 6.1 Dependency graph

```
                P0 (flags + shadow + engagement-mode + verification harness + manifest reg)
                          │ (everything gates on flagMode)
        ┌─────────────────┼───────────────────────────────┐
        ▼                 ▼                                 ▼
   P1 Block C        (P0 alone enables)                (Tier-1 cleanup ── prereq for P1)
   schemas/IDs/mapping
        │
   ┌────┼───────────────┬──────────────┐
   ▼    ▼               ▼              ▼
  P2 D  P3 E          P4 B            (C feeds all)
 freehand patterns    KG (passive)
   │      │             │
   └──┬───┘             │
      ▼                 │
   P5 F  (needs C + P0 shadow; KG optional consumer) ◄──┘
      │
      ▼
   P6 mode-routing/white-box  +  Block A Director   (need P0; A soft-needs B/C/F)
      │
      ▼
   P7 Block R  (needs P0; C for quality_level w/ fallback; F optional for chains)
```

### 6.2 Phases (each: changes · gating flag · shadow rollout · MECHANICAL exit)

**P0 — Flags + shadow + mode-routing scaffold + verification harness.**
- Changes: `paths.flagMode/flagEnabled/shadowDir`; `src/shadow/shadow-sink.js`; `src/core/engagement-mode.js` (classifier reads `meta.sourceDir`/`meta.sourceGuided`/resolved engagement `sourceDir`; `assertModeContract` strips `deployUrl` for static — Issues 1+5); `src/pipeline/shadow-recorder.js`; **register `3.088`/`3.95` in `PHASE_MANIFEST` as optional (Issue 6)**; test harness (`shadow-diff.js`, `golden.js`, `flag-off-byte-stable.test.js`, `mode-contract.test.js`, `dispatch-routing.test.js`); wire `assertModeContract` at both dispatch boundaries; CI workflow incl. the ajv/js-yaml grep-gate (Issue 8); grep-gate for direct env reads. Optional Docker.
- Flag: master + family defined, all off.
- Shadow: n/a (substrate).
- **Exit:** `test/feature-flags.test.js` + `flag-off-byte-stable.test.js` green; createDispatch byte-identical to golden with all flags off (incl. all non-combined paths — Issue 3); `assertModeContract` throws on blackbox+codeReview and strips `deployUrl` for static so PROBER never spawns (Issue 5); **source-guided pentest dispatch classifies whitebox at the event-bus boundary (Issue 1)**; `phaseEnabled('3.088'/'3.95')` resolvable under explicit `enabledPhases` (Issue 6); CI 3-job matrix passing; grep finds **zero** direct `process.env.ARCHON_ENABLE_*` reads outside `paths.js` and **zero** `require('ajv')`/`require('js-yaml')` (Issue 8).

**P1 — Block C schemas/IDs/mapping** (after Tier-1).
- Changes: 6 schemas + `validate.js` (dependency-free) + `mapping.js`; `test/schema-conformance.test.js` (imports `validate.js`, never ajv).
- Flag: `ARCHON_ENABLE_STRICT_SCHEMA` (validate-and-log).
- Shadow: candidate enrichment + `schema-divergence.jsonl`; `normalizeFinding` untouched.
- **Exit:** every legacy fixture validates after auto-repair (zero rejected); enum round-trip both directions (incl. severity `Info`); **invariant test: mapping never writes `validation_status`**; **invariant test: a CONFIRMED record at any quality_level round-trips unchanged (Issue 2)**; **hard gate: no new runtime dep — `npm ls` shows no ajv/js-yaml, grep-gate green (Issue 8)**; flag-off byte-stable goldens unchanged.

**P2 — Block D freehand.**
- Changes: 2 methodology files + dispatcher edits (FH_MODE, conditional PHASES spread, `freehandPrompt`, guarded execution block).
- Flag: `ARCHON_ENABLE_THREE_PHASE_SOURCE_REVIEW`.
- Shadow: candidates to non-globbed sibling; AUDITOR/SCRIBE/normalizer never see them.
- **Exit:** `test/parity-three-phase-source.test.js` — flag-off PHASES deep-equals original 8-element array; flag-on inserts `freehand` between `phase2`/`verify`; active fhDir under `phase2/`, shadow outside; evidence gate files unchanged. Precision tuned on a known-vuln corpus before DRIVE.

**P3 — Block E patterns.**
- Changes: `pattern_catalog.schema.json` + `index.json` + 6 catalog JSONs + `pattern-catalog.js`; `finding-schema` 7-state exports; `mapping.js` state mappers; `coverage-map.CATALOG_BY_CLASS`; gated `phase2Prompt`/`cross-view-dedup` edits; payload YAML additive fields.
- Flag: `ARCHON_ENABLE_PATTERN_REVIEW`.
- Shadow: `pattern-recommendations.jsonl`; legacy markdown still injected.
- **Exit:** `test/pattern-catalog.test.js` — all catalogs validate (via `validate.js`); `patternIds('access-control')===40` & `('xss')===50`; `validationTaskFor` validates against `task.schema.json`; flag-off `phase2Prompt`+`correlate()` byte-identical; `coverage-map` stays pure (existing coverage-map tests green).

**P4 — Block B KG (passive).**
- Changes: `knowledge-graph.js` + widened `attack-graph` type keys; `test/knowledge-graph.test.js` + `test/kg-jsonl-parity.test.js`.
- Flag: `ARCHON_ENABLE_KNOWLEDGE_GRAPH` (passive-listener).
- Shadow: derive at phase boundaries; no engine reads it.
- **Exit:** KG-vs-JSONL parity (finding-node count/id parity; every correlation/chain edge maps to a `cross-view-dedup` merge decision); idempotent re-sync; read-purity (observe/query never mutate); flag-off ⇒ no `kg/` dir.

**P5 — Block F typed records.**
- Changes: `correlation-records.js`; event-bus shadow call-sites on **both** the operator-generate-report and auto-extractAndSavePentestReport correlation paths (Issue 9); gated Phase 3.5 checklist.
- Flag: `ARCHON_ENABLE_CORRELATION_ENGINE`.
- Shadow: records to shadowDir + KG passive ingest (when KG on).
- **Exit:** `test/parity-correlation-records.test.js` — merge parity vs `correlate()`; **hard-gate invariant (positive delta + no evidence ⇒ NEEDS-LIVE)**; ID idempotency; schema conformance; **records emitted on both report paths (Issue 9)**; flag-off no shadow writes; flag-off Phase 3.5 prompt byte-identical.

**P6 — Mode-routing/white-box + Block A Director.**
- Changes: `whitebox-correlation.js` + dashboard/event-bus sequencing (surgical writeInbox skip, `sourceGuided` stamp, persisted-signal launch, recovery sweep, Phase 3.088 whitebox+crTaskId hard-guard) + planner/specialist source-guidance blocks; `mission-director.js` + event-bus wrap at the `dispatchPentestParallel` call + terminal-hop annotation/archival re-run for multi-hop.
- Flags: `ARCHON_ENABLE_SOURCE_GUIDED_PENTEST`, `ARCHON_ENABLE_BLACKBOX_MASTER_AGENT` (+ DRIVE).
- Shadow: `whitebox-plan-<eng>.md` + `director-recommendations.jsonl`; legacy parallel/single-hop drives.
- **Exit:** `test/mission-director.test.js` (flag-off identity; cap/scope/active-poc/evidence-gated stop) + `test/parity-mission-director.test.js` (hop-0 identical; recommendations ⊇ followup coverage; **multi-hop CONFIRMED findings AND challenger/severity-archival/chain_verified annotations survive; archived NOT resurrected — Issue 7, resolved**) + `test/whitebox-correlation.test.js` (**source-guided pentest classifies whitebox at both boundaries — Issue 1**; mode contract; source→live; live→source; **Phase 3.088 no-op unless whitebox+crTaskId — Issue 4**; **never writes pentest VALIDATED-FINDINGS**; **launch honors persisted deferral even with flag flipped off, recovery sweep adopts orphans — Issue 3**; fallback; flag-off byte-stable). DRIVE flip is per-engagement owner sign-off after shadow diffing; `hops>1` additionally requires the annotation-survival gate green (Issue 7).

**P7 — Block R reporting.**
- Changes: `report-stream.js` + evidence packages + `evidence-completeness.meetsReportInclusion` (CONFIRMED-keyed — Issue 2) + report-quality judge (never-drop floor CONFIRMED-keyed — Issue 2) + Phase 3.95 (`phaseEnabled`+flag — Issue 6) + appendStream hooks.
- Flags: `ARCHON_ENABLE_CONTINUOUS_REPORT`, `ARCHON_ENABLE_STRICT_JUDGE_GATE` (+ DRIVE).
- Shadow: stream to shadowDir; report-quality annotate-only; evidence packages for inspection.
- **Exit:** `test/parity-continuous-report.test.js` — streaming digest ≡ terminal SCRIBE cited findings; evidence-package completeness; **report inclusion drops ZERO CONFIRMED findings at any quality_level (Issue 2)**; flag-off `buildscribeReportPrompt`+`reports/<taskId>.md` byte-stable. Promote streaming→canonical only post-parity + owner DRIVE.

---

## 7. End-to-end wiring walkthroughs (no dangling seams)

### 7.1 WHITE-BOX engagement (all flags ACTIVE) — source → source-guided pentest → bidirectional → KG → Director re-plan → continuous report

| Hop | Module / file (anchor) | What flows |
|---|---|---|
| 1. Dispatch | `scripts/dashboard.js createDispatch` combined branch (`334`) | `meta.sourceDir`+`targetUrl` → `classifyEngagementMode` = **whitebox** → `assertModeContract` ok (keeps code-review `deployUrl`, whitebox case). ACTIVE: write **only** the code-review dispatch (`crTaskId`); **surgically skip only the combined-pentest writeInbox at `398`** (Issue 3); stash `engagement.deferredPentestDispatch` (stamped `meta.sourceGuided=true`) on `engagement-<root>.json`; pentest iteration `status:'pending-source-guidance'`. Two iterations recorded: `blackbox`(deferred) + `whitebox`. |
| 2. Route | `event-bus.js dispatchToAgent` → `code-review` branch → `runCodeReview` → `src/dispatch/code-review-dispatcher.js` | PHASES run: inventories→blueprint→discovery→mapping→consolidate→**phase2 (pattern, Block E catalogs incl. the 4 now-filled classes)**→**freehand (Block D, `phase2/freehand/`)**→verify→report. Scope 0.0 validated; PROBER runtime-validates (deployUrl present — whitebox). |
| 3. Source candidates | AUDITOR Phase 2v (`auditorPrompt` `273`, globs `phase2/**/*.md` incl. freehand) → SCRIBE → `normalizeCodeReviewFindings` (~`8218`) → `VALIDATED-FINDINGS-<crTaskId>.jsonl` (CR-`n`, CONFIRMED/NEEDS-LIVE) | Block C `toCandidateFinding` enriches (candidate_id, source='pattern'/'freehand', quality_level via `deriveQualityLevel` — label only). |
| 4. SOURCE→LIVE | completion hook (~`8657`) → `whitebox-correlation.maybeLaunchSourceGuidedPentest` (**launch driven by persisted `deferredPentestDispatch`+`pending-source-guidance`, no flag re-read** — Issue 3) → `buildSourceGuidance` | reads `feature-queue.json` + `VALIDATED-FINDINGS-<crTaskId>.jsonl` → `source-guidance-<pentestTaskId>.json` (`candidate_targets` + `suggested_blackbox_task` + `priority_classes`). `writeInbox` the deferred pentest dispatch (carrying `meta.sourceGuided=true` + `meta.sourceGuidanceFile`). FALLBACK: empty bundle ⇒ launch un-guided. Recovery sweep adopts the deferral if the hook never fired. |
| 5. Live route + Director | `event-bus.js` → **classify deferred dispatch = whitebox** (via `meta.sourceGuided` — Issue 1) → `parallel-phases` branch → **`missionDirector.run(dispatch, deps)`** (~`8683`) | hop 0 = full `dispatchPentestParallel` (scope 0.0 → recon → **`runAttackPlanner` reads `sourceGuidance`** (`2886`) → ATLAS seeds source-flagged hypotheses → specialists get `sourceGuidanceBlock` (`3653`) → AUDITOR 3 → ARBITER 3.9). Source candidates remain hypotheses — gated by scope+AUDITOR+evidence-contract. |
| 6. LIVE→SOURCE | Phase **3.088** (after `runReplanLoop` `5955`, **hard-guarded: whitebox + non-empty crTaskId/sourceGuidanceFile — Issue 4**) → `whitebox-correlation.buildRootCauseRequests` | match live↔source by `(deriveVulnClass, findingLocus)`: matched → hybrid inherits source `file:line`; unmatched → `root-cause-request-…json` → one focused source-tracer → `root-cause-<pentestTaskId>.md`. |
| 7. Typed records | Phase 3.6 chain site + report correlation site (operator-generate **and** auto-extract paths — Issue 9) → `correlation-records.buildCorrelationRecords/buildChainRecords` (Block F) | `source_to_blackbox`/`blackbox_to_source`/`conflict`/`duplicate`/`chain` records → `correlation-records.jsonl` + `chain-records.jsonl`. `recommended_next_task` proposals. **Advisory `confidence_delta` never flips the gate.** |
| 8. KG | `knowledge-graph.syncEngagement(engagementId)` (Director update-KG step + Block F passive ingest) | `resolveEngagement` unifies both iterations into one `kg/<engagementId>/graph.json`: Feature/SourceFile/CandidateFinding/ConfirmedFinding/AttackChain/Correlation nodes; `CANDIDATE_CORRELATES_WITH_{SOURCE,BLACKBOX}`, `FINDING_PART_OF_ATTACK_CHAIN`, `HYPOTHESIS_TARGETS_FEATURE` edges. `observe()` surfaces `recommendedTasks`. |
| 9. Director re-plan | `missionDirector.decideNext` (deterministic) | continue iff hop<cap && spent<budget && !cancelled && !awaitingTriage && (highValueFollowups ∪ coverageGaps ∪ sourceHypotheses). Scope re-validated before each extra hop. Focused hop: `meta.skipRecon=true` + `meta.focusClasses` + `meta.mdHypotheses`. Same `taskId`. **For `hops>1`, terminal hop re-runs annotation/archival (3.055/3.075/3.6) over the cumulative union before report (Issue 7).** |
| 10. Report | SCRIBE Phase 4 (cross-view prompt + `root-cause-*.md` input, `8303`) — authoritative; **Block R** Phase 3.95 (report-quality judge + evidence packages) + `report-stream.appendStream` (shadow/active) | each hybrid finding: live proof + source root cause + feature + repro + impact + fix. **Inclusion keyed on `validation_status==='CONFIRMED'` (any quality_level — Issue 2); `quality_level` labels only.** Report-quality annotates (never excludes any CONFIRMED finding). Terminal `reports/<taskId>.md` canonical until streaming parity green. |

**Seam check:** every artifact a downstream hop reads is written by a named upstream hop (guidance bundle 4→5, root-cause 6→10, typed records 7→8, KG 8→9). The deferral is launched off a persisted signal (1→4), the deferred dispatch self-identifies as whitebox (4→5, Issue 1), Phase 3.088 self-guards on whitebox+source (Issue 4), and report inclusion is categorical (Issue 2). No dangling reference.

### 7.2 BLACK-BOX engagement (Director ACTIVE, others off-or-shadow)

| Hop | Module (anchor) | What flows |
|---|---|---|
| 1. Dispatch | `dashboard.js createDispatch` (`304`) | `squad:'pentest'`, **no `sourceDir`, no `sourceGuided`, no engagement `sourceDir`** → `classifyEngagementMode` = **blackbox** → `assertModeContract(willSpawnCodeReview:false)` ok. One iteration `kind:'blackbox'`. No code-review dispatch (contract). |
| 2. Route + Director | `event-bus.js` → `parallel-phases` → `missionDirector.run` (~`8683`) | hop 0 = full `dispatchPentestParallel`: scope 0.0 (fail-closed) → recon → env-fingerprint 0.6 → strategist 1.9 → specialists 2 → AUDITOR 3 → exploit-prover 3.085 → re-plan 3.087 (`followup-plan-<taskId>.json`) → chains 3.5/3.6 → ARBITER 3.9 → SCRIBE 4. **Phase 3.088 is a no-op (not whitebox, no crTaskId — Issue 4) — no source/code-review spawn possible.** |
| 3. Observe | `missionDirector.observeEngagement` | reads findings JSONL + `followup-plan` + `coverage-map.computeCoverage` + `KG.observe` (if KG on). `eMode==='blackbox'` ⇒ no source sibling read. |
| 4. Decide + focus hop | `decideNext` → focused `dispatchPentestParallel` (`skipRecon`, `focusClasses`) | deterministic, evidence-gated; scope re-validated; default `ARCHON_AUTONOMY_HOPS=1` ⇒ one hop unless operator raises it (and `hops>1` requires the Issue-7 annotation-survival gate). Advisory `prompts/mission-director/v1.md` cannot extend past cap. |
| 5. KG (if on) | `knowledge-graph.syncEngagement` | engagement = taskId (single iteration). Passive; drives nothing unless Director reads `observe()`. |
| 6. Report | SCRIBE Phase 4 → `extractAndSavePentestReport` → `reports/<taskId>.md` | last hop's report canonical. **No code-review ever ran** (contract holds end-to-end; Phase 3.088 stayed a no-op — Issue 4). |

**Seam check:** the Director only ever calls `dispatchPentestParallel` (never `runCodeReview`); static-mode code-review is a separate branch the Director isn't wired into; Phase 3.088 self-guards on whitebox. Black-box and static can never cross — even with `ARCHON_ENABLE_SOURCE_GUIDED_PENTEST` globally on (Issues 1+4).

---

## Flagged uncertainties (status after audit fold-in)

1. ✅ **RESOLVED — ajv vs `validate.js`.** Hard invariant 8 + P1 gate: schemas and tests import the dependency-free `common/schemas/validate.js`; ajv/js-yaml are forbidden by the grep-gate and CI Job C. Future need for draft-2020-12 conditionals is **OPEN DECISION D-1** (default: stay on `validate.js`).
2. ✅ **RESOLVED (scoped) — `dispatchPentestParallel` truncate-rebuild.** Confirmed truncate-rebuild from the append-only ACTIVITY-LOG: CONFIRMED findings survive, but in-place annotations (challenger 3.055, severity-archival 3.075, chain_verified 3.6) are overwritten and archived findings resurrected across hops (Issue 7). Fix folded into §5.2: terminal-hop re-run of annotation/archival over the union for `hops>1`; P6 parity test asserts annotation+archival survival. Single-hop default unaffected.
3. ✅ **RESOLVED — Severity enum casing.** `CANONICAL_SEVERITIES = ['Info','Low','Medium','High','Critical']` (uses `Info`). `mapping.js`/`candidate_finding.schema.json` enum use `Info`; round-trip test in P1.
4. ⚠️ **Monitored — `recommended_next_task` shape.** Block F emits a proposal object; Block A back-fills `task_id`. Consumers stay tolerant of the proposal shape until A lands. Documented owner-override; no blocker.
5. ⚠️ **Monitored — event-bus.js line anchors drift** (~10K-line file). Wire by named function/region; confirm the line at edit time. Process note, not a blocker.
6. ✅ **RESOLVED — white-box code-review-throws-before-hook + flag-skew orphan.** Launch is driven by the persisted `deferredPentestDispatch`+`pending-source-guidance` signal (not a daemon flag re-read), and a daemon recovery sweep adopts any orphaned deferral (Issue 3 + the broader skew case). The live side can no longer be silently dropped.
7. ⚠️ **Monitored — Cost/latency.** Active source-guided white-box sequences code-review→pentest (~2× wall-clock) and stacks two engagements' spend against `squad.json maxCostUsd`. Mitigated by `priority_classes` focusing + per-engagement budget caps + `ARCHON_AUTONOMY_HOPS=1` default; monitor under shadow before DRIVE. No blocker.

**Open decisions outstanding:** only **D-1** (validate.js vs ajv for future draft-2020-12 conditionals; default = validate.js, nothing in this build depends on it). All three MAJOR audit blockers and the four MINOR issues are folded in with concrete wiring; none remains an open blocker.

---

## Relevant absolute paths for the build

Net-new unless noted: `paths.js` (modify), `src/shadow/shadow-sink.js`, `src/core/engagement-mode.js`, `common/schemas/`, `common/patterns/`, `src/intel/knowledge-graph.js`, `src/intel/pattern-catalog.js`, `src/orchestrator/mission-director.js`, `src/dispatch/whitebox-correlation.js`, `src/pipeline/correlation-records.js`, `src/pipeline/report-stream.js`; modify: `event-bus.js`, `scripts/dashboard.js`, `src/dispatch/code-review-dispatcher.js`, `src/pipeline/pentest-phases.js` (PHASE_MANIFEST 3.088/3.95), `agents/finding-schema.js`, `agents/judge-verifier.js`, `agents/poc-evidence-capture.js`, `src/pipeline/{cross-view-dedup,evidence-completeness,attack-planner,attack-graph}.js`, `src/core/coverage-map.js`, `scripts/run-judge-verifier.js`, `agents/auditor-validated-builder.js` (terminal-hop annotation re-run wiring, Issue 7).

---

## Audit resolution log

| # | Severity | Audit issue | How the final plan resolves it | Where folded in |
|---|---|---|---|---|
| 1 | MAJOR | Mode classifier keys whitebox on `meta.sourceDir`, which the pentest dispatch never carries (it's on crMeta/engagement record) → source-guided pentest mis-classifies as blackbox at the event-bus boundary. | Classifier input pinned to fields the pentest dispatch actually carries: primary explicit marker `meta.sourceGuided=true` (stamped on the deferred dispatch), plus fallback resolution of `engagement-<meta.engagementId>.json.sourceDir` (`engagementId` is present at dashboard.js:335). Test asserts whitebox classification at **both** boundaries. | §1 inv. 5, §3.1 table+rationale, §3.2 step 1, §3.3, §5.0 F-Flags verify, §5.1, §6 P0/P6 exits, §7.1 hops 1/4/5 |
| 2 | MAJOR | Block-R never-drop floor keyed on `quality_level>=L2` lets a level signal exclude a CONFIRMED finding from the report — violates the evidence-gate spirit. | Never-drop floor **and** `meetsReportInclusion` re-keyed on `validation_status==='CONFIRMED'` (any quality_level, incl. L0/L1). `quality_level` labels/orders only, never excludes a CONFIRMED finding. Added as invariant-2 corollary + dedicated tests. | §1 inv. 2 corollary, §2.3 "label not a gate", §5.6 inclusion+floor, §6 P1/P7 exits, §7.1 hop 10 |
| 3 | MAJOR | Deferral decision (dashboard) and launch (daemon) each read the flag independently → flag skew orphans the live side; writeInbox skip not surgical. | Flag gates **only** the one-time createDispatch deferral fork; the writeInbox skip at dashboard.js:398 is surgical (combined-pentest-active only). Daemon launch is driven by the **persisted** `deferredPentestDispatch`+`pending-source-guidance` signal (no flag re-read) + un-guided fallback + recovery sweep. Skew is structurally impossible. | §3.2 dual-process section + recovery sweep, §4.2 matrix note, §5.1, §6 P0/P6 exits, §7.1 hops 1/4 |
| 4 | MAJOR | Phase 3.088 source-tracer spawn gated only by the behavioral flag, not per-engagement source presence → a black-box run with the flag globally on could reach a code-review spawn. | Phase 3.088 hard-guarded on `eMode==='whitebox'` **AND** non-empty `crTaskId`/`sourceGuidanceFile`; no-op otherwise. Black-box can never spawn source/code-review even with flag on. Test asserts no-op. | §3.2 LIVE→SOURCE, §5.1, §7.1 hop 6, §7.2 hops 2/6 |
| 5 | MINOR | `code-review + operator deployUrl` standalone is unclassified by the table and fires PROBER (a live hit) in static mode. | `assertModeContract` strips `meta.deployUrl→null` for static at the boundary (not relying on caller); combined/whitebox keeps deployUrl (PROBER legitimate). Two legitimate deployUrl paths defined; test: static dispatch with deployUrl ⇒ PROBER never spawns. | §3.1 table + resolution para, §5.0/§5.1 verify, §6 P0 exit |
| 6 | MINOR | New phases 3.088/3.95 absent from PHASE_MANIFEST → a squad with explicit `enabledPhases` silently disables them (phaseEnabled fail-closed). | Both registered in `PHASE_MANIFEST` as `tier:'optional'`; each gated by `phaseEnabled(id,squad) && flagMode(flag)!=='off'`. Consistent approach for both phases. | §1 inv. 1 + §1a, §5.0 F-Flags, §5.6, §6 P0 exit |
| 7 | MINOR | VALIDATED-FINDINGS is truncate-rebuilt from the append-only log: CONFIRMED survive across hops but in-place annotations (challenger/severity-archival/chain_verified) are blown away and archived findings resurrected; plan's parity test was insufficient. | Confirmed root cause. Terminal Director hop re-runs annotation/archival phases (3.055/3.075/3.6) over the cumulative union before SCRIBE; P6 parity test expanded to assert annotation+archival survival and non-resurrection. Required only for `hops>1`; single-hop default unaffected. | §5.2 multi-hop section + verify, §6 P6 exit, §7.1 hop 9, uncertainty #2 |
| 8 | MINOR | No ajv/js-yaml in package.json; an unreconciled `require('ajv')` would throw MODULE_NOT_FOUND. | Promoted to hard invariant 8 + P1 exit gate: dependency-free `validate.js` imported everywhere; grep-gate + CI Job C fail on any `require('ajv')`/`require('js-yaml')`; catalogs are JSON. | §1 inv. 8, §2.1/§2.3, §4.1 grep-gate, §5.0 F-Schemas/F-Verification, §6 P0/P1 exits |
| 9 | MINOR | `buildCorrelationRecords` hooked only after the single `buildCorrelationMap` in the operator generate-report path → triage-off (auto) white-box reports emit no correlation-records. | Hook added to the auto `extractAndSavePentestReport` correlation path too; documented that Block F records exist on any correlation-bearing report path. Test asserts emission on both paths. | §5.5 hook coverage, §6 P5 exit, §7.1 hop 7 |