# Black-box Specialist Squads

## Authentication Squad

Focus:

- Login/logout
- Password reset
- MFA
- Session management
- JWT handling
- OAuth/SSO flows
- Account recovery

Required evidence:

- Flow description
- Token/session behavior
- Role/account context
- Reproduction steps
- Impact

## Authorization Squad

Focus:

- IDOR/BOLA
- BFLA
- Missing ownership checks
- Horizontal privilege escalation
- Vertical privilege escalation
- Tenant isolation
- Admin function exposure

Required evidence:

- Two-account or two-role proof where possible
- Object ownership context
- Request/response comparison
- Business impact

## Injection Squad

Focus:

- SQL injection
- NoSQL injection
- Command injection
- Template injection
- LDAP/XPath injection
- CRLF/header injection

Required evidence:

- Safe payload proof
- Differential response or controlled proof
- Affected parameter
- Impact explanation

## XSS/Client-Side Squad

Focus:

- Reflected XSS
- Stored XSS
- DOM XSS
- HTML injection
- CSP weakness
- Unsafe client-side sinks

Required evidence:

- Injection point
- Browser/rendering proof where applicable
- Payload context
- User impact

## API Squad

Focus:

- REST APIs
- GraphQL
- SOAP
- gRPC
- WebSocket
- JWT/API token behavior
- API authorization issues

Required evidence:

- Endpoint/method
- Auth context
- Request/response
- Schema or inferred object model
- Impact

## SSRF/Integration Squad

Focus:

- URL fetchers
- Webhooks
- Importers
- Preview generators
- Integrations
- Callback behaviors

Required evidence:

- Controlled destination proof
- Request trigger
- Safety-compliant impact explanation

## File Handling Squad

Focus:

- File upload
- File download
- Path traversal
- Archive extraction
- Parser abuse
- Content-type bypass
- Untrusted file rendering

Required evidence:

- Accepted file or path proof
- Validation bypass explanation
- Affected storage or rendering path
- Impact

## Business Logic Squad

Focus:

- Workflow bypass
- Payment abuse
- Refund abuse
- Approval bypass
- Race conditions
- State machine flaws
- Coupon/credit manipulation
- Trusting client-side values

Required evidence:

- Business workflow
- Expected control
- Abused path
- Before/after state
- Business impact
