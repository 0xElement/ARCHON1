# Auditor and Judge Flow

## Auditor

The Auditor independently validates candidate findings.

Auditor questions:

1. Is the candidate real?
2. Is the asset in scope?
3. Is evidence sufficient?
4. Are reproduction steps clear?
5. Is impact demonstrated?
6. Could this be a duplicate?
7. Could this be false positive?
8. Is more evidence required?

Auditor outputs:

```text
validated
rejected
needs_more_evidence
duplicate
out_of_scope
informational_only
```

## Judge

The Judge is the final quality gate.

Judge questions:

1. Does the finding meet report quality?
2. Is severity justified?
3. Is impact business-relevant?
4. Is remediation actionable?
5. Is evidence safe and clear?
6. Does this belong in final report?

## Mandatory gate

```text
Candidate Finding
  ↓
Auditor validation
  ↓
Judge quality gate
  ↓
Report finding
```
