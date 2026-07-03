# ARCHON × Autonomous Agent OS — Fit & Build Plan

*Synthesis across all 11 spec section digests, mapped to the live codebase at `the repo root`. Status legend: ✅ have · 🟡 partial · ❌ missing.*

---

## 1. The idea in one page

The **Autonomous Agent OS** is a re-framing of ARCHON, not a replacement for it. The spec's own thesis (from `00_START_HERE` + `README`) is explicit: **keep the current UI, operator workflow, model (Claude subscription via OAuth), and product identity — upgrade the backend intelligence only.** The mandatory backbone is unchanged and is called the **Golden Spine**:

> Recon → Attack Plan → Specialists → Auditor → Judge → Report, with a re-plan-from-evidence loop.

What the spec *adds* on top of that spine is a north-star control model:

> **Operator Prompt → Mission Director → (Scope + Safety + Knowledge Graph) → Golden Spine → re-plan loop**

The three ideas that are the *heart* of the upgrade — and that distinguish the OS from ARCHON-as-it-stands-today — are:

1. **A standing autonomous Mission Director loop.** Today ARCHON runs a deterministic, fail-soft phased pipeline (`dispatchPentestParallel` in `event-bus.js`) with a one-shot ATLAS re-plan at Phase 3.087 and an opt-in, hop-capped `ARCHON_AUTONOMY` re-dispatch. The OS wants a controller that *continuously* observes engagement state, identifies missing coverage, generates hypotheses, assigns work, validates, updates the graph, and decides "continue vs. report" — agents pick their own next actions after dispatch instead of the operator issuing step-by-step commands.

2. **A shared, persistent Knowledge Graph as the single source of truth.** Today the data layer is per-task JSONL/JSON under `var/intel` (`live-findings → VALIDATED-FINDINGS → JUDGED-FINDINGS`, `endpoint-models-<taskId>.jsonl`, `attack-plan-<taskId>.json`, `correlation-<taskId>.json`) plus a **per-task** `attack-graph-<taskId>.json`. The OS wants one queryable graph (assets, endpoints, code maps, hypotheses, evidence, findings) that all engines read/write and that can persist across engagements.

3. **Formal machine-readable contracts + canonical JSON schemas, enforced end-to-end.** Today shapes are enforced *imperatively* in JS (`agents/finding-schema.js`, `src/pipeline/evidence-contract.js`, `agents/phase-envelope.js`) and via markdown methodology templates. The OS wants declared `task / evidence / candidate_finding / source_feature_map` JSON Schemas and a uniform agent input/output contract that wires `task → evidence → candidate → feature_map` together by stable IDs.

The remaining non-negotiables of the spec — deterministic core (scope, task state, schema validation, report assembly, contracts, finding gates) + AI on top (planning, hypothesis, source understanding, business logic, prioritization, freehand); **"no evidence, no finding"**; **3-phase source review** (feature mapping → pattern → freehand, with pattern *and* freehand both mandatory); and **black-box ↔ white-box correlation** — are **already substantially implemented** in ARCHON. The single white-box deficit is the **third (freehand) source-review phase**.

The migration principle (§09) governs *how* to build all of this: preserve current UI/workflows/execution first; add the autonomous architecture behind **feature flags**, run it in **shadow mode**, and enable modules one-by-one only after the existing product stays stable.

---

## 2. Fit verdict (lead with this)

**ARCHON already implements roughly 80% of the Autonomous Agent OS spec — and in several places it is a strict superset of what the spec describes.** This is an *intelligence-layering and formalization* project, not a rebuild.

What is already done, verified across the digests:

- **The entire Golden Spine is built and the essential phases can never be gated off.** `dispatchPentestParallel` (`event-bus.js:4368`) runs scope(0.0) → fingerprint(0.6) → recon(1.x) → attack-plan(1.9) → specialist waves(2) → AUDITOR(3) → judge(3.9) → SCRIBE(4); `src/pipeline/pentest-phases.js` marks exactly this spine `essential` so `phaseEnabled()` always returns true for it.
- **The deterministic-core + AI-on-top split the spec demands already exists.** Scope (`agents/scope-prevalidator.js`, fail-closed), evidence contract (`src/pipeline/evidence-contract.js`), AUDITOR gate (`agents/auditor-validated-builder.js`), judge + consensus (`agents/judge-verifier.js` 4-stage Raptor + ARBITER), and report assembly (SCRIBE Phase 4) are all deterministic; planning/hypotheses/source-understanding are LLM-driven (`attack-planner.js`, code-review feature mapping).
- **"No evidence, no finding" is enforced as a hard gate**, not a guideline — `evidence-contract.js` demotes a CONFIRMED finding without replayable evidence to NEEDS-LIVE, inside `auditor-validated-builder.js`.
- **Black-box ↔ white-box correlation exists** deterministically: `src/pipeline/cross-view-dedup.js` merges the two views by `{kind, vuln-class, locus, param}` into `correlation-<taskId>.json` and instructs SCRIBE to emit one merged entry at worst severity.
- **The attack-chain engine is real**: `src/pipeline/attack-graph.js` (multi-hop discovery) + `chain-verifier.js` (deterministic curl/openssl/dig replay) + `browser-verifier.js`.
- **Two of the three source-review phases are faithfully implemented** with a substantial methodology pack (`src/dispatch/code-review-dispatcher.js` + `squads/code-review/methodology/`).

The genuinely-new work concentrates into **six building blocks** (Section 4) plus the **migration scaffolding** (`ARCHON_ENABLE_*` flags, shadow mode), none of which exist today but most of which **bolt onto existing modules rather than replacing them.** The risk profile is therefore inverted from a typical greenfield: the danger is *regressing ARCHON's existing strengths by implementing the spec's thinner one-liners literally*, not failing to build the capability.

---

## 3. Capability fit matrix

> Grouped by spec section. Representative capabilities + every notable gap. Evidence cites live ARCHON files from the digests.

### Section 01 — System Architecture

| Spec capability | Status | ARCHON evidence | What's needed |
|---|---|---|---|
| Golden Spine (Recon→Plan→Specialists→Auditor→Judge→Report) | ✅ | `event-bus.js:4368` `dispatchPentestParallel`; `pentest-phases.js` PHASE_MANIFEST marks spine `essential` | Nothing — preserve |
| Mission Director (owns engagement, decides next work) | 🟡 | No persona/loop; closest = NEXUS daemon + ATLAS + Phase 3.087 re-plan + `ARCHON_AUTONOMY` hop; `goal-evaluator.js` + `early-exit-decision.js` give done-condition | Standing bounded decision loop (Block A) |
| Scope Engine | ✅ | `scope-prevalidator.js` (0.0 fail-closed) + `scope-validator.js` | Nothing — stronger than spec |
| Safety Engine | ✅/🟡 | `active-poc-policy.js` 3-gate + complexity scoring (0.7) | "Test intensity" as a single dial (see §03) |
| Knowledge Graph (single source of truth, persistent, shared) | 🟡 | Per-task JSONL + `attack-graph-<taskId>.json` (`attack-graph.js:50`); not unified, not cross-engagement | Persistent shared KG (Block B) |
| Recon Engine | ✅ | SCOUT/RANGER/TRACER + `nmap-scan.js` + `env-fingerprint.js` + `endpoint-analyzer.js` | Nothing — exceeds spec |
| Attack Planner (facts→hypotheses) | ✅ | `attack-planner.js` (1.9) over WSTG `coverage-map.js` | Nothing |
| Source Review (3 phases) | 🟡 | `code-review-dispatcher.js`: mapping ✓ + pattern ✓; "Phase 3" is SCRIBE merge, not freehand | Freehand phase (Block D) |
| Correlation + Attack Chain Engine | ✅ | `cross-view-dedup.js` + `attack-graph.js` + `chain-verifier.js` | Typed records (Block F) |
| Auditor / Judge / Evidence Engine | ✅ | `auditor-validated-builder.js`; `judge-verifier.js`; `evidence-contract.js` + `poc-evidence-capture.js` | Nothing |
| Report Engine (continuously builds) | 🟡 | SCRIBE Phase 4 produces one terminal dossier | Continuous/streaming assembly (Block F/roadmap P7) |
| Autonomous loop (observe→plan→assign→validate→update KG→decide) | 🟡 | All sub-steps exist; runs as linear pipeline + one opt-in hop | Connective loop + KG sink (Blocks A+B) |

### Section 02 — Autonomous Decision Engine

| Spec capability | Status | ARCHON evidence | What's needed |
|---|---|---|---|
| Standing Mission Director (delegates, never runs tools) | ❌ | No `MissionDirector`/`mission-director` anywhere; ATLAS SOUL says "Mission Commander" but is a prompt persona | Build Block A |
| Engagement-mode classification (blackbox/static/whitebox/hybrid) | 🟡 | Derived from squad+config (`getSquadDispatchType` 8616; `kind` 8288-8303); no auto/hybrid decision | Mode classifier in director |
| Initial plan + hypotheses; start recon + Phase-1 mapping; assign specialists; trigger report | ✅ | `attack-planner.js`; PHASE_MANIFEST recon; `PENTEST_FOCUS_MAP`/`suggested_specialist`; SCRIBE Phase 4 | Nothing |
| Decide parallelism / detect stale paths | 🟡 | Static batching (`buildPentestBatches`, `runWaves`); `early-exit-decision.js` + `outcome-classifier.js` advisory | Director-level pruning |
| Ask Correlation Engine for chains; Auditor→Judge ordering | ✅ | `attack-graph.js` (3.5) + `chain-verifier.js` (3.6); essential 3 → 3.9 | Nothing |
| Director must-not constraints (scope/auditor+judge/no-scanner-as-confirmed/no high-risk) | ✅ | `scope-prevalidator.js` + `evidence-contract.js` + essential AUDITOR/judge + active-poc 3-gate | Director should *call* these |
| Mission Director task object `{task_id,mode,assigned_agent,objective,inputs,required_evidence,priority,stop_condition}` | ❌ | No grep hits; `attack-planner` emits a different hypothesis shape | New `agents/task-schema.js` (Block C) |
| Universal 11-step agent decision loop (incl. load/update KG) | 🟡 | Fragments in specialist prompts (`event-bus.js:3640-3667`); KG = per-task graph | Formalize + KG dependency |
| Universal agent output contract `{status∈confirmed|rejected|blocked|needs_more_evidence|duplicate, facts_added, evidence_refs, candidate_findings, follow_up_tasks, coverage_notes}` | ❌ | `evidence_refs` only in AUDITOR code-review verdict (`4151`); `finding-schema.js` is findings-only | New `agents/agent-result-schema.js` (Block C) |
| Formal task lifecycle (proposed→queued→running→evidence_submitted→audited→judged→reported) | 🟡 | Dispatch statuses + file stages (live→VALIDATED→JUDGED), not a per-task status field | Status state machine in dispatch writers |
| Typed task taxonomy (`recon.discovery`, `blackbox.authz`, `whitebox.freehand_review`…) | ❌ | Routed by squad+agent+`vuln_class`; no `task_type` | Add taxonomy (Block C) |
| Per-agent in-flight follow-up spawning | 🟡 | `runReplanLoop` advisory; `ARCHON_AUTONOMY` opt-in; A2A `handoff-*` gated OFF | Controlled task-creation API (§09) |

### Section 03 — Master Agent Team

| Spec capability | Status | ARCHON evidence | What's needed |
|---|---|---|---|
| L0 Scope/Queue Governors; State Manager | ✅/🟡 | `scope-prevalidator.js`; `dispatch-queue.json` single-writer + dedup Sets (`1168`); atomic `tasks.json`/ACTIVITY-LOG | KG-aware state writes |
| L0 Safety Governor + `test_intensity` ladder + `allowed_actions` allowlist | 🟡 | `active-poc-policy.js` 3-gate (binary); grep `test_intensity`/`allowed_actions` = none | Graduated intensity + allowlist |
| L1 Knowledge Graph Agent | ❌ | `attack-graph.js` per-task only; grep `knowledge_graph` = none | Block B |
| L1 Context Builder / Coverage / Hypothesis / Attack-Chain | ✅/🟡 | `getGraphContextForAgent` (425); `coverage-map.js`; `attack-planner.js`; `attack-graph.js`+`chain-verifier.js` | Mostly role-labeling |
| L2 Recon (DNS/Cert/HTTP/Content-Discovery; Nmap; Tech-FP; JS; API-Discovery) | ✅/🟡 | Folded into SCOUT/TRACER + `nmap-scan.js` + `env-fingerprint.js` + `js-bundle-analyzer*.js` + `endpoint-analyzer.js` | Treat as role taxonomy, don't fragment |
| L2 Screenshot (recon-stage visual map) | ❌ | Screenshots exist only for browser verification (`6364`) | Optional recon screenshotter |
| L3 squads (Auth/Authz/Injection/XSS/API/SSRF/File/BizLogic) | ✅/🟡 | WARDEN/KEYRING, DRILL/FORGE/RANGER, VIPER/DECOY, GATEWAY, RELAY, VAULT/SPECTRE, LEDGER | File-upload/archive + non-HTTP infra (§04) |
| L4 Repository Indexer / Feature Mapper / Pattern Router / Pattern Specialists | ✅ | `code-review-dispatcher.js` inventories+mapping+phase2; MARSHAL/CIPHER/QUILL/BEACON/BREAKER/SIPHON | Nothing |
| L4 Freehand Reviewer | ❌ | grep `freehand` = 0; PHASES = inventories…phase2,verify,report | Block D |
| L4 Code-Path Tracer / Authz Mapper / Data-Flow / Root-Cause | 🟡 | Exist as feature-map *sections* + blueprint, not personas | Keep as sections |
| L5 Auditor / Judge / Evidence / Report | ✅ | `auditor`, `judge-verifier.js`+ARBITER, `poc-evidence-capture.js`, SCRIBE | Nothing |
| L5 Remediation Agent | 🟡 | `common/remediation/*.yaml` + SCRIBE section | Optional persona |
| Uniform machine-readable INPUT contract | ❌ | grep `test_intensity`/`engagement_id`/`knowledge_graph_refs`/`evidence_required`/`deadline_policy` = none | Block C |
| Uniform OUTPUT contract | 🟡 | `finding-schema.js` + `phase-envelope.js` cover findings/evidence; spec agent fields absent | Block C |
| Evidence minimums (black-box/source/hybrid) | ✅ | `evidence-contract.js` + `cross-view-dedup.js` + finding `reproduction_*`/`proof_of_execution` | Per-class tightening (§04) |

### Section 04 — Black-box Operating Model

| Spec capability | Status | ARCHON evidence | What's needed |
|---|---|---|---|
| Golden spine flow + scope gate + recon + planner + waves + auditor + judge + report + coverage matrix | ✅ | `dispatchPentestParallel`; `scope-prevalidator.js`; SCRIBE Coverage Matrix (`3936`) | Nothing |
| KG update between recon and planning | 🟡 | Structured intel feeds planner; `attack-graph.js` per-task ephemeral | Block B |
| Decision-tree routing to squad by signal | ✅ | `attack-planner.suggested_specialist` + `PENTEST_FOCUS_MAP` (`~979`) + `AGENT_TO_WSTG` | Document (routing = prioritization, not gating; `4901`) |
| Non-HTTP → Infrastructure Squad | 🟡 | `nmap-scan.js` discovers; RELAY does non-HTTP via SSRF; no infra-exploitation persona | New persona (optional) |
| Prioritization on named signals (authenticated/admin/multi-tenant/financial/file/url-fetch/source-evidence/weak-signal-correlate) | 🟡 | numeric priority 1-5 + complexity score; signals are ATLAS prompt guidance | Deterministic scorer (optional) |
| Re-plan if coverage incomplete | 🟡 | `runReplanLoop` (3.087) post-exploitation; gated OFF; not coverage-gap-triggered | Wire `computeCoverage()` gaps into trigger |
| Output: asset/URL/nmap/tech tables, candidate/confirmed/rejected, evidence packages, coverage matrix | ✅ | RECON.md, `nmap-<taskId>.json`, `env-fingerprint-<taskId>.json`, 3-tier JSONL, `poc-evidence-capture.js` | Nothing |
| Output: authentication map (consolidated) | 🟡 | per-endpoint `auth_boundary` in EndpointModel; no single artifact | Derive artifact from EndpointModel |
| Output: role/action matrix | ❌ | grep `role-matrix` = none; multi-role testing is prompt-only | New artifact (needs 2+ accounts in scope) |
| Per-squad REQUIRED evidence (two-account/browser/controlled-dest/before-after) | 🟡 | `evidence-contract.js` is one-size-fits-all; per-class is SOUL prose | Class-keyed evidence policy |

### Section 05 — Source Review (3 phases)

| Spec capability | Status | ARCHON evidence | What's needed |
|---|---|---|---|
| Three-phase model | 🟡 | `code-review-dispatcher.js:1-28` header says two-phase; PHASES (`:59`) has no freehand | Block D |
| Phase 1 feature mapping (no findings, no random review) | ✅ | `featureMapPrompt` (184-214); one agent/feature in waves | Nothing |
| Phase 1 inventories + consolidated artifacts + completion gate | ✅/🟡 | `buildInventories` (99-155); `phase1_consolidated_templates.md`; `phase1_completion_gate.md` | Naming alignment; `model_inventory` weak in generic preset |
| Per-feature map template | ✅ | `phase1_feature_map_template.md`; `FEATURE_SECTIONS`+`LEDGER_COLS` (63-70) | Add webhooks/frontend/integrations sections |
| Phase 2 pattern review applied feature-by-feature | ✅ | `phase2Prompt` (249-271); `anti_drift_execution_contract.md` | Nothing |
| Phase 2 separate `candidates/CAND-NNN`, `rejected/`, `candidate_findings_index`, `blackbox_validation_queue` | ❌ | matched+rejected folded into one per-feature report | Add artifacts (weigh consumer need) |
| Six pattern result states | ❌ | uses depth-status + AUDITOR verdicts | Enum (Block E) |
| Candidates → Auditor (white-box) | ✅ | `auditorPrompt` (273-281) Phase 2v | Nothing |
| Phase 3 Freehand (15 questions, feature stories, novel candidates, chain ideas) | ❌ | grep `freehand` = 0 | Block D |
| Source→blackbox proof task (two accounts) | 🟡 | PROBER Phase 2v with `meta.testAccounts` (409-416); not framed as pentest-squad tasks | Use A2A `handoff-*` |
| Blackbox→source root-cause task | ❌ | `cross-view-dedup.js` only post-hoc | New direction |
| Continuous source↔blackbox feed loop | 🟡 | one-shot post-hoc de-dup | Depends on Block A+B |
| Hybrid finding (live proof + source root-cause + feature + repro + impact + fix) | ✅ | SCRIBE CROSS-VIEW prompt (`8308-8310`), worst severity | Nothing |

### Section 06 — Pattern Catalogs

| Spec capability | Status | ARCHON evidence | What's needed |
|---|---|---|---|
| Catalogs as first-class data assets (engine reads them) | 🟡 | `catalogs/access_control_40` + `xss_50` injected as prompt markdown; routed via `code-review-dispatcher.js:49-57` | Structured data + loader (Block E) |
| Index of 20 core categories | 🟡 | WSTG 12-area `coverage-map.js` is nearest analogue | Catalog index |
| Per-pattern 9-field schema | 🟡 | catalogs are 2-col ID→Name; fields scattered across phase2 module + remediation YAML + gates | Co-locate 9 fields |
| 7-state output enum | ❌ | grep = 0; overlapping prose states only | Add to `finding-schema.js` (Block E) |
| Access-Control + XSS catalogs | ✅ | `access_control_40` (superset of AC-001..010), `xss_50` (superset of XSS-001..007) | Keep depth; don't regress to spec's smaller sets |
| Injection / Auth-Session / SSRF / File / API / BizLogic / GraphQL / Cloud / Dep / Logging catalogs | ❌/🟡 | payload KBs exist (`common/payloads/*.yaml`) but no structured catalogs; `sqli/ssrf/rce/account-takeover` catalogs = null | Add 18 categories (Block E) |
| Dual-mode patterns (source + black-box indicators in one) | ❌ | white-box catalogs vs black-box payload KB are separate, reconciled post-hoc | Unify per-pattern |
| Pattern engine (route by class, attach validation task, track state, FP-suppress) | 🟡 | class→catalog routing (white-box, 2/6); FP/evidence gating is global | Per-pattern validation linkage |

### Section 07 — Knowledge Graph & Correlation

| Spec capability | Status | ARCHON evidence | What's needed |
|---|---|---|---|
| Persistent KG as single source of truth | ❌ | `attack-graph.js` per-task (`:50`), built *after* Phase 2 from findings; real SSOT = JSONL | Block B |
| 30 node types / 21 edge types | 🟡 | 9 node types + 8 edges (incl. stocks types METRIC/CATALYST/SECTOR); no dataflow/hypothesis/correlation edges | Widen taxonomy (squad-extensible) |
| Canonical node props (id/type/name/source/confidence/timestamps/evidence_refs) | 🟡 | nodes `{type,label,properties,addedAt}`; richer props live on findings | Add props |
| Attack-chain discovery + construction + deterministic verification | ✅ | `findAttackChains` (126-206), Constructor (3.5) → `CHAIN_OUTPUT_SCHEMA`, `chain-verifier.js` (3.6) | Nothing — reuse verbatim |
| Chain category catalog | 🟡 | prompt `patternHints` only | First-class catalog (optional) |
| Chain record `{chain_id,current_confidence,missing_proof,next_validation_task}` | 🟡 | schema is `{id,name,severity,mitre_technique,narrative,finding_ids,steps}`; missing_proof≈match_failure | Extend schema (Block F) |
| Correlation source↔blackbox; duplicate; conflict | ✅ | `cross-view-dedup.js`; exact_duplicate_groups; Phase 2.9 contradiction detector | Nothing |
| Correlation record `{correlation_id,linked_items,correlation_type,confidence_delta,summary,recommended_next_task}` | ❌ | grep all fields = 0; `correlation-<taskId>.json` is a different shape | Typed record (Block F) |
| Numeric confidence increase/decrease rules | 🟡 | categorical (CONFIRMED/NEEDS-LIVE + severity caps + ARBITER) | Numeric delta *without* weakening hard gate |
| Correlate recon + freehand signals | ❌ | de-dup ingests only VALIDATED-FINDINGS; freehand phase absent | Depends on Block D |

### Section 08 — Validation, Evidence, Reporting

| Spec capability | Status | ARCHON evidence | What's needed |
|---|---|---|---|
| AUDITOR independent validation (8 questions) | ✅ | `auditor/skills/finding-validation/SKILL.md` (Q1-Q7 + Gates 0-3); Phase 3 essential | Nothing |
| AUDITOR 6-way verdict enum | 🟡 | binary CONFIRMED/KILLED + NEEDS-LIVE; duplicate/out_of_scope/informational in separate modules | Single enum on record (P7) |
| Judge final quality gate (report-quality questions) | 🟡 | `judge-verifier.js` exists but rubric = *exploitability*, not report-quality | Add report-quality judge pass |
| Mandatory Candidate→Auditor→Judge→Report | ✅ | Phase 3 → 3.05 → 3.9 → 4; AUDITOR essential | Note: judge config-gated (see watch-outs) |
| "No evidence, no finding" | ✅ | `evidence-contract.js` in `auditor-validated-builder.js` | Nothing |
| Canonical evidence-package folder (`evidence/CAND-NNN/…`) | ❌ | flat `var/intel/poc-evidence/{taskId}/{findingId}.json` | Extend `poc-evidence-capture.js` (P7) |
| Candidate min-field set (Category/Feature/Entry/Preconditions/Root-cause/Scope) | 🟡 | `finding-schema.js` REQUIRED = id/title/severity/validation_status/original_agent/taskId | Add fields (Block C) |
| L0-L4 evidence scale (only L2+ in report) | 🟡 | 3-tier `evidence-completeness.js` full/partial/local_only + 4-row code-review tier | Map/add L0-L4 |
| Report section list + detailed finding format | ✅ | `buildscribeReportPrompt` (3938-3949) CVSS3.1/OWASP/CWE/repro/evidence + coverage matrix | Nothing |
| Continuous report engine | ❌ | SCRIBE single batch at Phase 4 | Block F / P7 |
| SCRIBE must not invent evidence; label limitations | ✅ | only CONFIRMED (`3934`); `scribe-chain-orphan-guard.js`; `prependPublicationStatusBanner` (`750`) | Nothing |

### Section 09 — Developer Implementation (migration playbook)

| Spec capability | Status | ARCHON evidence | What's needed |
|---|---|---|---|
| `ARCHON_AGENT_SPEC_DIR` + vendored `docs/autonomous-agent-os-spec/` | ❌ | spec lives outside repo; `docs/` has only system map | P0 |
| `ARCHON_ENABLE_*` flag family + 5-stage shadow rollout | 🟡 | pattern exists (`ARCHON_AUTONOMY`/`ARCHON_ACTIVE_POC`/`ARCHON_SCOPE_OVERRIDE` + `enabledPhases`/`phaseEnabled`); named flags absent | P0 — add to `paths.js` |
| Split monolith into `src/orchestrator/*` | 🟡 | `event-bus.js` is one ~580KB file; much already factored into `src/pipeline/*`, `src/safety/*`, `src/routing/model-router.js` | Incremental extraction; map names onto existing |
| `src/intel/{knowledge-graph,entity,relationship,coverage}` | 🟡 | `coverage-map.js`, `cross-view-dedup.js`, `attack-graph.js` exist under other paths | Block B |
| Agent task-creation API (createTask/createHypothesis/linkEvidence/updateCoverage/requestAudit) | 🟡 | internal `enqueueTask` (`1261`) + followup-plan JSON; no agent-facing API | Controlled API |
| Enforce Auditor/Judge hard gates | ✅ | already strict (not advisory) | Nothing — already at spec end-state |
| Community plugin SDK + versioned rollout | 🟡 | extensibility via `squad.json`/`ownership.json`/`paths.js`/runner adapters; direct-to-main only | Formalize plugin points |

### Section 10 — Schemas

| Spec capability | Status | ARCHON evidence | What's needed |
|---|---|---|---|
| JSON-Schema layer enforced end-to-end | ❌ | no ajv; lone draft-07 `common/reporting/finding_schema.json` is vestigial; enforcement is imperative JS | Block C — `common/schemas/` + ajv validator |
| `candidate_finding` core identity + auto-repair | ✅ | `finding-schema.js` normalize/validate | Nothing |
| `candidate_finding` provenance enum / feature ref / structured `source_files` / `evidence_refs`/`hypothesis_refs` | ❌ | grep `line_start`/`source_files`/`evidence_refs` (finding) = none | Block C (ties to Block D) |
| Separate `auditor_status` + `judge_status` fields | 🟡 | modeled as pipeline stages + separate JSONL files; confidence is free string | Two enum fields on record |
| `evidence` first-class addressable record + L0-L4 | ❌ | evidence is inline finding property; `hasEvidence()` predicate | Block C (biggest schema lift) |
| `evidence` scope_status | ✅ | Phase 3.06 scope annotation (`5756-5767`) | Move onto evidence record |
| `source_feature_map` as structured JSON | 🟡 | markdown template; only thin `feature-queue.json {slug,name,keywords}` | Emit parallel `features/<slug>.json` |
| `task` id/objective/assignee/priority/scope | ✅ | `newTask` (9928-9940); dashboard dispatch | Nothing |
| `task` engagement_id + 4 modes; dotted type taxonomy; allowed_actions; test_intensity; KG refs; 9-state status; stop_condition | ❌/🟡 | engagement model exists (blackbox/whitebox only); rest absent | Block C (+depends on A/B) |

### Section 11 — Prompts

| Spec capability | Status | ARCHON evidence | What's needed |
|---|---|---|---|
| Mission Director prompt | 🟡 | spine procedural in `event-bus.js`; ATLAS SOUL + `attack-planner` + COMMAND cover slices; no KG-fed decision prompt | Block A + `prompts/mission-director/v1.md` |
| Black-box Master prompt (9-question checklist, hybrid source-task creation) | 🟡 | `attack-planner` + `buildPentestSpecialistPrompt` (3543-3719) "CREATIVE ATTACK PHASE" + EndpointModel assumptions | Literal checklist + hybrid task spawn |
| Phase 1 feature-mapping prompt | ✅ | `phase1_code_review_master.md` + dispatcher prompts | Nothing |
| Phase 2 pattern-review prompt | ✅/🟡 | `phase2_vulnerability_assessment_router.md` + 2 wired catalogs | 4 more frameworks (Block E) |
| Phase 3 freehand prompt (12 questions) | ❌ | grep `freehand` = 0 | Block D — `phase3_freehand_review_v1.md` |
| Auditor prompt | 🟡 | `buildauditorValidationPrompt` (3723) + 7-Question-Gate; emits binary CONFIRMED/KILLED | Align to 6-way enum |
| Judge prompt | 🟡 | `judge-verifier.js buildJudgePrompt` (141); emits confirmed/downgraded (severity) | Align to accepted/rejected/needs_more_evidence |
| Prompt hosting infra | ✅ | `src/rendering/prompt-renderer.js` loads `prompts/<role>/<version>.md` with rollback via `intel/prompts-config.json` | Reuse for all new prompts |

---

## 4. The real gaps — the six genuinely-new building blocks

Everything else in the spec is labeling, formalization, or already-built. These six are the actual engineering. They have dependencies: **Block C (schemas)** and **Block B (KG)** are keystones — A, F, and parts of D/E depend on them.

### Block A — The autonomous Mission Director loop
- **What it is.** A standing controller that observes engagement state, identifies coverage gaps, generates/ranks hypotheses, assigns specialists, routes candidates through Auditor→Judge, updates the KG, and decides "continue vs. report" — bounded by scope/safety/cost.
- **Why it matters.** It is the spec's headline and the thing that turns ARCHON's linear pipeline into an autonomous OS. Without it, "agents decide next actions themselves" remains a one-shot re-plan.
- **Where it bolts on.** *Wrap, don't replace* `dispatchPentestParallel` in `event-bus.js`. Promote Phase 3.087 `runReplanLoop` + `agents/goal-evaluator.js` + `src/pipeline/early-exit-decision.js` + `outcome-classifier.js` into a bounded loop. Reuse `attack-planner.js` as the hypothesis generator and `coverage-map.computeCoverage()` as the stop signal. The PHASE_MANIFEST *is* the plan — the director selects/reorders enabled phases. **Must call** (not re-implement) `scope-prevalidator.js`, `evidence-contract.js`, AUDITOR/judge, active-poc gates. Reuse the `ARCHON_AUTONOMY_HOPS` hop-cap as a real bounded loop budget.
- **Effort.** Large (the hardest of the six), but mostly wiring existing modules + a new control structure. Gated by Block C (task object) and ideally Block B (KG sink).

### Block B — Shared persistent Knowledge Graph
- **What it is.** One queryable graph (assets/endpoints/code-maps/hypotheses/evidence/findings) that all engines read/write, keyed beyond `taskId`, optionally persistent across engagements; the loop's "update KG" sink and Correlation's canonical store.
- **Why it matters.** It is the central organ of the spec's architecture and the dependency for Block A's observe-step, Block F's correlation/chain records, and §10's `knowledge_graph_refs[]`.
- **Where it bolts on.** Promote `src/pipeline/attack-graph.js` from per-task derived artifact (`attack-graph-<taskId>.json`) into a durable, engagement-scoped store under `var/intel` (`paths.js` INTEL_ROOT). Widen `NODE_TYPES`/`EDGE_TYPES` toward the spec taxonomy (keep squad-extensible — it carries stocks-domain types). Have recon (SCOUT/RANGER/TRACER), `env-fingerprint.js`, code-review inventories/blueprint, and the JSONL finding writers **upsert** nodes instead of rebuilding at Phase 3.4. Wrap `getGraphContextForAgent` as the L1 Context Builder.
- **Effort.** Large + cross-cutting (touches many `var/intel` read sites). Must be additive/fail-soft to protect the single-writer state model. **Decide first**: KG-as-SSOT vs KG-derived-from-JSONL (see watch-outs).

### Block C — Formal agent contracts + canonical JSON schemas
- **What it is.** `common/schemas/{task,evidence,candidate_finding,source_feature_map}.schema.json` (draft 2020-12) + a thin ajv validator; a uniform agent input/output contract; everything wired by stable IDs.
- **Why it matters.** It is one of the three "heart" items and a prerequisite for A (task object), F (typed records), and the §08 evidence model. It is the lowest-architectural-risk keystone.
- **Where it bolts on.** Extend `agents/finding-schema.js` (add `candidate_id`, provenance enum, feature ref, structured `source_files`, `evidence_refs`, split `auditor_status`/`judge_status`) and `agents/phase-envelope.js` (already a typed `schemaVersion`/provenance envelope). Enforce at existing write boundaries (specialist write → AUDITOR read, same pattern as `finding-schema.js` today). Add task lifecycle state machine to the `dispatch-queue.json`/`tasks.json` writers via `writeAtomic`/`withFileLock`. Evidence record is the biggest sub-lift (introduce addressable evidence + store keyed by `evidence_id`).
- **Effort.** Medium-large with **high blast radius** (every specialist write boundary, AUDITOR, judge, SCRIBE, dashboard). Mitigate by normalizing at boundaries + auto-repair defaults, never rewriting the pipeline.

### Block D — Phase 3 freehand source-review
- **What it is.** A third white-box phase: senior-pentester open-ended reasoning (12-15 questions, "feature stories") to find novel/business-logic vulns pattern review misses, emitting novel candidates + chain ideas.
- **Why it matters.** The single explicit white-box deficit; the spec mandates pattern *and* freehand. It also unblocks freehand-signal correlation (§07).
- **Where it bolts on.** The **smallest concrete code change** of the six: add a `'freehand'` entry to `code-review-dispatcher.js` PHASES between `'phase2'` and `'verify'`; add `methodology/prompts/phase3_freehand_review_v1.md` + a candidate template; run per-feature via the existing `MAPPER_POOL`/`runWaves`; route NOVEL candidates through the existing AUDITOR Phase 2v + `evidence-contract.js` so they cannot pollute the report unverified.
- **Effort.** Small-medium. **Needs its own cost cap/gate** (squad.json `maxCostUsd=50`; Phase 2 already capped to top-6 features).

### Block E — Pattern catalogs as a first-class engine
- **What it is.** Structured (YAML/JSON), machine-readable catalogs across ~20 categories, each pattern carrying the 9 fields + a 7-state output enum, dual-mode (source + black-box indicators), with per-pattern "suggested validation task" linkage.
- **Why it matters.** Turns catalogs from prompt text into data an engine routes/validates against; drives candidate generation + FP suppression + validation routing.
- **Where it bolts on.** Keep catalogs where they live and are routed (`code-review-dispatcher.js:49-57` CLASS map); fill the 4 missing white-box classes (`sqli/ssrf/rce/account-takeover`) and add the 14 missing categories under `squads/code-review/methodology/catalogs/`. Promote prose → structured data co-located with `common/taxonomy/`; have `coverage-map.js` reference catalog IDs. For black-box, extend `common/payloads/*.yaml` with black-box-indicators/FP-checks/validation-task so one object serves both engines; let `cross-view-dedup.js` merge on pattern-ID. Add the 7-state enum to `finding-schema.js`; map existing dispositions onto it.
- **Effort.** Medium, mostly content/breadth. **Keep ARCHON's richer 40/50-row catalogs and ID schemes** — treat the spec's smaller AC-001..010/XSS-001..007 as the *schema/breadth target*, not a replacement (regression risk).

### Block F — Typed correlation + attack-chain records
- **What it is.** First-class typed records: Correlation `{correlation_id, linked_items, correlation_type(source_to_blackbox|blackbox_to_source|chain|duplicate|conflict), confidence_delta, summary, recommended_next_task}` and Chain `{chain_id, steps, current_confidence, missing_proof, next_validation_task}`.
- **Why it matters.** Formalizes ARCHON's existing-but-implicit correlation/chain substance so the Mission Director can act on it (next_validation_task) and the KG can store it.
- **Where it bolts on.** Wrap `cross-view-dedup.js buildCorrelationMap` output in the typed record; fold in the Phase 2.9 contradiction detector (conflict) + judge/ARBITER/evidence-contract verdicts as the `confidence_delta` source. Extend `chain-verifier.js CHAIN_OUTPUT_SCHEMA` with `current_confidence`/`missing_proof` (from step match_failure) / `next_validation_task` (from the Phase 3.087 followup-plan). Add the 5-question chain checklist to the Phase 3.5 Constructor prompt.
- **Effort.** Medium. The deterministic execution backbone is solid — reuse verbatim; this is schema formalization. **Numeric `confidence_delta` must not weaken** the categorical "no replayable evidence → not CONFIRMED" hard gate.

---

## 5. Build roadmap

Sequenced to honor §09 (preserve → flag → shadow → enable one-by-one) and ARCHON's actual structure. Each phase is non-breaking: **flag disabled = exact current behavior.** Default all new flags **off**.

### Prerequisite — Tier-0/Tier-1 cleanup (already underway)
The recent commits (purging removed-squad agents, streamlining the event-bus header, fixing persona refs, surfacing all findings) are the right precondition: the contract/schema and KG work touches `event-bus.js` and `var/intel` heavily, so a clean roster + stable findings flow must land first. **Do not start Block B or C until the cleanup is complete** — schema migration on top of drifting data is the highest-pain ordering.

### Phase 0 — Migration scaffolding (no behavior change)
- **Goal.** Make every later phase flaggable and shadow-able without touching the product.
- **Changes.** Add the `ARCHON_ENABLE_*` flag family to `paths.js` (the central env resolver that already autoloads `.env.local`), reusing the existing `ARCHON_AUTONOMY`/`ARCHON_ACTIVE_POC`/`enabledPhases` pattern. Vendor the spec into `docs/autonomous-agent-os-spec/` + add `ARCHON_AGENT_SPEC_DIR`.
- **Flag.** `ARCHON_ENABLE_AUTONOMOUS_OS` (master) — default off.
- **Shadow mode.** N/A (docs + flags only).
- **Exit.** Flags resolve through `paths.js` to daemon/dashboard/agents; `npm test` green.

### Phase 1 — Canonical schemas + contracts (Block C)
- **Goal.** Land the keystone schema layer before anything depends on it.
- **Changes.** `common/schemas/*.schema.json` + thin ajv validator; extend `finding-schema.js` (candidate fields, provenance, evidence_refs, auditor/judge status split) and `phase-envelope.js`; add the typed `task.schema.json` mapping onto `newTask` + dashboard dispatch + engagement/iterations. Enforce at existing boundaries with auto-repair defaults.
- **Flag.** `ARCHON_ENABLE_STRICT_SCHEMA` (validation advisory-then-strict). Existing strict AUDITOR/Judge gates stay on.
- **Shadow mode.** Validate-and-log-only: run the validator over every produced finding/task, write divergences to a side log, but accept the legacy shape. Compare for N engagements.
- **Exit.** Zero unexplained validation failures across a representative engagement set; existing reports byte-stable when flag off.

### Phase 2 — Phase 3 freehand source review (Block D)
- **Goal.** Close the one explicit white-box gap; deliver immediate value.
- **Changes.** New `'freehand'` PHASES entry in `code-review-dispatcher.js` (between `phase2` and `verify`); `phase3_freehand_review_v1.md` + candidate template; per-feature waves via existing `runWaves`; NOVEL candidates routed through AUDITOR Phase 2v + `evidence-contract.js`.
- **Flag.** `ARCHON_ENABLE_THREE_PHASE_SOURCE_REVIEW` (a.k.a. `source_review_mode=legacy|three_phase`) + a dedicated freehand cost cap.
- **Shadow mode.** Run freehand and emit `phase3-freehand-review/` artifacts, but **exclude** NOVEL candidates from the published report (label-only) until precision is observed.
- **Exit.** Freehand NOVEL candidates that survive AUDITOR achieve acceptable precision on a known-vuln corpus; cost stays within cap.

### Phase 3 — Pattern catalogs as an engine (Block E)
- **Goal.** Formalize + broaden catalogs; feed Block D/F.
- **Changes.** Fill 4 missing white-box class catalogs + add missing categories; promote prose → structured data referenced from `coverage-map.js`; extend `common/payloads/*.yaml` with dual-mode fields; add the 7-state enum to `finding-schema.js`.
- **Flag.** `ARCHON_ENABLE_PATTERN_REVIEW` (structured-catalog path) — falls back to current prompt-injected catalogs when off.
- **Shadow mode.** Engine parses catalogs as data and emits pattern-state annotations alongside the current markdown reports; no change to what's published.
- **Exit.** Structured catalogs reproduce ≥ current coverage; ARCHON's 40/50-row depth + ID schemes preserved (no regression to spec's smaller sets).

### Phase 4 — Persistent shared Knowledge Graph (Block B)
- **Goal.** Stand up the central organ as a passive store first.
- **Changes.** Promote `attack-graph.js` to an engagement-scoped durable store under `var/intel`; widen node/edge taxonomy (squad-extensible); have recon/fingerprint/code-review/finding-writers upsert nodes; expose a context-builder read API.
- **Flag.** `ARCHON_ENABLE_KNOWLEDGE_GRAPH` — default off.
- **Shadow mode.** **KG as passive listener** (the §09 instruction): it *receives copied events* and builds the graph, but no engine reads from it for decisions and it cannot block legacy flow. Verify graph completeness vs JSONL for N engagements.
- **Exit.** KG reconstructs the same findings/correlations the JSONL pipeline produces (no dual-write drift); reads are pure/fail-soft.

### Phase 5 — Typed correlation + chain records (Block F)
- **Goal.** Make correlation/chains first-class so the director can act on them.
- **Changes.** Wrap `buildCorrelationMap` + Phase 2.9 contradiction detector in the typed Correlation record; extend `CHAIN_OUTPUT_SCHEMA`; add 5-question chain checklist to the Constructor prompt; source `confidence_delta` from existing verdict gates *without* replacing them.
- **Flag.** `ARCHON_ENABLE_CORRELATION_ENGINE` — writes records to the KG (Phase 4) when both enabled.
- **Shadow mode.** Emit typed records alongside the existing `correlation-<taskId>.json`; SCRIBE still uses the existing de-dup spine.
- **Exit.** Typed records match the existing merge decisions; numeric confidence never overrides the "no replayable evidence → not CONFIRMED" gate.

### Phase 6 — Mission Director loop (Block A)
- **Goal.** The autonomy keystone — only after A's dependencies (C task object, B KG, F next_validation_task) are stable.
- **Changes.** New bounded control structure wrapping `dispatchPentestParallel`; promote `runReplanLoop` + `goal-evaluator.js` + `early-exit-decision.js` into the loop; reuse `attack-planner.js` (hypotheses) + `computeCoverage()` (stop signal) + `ARCHON_AUTONOMY_HOPS` (budget). The director *calls* scope/safety/auditor/judge — never re-implements them. Host its prompt at `prompts/mission-director/v1.md` via `prompt-renderer.js`.
- **Flag.** `ARCHON_ENABLE_BLACKBOX_MASTER_AGENT` / `ARCHON_ENABLE_AUTONOMOUS_OS` (master) — default off.
- **Shadow mode.** **Director as observer/recommender** (the §09 instruction): it reads state and *recommends* next tasks into a side plan, but the deterministic pipeline still drives execution. Compare director recommendations to actual pipeline behavior; only then flip to "director assigns."
- **Exit.** Director recommendations match or beat the deterministic plan on coverage/precision across a benchmark set; loop is hard hop/budget/scope/active-poc-capped; coverage-sufficiency stop is **evidence-gated, not LLM-discretionary** (must not regress guaranteed WSTG A-Z coverage).

### Phase 7 — Continuous reporting + evidence packages + report-quality judge (Block F tail + §08)
- **Goal.** Streaming report cadence + canonical evidence folders + the report-quality gate.
- **Changes.** Restructure SCRIBE Phase 4 into an incremental writer keyed on the live→VALIDATED→JUDGED JSONL streams (capture is already incremental); extend `poc-evidence-capture.js` to write `evidence/CAND-NNN/` folders serializing reproduction/impact/auditor-verdict/judge-verdict; add a second judge pass (report-quality rubric) or ARBITER skill between 3.9 and 4; add L0-L4 to `evidence-completeness.js` and gate report inclusion on L2+.
- **Flag.** `ARCHON_ENABLE_CONTINUOUS_REPORT` + `ARCHON_ENABLE_STRICT_JUDGE_GATE`.
- **Shadow mode.** Build the streaming report in parallel and diff it against the terminal SCRIBE output; keep the terminal report authoritative until parity.
- **Exit.** Streaming report ≡ terminal report content; evidence folders complete; report-quality judge does not drop currently-valid findings.

---

## 6. Watch-outs

**Spec ↔ code conflicts and regressions to avoid**
- **Don't read the spec's one-liners as a ceiling.** Recon, Scope, Judge, and the pattern catalogs are *richer* in ARCHON than in the spec. Naively "implementing the spec" (e.g. adopting the spec's smaller AC-001..010 / XSS-001..007 catalogs, or forcing spec ID schemes over ARCHON's mandatory 40/50-row matrices and "use these exact IDs, do not rename" contract) would be a **regression**. Treat the spec as a *superset target and schema/breadth guide*, not a replacement.
- **Routing is prioritization, not gating, by design.** `event-bus.js:4901` ("Target profile NEVER restricts specialist roster") means ARCHON intentionally runs the full A-Z roster. A reviewer reading the §04 decision tree as *gating* would wrongly conclude routing is missing. Document this.
- **Per-class evidence enforcement can demote live findings.** Adding two-account/browser/controlled-destination requirements to `evidence-contract.js` could demote currently-CONFIRMED findings — ship behind a flag with a grace/migration path.
- **The judge is currently config-gated/optional** while the spec treats Judge as mandatory; and **ARCHON's judge rubric is exploitability, the spec's is report-quality.** Don't conflate them — a finding can be exploitable but poorly-reported (or vice-versa). Add the report-quality pass *in addition to*, not instead of, the Raptor judge; consider making the judge essential under the strict flag.

**Doc/code divergences to fix**
- `CLAUDE.md` calls `event-bus.js` "~10K lines"; the digest measures ~580KB — reconcile.
- `code-review-dispatcher.js` header says "two-phase methodology" while the spec (and Block D) wants three — update the header when freehand lands.
- The lone draft-07 `common/reporting/finding_schema.json` is vestigial (referenced only in `docs/_audit-tree.txt`); either adopt it as the seed for `common/schemas/` or remove it to avoid confusion.

**Decisions the owner must make**
1. **KG storage backend.** File-based under `var/intel` keyed beyond `taskId` (consistent with the current data layer and `writeAtomic`/`withFileLock` discipline) vs SQLite vs an embedded graph DB. File-based is the least-disruptive, fail-soft choice and matches §09's "additive-first"; a graph DB buys cross-engagement query power at the cost of a new dependency + ownership model. **Recommendation: start file-based, derive from JSONL.**
2. **Single vs dual source of truth.** Is the KG *the* SSOT (large refactor; every JSONL read/write migrates; dual-write drift risk) or *derived* from the JSONL pipeline (safe, but the spec's "single source of truth" framing becomes aspirational)? **Recommendation: KG derived-from-JSONL through Phase 4-6; promote to SSOT only after parity is proven.**
3. **How the Mission Director relates to ATLAS + `ARCHON_AUTONOMY`.** Avoid two competing orchestrators. The director should *wrap* `dispatchPentestParallel` and *reuse* ATLAS (`attack-planner.js`) as its hypothesis generator + the `ARCHON_AUTONOMY_HOPS` cap as its budget — not a parallel daemon. ATLAS stays the LLM strategist; the director is the bounded control structure around it.
4. **Schema migration of existing JSONL findings.** ARCHON's `validation_status` (CONFIRMED/NEEDS-LIVE/KILLED/SUSPECTED), `evidence_completeness` (full/partial/local_only), and binary AUDITOR (CONFIRMED/KILLED) must map onto the spec's status enums, L0-L4 scale, and 6-way verdict. Decide: **adopt spec enums with a compat/mapping layer** (keeps interoperability) vs **document the intentional divergence** (keeps ARCHON's battle-tested semantics). A mapping layer at the boundaries (the `finding-schema.js` pattern) is lowest-risk.
5. **Cost ceiling under autonomy.** A standing loop + freehand phase + any recon decomposition multiply LLM spawns against `squad.json` caps (`maxSpecialists:12`, `maxCostUsd:50`) on a subscription/OAuth model with no API key. Every autonomous path must inherit a hard hop/budget cap, scope fail-closed, and the active-poc 3-gate — non-negotiable for an OSS exploit tool.
6. **Write-contention.** Continuous reporting + a live KG increase pressure on `tasks.json`/`dispatch-queue.json`/`ACTIVITY-LOG.jsonl`. All new writers must use `writeAtomic`/`withFileLock`; KG writes must be additive and fail-soft so they never destabilize the single-writer state model.

**Uncertain mappings (flagged honestly)**
- The §07 KG node taxonomy in `attack-graph.js` carries stocks-domain types (METRIC/CATALYST/SECTOR) — it was built generic across squads. Widening it to 30 security entities risks coupling; keep it squad-extensible.
- `attack-graph` currently matches nodes to AUDITOR confirmations by fuzzy keyword overlap (`updateGraphWithValidation`, overlap≥2 words) — brittle. A real KG with id-linked `EVIDENCE_SUPPORTS_CANDIDATE` edges is more reliable but requires every producer to emit stable IDs (depends on Block C).
- Freehand-signal correlation (§07) is **blocked on Block D** — it cannot be built before the freehand phase exists.

---

*Bottom line: the Golden Spine, evidence contract, AUDITOR+judge gates, cross-view correlation, scope fail-closed, attack-graph + chain-verifier, and the deterministic-core/AI-on-top split are already in `event-bus.js` + `src/pipeline/*` + `code-review-dispatcher.js`. Build the six new blocks behind `ARCHON_ENABLE_*` flags in shadow mode, schemas (C) and KG (B) first, Mission Director (A) last, and the existing product never breaks.*