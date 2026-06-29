# Injection Patterns

## INJ-001 SQL injection

Look for string concatenation, raw queries, unsafe filters, sort/order clauses, dynamic table/column names, or ORM escape hatches using user input.

## INJ-002 NoSQL injection

Look for user-controlled JSON operators, dynamic query objects, or unvalidated filters.

## INJ-003 Command injection

Look for shell execution, process spawning, scripts, hooks, or command construction with user input.

## INJ-004 Template injection

Look for server-side template rendering with user-controlled template content or expressions.

## INJ-005 LDAP/XPath injection

Look for string-built directory/search queries.

## INJ-006 Header/CRLF injection

Look for user input written into headers, redirects, cookies, email headers, or logs without safe encoding.

## INJ-007 Expression language injection

Look for dynamic expression evaluators, rules engines, or formulas using user-controlled content.

Evidence required:

- Source/sink path
- User-controlled input
- Missing safe binding/encoding
- Safe proof or differential behavior
