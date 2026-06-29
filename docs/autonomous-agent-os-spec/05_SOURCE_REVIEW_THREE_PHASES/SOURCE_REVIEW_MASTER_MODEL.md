# Source Review Master Model

Source-code review must run in three phases.

```text
Phase 1: Feature Mapping
Phase 2: Pattern-Based Vulnerability Review
Phase 3: Freehand Security Review
```

## Why three phases

Phase 1 creates understanding. Phase 2 systematically checks known vulnerability categories. Phase 3 lets the agent reason like a senior pentester and find unknown or novel vulnerabilities that pattern review missed.

## Source review output pipeline

```text
Repository Input
  ↓
Phase 1 Feature Maps
  ↓
Phase 2 Pattern Findings
  ↓
Phase 3 Freehand Findings
  ↓
Candidate Findings
  ↓
Black-box Proof Tasks, if live target exists
  ↓
Auditor
  ↓
Judge
  ↓
Report
```

## Required source review rule

Do not jump directly to findings. First map the application feature-by-feature.
