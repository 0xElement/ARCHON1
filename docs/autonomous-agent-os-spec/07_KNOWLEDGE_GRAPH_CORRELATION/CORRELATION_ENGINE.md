# Correlation Engine

## Purpose

The Correlation Engine merges signals from recon, black-box testing, pattern review, freehand review, and validation.

## Correlation examples

### Source weakness to live proof

```text
Pattern review: missing ownership check
Black-box: cross-user access confirmed
Result: high-confidence IDOR finding
```

### Live behavior to source root cause

```text
Black-box: user can modify another tenant's object
Source review: tenant ID comes from request body
Result: root-cause-backed authorization finding
```

### Multi-step attack chain

```text
Open redirect
  ↓
OAuth callback influence
  ↓
Account linking weakness
  ↓
Account takeover candidate
```

## Correlation rules

Increase confidence when:

- Source and black-box evidence match
- Multiple agents independently identify same weakness
- Evidence is replayable
- Affected feature is sensitive
- Issue participates in a chain

Decrease confidence when:

- Evidence is scanner-only
- No reproduction steps exist
- Source code shows mitigating control
- Scope is unclear
- Impact is theoretical

## Output

```json
{
  "correlation_id": "corr-001",
  "linked_items": [],
  "correlation_type": "source_to_blackbox|blackbox_to_source|chain|duplicate|conflict",
  "confidence_delta": 0.2,
  "summary": "",
  "recommended_next_task": {}
}
```
