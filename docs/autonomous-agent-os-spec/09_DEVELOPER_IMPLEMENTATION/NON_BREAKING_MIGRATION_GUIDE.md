# Non-Breaking Migration Guide

## Prime directive

Do not break the current ARCHON product.

The new autonomous agent OS architecture must be introduced gradually and safely. The existing UI, current workflows, current scan execution, and current report generation should remain functional throughout the migration.

## What must remain unchanged initially

- Current UI layout and navigation
- Current project creation flow
- Current scan start flow
- Current report download flow
- Current agent names where already used by the UI or logs
- Current evidence/output folder behaviour
- Current CLI commands
- Current environment variables
- Current Docker build process

## Additive-first strategy

Every new capability should be added beside the current implementation, not directly over it.

```text
Existing implementation → remains active
New implementation      → runs in shadow mode first
Feature flag            → controls activation
```

## Migration order

### 1. Preserve and wrap existing event bus

Do not delete or heavily rewrite `event-bus.js` first.

Instead:

```text
event-bus.js
  └── calls new orchestrator modules gradually
```

Recommended modules:

```text
src/orchestrator/mission-director.js
src/orchestrator/task-scheduler.js
src/orchestrator/agent-registry.js
src/orchestrator/phase-runner.js
src/orchestrator/state-manager.js
```

### 2. Add Knowledge Graph in passive mode

The Knowledge Graph should first listen to existing events.

It should not control execution until it has proven stable.

### 3. Add Evidence Engine compatibility layer

The new evidence model should accept current evidence/log formats.

Do not require all agents to instantly emit the new schema.

### 4. Add three-phase source review as a new mode

Keep the current source-code review path.

Add:

```text
source_review_mode=legacy
source_review_mode=three_phase
```

Default should remain legacy until tested.

### 5. Add black-box master agent as coordinator only

The black-box master agent should initially observe and recommend tasks.

Only later should it assign tasks directly.

### 6. Add Auditor/Judge strict gates gradually

Start with advisory validation.

Then move to strict validation once evidence quality is reliable.

## Feature flags

Recommended flags:

```text
ARCHON_ENABLE_AUTONOMOUS_OS
ARCHON_ENABLE_KNOWLEDGE_GRAPH
ARCHON_ENABLE_BLACKBOX_MASTER_AGENT
ARCHON_ENABLE_THREE_PHASE_SOURCE_REVIEW
ARCHON_ENABLE_PATTERN_REVIEW
ARCHON_ENABLE_FREEHAND_REVIEW
ARCHON_ENABLE_CORRELATION_ENGINE
ARCHON_ENABLE_STRICT_AUDITOR_GATE
ARCHON_ENABLE_STRICT_JUDGE_GATE
```

## Backward compatibility rules

1. Existing scans must still run.
2. Existing reports must still generate.
3. Existing UI must not require redesign.
4. Existing project files must still load.
5. Existing agent logs must remain readable.
6. New schemas must support legacy imports.
7. New modules must fail open to legacy behaviour where safe.

## Developer checklist before merging

- [ ] Docker build passes
- [ ] UI loads
- [ ] Legacy black-box scan works
- [ ] Legacy source review works
- [ ] Existing report output works
- [ ] New spec folder is copied into container
- [ ] Feature flags default to safe values
- [ ] No existing command is removed
- [ ] No current output path is changed
- [ ] New logs are additive, not replacing old logs

## Release strategy

Use versioned rollout:

```text
v0.x current ARCHON
v0.x+1 docs/spec added
v0.x+2 Knowledge Graph passive mode
v0.x+3 source review three-phase optional mode
v0.x+4 black-box master optional mode
v0.x+5 autonomous OS beta
v1.0 stable autonomous OS
```

## Final rule

ARCHON should evolve like a platform, not be rewritten like a prototype.
