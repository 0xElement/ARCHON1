# Attack Chain Engine

## Purpose

Find meaningful chains instead of reporting only isolated vulnerabilities.

## Chain model

```text
Weakness A → Enables Condition B → Enables Action C → Impact D
```

## Common chain categories

- Open redirect → OAuth weakness → account compromise
- IDOR → data exposure → privilege escalation
- SSRF → internal service access → secret exposure
- File upload → stored content execution/rendering → account impact
- Low-privilege API access → admin action exposure → sensitive change
- Source-code secret → authenticated access → business logic abuse

## Chain task creation

When a candidate finding is created, the Attack Chain Engine asks:

1. What does this newly enable?
2. Can it reach a more sensitive feature?
3. Can it bypass authentication, authorization, or tenant isolation?
4. Can it expose secrets or tokens?
5. Can it move from read impact to write/admin impact?

## Output

```json
{
  "chain_id": "chain-001",
  "steps": [],
  "current_confidence": "low|medium|high",
  "missing_proof": [],
  "next_validation_task": {}
}
```
