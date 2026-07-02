# Agent Authoring Guide

How to add or modify a **specialist persona** in ARCHON. A persona is data + prompts
— a `SOUL.md` (identity + remit) plus `skills/` — not engine code. Adding one should
not require touching `event-bus.js`.

## Anatomy of a persona

Personas live under `squads/<squad>/agents/<name>/` (universals at
`_universal/agents/<name>/`). Resolve every path through `paths.js` — never hardcode.

```
squads/pentest/agents/viper/
├── SOUL.md          # identity, single job, stop condition, arsenal  (REQUIRED)
├── skills/          # one dir per skill, each with a SKILL.md
│   └── xss-testing/
│       ├── SKILL.md         # the procedure the agent follows
│       ├── references/      # bypass tables, payload refs
│       ├── checklists/      # anti-drift execution contracts
│       └── scripts/         # helper scripts the skill invokes
├── MEMORY.md, MISTAKES.md, HEARTBEAT.md, …   # runtime state scaffolding
```

`paths.js` accessors you will use: `soulPath(name)`, `skillsDir(name)`,
`personaState(name)`, `memoryDir(name)`, `lessonsPath(name)`.

## SOUL.md — the contract

A good SOUL is specific and bounded. Mirror the existing specialists:

1. **Core Identity** — one line: who this agent is.
2. **Your Role / Single job** — exactly one domain (e.g. "client-side attacks").
   Overlap with another specialist is a smell.
3. **Stop condition** — when is this agent *done*? Be concrete ("all reflection
   points tested; 30 min no new findings = done"). Agents without a stop condition
   run forever or quit early.
4. **How You Work** — the ordered procedure, referencing the inputs it reads
   (endpoint map, RECON.md) and where it writes findings (the squad's findings dir).
5. **Your Arsenal** — the concrete techniques, with real example payloads.

Findings must conform to `agents/finding-schema.js` (`id`, `title`, `severity`,
`validation_status`, `impact`, `proof_of_execution`, reproduction fields). A
source-only candidate is a HYPOTHESIS (NEEDS-LIVE), never CONFIRMED.

## Registering a new specialist

Adding a persona dir is not enough — wire it into the four registries:

1. **`ownership.json`** — map `"<name>": "squads/<squad>"` (or `"_universal"`). This
   is how `paths.js` resolves the persona's home in nested mode.
2. **Squad roster** — add the agent to its squad config under
   `agents/squads/<squad>/squad.json` so the dispatcher knows it exists.
3. **`agents/model-config.js`** — give the agent a model family if it should
   differ from the squad default. Selection is always via
   `modelRouter.getModelForAgent('<name>', opts)` — never a literal model string.
4. **`src/core/coverage-map.js`** — if the specialist owns a WSTG area, add it to
   that area's `owner[]` so coverage scoring credits its runs. Map any new
   vuln-class string in `CLASS_TO_WSTG`.

For the **code-review** squad, also register the vuln class in
`src/dispatch/code-review-dispatcher.js` `CLASS` (agent + module + catalog) so the
Phase-2 router can dispatch the class. A null catalog auto-resolves to
`common/patterns/<class>.json` — see `PATTERN_AUTHORING_GUIDE.md`.

## Universals

`AUDITOR` (independent verifier), `ARBITER` (confidence judge), `SCRIBE` (final
reporter), and `COMMAND` (coordination) are shared across squads under
`_universal/agents/`. Touch these only when changing cross-squad behavior — they are
load-bearing for the evidence contract and the report.

## Testing your persona

There is no live LLM in CI. Validate structurally:

- `node -e "require('./paths').soulPath('<name>')"` resolves to your SOUL.
- The dispatcher integration tests (`test/code-review-dispatcher-integration.test.js`,
  the pentest wiring tests) mock `spawnAgent` — add an assertion there if your agent
  changes the dispatch wiring.
- Run the whole suite: `npm test` (must stay green).

## Checklist

- [ ] `SOUL.md` with a single job + an explicit stop condition.
- [ ] At least one `skills/<skill>/SKILL.md` with a concrete procedure.
- [ ] Registered in `ownership.json`, the squad roster, `model-config.js`.
- [ ] Coverage owner / `CLASS_TO_WSTG` updated if it owns an area.
- [ ] Findings conform to `finding-schema.js`; no over-claimed confirmations.
- [ ] `npm test` green.
