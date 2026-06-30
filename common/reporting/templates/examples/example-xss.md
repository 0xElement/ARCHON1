# Stored XSS in project display name: a low-privileged member can run script in any viewer's session

> EXAMPLE / DUMMY FINDING — illustrative only. Target, IDs, and code are fabricated.

## Summary
The project "display name" field is rendered into the dashboard header with a raw-HTML binding
instead of escaped interpolation. A member who can edit the project name stores an HTML/script
payload that executes in the browser of every user who views the project.
**Root cause:** `dashboard_header.vue` renders the user-supplied name via `v-html` with no
sanitization.

## Severity
`CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:N` = **8.3 (High)**
PR:L (member can set the name); UI:R (victim views the project); S:C (script runs in the
victim's session = different authority); C:H/I:H (full session takeover / act as victim).

## Affected / tested versions
- Affected: `app v2.0 – v2.7.3`   Fixed in: `v2.7.4`   Tested build: `v2.7.3`

## Roles involved
- **Attacker:** a project member with edit-name permission (Developer-equivalent).
- **Victim / policy bypassed:** any user who opens the project — including admins.

## Preconditions
- Membership in one project with permission to edit its display name (default for Developers).
- A victim views the project page (e.g. an admin reviewing it).

## Mechanism (code-level root cause)
1. **Input** — `PATCH /api/projects/:id` accepts `display_name` with no server-side sanitization
   (`app/models/project.rb` stores it verbatim).
2. **Sink** — `app/components/dashboard_header.vue:18`:
```html
<!-- app/components/dashboard_header.vue:18 -->
<h1 class="project-title" v-html="project.displayName"></h1>   <!-- raw HTML, unsanitized -->
```
**Proof of intent (sibling control):** the breadcrumb renders the same field safely with
escaped interpolation — the header path is the outlier:
```html
<!-- app/components/breadcrumb.vue:11 -->
<span>{{ project.displayName }}</span>   <!-- escaped, safe -->
```

## Steps to Reproduce
Replace `<host>`, `<token>`, `<id>`.

### Part A — setup (attacker, one-time)
**Step 1.** As a member of project `<id>`, set the display name to a payload:
```http
PATCH /api/projects/<id> HTTP/1.1
Host: <host>
Authorization: Bearer <token>
Content-Type: application/json

{"display_name":"<img src=x onerror=alert(document.domain)>"}
```
```http
HTTP/1.1 200 OK
```

### Part B — trigger (victim)
**Step 2 (control — escaped contexts are safe).** The breadcrumb shows the literal text
`<img src=x ...>` with no execution. Proves the field itself isn't globally sanitized — only
the header sink is unsafe.

**Step 3 (bug — the header executes).** Any user opens `GET /projects/<id>`. The header binds
the name as raw HTML and the `onerror` fires:
```
alert box shows the app origin → arbitrary JS runs in the viewer's session
```
> `[SCREENSHOT HERE: the project page with the alert/payload executing in the victim's browser]`

## Observed (live)
On `v2.7.3` at `example.com`, member `mallory` set the name to
`<img src=x onerror=alert(document.cookie)>`. When admin `root` opened the project, the script
executed in `root`'s session and exfiltrated the session cookie to a listener. The breadcrumb
rendered the same value inert.

## Impact
Stored XSS executes in every viewer's session, including admins. An attacker steals session
tokens / CSRF tokens and performs any action as the victim (account takeover, privilege
escalation). One low-privileged member compromises any viewer.

## Suggested Fix
Render the field with escaped interpolation (drop `v-html`); if markup is genuinely required,
sanitize through the app's safe-HTML allowlist:
```html
<!-- app/components/dashboard_header.vue:18 -->
<h1 class="project-title">{{ project.displayName }}</h1>
```

## References
CWE-79 (Improper Neutralization of Input During Web Page Generation). OWASP A03:2021 (Injection).
