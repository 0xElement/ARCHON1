# Source-to-Black-box Correlation

In hybrid mode, source-code review and black-box testing must continuously feed each other.

## Source to black-box

```text
Source review finds missing ownership check
  ↓
Create black-box IDOR validation task
  ↓
Use two test accounts or roles
  ↓
Collect request/response evidence
  ↓
Auditor validates
  ↓
Judge approves or rejects
```

## Black-box to source

```text
Black-box agent confirms unexpected behavior
  ↓
Create source root-cause task
  ↓
Find route/controller/service/policy path
  ↓
Explain missing or broken control
  ↓
Attach source evidence to finding
```

## Correlation output

Every hybrid finding should include:

- Live proof
- Source root cause
- Affected feature
- Reproduction steps
- Impact
- Recommended fix
