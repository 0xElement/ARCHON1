# Phase 2: Pattern-Based Vulnerability Review

## Mission

Use Phase 1 maps to apply vulnerability patterns feature-by-feature.

Phase 2 is systematic. It should ensure known vulnerability classes are not missed.

## Inputs

- Phase 1 feature maps
- Route inventory
- API inventory
- Authorization map
- Actor/role map
- Data exposure map
- Phase 2 review queue

## Pattern review method

For each feature:

1. Load feature map.
2. Identify relevant vulnerability categories.
3. Apply category-specific patterns.
4. Record matched and rejected patterns.
5. Create candidate findings only when evidence exists.
6. Create black-box validation tasks where possible.
7. Send candidates to Auditor.

## Phase 2 output

```text
phase2-pattern-review/
  features/
    <feature-name>_pattern_review.md
  candidates/
    CAND-001.md
  rejected/
    <feature-name>_rejected_patterns.md
  consolidated/
    phase2_coverage_matrix.md
    candidate_findings_index.md
    blackbox_validation_queue.md
```

## Pattern result states

```text
matched_candidate
not_applicable
reviewed_no_issue
needs_manual_review
needs_blackbox_validation
duplicate
```
