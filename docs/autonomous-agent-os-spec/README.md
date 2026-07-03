# ARCHON Autonomous Agent OS Specification

This pack is the final developer-facing blueprint for evolving ARCHON into an open-source autonomous penetration-testing operating system while keeping the current UI, model, operator workflow, and product identity.

The mandatory golden spine remains:

```text
Recon → Attack Plan → Specialists → Auditor → Judge → Report
```

The main change is that agents should not wait for manual commands after dispatch. The operator gives the engagement prompt, scope, source/code inputs, test accounts, and constraints. ARCHON then plans, assigns, tests, validates, reports, and re-plans through its own autonomous decision loop.

## What this pack covers

- Autonomous Mission Director design
- Master agent team structure
- Black-box testing operating model
- Static and white-box source-code review in three phases
- Freehand security code review methodology
- Pattern-based vulnerability catalogs
- Knowledge Graph and correlation engine
- Auditor, Judge, Evidence, and Report gates
- Developer implementation roadmap
- JSON schemas and prompt contracts

## Mandatory rule

ARCHON must be evidence-driven. No finding should enter the final report unless it has sufficient proof, is in scope, and passes independent validation.

## Non-breaking integration

This pack lives under `docs/autonomous-agent-os-spec/`. For the rollout process, follow:

- `09_DEVELOPER_IMPLEMENTATION/NON_BREAKING_MIGRATION_GUIDE.md`

The migration principle is simple: preserve the current UI, current workflows, and current agent execution first. Add the autonomous architecture behind feature flags, run it in shadow mode, then enable modules one by one only after the existing product remains stable.
