# ARCHON Black Box Benchmark

**Target:** OWASP Juice Shop  ·  `http://<target-host>:3000`  ·  2026-07-01

> Snapshot taken while the run was still executing. It is regenerated for the final numbers once the run reaches operator triage.

ARCHON was pointed at a fresh OWASP Juice Shop instance with no prior knowledge and asked to
perform a full black box web application penetration test. Juice Shop is a deliberately
vulnerable application, which makes it a stable yardstick: the benchmark measures how many of the
vulnerability classes it is known to contain ARCHON surfaces on its own, and how deeply.

## Coverage at a glance

```
class coverage   ████████████████░░░░░░░░  67%   (10 of 15 classes)
```

| Metric | Value |
|---|---|
| Confirmed findings on the board | **41** |
| Critical / High / Medium | 24 / 9 / 8 |
| Vulnerability classes covered | **10 of 15** (67%) |
| Additional findings beyond the classes | 31 |

```mermaid
pie showData title Vulnerability class coverage
  "Covered" : 10
  "Missed" : 5
```

## Findings by severity

ARCHON confirmed **41** findings, weighted heavily toward high impact issues.

```mermaid
pie showData title Findings by severity
  "Critical" : 24
  "High" : 9
  "Medium" : 8
```

## Class scorecard

Each vulnerability class Juice Shop is known to contain, and whether ARCHON surfaced at least one
confirmed finding for it. Matching is by CWE, OWASP tag, or keyword.

| Vulnerability class | Result | Representative finding |
|---|:--:|---|
| SQL Injection | 🟢 found | SQL Injection authentication bypass — POST /rest/user/login gran |
| Cross Site Scripting | 🟢 found | Stored XSS via Unauthenticated PUT /rest/products/{id}/reviews |
| Broken authentication, weak or default credentials, no rate limit | 🟢 found | SQL Injection Authentication Bypass via Login Email Field |
| Broken access control and IDOR | 🟢 found | Admin privilege escalation via mass assignment on POST /api/User |
| Sensitive data and information exposure | 🟢 found | Cryptographic key material exposed at /encryptionkeys/ enabling  |
| Path traversal and LFI | 🟢 found | Unauthenticated /ftp/ directory listing and null-byte extension- |
| JWT weaknesses | 🟢 found | JWT Algorithm Confusion (alg:none) — Unauthenticated Admin Imper |
| Cross Site Request Forgery | 🟢 found | Unauthenticated Stored XSS via Product Reviews |
| Unvalidated or open redirect | 🔴 missed |  |
| Server Side Request Forgery | 🔴 missed |  |
| XML External Entity | 🔴 missed |  |
| Security misconfiguration, missing headers, CORS | 🟢 found | CORS Wildcard (Access-Control-Allow-Origin: *) Permits Any Origi |
| Other injection | 🔴 missed |  |
| Vulnerable or outdated components | 🔴 missed |  |
| Improper input validation and business logic abuse | 🟢 found | Mass Assignment — Unauthenticated Self-Registration as Admin via |

## What ARCHON found

ARCHON covered **10 of 15** classes and reported **41**
confirmed findings, 31 of them beyond a single example per class. The depth matters:
it did not simply tick a box per class, it independently reproduced multiple distinct instances,
including SQL injection authentication bypass, union based injection in product search, JWT
algorithm confusion and the alg none bypass, stored cross site scripting, mass assignment leading
to administrator self registration, and exposed cryptographic key material. Every high impact class
that leads to account takeover or data compromise was surfaced.

Classes covered: sqli, xss, broken_auth, access_control, sensitive_data, path_traversal, jwt, csrf, security_misconfig, input_validation.

## What ARCHON missed

ARCHON did not surface a confirmed finding for 5 classes: open_redirect, ssrf, xxe, injection_other, vulnerable_components. These are the harder to reach or lower signal classes in a pure black box run: open redirect and server side request forgery need a specific reachable sink, XML external entity depends on hitting the file import surface, NoSQL and command injection sit behind less obvious endpoints, and outdated component detection favours a source or dependency view. They are candidates for a focused follow up pass or a white box run.

## Reading the score

The headline number is class level coverage, not a count of the roughly one hundred individual
Juice Shop challenges. A class counts as covered when at least one confirmed finding maps to it, so
the score stays stable across Juice Shop versions and rewards genuine discovery rather than the
exact challenge names. The 31 additional findings show that within the covered
classes ARCHON went several instances deep, which is closer to how a real assessment reads than a
single proof of concept per category.
