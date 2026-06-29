# Authentication and Session Patterns

## AUTH-001 Weak password reset flow

Look for reset tokens that are predictable, reusable, not bound to user/session, not expired, or not invalidated after use.

## AUTH-002 MFA bypass

Look for flows where MFA is enforced in UI but not server-side, or where alternate endpoints skip MFA.

## AUTH-003 Session fixation

Look for session IDs not rotated after login or privilege change.

## AUTH-004 JWT validation weakness

Look for missing signature validation, weak algorithm handling, missing expiry checks, weak audience/issuer validation, or trusting client-side claims.

## AUTH-005 OAuth/SSO callback weakness

Look for missing state validation, open redirect influence, weak account linking, or untrusted email claim handling.

## AUTH-006 Account recovery abuse

Look for recovery flows that trust user-controlled identifiers or allow takeover through email/phone change.

## AUTH-007 Logout does not invalidate server-side session

Look for logout that only clears client state.

## AUTH-008 Privilege not refreshed after role change

Look for sessions retaining old privileges after role or membership changes.
