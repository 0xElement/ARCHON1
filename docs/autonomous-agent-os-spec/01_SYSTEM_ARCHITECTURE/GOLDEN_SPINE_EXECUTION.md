# Golden Spine Execution

ARCHON must keep this as the main execution model:

```text
Recon → Attack Plan → Specialists → Auditor → Judge → Report
```

## Expanded flow

```text
1. Operator starts engagement
2. Mission Director parses prompt, scope, source, credentials, and rules
3. Scope Engine validates targets
4. Recon builds attack surface
5. Source Review Phase 1 maps features if code exists
6. Attack Planner creates hypotheses
7. Specialist agents execute black-box, static, and white-box tasks
8. Source Review Phase 2 applies pattern catalogs
9. Source Review Phase 3 performs freehand security reasoning
10. Correlation Engine merges related signals
11. Auditor independently validates candidate findings
12. Judge applies final quality gate
13. Evidence Engine stores proof package
14. Report Engine updates final report
15. Mission Director checks coverage and re-plans if needed
```

## Autonomous loop

```text
Observe current state
  ↓
Identify missing coverage
  ↓
Generate next hypotheses
  ↓
Assign specialist tasks
  ↓
Review outputs
  ↓
Validate evidence
  ↓
Update Knowledge Graph
  ↓
Decide whether to continue or report
```
