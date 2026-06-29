# GraphQL, Cloud, Dependency, and Operational Patterns

## GraphQL patterns

- GQL-001 Introspection exposed in sensitive environment
- GQL-002 Resolver missing authorization
- GQL-003 Field-level authorization missing
- GQL-004 Batching or alias abuse
- GQL-005 Excessive query depth/complexity
- GQL-006 Mutation authorization mismatch
- GQL-007 Object node/global ID authorization bypass

## Cloud/infrastructure patterns

- CLOUD-001 Secrets in environment/config
- CLOUD-002 Over-permissive storage bucket/container
- CLOUD-003 Metadata access from SSRF-capable service
- CLOUD-004 Over-permissive IAM/service account
- CLOUD-005 Exposed admin/debug service
- CLOUD-006 Insecure Kubernetes/Docker configuration
- CLOUD-007 Publicly exposed internal dashboard

## Dependency/supply-chain patterns

- DEP-001 Known vulnerable dependency
- DEP-002 Dependency confusion risk
- DEP-003 Unsafe postinstall/build script trust
- DEP-004 Unpinned or weakly constrained dependency
- DEP-005 Insecure package source
- DEP-006 Secrets in CI/CD logs or configs

## Logging/audit patterns

- LOG-001 Sensitive data logged
- LOG-002 Log injection/HTML injection
- LOG-003 Security event not audited
- LOG-004 Audit record client-controlled
- LOG-005 Admin action missing audit trail
