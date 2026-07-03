# ARCHON — Release Checklist

> **For maintainers.** This is the release process, not a user launch list — the unchecked boxes are
> per-release steps run on the release host, not a claim the product is unfinished.

Run before a community release or a developer handoff.

## Packaging — produce a clean artifact

```bash
npm run pack:release      # → archon-release.zip via `git archive` (tracked files only)
```

`git archive` ships **only git-tracked files**, so it automatically excludes
`node_modules/`, `.git/`, and `.env.local` (all gitignored), plus the
`export-ignore` dev files in `.gitattributes`. **Never** zip the working directory
directly — that leaks local Mac paths and a multi-hundred-MB `node_modules`.

The shipped tree keeps: `package.json`, `package-lock.json`, `.env.local.example`,
`setup.sh`, `src/`, `agents/`, `common/`, `squads/`, `_universal/`, `scripts/`, `ui/`,
`tools/`, `test/`, `docs/`, `schemas/`, and the docs set.

## Environment — no hardcoded local paths

Roots resolve automatically (see `paths.js`): explicit env (`KURU_AGENTS_ROOT` /
`KURU_INTEL_ROOT`) → `ARCHON_ROOT` → `/root/agents` (only if it exists) → **the repo
dir**. A fresh clone therefore needs **no `.env.local`** — verified by `npm test`
passing with all roots unset.

## The checklist

- [x] Remove local/private files from the artifact — `git archive` omits `.env.local`, `node_modules/`, `.git/`.
- [x] No hardcoded local paths — `paths.js` resolves roots from cwd/repo when not on the `/root` server.
- [x] Tests work without internet — the chain-verifier live test uses a local HTTP fixture, not example.com.
- [x] Source-review default categories expanded + auto-selected from the discovered surface.
- [x] `SOURCE_CONFIRMED` vs `RUNTIME_CONFIRMED` (+ `NEEDS_LIVE_VALIDATION` / `DISPROVEN`) finding statuses.
- [x] Autonomous-decision logging (agent · why · evidence · task · confidence · outcome).
- [x] Coverage scoring (per-area % tested).
- [x] Community/plugin docs (CONTRIBUTING, PLUGIN_SDK, AGENT/PATTERN authoring, ROADMAP, MANIFESTO).
- [ ] Clean-clone bootstrap — `bash setup.sh` on a fresh clone installs, seeds, and reports Claude status.
- [ ] Black-box sample assessment — dispatch a URL-only engagement; confirm a clean report.
- [ ] Source-code review sample assessment — dispatch a source-only engagement; confirm a clean report.
- [ ] Confirm report output is clean (no orchestration logs, correct statuses).
- [ ] Confirm the UI still works as before (portal loads, dispatch/triage/report controls).

The last five require a running daemon + the `claude` CLI (subscription OAuth) and a
sample target, so they are operator-run on the release host, not in unit CI.
