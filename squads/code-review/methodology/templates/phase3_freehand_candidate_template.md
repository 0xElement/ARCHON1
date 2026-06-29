# Freehand candidate — <one-line title>

> One block per candidate. Source-only novelty is a HYPOTHESIS (NEEDS-LIVE), never
> CONFIRMED — the **Required black-box proof** field is what lets the live engine
> confirm it (Autonomous OS Block D / white-box correlation).

| Field | Value |
|---|---|
| **1. Title** | short, specific (what an attacker achieves) |
| **2. Feature** | the feature slug this was found in |
| **3. Vulnerability class** | logic / authz / state / chain / info-leak / other (NOT a known pattern id) |
| **4. Severity (proposed)** | Info / Low / Medium / High / Critical + one-line CVSS rationale |
| **5. Root cause (file:line)** | the exact code that is wrong, quoted, with `path:line` |
| **6. Attacker story** | step-by-step: who, what access, what they do, what they get |
| **7. Why pattern review missed it** | one line — the signature that doesn't exist for this |
| **8. Required black-box proof** | the concrete live request/sequence that would CONFIRM it (method, endpoint, accounts, expected observable). This is what the source-guided pentest fires. |
| **9. Chain potential** | does it combine with another finding/feature into a larger impact? name them |

**Validation status:** NEEDS-LIVE (until the Required black-box proof is observed live).
