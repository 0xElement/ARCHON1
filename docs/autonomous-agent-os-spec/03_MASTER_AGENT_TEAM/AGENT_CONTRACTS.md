# Agent Contracts

Every agent must implement the same high-level contract.

## Input contract

```json
{
  "task_id": "",
  "engagement_id": "",
  "agent_role": "",
  "objective": "",
  "scope": {},
  "allowed_actions": [],
  "test_intensity": "passive|standard|active|restricted",
  "knowledge_graph_refs": [],
  "inputs": [],
  "evidence_required": [],
  "constraints": [],
  "deadline_policy": "complete-best-effort-with-current-evidence"
}
```

## Output contract

```json
{
  "task_id": "",
  "agent_role": "",
  "status": "confirmed|rejected|blocked|needs_more_evidence|duplicate",
  "summary": "",
  "facts": [],
  "candidate_findings": [],
  "evidence": [],
  "new_hypotheses": [],
  "follow_up_tasks": [],
  "coverage_notes": [],
  "risk_notes": []
}
```

## Evidence minimums

Black-box evidence:

- Request
- Response
- Affected asset
- Test account/role context where relevant
- Reproduction steps
- Impact

Source evidence:

- File path
- Function/class/method
- Line range where available
- Entry point
- Security control or missing control
- Data flow or authorization flow
- Exploit hypothesis

Hybrid evidence:

- Source root cause
- Live proof
- Correlation explanation
