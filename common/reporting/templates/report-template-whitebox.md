# Vulnerability Report Template — White-box (code review + pentest)

Use when you have **source access**. The strength of a white-box report is proving the bug at
the code level (entry point → sink) *and* demonstrating it live. Delete any section that does
not apply; never leave a placeholder unfilled.

> Writing tips
> - Title = one sentence: *what breaks*, *for whom*, *what the impact is*. No internal IDs.
> - Use the **real tested host and full URL** in the repro steps (the actual target that was
>   tested), so the steps are runnable — never `<host>`, `example.com`, or `attacker.com`. Only
>   a per-session secret (auth token / CSRF nonce) may stay a `<token>` placeholder; put its
>   real captured value in the "Observed (live)" block.
> - Trace to the **deepest enforcing gate**. A weak controller gate + a strong service/policy
>   re-check is NOT a bug. The binding check is the deepest one.
> - Prove a **control** (the secure case) next to the **bug** (the broken case). The contrast
>   is the proof.

---

## Title
> One line: `<vuln class> in <component>: <attacker role> can <impact> by <mechanism>`

## Summary
2–4 sentences. What the feature is supposed to enforce, what it actually does, and the
security consequence. State the **root cause** in one bold line at the end:
**Root cause:** `<the single reason the gate fails — file/function>`.

## Severity
`CVSS:3.1/AV:_/AC:_/PR:_/UI:_/S:_/C:_/I:_/A:_` = **<score> (<band>)**
One line justifying each non-obvious metric (especially PR, UI, S). See the CVSS guide.

## Affected / tested versions
- Affected: `<range>`   Fixed in (if known): `<version>`   Tested build: `<version/commit>`

## Roles involved
- **Attacker:** the *minimum* role that can exploit it, and what they're entitled to vs. what
  they gain.
- **Victim / policy bypassed:** whose control or data is broken, and what they reasonably
  expected.

## Preconditions
Bullet list of what must be true to reproduce (feature enabled? specific role? a setup step?).
Note whether each is the default.

## Mechanism (code-level root cause)
Trace the request from entry point to sink, naming the binding ability/check at each layer:

1. **Entry point** — `path/to/controller_or_route.ext:LINE` — what gate (if any) it applies.
2. **Service / business layer** — `path/to/service.ext:LINE` — does it re-authorize the
   primary object? (This is usually the binding gate.)
3. **Data/finder/query** — `path/to/finder.ext:LINE` — scoping/filtering applied or missing.
4. **Policy / authorization rule** — `path/to/policy.ext:LINE` — the ability that *should*
   gate this.
5. **Sink** — `path/to/sink.ext:LINE` — where the unsafe action/render/disclosure happens.

Quote the **smallest** vulnerable snippet(s), with a one-line note on what's wrong:
```
// path/to/file.ext:LINE
<the few lines that contain the defect>     // <-- the check that is missing / wrong
```

**Proof of intent (sibling control):** point to the sibling code path that enforces the check
correctly (other interface, create-time validation, the secure caller). This proves the gap
is a bug, not by-design.
```
// path/to/sibling.ext:LINE  — enforces what the vulnerable path skips
```

## Steps to Reproduce
Use the **real tested host + full URL** (only per-session secrets stay as `<token>`). Keep it copy-pasteable.

### Part A — setup (one-time, legitimate)
Steps a legitimate actor performs to create the starting state.

### Part B — exploit
**Step N (control — the secure case).** Show the request that is correctly denied / behaves
safely.
```http
<request>
```
```http
<response showing the secure result, e.g. 403/404>
```

**Step N+1 (bug — the broken case).** Same actor/shape, the case that should be denied but
isn't.
```http
<request>
```
```http
<response showing the leak / unauthorized write / executed payload>
```
> `[SCREENSHOT N HERE: <what the capture must show>]`

## Observed (live)
One paragraph with the **real** values and exact statuses you saw on the tested build
(host, IDs, response codes, key fields). This is where concrete data goes.

## Impact
What an attacker actually achieves and why it matters (data exposed, integrity lost, scope of
affected users/tenants). Note any chaining potential separately from the scored impact.

## Suggested Fix
The smallest correct fix at the right layer (usually: add/repair the check in the deepest
shared gate so every caller is covered). Show the minimal patch if obvious:
```
// path/to/file.ext:LINE
<the guard to add>
```

## References
Docs that state the intended behavior (so the deviation is provable), related advisories, prior
art. Quote the one line of documentation the bug contradicts.
