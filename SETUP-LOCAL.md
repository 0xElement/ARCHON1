# Local Development Setup

ARCHON runs **as a normal user, anywhere on disk** — no `sudo`, no `/root`. The two roots
(code + data) resolve from `paths.js`, which defaults them to the repo directory and
`<repo>/var/intel`, and autoloads `.env.local` if present — so the daemon and any spawned
`node` subprocess pick up your paths automatically. (A legacy server deploy under `/root`
still works: set the roots via env.)

## One-time setup

```bash
npm install                       # deps: claude-agent-sdk, acorn (+ optional playwright)
npm run setup                     # scaffold + seed the local data layer (var/intel)
```

That's it — a fresh clone runs with **no env set**: the roots default to the repo dir and
`<repo>/var/intel`, and the `claude` binary is found on `PATH`. You only need `.env.local` for
non-default roots or a specific Claude CLI:

```bash
cp .env.local.example .env.local  # then edit the paths inside (optional)
```

`.env.local` (gitignored) overrides three roots:

| Var | Default | Set it to |
|---|---|---|
| `KURU_AGENTS_ROOT` | the repo dir | where `event-bus.js` lives (only if running from elsewhere) |
| `KURU_INTEL_ROOT`  | `<repo>/var/intel` | a different data-layer location |
| `KURU_CLAUDE_BIN`  | `claude` (on `PATH`) | an explicit path to your Claude CLI |

> Real shell env vars override `.env.local`. The `claude` CLI must be installed and logged in
> (OAuth subscription — ARCHON runs on the Claude subscription, **no API key**) for agents to run.

> **Engagement types:** dispatch a **black-box** run with a URL, a **static** review with a source
> directory, or a **white-box** run with both (the code review runs first, then a source-guided live
> pentest verifies its findings against the target). The `code-review` squad is the under-the-hood
> white-box engine; the portal exposes it via the pentest form's source-directory field (set
> `KURU_PORTAL_SQUADS=pentest,code-review` to also offer it as a standalone dispatch option).

## Daily commands

```bash
npm start          # boot the event-bus daemon (foreground)
npm run dashboard  # the portal → http://localhost:4000 (PORT= to override) — dispatch/triage/report UI
npm test           # unit suite (test/run-all.js) — the product gate, fully offline
npm run setup      # re-scaffold var/intel (idempotent — never clobbers existing state)
npm run benchmark  # score a run against the OWASP Juice Shop ground truth (benchmark/)
```

Dispatch a task from the **dashboard portal** (`npm run dashboard`): pick the squad, enter the
target URL and/or source directory, and submit. (Under the hood a dispatch is a JSON entry the
daemon reads from `var/intel/dispatch-queue.json` on its poll cycle.)

## How portability works (for when you edit the code)

- **Single source of truth for the roots:** `paths.js` exports `AGENTS_ROOT` and
  `INTEL_ROOT`. **Never hardcode `/root/intel` or `/root/agents`** in new code — import
  from `paths.js` (`const agentPaths = require('./paths')` → `agentPaths.INTEL_ROOT`).
- **`.env.local` autoload** lives at the top of `paths.js`, keyed off its own directory,
  so it works no matter where the process is launched.
- The original cutover (2026-06-07) rewrote ~470 hardcoded `/root/...` literals into
  `paths.js`-derived expressions via a one-time AST codemod.

## The test gate

`npm test` (`test/run-all.js`) is the product gate. It runs **fully offline** — no test
touches the public internet (HTTP-dependent suites start a local fixture server) — and passes
against the seeded local `var/intel`. A few framework-internal suites are skipped by `run-all.js`
(they need a Bun runtime or long-running fixtures); that's expected, not a failure.

The **daemon boots cleanly** on a fresh clone (`npm start` → "NEXUS v3 active"), reads/writes the
local `var/intel`, and routes models from the seeded config. The **portal** (`npm run dashboard`)
serves the dispatch/triage/report UI on `127.0.0.1:4000`.

## Seeding details

`npm run setup` (`scripts/setup-local.js`) creates `var/intel/` with:
- the directory skeleton (reports, tasks, episodes, handoffs, …),
- gate-valid default **configs** (`model-config.json`, `grader-config.json`,
  `target-profile-rules.json`, `prompts-config.json`), sourced from each module's own
  fallback + the field requirements the gates assert,
- empty **state** collections (`tasks.json`, `dispatch-queue.json`, …).

It refuses to run against the real `/root/intel` unless `KURU_FORCE_PROD_SEED=1`, so it
can't clobber a production data layer.
