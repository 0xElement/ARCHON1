# SQL injection in report search: user-supplied `sort` parameter is interpolated into the ORDER BY clause

> EXAMPLE / DUMMY FINDING — static analysis only. Found by source review; **not** dynamically
> confirmed. Proof is the code path; see "Validation" for how to confirm at runtime.

## Summary
The report-search endpoint builds its SQL `ORDER BY` clause by string-interpolating the raw
`sort` query parameter. Parameterization protects the `WHERE` values but not the order column,
which is concatenated directly, allowing SQL injection through the `sort` field.
**Root cause:** `ReportsQuery#ordered` interpolates `params[:sort]` into the SQL string instead
of validating it against an allowlist of column names.

## Severity
`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N` = **8.1 (High)** *(estimated — see Confidence)*
PR:L (any authenticated user reaches the search). C/I:H reflect typical injection reach
(read/modify DB). Adjust once the DB privileges and injection class are confirmed at runtime.

## Affected / tested versions
- Affected: `app v1.x – v1.9.4` (code present)   Tested build: source only, `commit <sha>`
- **Not** confirmed against a running instance.

## Roles involved
- **Attacker:** any authenticated user who can reach `/reports/search`.
- **Policy bypassed:** the database trust boundary — query structure must not be user-controlled.

## Confidence
**Medium-High (static).** The interpolation and the reachable entry point are confirmed in
source. **Not yet validated dynamically** — exact exploitability depends on the adapter's
multi-statement handling, the DB account's privileges, and any upstream WAF/normalization. The
severity above is an estimate pending the runtime check below.

## Mechanism (code-level root cause)
1. **Entry point** — `app/controllers/reports_controller.rb:27` — `search` action, gated only by
   `authenticate_user!`; passes `params[:sort]` to the query object unmodified.
2. **Sink** — `app/queries/reports_query.rb:33`:
```ruby
# app/queries/reports_query.rb:33
def ordered(sort)
  where(account_id: @account.id)              # parameterized — safe
    .order("created_at, #{sort}")             # <-- raw interpolation of user input into SQL
end
```
The `WHERE` is bound safely; the `ORDER BY` is not. `sort` flows unfiltered from the request.
**Proof of intent (sibling control):** an adjacent query validates its order column against an
allowlist, showing the safe pattern this one skips:
```ruby
# app/queries/users_query.rb:18
raise ArgumentError unless ALLOWED_SORTS.include?(sort)   # enforced here, missing in reports_query
order(sort)
```

## Reachability
`POST /reports/search` (or `GET` with `?sort=`) → `ReportsController#search:27` →
`ReportsQuery#ordered:33`. No sanitization, allowlist, or `Arel`/quoting between the parameter
and the SQL string. Any logged-in user can reach it.

## Validation (how to confirm at runtime — not yet done)
1. Baseline (control): `GET /reports/search?sort=id` → 200, normal ordering.
2. Syntax probe: `sort=id);--` or `sort=(SELECT 1)` → a 500 / SQL syntax error in logs indicates
   the input reaches the parser unescaped.
3. Boolean/time oracle: `sort=(CASE WHEN (1=1) THEN id ELSE name END)` vs `1=2`, or a
   time-based payload (`sort=...pg_sleep(5)...` shape for the target DB), to confirm execution
   without relying on stacked queries.
4. Record the exact request/response and move this to a dynamically-confirmed finding.

## Impact
If confirmed, an authenticated user reads or modifies arbitrary database contents (cross-account
data, credentials, integrity loss) via the `sort` parameter. Even limited to a blind oracle,
full data exfiltration is typically achievable.

## Suggested Fix
Never interpolate user input into SQL. Validate `sort` against an explicit column allowlist (and
map direction separately):
```ruby
# app/queries/reports_query.rb:33
ALLOWED_SORTS = %w[created_at title status].freeze
raise ArgumentError, "invalid sort" unless ALLOWED_SORTS.include?(sort)
order(:created_at, sort)
```

## References
CWE-89 (SQL Injection). OWASP A03:2021 (Injection). CWE-89 ORDER BY variant is a classic
parameterization blind spot.
