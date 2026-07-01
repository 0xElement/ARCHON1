# Vulnerability Report Template — Black-box (no source code)

Use when you have **no source access** — only the running target. The proof here is entirely
**observable behavior**: requests, responses, and a clear control-vs-bug contrast. No code,
no file:line, no internal mechanism claims you can't back with traffic.

> Writing tips
> - Everything you assert must be visible in a request/response you include. If you can't show
>   it, don't claim it.
> - Use the **actual tested host and full vulnerable URL** in every step — the real target you
>   hit (e.g. `http://192.0.2.10/capture`), so the repro is copy-paste runnable. NEVER write
>   `<host>`, `example.com`, or `attacker.com`. Only a genuinely per-session secret (an auth
>   token / CSRF nonce) may remain a `<token>` placeholder, with the real captured value shown
>   in "Observed".
> - Prove a **control** (the secure case) right next to the **bug**. The contrast is the whole
>   proof when you can't read the code.
> - Infer the cause cautiously and label it as inference ("behavior suggests …"), never as
>   fact.

---

## Title
> One line: `<vuln class> in <feature/endpoint>: <attacker> can <impact> by <observable action>`

## Summary
2–4 sentences: what the target does, what it should do, and the security consequence — stated
entirely in terms of observed behavior.

## Severity
`CVSS:3.1/AV:_/AC:_/PR:_/UI:_/S:_/C:_/I:_/A:_` = **<score> (<band>)**
One line per non-obvious metric. See the CVSS guide.

## Target
- Application / endpoint: `<url or feature>`
- Build/version if visible: `<banner, header, or "unknown">`
- Date/time of testing: `<when>` (responses are point-in-time evidence)

## Roles / access used
- **Attacker:** the access level you actually used (anonymous / basic user / token type). State
  what that access is *supposed* to allow.
- **Victim / boundary crossed:** whose data or control is affected.

## Preconditions
What had to be true to reproduce (an account, a target object ID, a feature toggle you could
observe, a victim who clicks). Note how you obtained each.

## Steps to Reproduce
Use the **real tested host + full URL** in every request (only per-session secrets stay as `<token>`). Copy-pasteable, minimal.

**Step 1 (baseline/setup).** How you reached the testable state.

**Step 2 (control — the secure case).** The request that is correctly denied / behaves safely.
```http
<request>
```
```http
<response showing the expected secure result, e.g. 403/404/empty>
```

**Step 3 (bug — the broken case).** The request that should behave like the control but
doesn't.
```http
<request>
```
```http
<response showing the unauthorized data / accepted write / executed payload>
```
> `[SCREENSHOT HERE: <what the capture must show — status line + key evidence>]`

## Observed
The **real** captured values and exact statuses: host, object IDs, response codes, the specific
fields/bytes that prove the issue. This is the evidence of record.

## Impact
What the attacker achieves in practice and the scope (how many users/objects, read vs. write,
crossing a tenant/trust boundary). Keep it to what the traffic demonstrates.

## Likely cause & Remediation (behavioral)
- **Probable cause (inferred):** one or two sentences, labeled as inference from observed
  behavior — e.g. "the listing endpoint appears to authorize the parent container but not each
  child object."
- **Remediation:** the behavioral fix the vendor should apply (enforce the missing check at the
  object level / validate the input / require the missing privilege). No code, no file paths.

## Notes / limitations
What you could **not** verify without source or deeper access, and any assumptions. Honesty here
makes the rest credible.

## References
Public docs stating the intended behavior, related CVEs/advisories, standards (CWE/OWASP) that
classify the issue.
