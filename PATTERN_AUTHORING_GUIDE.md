# Pattern Authoring Guide

How to add or extend a **pattern catalog** — the per-vulnerability-class knowledge
that drives ARCHON's Phase-2 review. Catalogs are data under `common/patterns/`,
read by the dependency-free pattern engine in `src/intel/pattern-catalog.js`.

## The registry

`common/patterns/index.json` maps a vuln class to its descriptor file:

```json
{
  "version": "1",
  "classes": {
    "xss": "xss.json",
    "sqli": "sqli.json",
    "graphql": "graphql.json"
  }
}
```

Every class ARCHON can review must appear here. The 23 classes mirror the
`CLASS` map in `src/dispatch/code-review-dispatcher.js` and the catalog slugs used
by `src/core/coverage-map.js` (`CATALOG_BY_CLASS`).

## Two catalog shapes

**1. Thin descriptor** — when a rich markdown catalog already exists (e.g. ARCHON's
40-pattern access-control and 50-pattern XSS packs are the source of truth). The
JSON points at the markdown and tells the engine how to extract pattern ids:

```json
{
  "vuln_class": "xss",
  "source": "markdown",
  "markdown": "squads/code-review/methodology/catalogs/xss_50_pattern_catalog.md",
  "id_regex": "(XSS-[0-9]+)",
  "expected_count": 50
}
```

**2. Full inline catalog** — when there is no markdown pack, ship the patterns in the
JSON itself (this is how `sqli`/`ssrf`/`rce`/`account-takeover` and the newer
spec categories ship). Each pattern is an id + what to look for + the signal:

```json
{
  "vuln_class": "ssrf",
  "source": "inline",
  "patterns": [
    {
      "id": "SSRF-01",
      "name": "Unvalidated URL fetch from user input",
      "look_for": "http client call (requests/axios/curl) whose URL derives from a request param",
      "signal": "no allowlist / no scheme+host validation before the fetch",
      "severity_hint": "High"
    }
  ]
}
```

## Adding a new class — steps

1. Create `common/patterns/<class>.json` (thin or inline).
2. Register it in `common/patterns/index.json` under `classes`.
3. Add the class to `CLASS` in `src/dispatch/code-review-dispatcher.js`
   (`{ agent, module, catalog }`). A **null** `catalog` means "auto-resolve from the
   pattern engine" — `phase2Prompt` calls `catalogPathFor(class)` when the pattern
   flag is on, so a registered catalog is picked up automatically.
4. Map the class string in `src/core/coverage-map.js` `CLASS_TO_WSTG` (and
   `CATALOG_BY_CLASS` if you want coverage to name the catalog).
5. If a feature surface should *auto-select* this class, add its keyword trigger in
   `selectVulnClasses()` (same dispatcher) — e.g. a `graphql` inventory → `graphql`.

## The validation gate (dependency-free)

ARCHON validates catalogs **without `ajv` or `js-yaml`** — a deliberate constraint
enforced by a grep-gate. Use `common/schemas/validate.js`. A catalog must:

- be valid JSON with a `vuln_class` matching its registry key;
- declare `source` as `"markdown"` or `"inline"`;
- for `markdown`: point at an existing file and supply `id_regex` + `expected_count`;
- for `inline`: provide a non-empty `patterns[]`, each with a unique `id`.

Run `npm test` — the schema-conformance and pattern-catalog tests check every
registered class. Add a fixture/assertion if your catalog has novel structure.

## Quality bar for patterns

- **Actionable, not academic.** A pattern says what code shape to find and what
  makes it a bug — not a textbook definition.
- **Source-anchored.** Phase-2 produces file:line traces; write patterns a reviewer
  can map to a line.
- **Honest about proof.** A source pattern match is `SOURCE_CONFIRMED` at best —
  patterns flag candidates; they don't prove runtime exploitability (see
  `finding-schema.js` `confirmation_status`).

## Checklist

- [ ] `common/patterns/<class>.json` (thin or inline) is valid JSON.
- [ ] Registered in `index.json`.
- [ ] `CLASS` + `CLASS_TO_WSTG` updated; auto-select keyword added if relevant.
- [ ] `common/schemas/validate.js` passes (no new deps).
- [ ] `npm test` green.
