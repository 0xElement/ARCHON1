# Changelog

All notable changes to ARCHON are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and ARCHON adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Post-1.0 work in progress — see [BACKLOG.md](./BACKLOG.md) and [ROADMAP.md](./ROADMAP.md)._

## [1.0.2] — 2026-07-07

### Fixed
- **Vulnerability-focus picker reappeared in black-box mode.** v1.0.1 hid `#ptStrategyField` with the
  `hidden` attribute, but `applyPtMode()` re-set `display:block` on it when black-box/white-box was
  selected, overriding the attribute. Removed that re-show line so the picker stays hidden and every
  scan is full A→Z, as intended.

## [1.0.1] — 2026-07-07

### Changed
- **Disabled the black-box "Scan strategy → Vulnerability focus" class picker.** Selecting a class
  (e.g. XSS) silently narrowed the strategist to that class only, which read as "the strategy scan
  isn't accurate." Every scan now runs the full A→Z deep dive by default; dispatch is one step shorter.
  Backend focus handling is untouched (reversible). (#10)

## [1.0.0] — 2026-07-06

First stable release. ARCHON is a durable multi-agent AI penetration tester for web applications:
a lead agent plans a stack-specific attack, per-class specialists go deep in parallel, and
independent verifiers reject anything they can't reproduce — confirmed, de-duplicated findings land
live on the operator's board. Runs entirely on a Claude subscription over OAuth (no metered API key).

### Engagement modes
- **Black-box** — recon → stack fingerprint → ranked attack plan → parallel specialist waves
  (fire → observe → mutate → re-fire), WAF-adaptive.
- **Static / white-box** — reads the source: inventories → app blueprint → feature mapping →
  per-class assessment → AUDITOR reverse-check. Findings reported at `file:line` with the vulnerable
  code block as proof; review classes auto-selected from the discovered surface.
- **White-box (combined)** — code review runs first, then aims a source-guided live pentest;
  `cross-view-dedup` merges source and runtime views into one report.

### Core pipeline
- Two squads: **pentest** (lead ATLAS + ~15 specialists) and **code-review** (lead CURATOR + mappers/
  specialists + PROBER runtime validator), plus universal AUDITOR / ARBITER / SCRIBE / TRIAGER / WRITER.
- **Map-all-then-review** code-review pipeline: every feature is mapped before Phase 2 begins
  (fast-map all → deep-map high-risk → completion gate → per-class review), eliminating head-of-line
  stalls; findings stream to the board live with `file:line` + the vulnerable code block.
- Live triage squad that scales with the backlog; multi-judge consensus gates High/Critical.
- **Honest confirmation status** — `RUNTIME_CONFIRMED` / `SOURCE_CONFIRMED` /
  `NEEDS_LIVE_VALIDATION` / `DISPROVEN`; a source read is never dressed up as a live proof.
- **Evidence contract** — a CONFIRMED finding needs replayable evidence or it is demoted.
- Graded per-area OWASP WSTG coverage scoring; on-demand reporting (nothing auto-publishes).

### Safety
- **Fail-closed scope gate** (Phase 0.0) — a dispatch with no scope config is blocked.
- **Detecting ≠ exploiting** — impact-proving exploits fire only behind a 3-gate opt-in; off by default.
- Non-destructive by default; local-operator security (portal binds `127.0.0.1`; `var/` gitignored).

### Operator console
- Zero-build single-page dashboard: dispatch, live progress, triage, CVSS 3.1, and reports.
- Neutral empty-state pipeline preview.

### Tooling
- Portable roots (`KURU_*` + `.env.local` autoload) — a fresh clone runs unconfigured.
- Release gate (`npm run release:check`), clean-artifact packaging (`npm run pack:release`),
  secret/PII scanner + pre-commit hook + CI.
- Flag-gated, off-by-default **Autonomous Agent OS** layer (Mission Director, knowledge graph,
  pattern catalogs, decision logging); flag-off is byte-identical to the deterministic pipeline.

### Field-tested
- ARCHON's white-box review found a real broken-access-control flaw disclosed to GitLab via HackerOne,
  fixed in GitLab's May 2026 security release as **CVE-2026-4524** (CVSS 6.5, CWE-288).

[Unreleased]: https://github.com/ghostshift-content/ARCHON/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/ghostshift-content/ARCHON/releases/tag/v1.0.2
[1.0.1]: https://github.com/ghostshift-content/ARCHON/releases/tag/v1.0.1
[1.0.0]: https://github.com/ghostshift-content/ARCHON/releases/tag/v1.0.0
