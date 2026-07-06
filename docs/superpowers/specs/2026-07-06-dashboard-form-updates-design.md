# Dispatch-form UX updates — design

**Date:** 2026-07-06
**Branch:** `feat/dashboard-form-updates`
**Scope:** operator console (`ui/` + `scripts/dashboard.js`) only. No change to the daemon
pipeline, agents, or squad logic.

Five self-contained changes to the **New dispatch** form and the Overview empty state, plus
one new dependency (`adm-zip`) for source-archive upload.

---

## 1. Remove the "juice-shop" card on fresh startup

**Today:** the Overview page's empty state (`DEMO_LOOP_HTML`, `ui/app.js`) renders a fake
`juice-shop.local` engagement with invented SQLi/JWT/IDOR findings. It is shown only when
`state.tasks` is empty (`renderTasks()`), is purely presentational, and is wired to nothing.

**Change:** replace `DEMO_LOOP_HTML` with a neutral, honest empty state — a short "No runs yet"
message pointing the operator at **New dispatch**. No fake target, no fake findings. Backend
untouched.

## 2. Source code directory → upload a `.zip` (in addition to a path)

**Today:** `#crSourceDir` / `#ptSourceDir` are plain absolute-path text inputs, validated by
`GET /api/check-source`. The value rides to the daemon as `meta.sourceDir` (a path string). There
is **no** upload/multipart/zip code anywhere in the repo.

**Change:** add a small **mode toggle** on the source field — *Paste a path* (unchanged) or
*Upload .zip*. The upload path:

- Frontend reads the chosen `.zip` and POSTs its **raw bytes** to a new
  `POST /api/upload-source`, with the original filename in an `X-Filename` header. This avoids
  needing a multipart parser (the existing `readBody` is JSON-only, 1 MB cap — untouched).
- The server buffers the binary with a **new dedicated reader** (hard cap ~100 MB), writes it to a
  temp file, and extracts with **`adm-zip`** into **`var/intel/uploads/<id>/`**. Extraction is
  **zip-slip-guarded**: every entry's resolved path must stay inside the target dir, or the upload
  is rejected (critical — this is a security tool).
- The server validates the extracted tree with the existing `checkSourceDir()` and returns its
  **absolute path**, which the frontend drops into the `sourceDir` field. From there the entire
  downstream pipeline is unchanged (it still receives a path string).

New dependency: **`adm-zip`** (pure-JS, no native build) — Node ships no zip extractor.

## 3. Test accounts → high-priv / low-priv (exactly two rows)

**Today:** an add-N-rows list, each with a role dropdown **admin / normal / other**
(`credRow()`). The role is **cosmetic** downstream — validated against a `ROLES` whitelist in
`buildPentestMeta()` and rendered into the engagement brief; no backend logic branches on it.

**Change:** replace the add-more list with **exactly two fixed rows** — **"High-privilege user"**
and **"Low-privilege user"** (username + password each), role values `high` / `low`.

- `ROLES` whitelist in `scripts/dashboard.js` → `['high','low']` (else new values coerce to the
  fallback and get dropped). Fallback role → `low` (least privilege).
- Static-analysis `testAccounts` mapping keeps its shape: attacker = low-priv, victim = high-priv
  (the natural privilege-escalation direction).
- Engagement-brief prose/table copy updated to say high/low-priv.

## 4. Model override → fetched from the SDK at runtime

**Today:** `#fModel` hardcodes `auto` + three concrete model IDs in `ui/index.html`, duplicating
`model-config.json` (and violating the repo's "never hardcode model strings" rule).

**Change:** new module `src/routing/model-catalog.js` + route `GET /api/models`:

1. Try the bundled SDK's `query(...).supportedModels()` over the OAuth CLI session (no API key;
   idle streaming-input session that initializes but runs no turn). Timeout-guarded (~6 s),
   result cached in-memory (5 min TTL).
2. Fall back to `modelRouter.loadModelConfig().families`.
3. Hard fallback to whatever the router's config gives.

The frontend fetches `/api/models` on boot and populates `#fModel`
(`value` = the SDK-native model id, label = display name). The HTML keeps only the `auto` option
as the offline-safe default — **no hardcoded model IDs in markup** (satisfies the CLAUDE.md rule).

`model-catalog.js` takes an injectable `sdkLoader` so the config-fallback path is unit-testable
offline.

## 5. Priority — removed

**Today:** a Low/Normal/High segmented control (`#fPriority`). Trace confirms it is **vestigial**:
the daemon's dispatch loop is strictly FIFO + concurrency-capped and never reads `priority` for
ordering; it is only interpolated into a prompt line.

**Change:** remove the field from `ui/index.html` and its handler/reads in `ui/app.js`. The server
already defaults `priority: 'normal'` when the field is absent, so the queue entry shape and the
prompt line are unchanged. No backend edit required.

---

## Testing / verification

- `npm test` (`node test/run-all.js`) must stay green; add a `test/model-catalog.test.js` covering
  the config-fallback and SDK-normalization paths (offline, injected loader).
- Manual: restart the dashboard, load **New dispatch** — confirm the model dropdown populates from
  `/api/models`, Priority is gone, test accounts show two priv rows, the source field offers a zip
  upload that extracts + validates, and the Overview empty state shows no juice-shop card.

## Out of scope

- `components/dashboard-demo-framed.html` (a README GIF mock the portal never serves) — left as-is.
- Non-UI juice-shop references in `benchmark/` and `test/` (unrelated to the portal).
- Any change to daemon scheduling, scope gating, or agent behavior.
