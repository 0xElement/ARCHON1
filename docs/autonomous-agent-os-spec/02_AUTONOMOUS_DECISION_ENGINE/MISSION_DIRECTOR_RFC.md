# Mission Director RFC

## Purpose

The Mission Director is the top-level autonomous controller. It should not directly run tools. It decides what needs to happen next and delegates work to specialist agents.

## Input

- Engagement prompt
- Scope
- Rules of engagement
- URLs/domains/IPs
- Credentials/test accounts
- Source code location, if available
- Previous Knowledge Graph state
- Current task queue
- Current findings and rejected candidates

## Responsibilities

1. Classify engagement mode:
   - black-box only
   - static only
   - white-box only
   - hybrid
2. Create the initial execution plan.
3. Start Recon and Phase 1 source mapping.
4. Generate attack hypotheses.
5. Assign specialist agents.
6. Decide which tasks can run in parallel.
7. Detect stale/dead-end paths.
8. Ask the Correlation Engine for likely chains.
9. Send candidates to Auditor.
10. Send validated findings to Judge.
11. Determine when coverage is sufficient.
12. Trigger final report generation.

## Decision policy

The Mission Director should always ask:

```text
What do we know?
What do we not know?
Which feature or asset has the highest security value?
Which vulnerability class is most likely here?
Which specialist should test it?
What evidence is required?
Can this be correlated with source code or black-box proof?
Should this continue, pause, merge, or close?
```

## Mission Director must not

- Ignore scope boundaries
- Add final findings without Auditor and Judge
- Treat scanner output as confirmed evidence
- Run high-risk actions unless allowed by engagement configuration
- Rewrite the UI workflow unnecessarily

## Output

The Mission Director emits structured tasks:

```json
{
  "task_id": "task-001",
  "mode": "blackbox|static|whitebox|hybrid",
  "assigned_agent": "access-control-specialist",
  "objective": "Test whether project documents can be accessed across tenants",
  "inputs": ["endpoint-ref", "role-ref", "source-file-ref"],
  "required_evidence": ["request", "response", "role comparison", "impact"],
  "priority": "high",
  "stop_condition": "confirmed, rejected, blocked, or duplicate"
}
```
