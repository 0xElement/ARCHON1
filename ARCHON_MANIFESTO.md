# The ARCHON Manifesto

ARCHON is an autonomous AI web-application pentester. These are the principles it is
built on — read them before you change how it thinks.

## 1. Evidence over assertion

A finding is a claim, and a claim without replayable evidence is a rumour. ARCHON
demotes anything it cannot reproduce: a CONFIRMED finding must carry a replayable
proof (a reproduction, an exploit-prover nonce, a captured live response) or it is
recorded as NEEDS-LIVE, not shipped as fact. We added `confirmation_status`
(`SOURCE_CONFIRMED` vs `RUNTIME_CONFIRMED`) precisely because *"I read the code and
it looks exploitable"* is not the same as *"I fired it at the running app and it
worked."* Never let the report blur the two.

## 2. Honest coverage

A scan that tested 4 of 23 areas and says nothing about the other 19 is lying by
omission. Every report states, per WSTG area, what was exercised and what was not
reached — with a number, not a vibe. Untested is a valid, *required* answer.

## 3. Safe by default, dangerous only on purpose

Scope is **fail-closed**: no scope, no scan. Impact-proving exploits fire only
behind three explicit gates (engagement mode + permission token + `ARCHON_ACTIVE_POC`).
The default run proves vulnerabilities exist; it does not detonate them. This is
non-negotiable for an open-source offensive tool — the perimeter is the product.

## 4. The engagement mode is a contract

- **black-box** (URL): live pentest **only** — no source is read.
- **static** (source): code review **only** — nothing is fired at a live target.
- **white-box** (URL + source): code review **and** source-guided pentest, with
  findings correlated **both ways** and merged into one de-duplicated report.

A mode never does another mode's job. A static review never claims runtime proof.

## 5. Determinism owns execution; autonomy advises

The deterministic pipeline (`event-bus.js`) is the source of truth. The autonomous
layer (Mission Director, knowledge graph, pattern catalogs) runs behind
`ARCHON_ENABLE_*` flags and, until explicitly told to `DRIVE`, only *observes and
recommends*. Flag-off must be **byte-identical** to the deterministic pipeline. New
intelligence earns the right to drive by first proving itself in shadow.

## 6. One chokepoint per concern

Persona paths resolve through `paths.js`. Models resolve through `modelRouter`.
Agents run through `runAgent`. Findings normalize through `finding-schema.js`. We do
not re-implement these inline — a second copy is a second bug and a silent drift.

## 7. Small, pure, tested

Pipeline modules under `src/pipeline/` are pure and ship with a `test/*.test.js`.
The test suite runs with **no network and no API key**. Dependencies are a cost, not
a convenience: ARCHON's schema/pattern layer is deliberately dependency-free.

## 8. Built to be extended

Squads, specialists, skills, and pattern catalogs are data and prompts, not
hard-coded control flow. Adding a vulnerability class should be writing a catalog,
not patching the engine. See `PLUGIN_SDK.md`, `AGENT_AUTHORING_GUIDE.md`, and
`PATTERN_AUTHORING_GUIDE.md`.

---

*If a change violates one of these principles, the change is wrong — not the
principle. If a principle is wrong, change it here first, in the open.*
