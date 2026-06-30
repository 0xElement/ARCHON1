# CVSS 3.1 Scoring Guide (generic, vendor-neutral)

A practical guide to scoring a vulnerability accurately with CVSS v3.1. Not tied to any
vendor's rubric. Use it to derive a defensible Base vector and score for any finding.

> Score the vulnerability **as it exists**, with the *reasonable worst-case* impact a
> single exploitation produces. Do not score a theoretical chain you cannot demonstrate,
> and do not score the easiest case if a harder-hitting one is equally reachable.

---

## 1. The Base metrics

Vector string: `CVSS:3.1/AV:_/AC:_/PR:_/UI:_/S:_/C:_/I:_/A:_`

### Exploitability

**AV — Attack Vector** (where the attacker must be)
- `N` Network: exploitable across a routable network (internet/remote). Most web/API bugs.
- `A` Adjacent: same physical/logical network segment (LAN, Bluetooth, same VLAN).
- `L` Local: needs local access, a shell, or tricks a user into running something.
- `P` Physical: attacker must physically touch the device.

**AC — Attack Complexity** (conditions *outside the attacker's control*)
- `L` Low: works reliably, repeatably, no special conditions. **Default.**
- `H` High: requires a race window, a specific config the attacker can't set, a
  man-in-the-middle position, or per-target reconnaissance/preparation.
- Pitfall: "the victim must click" is **UI**, not AC. "The admin must have enabled X" is
  AC:H only if the attacker can't cause it and it isn't the default.

**PR — Privileges Required** (what the attacker must already hold)
- `N` None: anonymous / unauthenticated.
- `L` Low: an ordinary authenticated account / basic user role.
- `H` High: admin/privileged role needed to launch the attack.
- Pitfall: score the privilege needed to *launch*, not what you gain.

**UI — User Interaction**
- `N` None: no victim action required.
- `R` Required: a victim must do something (click a link, open a page, view a record).

### Scope

**S — Scope** (does the impact cross a security/authorization boundary?)
- `U` Unchanged: impact stays within the same security authority as the vulnerable component.
- `C` Changed: the vulnerable component lets you affect resources managed by a *different*
  authority. Examples: stored XSS (app → victim's browser/session), sandbox escape,
  hypervisor breakout, one tenant affecting another, SSRF reaching an internal service.
- Scope is the most mis-scored metric. If in doubt, ask: "does one exploitation let me
  reach beyond what the vulnerable component itself controls?" Yes → `C`. `S:C` raises the
  score and changes how C/I/A are interpreted (impact is measured on the *impacted*
  component).

### Impact (C/I/A) — rate each: `H` high / `L` low / `N` none

- **C — Confidentiality:** how much data the attacker reads. All/most sensitive data = `H`;
  some limited/constrained data = `L`; none = `N`.
- **I — Integrity:** how much the attacker can modify. Full or critical write/control = `H`;
  limited/constrained modification = `L`; none = `N`.
- **A — Availability:** loss of access to the component. Full DoS/crash = `H`; degraded/
  partial = `L`; none = `N`.

Rate impact on the **most-impacted component** after exploitation. With `S:C`, that may be a
component different from the vulnerable one.

---

## 2. Severity bands (from the numeric Base score)

| Score | Severity |
|-------|----------|
| 0.0 | None |
| 0.1 – 3.9 | Low |
| 4.0 – 6.9 | Medium |
| 7.0 – 8.9 | High |
| 9.0 – 10.0 | Critical |

Compute with any CVSS 3.1 calculator (e.g. FIRST's). Always publish the **vector**, not just
the number — the vector is the argument; the number is its output.

---

## 3. Decision checklist (run top to bottom)

1. Can an unauthenticated remote attacker do it? → `AV:N PR:N`. Else step down each metric.
2. Does it work every time with no special preconditions you can't control? → `AC:L`.
3. Must a victim act? → `UI:R`.
4. Does one exploitation cross into another authority/tenant/component? → `S:C`.
5. For C/I/A, ask separately: read what? change what? break what? Pick H/L/N for each on the
   impacted component.
6. Build the vector, run the calculator, sanity-check against the bands.

---

## 4. Worked examples

**Unauthenticated SQL injection dumping the whole DB**
`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N` = **9.1 Critical**
(read + write the DB; same app authority → S:U.)

**Stored XSS, low-priv author, victim must view the page**
`CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N` = **5.4 Medium**
(script runs in victim's session = scope change; constrained per-session impact → L/L.)

**IDOR letting any user read another user's private records**
`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N` = **6.5 Medium**
(read-only cross-user disclosure.)

**Reflected XSS via a crafted link**
`CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N` = **6.1 Medium**

**Cross-tenant write after a misconfiguration the attacker exploits but didn't create**
`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:N` = **9.6 Critical**
(if the enabling condition is attacker-controllable/permanent → AC:L; if it depends on a
victim-side state the attacker can't set → AC:H lowers it.)

---

## 5. Common mistakes

- **Scoring the chain, not the bug.** Score what *this* finding does. Note chaining potential
  in prose; only raise the score if you can demonstrate the chained impact.
- **PR confusion.** PR is what you *need*, not what you *get*. Privilege escalation from Low to
  Admin is still `PR:L`.
- **Forgetting Scope on XSS / SSRF / sandbox escapes.** These are almost always `S:C`.
- **Treating "feature must be enabled" as AC:H when it's the default** — then it's AC:L.
- **UI vs AC.** Victim clicks → UI:R. Attacker needs a race/config they can't control → AC:H.
- **Over-rating availability.** A single error/500 is not A:H; A:H is sustained denial.
- **Under-rating confidentiality.** If "limited" data is actually credentials/tokens/PII at
  scale, that's `C:H`.

---

## 6. Optional: Temporal & Environmental

Base is what you report by default. Refine only when relevant:
- **Temporal** (E/RL/RC): exploit maturity, remediation level, report confidence. Lowers the
  score for unproven or already-fixed issues.
- **Environmental** (modified Base + CR/IR/AR): re-score for a *specific* deployment where the
  asset's C/I/A matters more or less than average.

Report Base + vector always. Add Temporal/Environmental only when you can justify each value.
