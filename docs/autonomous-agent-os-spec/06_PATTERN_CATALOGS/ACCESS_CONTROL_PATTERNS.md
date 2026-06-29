# Access Control and IDOR Patterns

## AC-001 Missing ownership check

Look for object lookup by ID followed by action without checking the object belongs to the current user, tenant, group, or allowed role.

Evidence required:

- Entry point
- Object lookup
- Missing or insufficient ownership check
- Two-account/role proof if live target exists

## AC-002 Controller-level authorization missing

Look for sensitive controller/API actions that do not call a policy, guard, middleware, permission check, or equivalent.

## AC-003 Service-level authorization missing

Look for services callable from multiple controllers/jobs where authorization is assumed to have happened elsewhere.

## AC-004 Horizontal privilege escalation

Look for same-role users accessing each other's resources.

## AC-005 Vertical privilege escalation

Look for lower-privilege user reaching admin or manager actions.

## AC-006 Tenant isolation bypass

Look for tenant ID, org ID, workspace ID, or account ID accepted from client input without server-side enforcement.

## AC-007 Mass assignment authorization bypass

Look for model update/create calls that accept broad request parameters.

## AC-008 Hidden endpoint exposure

Look for routes not exposed in UI but callable directly.

## AC-009 Inconsistent authorization across same functionality

Compare web, API, mobile, GraphQL, background jobs, import/export, and admin versions of the same action.

## AC-010 Authorization checked after side effect

Look for state change before permission validation.
