# SSRF, File, API, and Business Logic Patterns

## SSRF patterns

- SSRF-001 URL fetcher accepts arbitrary URL
- SSRF-002 Webhook target not restricted
- SSRF-003 Import/preview feature fetches remote content
- SSRF-004 Redirect-follow bypass
- SSRF-005 DNS rebinding or host validation mismatch
- SSRF-006 Cloud metadata exposure risk

## File handling patterns

- FILE-001 Upload extension/content-type mismatch
- FILE-002 SVG or HTML upload rendered in browser
- FILE-003 Archive extraction traversal
- FILE-004 Path traversal in download/export
- FILE-005 Unsafe image/document parser
- FILE-006 Untrusted file served from trusted origin
- FILE-007 File overwrite or predictable storage path

## API patterns

- API-001 BOLA/IDOR in object endpoints
- API-002 BFLA in action endpoints
- API-003 Excessive data exposure
- API-004 Mass assignment
- API-005 Unrestricted pagination/export
- API-006 Weak rate/abuse control for sensitive actions
- API-007 Inconsistent web/API authorization
- API-008 Verb/method confusion

## Business logic patterns

- BL-001 Workflow step can be skipped
- BL-002 Approval can be self-approved
- BL-003 Price, quantity, role, or status trusted from client
- BL-004 Race condition changes state twice
- BL-005 Refund/cancel/retry abuse
- BL-006 Invite or membership abuse
- BL-007 Trial/subscription limit bypass
- BL-008 Deleted/disabled/stale object can still be used
- BL-009 Cross-feature same-functionality mismatch
- BL-010 Audit/logging bypass for sensitive action
