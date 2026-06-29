# Developer Build Notes

## Existing ARCHON alignment

The uploaded ARCHON project already has a strong base:

- Event bus/orchestration
- Agent names and roles
- Black-box and white-box flow
- Attack planner
- Evidence contracts
- Judge verifier
- Report generation
- UI dashboard
- Tests around security workflow

This specification should be integrated without throwing away that work.

## Highest-value engineering changes

1. Create Mission Director abstraction above existing orchestration.
2. Add Knowledge Graph as shared state.
3. Convert agent outputs into strict schemas.
4. Allow agents to create follow-up tasks.
5. Implement source review three-phase pipeline.
6. Load vulnerability patterns as structured catalogs.
7. Enforce Auditor/Judge gates.
8. Track coverage continuously.

## Contribution model

ARCHON should be easy for the security community to extend.

Community contributors should be able to add:

- New agents
- New pattern packs
- New tool adapters
- New report templates
- New source-code framework analyzers

without modifying core orchestration.
