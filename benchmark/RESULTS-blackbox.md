# ARCHON black box benchmark: OWASP Juice Shop

> This report was generated while the run was still in progress. Regenerate it after the run reaches awaiting triage for the final numbers.

## Summary

| Field | Value |
|---|---|
| Target | OWASP Juice Shop |
| URL | http://REDACTED-HOST:3000 |
| Mode | Black box (live pentest) |
| Task | `t-1782906654779-cd2d` |
| Status | in-progress (65%) |
| Date | 2026-07-01 |
| Findings on the board | 39 |
| Severity | 22 Critical, 9 High, 8 Medium, 0 Low, 0 Info |
| Class coverage | 10 of 15 (67%) |

## Vulnerability class coverage

ARCHON is scored on whether it surfaced at least one confirmed finding in each vulnerability
class that OWASP Juice Shop is known to contain. Matching is by CWE, OWASP tag, or keyword.

| Class | Result | Representative finding |
|---|---|---|
| SQL Injection (login bypass, product search) | found | SQL Injection authentication bypass — POST /rest/user/login  |
| Cross Site Scripting (DOM, reflected, stored) | found | Stored XSS via Unauthenticated PUT /rest/products/{id}/revie |
| Broken authentication, weak or default credentials, no rate limit | found | SQL Injection Authentication Bypass via Login Email Field |
| Broken access control and IDOR | found | Admin privilege escalation via mass assignment on POST /api/ |
| Sensitive data and information exposure (errors, backups, /ftp files) | found | Cryptographic key material exposed at /encryptionkeys/ enabl |
| Path traversal and LFI (/ftp poison null byte) | found | Unauthenticated /ftp/ directory listing and null-byte extens |
| JWT weaknesses (none algorithm, forged token) | found | JWT Algorithm Confusion (alg:none) — Unauthenticated Admin I |
| Cross Site Request Forgery | found | Unauthenticated Stored XSS via Product Reviews |
| Unvalidated or open redirect | not surfaced |  |
| Server Side Request Forgery | not surfaced |  |
| XML External Entity | not surfaced |  |
| Security misconfiguration, missing headers, CORS | found | CORS Wildcard (Access-Control-Allow-Origin: *) Permits Any O |
| Other injection (NoSQL, command, code) | not surfaced |  |
| Vulnerable or outdated components | not surfaced |  |
| Improper input validation and business logic abuse | found | Mass Assignment — Unauthenticated Self-Registration as Admin |

## Severity breakdown

22 Critical, 9 High, 8 Medium, 0 Low, 0 Info.

## Extra findings

ARCHON also reported 29 findings that did not map to a ground truth class. These are
finer grained variants of a covered class (for example several distinct JWT or SQL injection
findings), or services discovered on the host during recon that are not part of Juice Shop.

## How this was measured

The ground truth is 15 vulnerability classes defined in
`benchmark/juice-shop-ground-truth.json`. The scorer in `benchmark/score.js` maps each board
finding to a class and reports class level coverage. Regenerate this report with:

```
node benchmark/report-md.js t-1782906654779-cd2d
```
