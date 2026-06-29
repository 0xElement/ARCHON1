# Phase 3: Freehand Security Review

## Mission

Discover unknown or novel vulnerabilities that pattern-based review may miss.

This is where ARCHON thinks like a senior penetration tester rather than a rule engine.

## Required questions for every important feature

1. What is this feature trying to do?
2. Who is allowed to use it?
3. Can a user bypass authorization?
4. Can a user access or modify another user's data?
5. Is there a business logic flaw?
6. Could this workflow be abused?
7. Does this API trust the client too much?
8. Can data flow into a dangerous sink?
9. What assumptions is the developer making?
10. What happens if the workflow order is changed?
11. What happens if the same action is repeated?
12. What happens if stale, deleted, disabled, or cross-tenant objects are used?
13. What hidden states exist?
14. What would an attacker try if they understood this feature deeply?
15. Can this combine with another weak behavior?

## Freehand review style

The agent should reason in feature stories:

```text
Feature: Invoice approval
Intended behavior: Manager approves invoices belonging to their department
Security assumption: Client-provided department ID is trusted
Abuse idea: User changes department ID before approval
Likely impact: Cross-department approval bypass
Required proof: Two-role black-box test and source-code evidence
```

## Phase 3 output

```text
phase3-freehand-review/
  features/
    <feature-name>_freehand_review.md
  novel_candidates/
    NOVEL-001.md
  chain_ideas/
    attack_chain_candidates.md
  consolidated/
    freehand_coverage_matrix.md
    novel_findings_index.md
```

## Freehand candidate requirements

A freehand finding candidate must include:

- Feature being reviewed
- Intended behavior
- Security assumption
- Abuse hypothesis
- Source-code evidence
- Why pattern review may miss it
- Required black-box proof
- Potential impact
- Confidence level
