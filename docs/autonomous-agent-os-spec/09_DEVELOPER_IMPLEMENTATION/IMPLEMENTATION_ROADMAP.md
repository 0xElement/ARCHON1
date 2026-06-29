# Developer Implementation Roadmap

## Phase 0: Preserve current product

Do not redesign the UI first.

Keep:

- Dispatch screen
- Task screen
- Findings/triage
- CVSS workflow
- Report workflow
- Existing agent identity where useful
- Existing golden spine

## Phase 1: Split orchestration cleanly

Refactor large orchestration logic into modules:

```text
src/orchestrator/
  mission-director.js
  queue-manager.js
  task-lifecycle.js
  scope-governor.js
  safety-governor.js
  agent-router.js
  state-manager.js
```

## Phase 2: Add Knowledge Graph

```text
src/intel/
  knowledge-graph.js
  entity-store.js
  relationship-store.js
  coverage-store.js
```

## Phase 3: Add autonomous task creation

Agents should be able to create follow-up tasks through a controlled API.

```text
createTask()
createHypothesis()
linkEvidence()
updateCoverage()
requestAudit()
```

## Phase 4: Implement three-phase source review

```text
src/source-review/
  phase1-feature-mapper.js
  phase2-pattern-router.js
  phase3-freehand-reviewer.js
  source-blackbox-correlator.js
```

## Phase 5: Implement pattern catalog loading

```text
patterns/
  access-control/
  authentication/
  injection/
  xss/
  api/
  business-logic/
  cloud/
```

## Phase 6: Strengthen black-box squads

Move from generic scanning to specialist task execution.

## Phase 7: Add Auditor/Judge hard gates

No report finding should bypass these gates.

## Phase 8: Continuous reporting

Report sections should update as evidence is validated.

## Phase 9: Community plugin SDK

Allow community to add:

- Agents
- Pattern packs
- Tool adapters
- Report templates
- Knowledge Graph node types
