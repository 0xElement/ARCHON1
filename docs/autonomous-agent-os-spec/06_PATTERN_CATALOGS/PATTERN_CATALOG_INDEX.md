# Vulnerability Pattern Catalog Index

ARCHON should maintain pattern catalogs as first-class project assets.

Each pattern category should contain:

- Pattern ID
- Vulnerability class
- What to look for
- Source-code indicators
- Black-box indicators
- Evidence required
- False-positive checks
- Suggested validation task
- Reporting guidance

## Core pattern categories

1. Access Control and IDOR
2. Authentication and Session Management
3. Injection
4. XSS and Client-Side Injection
5. SSRF and External Resource Fetching
6. File Upload, Download, and Parsing
7. API Security
8. GraphQL Security
9. Business Logic
10. Data Exposure and Privacy
11. Cryptography and Secrets
12. Deserialization and Object Injection
13. Path Traversal and File Access
14. Race Conditions and Concurrency
15. Webhooks and Integrations
16. Cloud and Infrastructure
17. Dependency and Supply Chain
18. Logging, Monitoring, and Audit
19. Multi-Tenant Isolation
20. Admin and Privileged Operations

## Pattern output states

```text
matched_candidate
needs_blackbox_validation
needs_source_root_cause
reviewed_no_issue
not_applicable
false_positive
duplicate
```
