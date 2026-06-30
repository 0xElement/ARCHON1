# ARCHON Plugin SDK

ARCHON is extended at four surfaces — **squads**, **specialists**, **pattern
catalogs**, and **pipeline modules**. None of them require forking `event-bus.js`.
This document is the contract for each surface and the rules that keep extensions
safe and flag-inert.

## The chokepoints (use them, never bypass)

| Concern | Chokepoint | Never do instead |
|---|---|---|
| Persona / squad paths | `paths.js` (`soulPath`, `skillsDir`, `personaState`, `AGENTS_ROOT`, `INTEL_ROOT`) | hardcode `/root/...` or a local path |
| Model selection | `modelRouter.resolve(name)` | a literal model string |
| Running an agent | `runAgent(spec)` in `agents/runner/agent-runner.js` | spawn the `claude` CLI directly |
| Finding shape | `agents/finding-schema.js` (`normalizeFinding`) | invent a finding object |
| Feature flags | `paths.flagMode(name)` / `flagEnabled(name)` | read `process.env.ARCHON_ENABLE_*` |

A grep-gate fails the build if you read an `ARCHON_ENABLE_*` env var outside
`paths.js`, or add `ajv`/`js-yaml`.

## 1. Pipeline modules (`src/pipeline/*`)

The main extension point for new methodology/autonomy. A module is **pure** (no I/O
in the hot path where avoidable, deterministic, no hidden globals) and ships with a
`test/<module>.test.js`. Existing examples: `env-fingerprint`, `attack-planner`,
`exploit-prover`, `outcome-classifier`, `cross-view-dedup`, `chain-verifier`,
`attack-graph`.

```js
// src/pipeline/my-module.js
'use strict'
function analyze(input, opts = {}) { /* pure; return a plain object */ }
module.exports = { analyze }
```

Wire it into `event-bus.js` behind a flag so it is inert when off:

```js
const mode = agentPaths.flagMode('MY_MODULE')      // 'off' | 'shadow' | 'active'
if (mode !== 'off') {
  const out = require('./src/pipeline/my-module').analyze(ctx)
  if (mode === 'active') { /* drive */ } else { /* shadow: write to shadowDir only */ }
}
```

**Flag contract (tri-state).** `ARCHON_ENABLE_AUTONOMOUS_OS` is the master switch.
Per block, `ARCHON_ENABLE_<NAME>` turns it on in **shadow** (observe + write to
`paths.shadowDir(engagementId)`, drives nothing); add `ARCHON_DRIVE_<NAME>` to reach
**active** (drives execution). Flag-off ⇒ byte-identical to the deterministic
pipeline — this is tested.

## 2. Squads

A squad is a leader + specialists + a domain, registered in
`src/core/squad-framework.js` (`SQUAD_TYPES`) and configured under
`agents/squads/<squad>/squad.json`. The two shipped squads are `pentest` (black-box)
and `code-review` (white-box). A new squad supplies its own dispatcher (see
`src/dispatch/code-review-dispatcher.js` as the reference white-box engine) and its
roster in `ownership.json`.

## 3. Specialists

See `AGENT_AUTHORING_GUIDE.md`. A persona is `SOUL.md` + `skills/`, registered in
`ownership.json`, the squad roster, `model-config.js`, and (if it owns a WSTG area)
`coverage-map.js`.

## 4. Pattern catalogs

See `PATTERN_AUTHORING_GUIDE.md`. A catalog is JSON under `common/patterns/`,
registered in `index.json`, validated by the dependency-free
`common/schemas/validate.js`.

## Agent adapters

`runAgent(spec)` is the single chokepoint to the LLM, returning
`{text, usage, model, raw}`. The default adapter is `sdk` (subscription OAuth);
`ADAPTER=cli` is the rollback. The env allowlist lives in
`agents/runner/adapters/common.js`. To add an adapter, implement the same return
shape and register it there — do not call the model from anywhere else.

## Testing extensions

- Pure modules: a `test/*.test.js` with `node:test` or the lightweight custom harness
  (see `test/chain-verifier.test.js`).
- Dispatch wiring: extend the dispatcher integration tests (they mock `spawnAgent`).
- Everything runs offline — start a **local fixture** if you need HTTP, never a
  public URL.
- `npm test` must stay green, and flag-off must remain byte-identical.

## Golden rules

1. Flag-gated and inert when off.
2. Resolve through the chokepoints.
3. Pure + tested.
4. No new runtime dependencies.
5. Never weaken the safety perimeter (fail-closed scope, gated active-poc) or the
   evidence contract.
