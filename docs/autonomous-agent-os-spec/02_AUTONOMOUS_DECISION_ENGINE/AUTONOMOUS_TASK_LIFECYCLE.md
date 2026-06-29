# Autonomous Task Lifecycle

## Status model

```text
proposed → queued → running → evidence_submitted → audited → judged → reported
                         ↓              ↓          ↓
                       blocked        rejected   needs_more_evidence
```

## Task creation sources

Tasks may be created by:

- Mission Director
- Attack Planner
- Recon agents
- Source Phase 1 feature mapper
- Pattern-based review agents
- Freehand review agents
- Correlation Engine
- Auditor when more evidence is required

## Task types

```text
recon.discovery
recon.fingerprinting
blackbox.auth
blackbox.authz
blackbox.injection
blackbox.xss
blackbox.api
blackbox.business_logic
static.pattern_review
whitebox.feature_mapping
whitebox.freehand_review
correlation.chain_analysis
audit.validation
judge.quality_gate
report.section_update
```

## Agent autonomy rules

Agents may create follow-up tasks when:

1. They discover a new asset, endpoint, role, or feature.
2. Evidence suggests a different vulnerability class.
3. A source-code weakness needs live proof.
4. A black-box issue needs source root-cause review.
5. A partial exploit path needs chaining.
6. A finding needs additional evidence.

Agents must not create tasks outside scope or beyond allowed test intensity.
