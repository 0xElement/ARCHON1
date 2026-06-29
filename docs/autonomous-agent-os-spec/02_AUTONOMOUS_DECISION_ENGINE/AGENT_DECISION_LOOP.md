# Universal Agent Decision Loop

Every agent must follow this loop:

```text
1. Receive task
2. Load relevant Knowledge Graph context
3. Understand objective
4. Identify assumptions
5. Create test plan
6. Execute allowed actions
7. Observe output
8. Decide result: confirmed, rejected, needs more work, blocked, duplicate
9. Collect evidence
10. Update Knowledge Graph
11. Suggest follow-up tasks
```

## Required reasoning questions

For every task, the agent should answer internally and summarize safely:

- Why is this task important?
- What evidence would prove the issue?
- What evidence would disprove it?
- What assumptions are being made?
- What related tasks should be created?
- Does this connect to an existing attack chain?

## Output contract

Every agent returns:

```json
{
  "task_id": "",
  "agent": "",
  "status": "confirmed|rejected|blocked|needs_more_evidence|duplicate",
  "summary": "",
  "facts_added": [],
  "evidence_refs": [],
  "candidate_findings": [],
  "follow_up_tasks": [],
  "coverage_notes": []
}
```
