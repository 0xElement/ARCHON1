# Phase 2 — Deep Account-Takeover Vulnerability Review

## Purpose

This prompt is for **Phase 2 account-takeover (ATO) focused security review**.

The goal is to identify any path that leads to **unauthorized access to another user's account,
session, or tokens**:

- Password-reset token manipulation (array injection, weak entropy, no invalidation, host-header, Referer leak)
- OAuth / OIDC flow exploitation (state, `redirect_uri`, unverified-email auto-link, code theft)
- SAML assertion manipulation (XPath, signature wrapping, comment truncation, AuthnContext spoof)
- 2FA / MFA bypass (pending-state skip, alternate-credential bypass, remember-device forgery, backup-code brute force, race, disable-without-verify)
- Session hijacking & fixation (no rotation, no invalidation on password change/block, broad cookie scope, missing flags)
- Email-verification bypass (predictable/reusable token, change-without-reverify, race, unverified-email matching)
- Credential & token leakage (URL, logs, response, bundle, webhook, timing side channel)
- Account enumeration · host-header attacks · auth race conditions · impersonation/delegation abuse
- Any multi-step **ATO chain** that combines the above.

This prompt is separate from the access-control and XSS Phase 2 prompts. Use it when the review
objective is account takeover, not general authorization (IDOR) or XSS.

The canonical pattern definitions — grep signatures, vulnerable code, source→sink flows, the
"What Survives Security Actions" matrix, the ATO chains, and the token-entropy reference — live in
**`account_takeover_pattern_catalog.md`** (same `methodology/catalogs/` directory). This prompt drives
the workflow and references the catalog by ID; it does not restate the pattern text.

---

# Execution Contract — No Autonomous Deviation

The agent must follow this prompt exactly. It must not invent a different workflow, skip required
gates, redefine completion, or decide to perform a different type of review.

## Scope Control Rule

Allowed work:

- Reviewing the local application source code for account-takeover vulnerabilities
- Consuming existing Phase 1 authentication/identity maps if available
- Reconstructing missing inventories from source code
- Reviewing login, registration, password reset/change, email verify/change, OAuth/OIDC, SAML/SSO,
  2FA/MFA, session middleware, token models/lifecycle, mailers, and impersonation/delegation paths
- Applying every pattern in `account_takeover_pattern_catalog.md` (ATO-P0 … ATO-P10) to each feature
- Applying the "What Survives Security Actions" matrix and the ATO-chain review
- Reporting confirmed, potential, or suspicious ATO findings with source→sink evidence
- Producing the required coverage ledgers, matrices, and CVSS assessments

Not allowed unless explicitly requested:

- General access-control / IDOR review, or XSS review (except as a *link* in an ATO chain)
- Dependency/CVE review unrelated to auth
- Secret scanning as an end in itself (leaked-secret findings are in scope only as ATO-P6)
- Performance review, refactoring suggestions, generic hardening notes as findings
- Open-ended exploration outside the auth/identity surfaces required here
- Replacing required matrices with prose summaries
- Reporting safe paths as findings

## No-Shortcut Rule

The agent must not say:

- "This auth flow is probably safe."
- "The framework handles sessions, so no need to trace."
- "This uses `SecureRandom`, so the token must be fine." (still trace single-use, TTL, binding)
- "2FA is enabled, so this account is protected." (check every bypass path)
- "This is admin-only, so ATO does not matter."
- "This is mapped in Phase 1, so no need to read the source."
- "Only password reset matters."
- "Only the login endpoint matters."

Any such reasoning is invalid.

## Evidence Rule

Every claim must be backed by exact source-code evidence: file path · module/class · function/method ·
route/callback/resolver · user-controlled source · the security check (or its absence) · the sensitive
sink (token compare, mail recipient, session upgrade, account lookup) · why the path is safe or
vulnerable. If evidence is incomplete, mark the item a gap or a potential/suspicious finding. Do not
guess.

---

# Strict Mode When Phase 1 Was Already Run

Existing Phase 1 output is only **input material**, not proof of an ATO review.

## Required Inputs From Existing Phase 1

Load every available Phase 1 artifact: application/framework identification · auth-method list · OAuth
provider configs · SAML config · 2FA methods · **token inventory** · identity model · password-reset
flow trace · session model · ATO-chain map · rate-limiting analysis · endpoint/file coverage lists ·
gap/assumption lists.

Do not run Phase 2 from only a summary.

## If Existing Phase 1 Is Incomplete

Reconstruct any missing ATO-relevant surface from source before reviewing findings: auth controllers ·
session middleware · token models · mailer/notification templates · OAuth/SAML handlers · 2FA modules ·
password/email flows · impersonation code.

## Existing Phase 1 Does Not Reduce Pattern Coverage

Even when Phase 1 exists, Phase 2 must still apply the **full** catalog (ATO-P0 … ATO-P10) to every
auth-related feature. Do not review only the patterns Phase 1 mentioned, only high-priority endpoints,
or only fields already marked suspicious.

---

# Source-of-Truth Authentication / Identity-Surface Map

Before reviewing vulnerabilities, build or load this map. It is the Phase-2 rowset that the reverse-check
gate later verifies.

## 1. Authentication Flows

Every way a user proves identity: username/password, email/password, phone/OTP, magic-link/passwordless,
API key / PAT, mTLS/cert, OAuth/OIDC (per provider), SAML/SSO, LDAP/AD. For each: entry route → handler,
user lookup key (normalized? case?), password hash + comparison (constant-time?), account-state check
order, and where 2FA is (or isn't) enforced.

## 2. Session Management

Session id generator, store (cookie/Redis/DB), rotation triggers (login / 2FA / role change), cookie
attributes (`HttpOnly` / `Secure` / `SameSite` / `Domain` / `Path`), idle & absolute timeouts,
concurrent-session policy, and every invalidation trigger.

## 3. Token Lifecycle Inventory

For **every** token type (session · remember-me · API/PAT · OAuth access/refresh · JWT/id_token ·
service/bot · CI/deploy · password-reset · email-verify · 2FA backup · impersonation): generation
source · storage (hashed?) · entropy · TTL · rotation · revocation trigger · derived/child tokens. Score
entropy against the token-entropy reference in the catalog.

## 4. Password-Reset Surface

Full trace `request → generate → deliver → validate → set → invalidate`: token entropy, single-use,
TTL, user-binding; whether `email` can be an array/duplicated param; whether the reset URL is built from
request headers; whether the response leaks token/enumeration; post-reset session/token teardown.

## 5. Email-Verification Surface

Signup verification and email-change verification: token entropy/single-use, whether unverified
accounts can log in or be matched (invites, OAuth link, attribution), and multi-field/mass-assignment
bypass of the verified flag.

## 6. 2FA / MFA Surface

Methods (TOTP/WebAuthn/SMS/backup), when checked, the "pending" state model, attempt limiting (per
session vs per account), remember-device mechanism, every alternate-credential bypass path, and the
disable/recovery flows.

## 7. OAuth / OIDC and SAML Surface

OAuth: `state` generation/binding, `redirect_uri` validation (exact vs prefix), user-matching key,
auto-link/auto-create rules, `email_verified` handling, token storage. SAML: parser/library, what the
signature covers, XPath anchoring, assertion validation (audience/recipient/timestamps/replay), NameID
matching, AuthnContext trust.

## 8. "What Survives Security Actions" Checkpoints

For each security action (password change · explicit logout · revoke-all · admin block/disable · email
change · 2FA enable/disable · role downgrade · account delete), record which teardown calls the handler
*actually* makes, ready to diff against the catalog's matrix.

---

# Phase 2 Reverse-Check Gate — Every Phase 1 Row Must Be Tested

Every auth flow, endpoint, token type, session trigger, OAuth/SAML handler, 2FA path, and security-action
handler from the surface map (Phase 1 or reconstructed) must get exactly one matching Phase-2 review row,
or be explicitly merged into another with a referenced reason. A row with no Phase-2 disposition = Phase 2
incomplete.

## Required Disposition for Every Row

| Disposition | Meaning |
|---|---|
| Deep reviewed — no ATO issue found | Full source-to-sink path reviewed |
| Confirmed vulnerability | Source-confirmed ATO path |
| Potential vulnerability | Strong candidate requiring dynamic validation |
| Suspicious ATO-looking path | Concrete suspicious path needing deeper follow-up |
| Duplicate / covered by another reviewed row | Exact referenced row required |
| Not ATO-relevant | Evidence-backed reason required |
| Dead / unreachable code | Evidence-backed reason required |
| Gap / blocker | Could not complete; incomplete coverage |

No row may be left without a disposition.

---

# Full Feature-Code Sweep Gate

For each auth-related feature, read the full ATO-relevant surface: the route/handler, the user lookup,
the token generate/validate/consume, the session mutation, the mailer/link builder, the 2FA check, the
account-state check, and the shared middleware/services the feature depends on.

Do not stop at the route declaration. Do not stop at the first `SecureRandom`. Do not stop because the
framework "handles sessions." Do not stop because 2FA "is enabled." Do not stop because content is
"admin-only."

---

# Catalog Pattern Application

Phase 2 must apply the full canonical account-takeover catalog to every auth-related feature.

- The pattern definitions (grep signatures, vulnerable code, source→sink) are in
  **`account_takeover_pattern_catalog.md`**. Read it; do not re-derive patterns from memory.
- Do not rename, redefine, or renumber patterns.
- Every feature must produce a pattern matrix with **all P-0 … P-10 rows present exactly once**
  (sub-variants folded under their parent). Each row marked:
  - Applied — finding
  - Applied — potential/suspicious
  - Applied — no issue found
  - Not applicable — evidence-backed reason
  - Gap/blocker — could not complete

## Required Per-Feature Pattern Matrix

| Pattern | Name | Applied To (code surface) | Result | Finding / Reference | Evidence | Gap / N/A Reason |
|---|---|---|---|---|---|---|
| ATO-P0 | Password-reset token manipulation | TBD | TBD | TBD | TBD | TBD |
| ATO-P1 | OAuth / OIDC flow exploitation | TBD | TBD | TBD | TBD | TBD |
| ATO-P2 | SAML assertion manipulation | TBD | TBD | TBD | TBD | TBD |
| ATO-P3 | 2FA / MFA bypass | TBD | TBD | TBD | TBD | TBD |
| ATO-P4 | Session hijacking & fixation | TBD | TBD | TBD | TBD | TBD |
| ATO-P5 | Email-verification bypass | TBD | TBD | TBD | TBD | TBD |
| ATO-P6 | Credential & token leakage | TBD | TBD | TBD | TBD | TBD |
| ATO-P7 | Account enumeration | TBD | TBD | TBD | TBD | TBD |
| ATO-P8 | Host-header attacks | TBD | TBD | TBD | TBD | TBD |
| ATO-P9 | Race conditions in auth flows | TBD | TBD | TBD | TBD | TBD |
| ATO-P10 | Impersonation & delegation abuse | TBD | TBD | TBD | TBD | TBD |

When a parent pattern is marked "finding" or "potential/suspicious", name the specific sub-variant
(e.g. `ATO-P0.3 email-array`) in the Finding/Reference column.

## "What Survives Security Actions" Sweep (mandatory per applicable feature)

For any feature that implements a security action, complete its row against the catalog matrix and open
a candidate for every cell that *should* invalidate but does not.

| Security action | Web session | Remember-me | Reset tokens | API/PAT | OAuth grants | Derived/child | Gaps |
|---|---|---|---|---|---|---|---|
| (action under review) | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

## Pattern Count Check (per feature)

```markdown
# ATO Pattern Count Check
- Canonical patterns required: 11 (ATO-P0 … ATO-P10)
- Pattern rows present: 11
- Rows with finding/potential/suspicious:
- Rows with no issue:
- Rows not applicable (evidence):
- Rows gap/blocker:
- "What Survives" sweep completed for security-action features: Yes/No/N-A
- Renamed/non-canonical patterns used: Yes/No
- Result: PASS/FAIL   (FAIL if rows != 11 or non-canonical patterns used)
```

---

# Source-to-Sink Trace Requirement

Every possible finding needs a full trace.

```markdown
## Source-to-Sink Trace
| Step | Code Location | Evidence |
|---|---|---|
| User-controlled source | file:line / method | e.g. `email` param, `Host` header, `token` query |
| Transit / storage | file:line / method | DB column, session, cookie, mail queue |
| Transformation | file:line / method | token generation, XPath extraction, param binding |
| Security check | file:line / method | token compare, state validation, signature verify (or ABSENCE) |
| Sensitive sink | file:line / method | set_password, mail recipient, session upgrade, account lookup |
| Trust boundary crossed | — | unauth→auth / cross-user / privilege-escalation / cross-tenant |
| Victim & interaction | — | anonymous / any user / admin; none / click link / concurrent |
| Exploitability condition | — | direct / chained / race / requires-leak |
```

A finding cannot be reported without a concrete source, a security-check gap, and a sensitive sink.

---

# ATO-Chain Review (mandatory, report-level)

Beyond per-feature patterns, evaluate whether reviewed features form any chain in the catalog's
"ATO Chains" section (host-header→reset-theft, enumeration→spray, OAuth unverified-email auto-link,
redirect_uri→code-theft, SAML XPath, reset-token prediction, alternate-credential 2FA bypass,
registration race, CSRF→email-change→reset, session-fixation). For each chain: list the participating
patterns/features, whether every link is source-confirmed, and the composite impact.

---

# ATO Finding Reporting Gate

Report only: (1) confirmed ATO vulnerabilities, (2) potential ATO vulnerabilities needing dynamic
validation, (3) suspicious source-to-sink paths with concrete evidence, (4) confirmed chains.

Do not report: safe token generation, generic hardening notes, "could be dangerous" without a trace,
`SecureRandom` usage without a single-use/TTL/binding gap, a security action whose invalidation *is*
present, or anything that is not an account-takeover path.

## Reject a candidate if any is true

- The attack requires the victim's current password.
- The attack requires pre-existing access to the victim's account, device, or email.
- A deeper control (rate limit, CAPTCHA, email confirmation, mandatory 2FA that is *actually* enforced
  on this path) blocks it in practice.
- The behavior is documented/intended (e.g. admin rescue destroying a user's 2FA).
- It is a theoretical weakness with no practical exploitation path.
- It is not an account-takeover issue (belongs to another squad's scope).

## Required Finding Template

```markdown
# Finding: [Short title — how the attacker takes over the account]

## Status
Confirmed vulnerability / Potential vulnerability / Suspicious ATO-looking path

## Pattern
ATO-P#[.#]  (canonical id + sub-variant)

## Vulnerability Type
Password-reset flaw / OAuth flaw / SAML flaw / 2FA bypass / Session hijack-fixation /
Email-verification bypass / Credential leakage / Enumeration / Host-header / Auth race / Impersonation

## Affected Feature
- Feature:
- Entry point (route/handler):
- Interface: Web / REST / GraphQL / OAuth callback / SAML callback / Mailer / Frontend / Other

## Source-to-Sink Trace
(table per the Source-to-Sink Trace Requirement above)

## Attack Chain
| Step | Action | Technical detail |
|---|---|---|
| 1 | attacker does X | `POST /reset { "email": ["victim@example.com","attacker@example.com"] }` |
| 2 | this causes Y | reset link delivered to attacker@example.com |
| 3 | attacker gains access | password set → login as victim |

## Attacker & Victim Model
- Attacker privilege: unauth / authenticated / privileged / admin
- Victim interaction: none / click link / concurrent request
- Affected users: all / OAuth users / SAML users / users without 2FA / etc.
- Trust boundary crossed: unauth-to-auth / cross-user / privilege-escalation / cross-tenant / none

## Impact
- Full ATO / partial ATO / session hijack / token theft / enumeration
- Confidentiality / Integrity / Availability:

## Evidence
- files / methods / exact snippets:
- why existing controls are insufficient:

## Dynamic Validation Plan (safe local/test env only)
- Setup (attacker + victim + admin accounts, email interception, 2FA on victim):
- Attack request(s):
- Expected safe behavior vs vulnerable behavior:
- Success criterion (attacker gains access without losing victim's access):

## CVSS Assessment
- Vector / Score / Severity:
- Score Status: Final / Provisional (dynamic validation pending)
- Confidence: High / Medium / Low
```

---

# CVSS Scoring Gate (CVSS 3.1)

Every confirmed/potential/suspicious finding and every confirmed chain must include CVSS.

## Severity Bands

| Score | Severity |
|---|---|
| 0.0 | None |
| 0.1–3.9 | Low |
| 4.0–6.9 | Medium |
| 7.0–8.9 | High |
| 9.0–10.0 | Critical |

## ATO-Specific Guidance

- Most web/API-triggered ATO is `AV:N`.
- Unauthenticated single-request takeover (reset-token prediction, SAML XPath, array injection) →
  `PR:N`, often `UI:N`, `C:H/I:H` → Critical.
- Host-header / Referer-leak / OAuth-link chains typically need `UI:R` (victim clicks) → often High.
- Enumeration alone is usually `C:L/I:N/A:N` → Low/Medium; it earns its weight as a *chain* link.
- Account-takeover impact is normally `C:H/I:H`; add `A` only if the attacker can lock the victim out.
- Scope `S:C` when the vulnerable component (auth service) impacts a different component (the victim's
  data/session in another authority); otherwise `S:U`.

| Metric | Values |
|---|---|
| AV | N / A / L / P |
| AC | L / H |
| PR | N / L / H |
| UI | N / R |
| S | U / C |
| C | N / L / H |
| I | N / L / H |
| A | N / L / H |

Do not hide scoring uncertainty. If dynamic validation could change exploitability, mark CVSS
provisional.

---

# Threat-Model Calibration (mandatory for Critical/High) — anti-inflation

Before claiming Critical/High, emit a `threat_model` object on the candidate:

- `attacker_privilege` — unauth / authenticated / privileged / admin / superuser (minimum needed).
- `trust_boundary_crossed` — none / cross-user / cross-tenant / privilege-escalation / unauth-to-auth / cross-org.
- `documented_as_intended` — bool. Check docs, `*_intended_spec` tests, `# by design` comments. true → −1 tier.
- `validation_layers_checked` — from [router, middleware, controller, model, db-constraint, framework-default]. Under 3 layers → cap Medium for a validation-gap claim.
- `prerequisite_actions` — what the attacker must already have done (must not include "already has victim's password/session").

Framework-agnostic attacker-privilege mapping: Rails `current_user.nil?`=unauth · Django
`@login_required`=authenticated · Spring `hasRole("ADMIN")`=admin · Laravel `auth()->check()`=authenticated
· Express auth-middleware=authenticated.

**Anti-inflation discipline (ATO):**

- Admin destroying a user's 2FA: admin + `documented_as_intended=true` (rescue feature) → Informational,
  not a vuln. Silent admin change of user *state* is a UX/audit gap, not ATO.
- Admin injecting an OAuth identity for a user: privilege-transfer (attacker gains a new login path as
  the victim) → escalate one tier. This *is* ATO, unlike a silent 2FA destroy.
- Genuine ATO gives the attacker access they did not have. If the "attack" needs the victim's password,
  session, or device, it is not ATO — reject it.
- Enumeration/timing findings are Low/Medium on their own; only a demonstrated chain lifts them.

---

# Per-Feature Completion Gate

Every feature review ends with:

```markdown
# Feature Completion Gate Result

## Row Coverage
- Total surface-map rows for this feature:
- Phase 2 reviewed rows:
- Unmatched rows:
- Result: PASS/FAIL

## Auth-Surface Coverage
| Surface | Exists? | Fully reviewed? | Gaps |
|---|---|---|---|
| Login / primary auth | Yes/No | Yes/No | TBD |
| Password reset | Yes/No | Yes/No | TBD |
| Email verification / change | Yes/No | Yes/No | TBD |
| OAuth / OIDC | Yes/No | Yes/No | TBD |
| SAML / SSO | Yes/No | Yes/No | TBD |
| 2FA / MFA | Yes/No | Yes/No | TBD |
| Session management | Yes/No | Yes/No | TBD |
| Token lifecycle | Yes/No | Yes/No | TBD |
| Impersonation / delegation | Yes/No | Yes/No | TBD |
| "What Survives" security actions | Yes/No | Yes/No | TBD |

## ATO Pattern Count Check
- Patterns required: 11 (ATO-P0 … ATO-P10)
- Pattern rows present: 11
- Renamed/non-canonical patterns used: Yes/No
- Result: PASS/FAIL

## Unresolved Items
List every unresolved item.

## Completion Decision
Complete / Incomplete

If incomplete:
> This feature is not fully reviewed for account takeover. Additional ATO paths may remain in
> unresolved flows, token lifecycles, session-invalidation gaps, or same-functionality paths.
```

---

# Final Phase 2 ATO Report Requirements

1. Executive summary
2. Features reviewed
3. Existing Phase 1 intake check (if applicable)
4. Source-of-truth authentication / identity-surface map (incl. token inventory)
5. Reverse-check matrix (every surface-map row → disposition)
6. Full file / method-sink coverage ledgers
7. Auth-surface coverage matrix
8. Full 11-pattern (ATO-P0 … ATO-P10) matrix per feature
9. "What Survives Security Actions" matrix result
10. ATO-chain review
11. Confirmed findings
12. Potential vulnerabilities requiring dynamic validation
13. Suspicious ATO-looking paths
14. CVSS + threat-model calibration for every confirmed/potential/suspicious finding and chain
15. Dynamic validation plan per finding/candidate
16. Unresolved gaps/blockers
17. Features not fully reviewed
18. Final completion decision

Do not claim the ATO review is complete unless all required matrices pass.

---

# Anti-Drift Rules

- Do not switch to access-control, XSS, or generic-hardening review; those are out of scope except as a
  named link in an ATO chain.
- Do not skip a pattern because a feature "looks safe" or "uses the framework default."
- Do not shrink coverage because Phase 1 already exists or looked deep.
- Do not report safe escaping/generation, or a security action that *does* invalidate, as a finding.
- Do not inflate: silent admin state changes, victim-password-required flows, and pre-existing-access
  scenarios are not ATO.
- Do not restate catalog pattern text here — reference `account_takeover_pattern_catalog.md` by ID.
- Do not claim completion while any required matrix reads FAIL or any row lacks a disposition.
