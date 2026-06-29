# Phase 1: Feature Mapping

## Mission

Map all source-code features feature-by-feature so later testing becomes easy, structured, and complete.

The attached phase1 maps are examples only. ARCHON should replicate that style: clear feature files, consolidated indexes, coverage matrices, and review queues.

## Phase 1 must not

- Produce final vulnerability findings
- Skip boring features
- Only grep for dangerous functions
- Perform random file review
- Start with exploit assumptions

## Phase 1 must produce

```text
phase1-maps/
  README.md
  features/
    <feature-name>.md
  inventories/
    route_inventory.md
    api_inventory.md
    source_inventory.md
    auth_inventory.md
    model_inventory.md
    background_job_inventory.md
  consolidated/
    00_INDEX.md
    feature_coverage_matrix.md
    source_inventory_coverage_matrix.md
    same_functionality_cross_feature_map.md
    phase2_review_queue.md
    phase1_completion_gate.md
```

## Per-feature map template

Each feature file should include:

- Feature name
- Feature purpose
- User roles/actors
- Entry points
- Routes/controllers
- API endpoints
- GraphQL operations, if any
- Services/business logic files
- Models/database objects
- Authorization checks
- Ownership checks
- Sensitive data handled
- Inputs and outputs
- File upload/download paths
- External integrations
- Background jobs
- Webhooks
- Client-side/frontend files
- Same functionality in other features
- Security-relevant notes
- Phase 2 recommended vulnerability categories

## Phase 1 completion gate

Phase 1 is complete only when:

- All major routes/controllers are mapped
- API routes are mapped
- Auth and role checks are mapped
- Sensitive data flows are mapped
- Important background jobs are mapped
- Same functionality cross-feature map exists
- Phase 2 review queue exists
