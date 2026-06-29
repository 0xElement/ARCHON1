# schemas/ — Autonomous Agent OS canonical schemas

The spec's `RECOMMENDED_REPO_STRUCTURE.md` places the canonical JSON schemas here.
In ARCHON they live at **`common/schemas/`** (wired into the dependency-free
validator and the enum-mapping layer); this directory re-exports them via
`schemas/index.js` so both paths resolve without duplicating the files (no drift).

| Spec name | ARCHON file |
|---|---|
| `task.schema.json` | `common/schemas/task.schema.json` |
| `evidence.schema.json` | `common/schemas/evidence.schema.json` |
| `candidate.schema.json` | `common/schemas/candidate_finding.schema.json` |
| `finding.schema.json` | `agents/finding-schema.js` (the canonical finding shape is JS — `normalizeFinding`) + `common/schemas/candidate_finding.schema.json` |
| — (added) | `source_feature_map`, `correlation`, `chain`, `pattern_catalog` |

Validate with `common/schemas/validate.js` (subset validator — **no ajv**, no
js-yaml; see ULTRAPLAN §2). Map ARCHON↔spec enums with `common/schemas/mapping.js`.
