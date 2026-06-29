# Master Agent Team

ARCHON should be designed as an autonomous security team, not as one generic agent.

## Level 0: Mission Control

| Agent | Purpose |
|---|---|
| Mission Director | Owns the engagement and decides next work |
| Scope Governor | Enforces in-scope and out-of-scope boundaries |
| Safety Governor | Enforces test intensity and allowed actions |
| Queue Manager | Schedules tasks and prevents duplicate work |
| State Manager | Tracks lifecycle and Knowledge Graph writes |

## Level 1: Intelligence Agents

| Agent | Purpose |
|---|---|
| Knowledge Graph Agent | Maintains shared target intelligence |
| Context Builder | Prepares compact context for specialists |
| Coverage Agent | Tracks tested and untested features/classes |
| Hypothesis Engine | Converts facts into testable security hypotheses |
| Attack Chain Agent | Searches for multi-step attack paths |

## Level 2: Recon Squad

| Agent | Purpose |
|---|---|
| DNS Agent | DNS and subdomain intelligence |
| Certificate Agent | Certificate transparency discovery |
| HTTP Agent | HTTP service discovery and classification |
| Nmap Agent | Port/service inventory |
| Tech Fingerprint Agent | Framework, server, WAF, CDN, language hints |
| API Discovery Agent | REST, GraphQL, OpenAPI, Swagger, API docs |
| JavaScript Agent | JS route, endpoint, token, and sink discovery |
| Screenshot Agent | Visual surface mapping |
| Content Discovery Agent | Directories, files, robots, sitemap |

## Level 3: Black-box Specialist Squads

| Squad | Agents |
|---|---|
| Authentication | login, logout, MFA, reset, OAuth, SSO, session, JWT |
| Authorization | IDOR, BOLA, BFLA, RBAC, ABAC, tenant isolation |
| Injection | SQL, NoSQL, command, template, LDAP, XPath, CRLF |
| XSS | reflected, stored, DOM, HTML injection, CSP review |
| API | REST, GraphQL, SOAP, gRPC, WebSocket |
| SSRF | URL fetchers, webhooks, importers, callbacks |
| File Handling | upload, download, path traversal, archive extraction |
| Business Logic | workflow abuse, race, payment, approval, state machine |
| Infrastructure | exposed services, default panels, insecure admin surfaces |

## Level 4: Source Review Agents

| Agent | Purpose |
|---|---|
| Repository Indexer | Understands repository structure |
| Feature Mapper | Phase 1 feature-by-feature mapping |
| Pattern Router | Assigns Phase 2 vulnerability patterns |
| Pattern Specialists | Review specific vulnerability categories |
| Freehand Reviewer | Phase 3 novel vulnerability reasoning |
| Code Path Tracer | Tracks routes to services to sinks |
| Authorization Mapper | Maps actor, permission, ownership checks |
| Data Flow Agent | Finds sensitive data flows and dangerous sinks |
| Root Cause Agent | Explains why a confirmed issue exists in code |

## Level 5: Validation and Delivery

| Agent | Purpose |
|---|---|
| Auditor | Independently validates candidate findings |
| Judge | Accepts/rejects based on quality gates |
| Evidence Agent | Normalizes proof artifacts |
| Report Agent | Builds final report sections continuously |
| Remediation Agent | Writes clear developer guidance |
