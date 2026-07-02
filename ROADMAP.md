# ARCHON Roadmap

Where ARCHON is going. This is a direction document, not a dated commitment.
Status reflects the current `main`.

## Now (recently landed)

- **Static / white-box parity** — static and white-box run the same portal flow as black-box
  (live phase stepper, always-visible cancel, the shared dedup/merge triager + WRITER writing the
  Findings board with the code-review template: vulnerable code block + `file:line`, no curl). Only
  the agents swap by test type.
- **Source-guided white-box verify (default)** — a white-box run does the source code review
  **first**, then automatically launches a **source-guided** live pentest that verifies those
  candidates against the target (`whitebox-correlation`), merged into one report — instead of two
  parallel passes.
- **Honest confirmation status** — `SOURCE_CONFIRMED` vs `RUNTIME_CONFIRMED` (+
  `NEEDS_LIVE_VALIDATION` / `DISPROVEN`), derived in `finding-schema.js`. A
  source-only review no longer presents a code-read finding as live-proven.
- **Surface-driven source review** — the code-review dispatcher auto-selects vuln
  classes from the discovered Phase-1 surface (all 23 catalog classes available;
  `selectVulnClasses`), replacing the old access-control+xss default.
- **Graded coverage scoring** — per-area % ("Authentication: 90%") via
  `coverage-map.computeCoverage().areas` + `coverageTable`, surfaced in the report.
- **Structured decision log** — the Mission Director writes `decision-log.jsonl`
  (agent · why · evidence · task · confidence · outcome) when autonomy is enabled.
- **Portable roots + one-shot setup** — `paths.js` resolves roots from the repo/cwd
  when not on the `/root` server (fresh clone needs no `.env.local`); `bash setup.sh`
  bootstraps locally; clean release ZIP via `npm run pack:release`.
- **Offline test suite** — no test touches the public internet (local fixtures).

## Next

- **Precise coverage denominators** — feed `attemptedByArea` (WSTG sub-checks
  attempted vs total) from the strategist into `computeCoverage` so per-area % is a
  true ratio, not just the signal model.
- **Decision log in the report** — surface the Director's `decision-log.jsonl` as an
  operator-facing "why we did what we did" appendix.
- **Mission Director coverage gaps** — `observeEngagement` reads `cov.uncovered`,
  but `computeCoverage` returns `not_reached` objects; reconcile so coverage gaps
  actually become follow-up recommendations.
- **Pattern catalog depth** — several of the 23 classes ship as thin descriptors;
  grow the newer spec categories into full inline catalogs (see
  `PATTERN_AUTHORING_GUIDE.md`).

## Module graduation (handoff item 6)

The Autonomous-OS spec defines a `RECOMMENDED_REPO_STRUCTURE`. To make that layout
addressable without duplicating logic, several canonical paths currently ship as
**thin re-export shims** pointing at the real implementation. They graduate to real
modules as the autonomous layer earns its own behavior:

| Canonical path (shim) | Currently re-exports | Graduates into |
|---|---|---|
| `src/intel/coverage-engine.js` | `src/core/coverage-map.js` | own engine if coverage logic outgrows the pure map |
| `src/orchestrator/agent-router.js` | `src/routing/model-router.js` | autonomy-aware routing (load/cost/skill-based) |
| `src/evidence/evidence-store.js` | `agents/poc-evidence-capture.js` | a real evidence store with query/index |
| `src/reporting/report-builder.js` | `src/pipeline/report-stream.js` | deterministic streaming assembler (Block R) |
| `src/source-review/phase1-feature-mapper.js` | dispatcher | extracted Phase-1 mapper |
| `src/source-review/phase2-pattern-router.js` (+ `phase2-pattern-reviewer.js` alias) | pattern-catalog + dispatcher | standalone per-class router |
| `src/source-review/phase3-freehand-reviewer.js` | dispatcher | extracted freehand reviewer |

**Rule for graduating one:** move the logic into the canonical module, leave the old
location re-exporting *it* (so neither name breaks), keep flag-off byte-identical,
and ship the move with tests. Never duplicate — one source of truth, possibly
several addressable names.

## Autonomous Agent OS (flagged, shadow → active)

The autonomous layer (`ARCHON_ENABLE_AUTONOMOUS_OS` master switch) advances each
block from **off → shadow → active**. Shadow observes and writes to
`paths.shadowDir(engagementId)`, driving nothing; active drives execution. Flag-off
is always byte-identical to the deterministic pipeline. Blocks: Mission Director
(A), knowledge graph, pattern catalogs (E), strict schema, three-phase source
review (D), white-box correlation, report stream (R). Each earns `DRIVE` only after
proving itself in shadow.

## Later / ideas

- Per-engagement learning loop (lessons feeding the next strategist plan).
- Deeper white-box ⇄ black-box correlation — the default cross-view de-dup + SOURCE→LIVE
  source-guided verify already ship; graduate the still-flagged typed correlation-records and
  the LIVE→SOURCE root-cause back-linking.
- Community squad/catalog marketplace (see `PLUGIN_SDK.md`).

---

Contributions welcome — see `CONTRIBUTING.md`. Principles that gate every change:
`ARCHON_MANIFESTO.md`.
