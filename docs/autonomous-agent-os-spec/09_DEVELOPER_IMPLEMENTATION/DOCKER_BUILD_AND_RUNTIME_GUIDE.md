# Docker Build and Runtime Guide

## Goal

ARCHON should be Docker-friendly without changing the current product behaviour. The final specification pack should be added as documentation and runtime guidance, not as a breaking rewrite.

The Docker build must preserve:

- Existing UI
- Existing routes
- Existing agent names where possible
- Existing event bus behaviour
- Existing report output paths
- Existing environment variables
- Existing CLI commands
- Existing black-box flow
- Existing source-code review workflow

The architecture upgrade must be additive first.

## Recommended repository placement

```text
ARCHON/
  docs/
    autonomous-agent-os-spec/
      README.md
      00_START_HERE/
      01_SYSTEM_ARCHITECTURE/
      02_AUTONOMOUS_DECISION_ENGINE/
      03_MASTER_AGENT_TEAM/
      04_BLACKBOX_OPERATING_MODEL/
      05_SOURCE_REVIEW_THREE_PHASES/
      06_PATTERN_CATALOGS/
      07_KNOWLEDGE_GRAPH_CORRELATION/
      08_VALIDATION_EVIDENCE_REPORTING/
      09_DEVELOPER_IMPLEMENTATION/
      10_SCHEMAS/
      11_PROMPTS/
  src/
  ui/
  Dockerfile
  docker-compose.yml
```

Do not place this specification directly inside core runtime folders at first. Keep it under `docs/autonomous-agent-os-spec/` until the developer intentionally migrates each module.

## Runtime instruction loading

Agents may read instruction files from:

```text
ARCHON_AGENT_SPEC_DIR=/app/docs/autonomous-agent-os-spec
```

Recommended environment variable:

```bash
ARCHON_AGENT_SPEC_DIR=/app/docs/autonomous-agent-os-spec
ARCHON_ENABLE_AUTONOMOUS_OS=false
ARCHON_ENABLE_KNOWLEDGE_GRAPH=false
ARCHON_ENABLE_THREE_PHASE_SOURCE_REVIEW=false
ARCHON_ENABLE_BLACKBOX_MASTER_AGENT=false
```

Start with all new features disabled by default. Enable them one by one.

## Dockerfile guidance

The Dockerfile should copy the spec folder without changing application startup.

```dockerfile
COPY docs/autonomous-agent-os-spec /app/docs/autonomous-agent-os-spec
```

Do not make the application depend on the new spec folder during initial integration. If the folder is missing, ARCHON should still run in legacy mode.

## docker-compose guidance

Use volumes for outputs and evidence so data survives container restarts.

```yaml
services:
  archon:
    build: .
    environment:
      ARCHON_AGENT_SPEC_DIR: /app/docs/autonomous-agent-os-spec
      ARCHON_ENABLE_AUTONOMOUS_OS: "false"
      ARCHON_ENABLE_KNOWLEDGE_GRAPH: "false"
      ARCHON_ENABLE_THREE_PHASE_SOURCE_REVIEW: "false"
      ARCHON_ENABLE_BLACKBOX_MASTER_AGENT: "false"
    volumes:
      - ./outputs:/app/outputs
      - ./evidence:/app/evidence
      - ./reports:/app/reports
      - ./logs:/app/logs
```

## Safe rollout stages

### Stage 1: Documentation only

- Add the spec folder under `docs/`.
- Docker build should succeed.
- UI should behave exactly the same.
- Existing scans should run exactly the same.

### Stage 2: Read-only instruction loading

- Agents can read prompt files.
- No orchestration changes yet.
- No new Knowledge Graph writes yet.
- Existing reports remain unchanged.

### Stage 3: Shadow mode

Run the new architecture in parallel but do not let it control execution.

Example:

```text
Existing ARCHON flow runs normally
New Mission Director observes only
Knowledge Graph receives copied events only
No new agent can block or change legacy execution
```

### Stage 4: Feature-flagged execution

Enable one capability at a time:

```text
1. Knowledge Graph
2. Evidence model
3. Three-phase source review
4. Black-box master agent
5. Correlation engine
6. Auditor/Judge strict gate
```

### Stage 5: Default autonomous mode

Only make autonomous mode default when:

- Legacy flow still works
- UI remains stable
- Reports are equal or better
- Evidence is consistently produced
- Existing tests pass

## Non-breaking integration rule

Every new module must support this pattern:

```text
if feature flag disabled:
    use existing behaviour
else:
    use new behaviour
```

No existing function should be removed until the replacement has been tested in shadow mode.

## Required health checks

Docker runtime should expose health checks for:

- UI server running
- API server running
- Event bus running
- Output directory writable
- Evidence directory writable
- Report directory writable
- Agent spec directory readable

## Required mounted folders

```text
/app/outputs
/app/evidence
/app/reports
/app/logs
/app/workspace
/app/docs/autonomous-agent-os-spec
```

## Developer acceptance criteria

The Docker build is successful only if:

- Container starts without manual steps
- Existing UI loads
- Existing scan path works
- Existing report path works
- Spec folder is available inside the container
- New autonomous features can be disabled
- No existing agent is removed
- No existing operator workflow is broken
