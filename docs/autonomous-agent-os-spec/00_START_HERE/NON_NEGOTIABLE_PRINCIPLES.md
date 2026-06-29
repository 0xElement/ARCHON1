# Non-Negotiable Principles

## 1. Keep the golden spine

```text
Recon → Attack Plan → Specialists → Auditor → Judge → Report
```

All workflows must map back to this chain.

## 2. Keep current UI and operator experience

Do not rebuild the UI first. Improve backend intelligence and surface results through the current screens.

## 3. Agents decide next actions themselves

Agents should not wait for step-by-step manual commands. The Mission Director and planners should generate tasks from the engagement prompt and evidence.

## 4. Deterministic core, AI reasoning on top

Use deterministic logic for:

- Scope enforcement
- Task state
- Evidence schema validation
- Report assembly
- Agent contracts
- Knowledge Graph storage
- Finding gates

Use AI for:

- Planning
- Hypothesis generation
- Source-code understanding
- Business logic reasoning
- Prioritization
- Freehand security analysis

## 5. No evidence, no finding

A finding requires proof, affected asset, reproduction path, impact, and validation.

## 6. Source-code review has three phases

```text
Phase 1: Feature Mapping
Phase 2: Pattern-Based Vulnerability Review
Phase 3: Freehand Security Review
```

## 7. Pattern review and freehand review are both mandatory

Pattern review catches known classes. Freehand review catches unknown or novel logic flaws.

## 8. Black-box and white-box must correlate

Source findings should generate black-box proof tasks where possible. Black-box findings should ask source agents for root cause where source is available.
