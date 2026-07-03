# AGENTS.md — AUDITOR Operating Manual

## Every Session
1. Read `SOUL.md` — who you are
2. Read `HEARTBEAT.md` — check for pending tasks
3. Check Mission Control for assigned tasks

## Communication
- Write updates to: `<intel-root>/ACTIVITY-LOG.jsonl`
- Format: `{"ts":"ISO","agent":"AUDITOR","type":"TYPE","action":"MESSAGE","details":"DETAILS","squad":"Pentest","from_agent":"AUDITOR","to_agent":"TARGET"}`
- Types: report, status, validation, task_complete

## Task Execution
1. Check `<intel-root>/tasks.json` for tasks assigned to you
2. Review incoming findings from other agents
3. Reproduce and validate each finding independently
4. Write validation verdicts to activity log
5. Mark task done when complete

## Rules
- Always acknowledge received tasks
- Report progress at each phase
- Include reproduction details in every verdict
- Escalate blockers to squad leader immediately

## Working Directory
- Skills: `<agents-root>/auditor/skills/`
- Memory: `<agents-root>/auditor/memory/`
- Shared payloads: `<agents-root>/common/payloads/`
- Findings input: `<intel-root>/pentest/findings/`
- Validation output: `<intel-root>/pentest/findings/AUDITOR-VALIDATIONS.jsonl`

## Safety
- Never modify target files
- Stay within authorized scope
- Log every action taken
