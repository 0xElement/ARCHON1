# Evidence Model

## Rule

No evidence, no finding.

## Evidence package structure

```text
evidence/
  CAND-001/
    candidate.json
    summary.md
    requests/
      request-001.txt
    responses/
      response-001.txt
    screenshots/
    source/
      source-evidence.md
    tool-output/
    reproduction.md
    impact.md
    remediation.md
    audit-result.md
    judge-result.md
```

## Candidate finding minimum fields

- Title
- Category
- Affected asset
- Feature
- Entry point
- Preconditions
- Reproduction steps
- Evidence
- Impact
- Root cause, if source is available
- Recommended remediation
- Confidence
- Scope status

## Evidence quality levels

| Level | Description |
|---|---|
| L0 | Weak signal only |
| L1 | Source or scanner evidence only |
| L2 | Manual/live behavioral proof |
| L3 | Live proof plus source root cause |
| L4 | Reproducible chain with strong impact |

Only L2+ should normally enter final reports. L1 may enter only for source-only engagements and must be clearly labeled.
