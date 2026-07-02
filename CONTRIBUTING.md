# Contributing to ARCHON

Thanks for helping build ARCHON. This guide covers setup, the rules that keep the
engine safe and stable, and how to get a change merged. Read `ARCHON_MANIFESTO.md`
first — it explains *why* the rules below exist.

## Quick start

```bash
git clone <your-fork>
cd ARCHON
npm install            # acorn + the Claude Agent SDK; playwright is optional
npm run setup          # seeds var/intel + local state (idempotent)
npm test               # node test/run-all.js — must be green, no network, no API key
```

ARCHON runs on the **Claude subscription via OAuth** (the `claude` CLI, pointed at by
`KURU_CLAUDE_BIN`). There is **no API key**. See `SETUP-LOCAL.md` for env + portable roots.

## Ground rules (these block a PR)

1. **Tests pass offline.** `npm test` must be green with no internet and no API key.
   A test that needs a server starts a **local fixture** (see
   `test/chain-verifier.test.js`) — never a public URL.
2. **Flag-off is byte-identical.** Any Autonomous-OS work goes behind a
   `paths.flagMode('<NAME>')` gate and must be inert when the flag is off. Never read
   `process.env.ARCHON_ENABLE_*` directly — `paths.js` is the only reader (a grep-gate
   enforces this). Default (nothing set) ⇒ the deterministic pipeline, unchanged.
3. **No hardcoded roots or paths.** Resolve persona/squad paths via `paths.js`
   (`agentPaths.soulPath(name)`, `skillsDir`, `personaState`, …) and roots via
   `AGENTS_ROOT` / `INTEL_ROOT`. No raw `/root/...` or local-machine literals.
4. **No hardcoded model strings.** Use `modelRouter.resolve(agentName)`.
5. **Atomic writes on shared state.** `tasks.json`, `dispatch-queue.json`,
   `ACTIVITY-LOG.jsonl` use `writeAtomic` + `withFileLock` — never bare
   `fs.writeFileSync`.
6. **Evidence contract holds.** A CONFIRMED finding needs replayable evidence or it
   is demoted. Don't add a path that ships unproven findings as confirmed.
7. **Safety perimeter is sacred.** Scope stays fail-closed; impact-proving exploits
   stay behind the active-poc 3-gate. Don't weaken either.
8. **New pipeline module ⇒ new test.** Anything under `src/pipeline/*` (and the
   pure helpers in `src/core/`, `src/intel/`) ships with a `test/*.test.js`.
9. **No new runtime dependencies** without discussion. The schema/pattern layer is
   intentionally dependency-free (no `ajv`, no `js-yaml`).

## Workflow

- Branch from `main`. Keep diffs focused; stage specific files (never `git add -A`).
  Runtime drift under `var/` is gitignored — don't commit it.
- Run `npm test` before pushing. For UI changes, `npm run test:ui`.
- Commit messages: imperative subject, a body explaining *why*. End with:
  `Co-Authored-By: <you>`.
- Open a PR against `main` describing the change, the risk, and how you tested it.

## Where things live

| You want to… | Go to |
|---|---|
| Add a vulnerability class / patterns | `common/patterns/` → `PATTERN_AUTHORING_GUIDE.md` |
| Add or change a specialist agent | `squads/<sq>/agents/<name>/` → `AGENT_AUTHORING_GUIDE.md` |
| Add an autonomy/methodology module | `src/pipeline/` → `PLUGIN_SDK.md` |
| Change the black-box pipeline | `event-bus.js` (`dispatchPentestParallel`) + `src/pipeline/` |
| Change the white-box / static engine | `src/dispatch/code-review-dispatcher.js` (squad: `squads/code-review/agents/<name>/`); source→live correlation in `src/dispatch/whitebox-correlation.js` |
| Change root/path resolution | `paths.js` (the one chokepoint) |
| Change model selection | `src/routing/model-router.js` + `agents/model-config.js` |
| Understand the pipeline | `CLAUDE.md` + `docs/ORCHESTRATION.md` |

## Releasing

`npm run pack:release` builds a clean ZIP via `git archive` (tracked files only — no
`node_modules`, `.git`, or `.env.local`). See `RELEASE_CHECKLIST.md`.

## Reporting security issues

ARCHON is an offensive tool; please report vulnerabilities *in ARCHON itself*
privately via the repo's security contact, not a public issue.
