# Account-Takeover Canonical Pattern Catalog (ATO-P0 … ATO-P10)

Use these exact IDs and names. Do not rename, renumber, or invent new ones.

**Scope:** authentication bypass, password-reset flaws, OAuth/OIDC & SAML manipulation, 2FA/MFA
bypass, session hijack/fixation, email-verification bypass, credential leakage, account enumeration,
host-header attacks, auth race conditions, impersonation/delegation abuse — any path that leads to
unauthorized access to another user's account, session, or tokens.

**Universal:** language- and framework-agnostic. Every grep block below is multi-language
(JS/TS · Python · Ruby · PHP · Java · Go). Adapt regex to the target's conventions.

**Coverage rule:** every Phase-2 account-takeover *feature* report must include a pattern matrix with
**all P-0 … P-10 rows present exactly once** (sub-variants folded under their parent row), plus the
"What Survives Security Actions" checkpoint and the ATO-chain review. A missing row = incomplete review.

---

## ID + Name Index

| ID | Priority | Name |
|---|---|---|
| **ATO-P0** | 0 (highest) | Password-reset token manipulation |
| ATO-P0.1 | | Reset token predictable / weak entropy |
| ATO-P0.2 | | Reset token not single-use / not invalidated (old token survives) |
| ATO-P0.3 | | Email parameter accepts array / parameter pollution |
| ATO-P0.4 | | Host-header poisoning of the reset link |
| ATO-P0.5 | | Reset token leaked via Referer / third-party resources |
| **ATO-P1** | 1 | OAuth / OIDC flow exploitation |
| ATO-P1.1 | | Missing / unvalidated `state` (login CSRF, forced account link) |
| ATO-P1.2 | | `redirect_uri` validation bypass (prefix / authority / encoding) |
| ATO-P1.3 | | Auto-link / auto-create on unverified email |
| ATO-P1.4 | | Open redirect in the flow leaks `code` / token |
| ATO-P1.5 | | OAuth token stored/logged/exposed in plaintext |
| **ATO-P2** | 2 | SAML assertion manipulation |
| ATO-P2.1 | | XPath injection / unsigned-attribute trust |
| ATO-P2.2 | | Signature wrapping (XSW) |
| ATO-P2.3 | | Comment / canonicalization truncation in NameID |
| ATO-P2.4 | | AuthnContext spoofing (claims MFA outside signature) |
| **ATO-P3** | 3 | 2FA / MFA bypass |
| ATO-P3.1 | | Endpoint ignores the "2FA-pending" session state |
| ATO-P3.2 | | Alternate credential bypasses 2FA (PAT / API / deploy / CI token) |
| ATO-P3.3 | | "Remember this device" cookie forgeable / predictable |
| ATO-P3.4 | | Backup / recovery code brute force (short, unthrottled) |
| ATO-P3.5 | | 2FA verification race condition |
| ATO-P3.6 | | 2FA disable without re-verification |
| **ATO-P4** | 4 | Session hijacking & fixation |
| ATO-P4.1 | | Session ID not rotated after auth upgrade (fixation) |
| ATO-P4.2 | | Session not invalidated on password change |
| ATO-P4.3 | | Session not invalidated on block/disable |
| ATO-P4.4 | | No concurrent-session limit / no revoke-all |
| ATO-P4.5 | | Cookie scope too broad (parent domain / subdomain reach) |
| ATO-P4.6 | | Missing cookie attributes (HttpOnly / Secure / SameSite) |
| **ATO-P5** | 5 | Email-verification bypass |
| ATO-P5.1 | | Verification token predictable |
| ATO-P5.2 | | Verification token reusable / not invalidated |
| ATO-P5.3 | | Email change without re-verification / multi-field bypass |
| ATO-P5.4 | | Race condition on email claim |
| ATO-P5.5 | | Unverified email grants access / used for matching |
| **ATO-P6** | 6 | Credential & token leakage |
| ATO-P6.1 | | Token in URL / query string |
| ATO-P6.2 | | Token in logs / debug output |
| ATO-P6.3 | | Token echoed in API response |
| ATO-P6.4 | | Secret hardcoded in client-side / bundle |
| ATO-P6.5 | | Token in webhook / integration payload |
| ATO-P6.6 | | Non-constant-time comparison (timing side channel) |
| **ATO-P7** | 7 | Account enumeration |
| ATO-P7.1 | | Different error message (exists vs not) |
| ATO-P7.2 | | Timing difference (hash-on-hit vs fast-miss) |
| ATO-P7.3 | | Different status / body length / headers |
| ATO-P7.4 | | Rate-limit / lockout side channel |
| **ATO-P8** | 8 | Host-header attacks |
| ATO-P8.1 | | Password-reset link built from Host / X-Forwarded-Host |
| ATO-P8.2 | | Web-cache poisoning via Host |
| ATO-P8.3 | | Token in URL leaks via Referer of loaded resources |
| **ATO-P9** | 9 | Race conditions in auth flows |
| ATO-P9.1 | | Registration race (duplicate account, same email) |
| ATO-P9.2 | | Password-reset race (multiple valid tokens) |
| ATO-P9.3 | | 2FA verification race (see ATO-P3.5) |
| ATO-P9.4 | | Session-upgrade race |
| ATO-P9.5 | | Account-merge race |
| **ATO-P10** | 10 | Impersonation & delegation abuse |
| ATO-P10.1 | | Impersonation without audit / outliving session |
| ATO-P10.2 | | Impersonation token theft |
| ATO-P10.3 | | Service/bot account escalation via exposed token |
| ATO-P10.4 | | API-token scope mismatch (read→write, project→project) |

---

## ATO-P0 — Password-reset token manipulation  · priority 0 (highest)

Historically the #1 ATO vector. Trace the whole flow:
`request_reset → generate_token → deliver → validate_token → set_password → post-reset invalidation`.

**Detection (grep, multi-language):**
```bash
# JS/TS   — weak RNG vs strong; reset flow; host in link
grep -rn "Math.random\|Date.now()\|crypto.randomBytes\|resetToken\|passwordReset\|req.headers.host" .
# Python  — random vs secrets; Django token generator
grep -rn "random\.\(random\|randint\|choice\)\|secrets.token_\|os.urandom\|default_token_generator\|PasswordReset\|request.get_host" .
# Ruby    — SecureRandom vs weak; Devise
grep -rn "SecureRandom\|reset_password_token\|reset_password_sent_at\|request.host\|url_for" .
# PHP     — random_bytes vs mt_rand; Laravel
grep -rn "random_bytes\|bin2hex\|mt_rand\|uniqid\|Str::random\|Password::createToken\|Request::getHost" .
# Java    — SecureRandom vs java.util.Random
grep -rn "SecureRandom\|new Random(\|UUID.randomUUID\|PasswordResetToken\|getHeader(\"Host\")\|X-Forwarded-Host" .
# Go      — crypto/rand vs math/rand
grep -rn "crypto/rand\|math/rand\|rand.Read\|ResetToken\|r.Host\|X-Forwarded-Host" .
```

### ATO-P0.1 — Reset token predictable / weak entropy
- **Vulnerable pattern:** token derived from a guessable seed — `md5(email + timestamp)`, an
  auto-increment id, `Math.random()`, `mt_rand()`, `java.util.Random`, `time.Now().UnixNano()`, or the
  user's password hash itself. Anything not sourced from a CSPRNG with ≥128 bits is suspect.
- **Source → sink:** attacker-known values (email, approximate request time, user id) → token
  generator → DB `reset_token` column → attacker computes/guesses token → `set_password`.

### ATO-P0.2 — Reset token not single-use / not invalidated
- **Vulnerable pattern:** token is compared but never deleted/expired after use; or requesting a *new*
  reset does not invalidate the previous token; or no TTL (`reset_password_sent_at` unchecked).
- **Source → sink:** attacker triggers reset (token A) → victim triggers reset (token B) → token A
  still validates → attacker sets password. Also: token replayed after victim already used it.

### ATO-P0.3 — Email parameter accepts array / parameter pollution
- **Vulnerable pattern:** `email` bound as an array or duplicated param, e.g.
  `email[]=victim@example.com&email[]=attacker@example.com` or `{ "email": ["victim@example.com","attacker@example.com"] }`.
  The same reset token is delivered to *both* addresses; app validates against the victim.
- **Source → sink:** array/duplicate `email` param → mailer recipient list → attacker's inbox receives
  the victim's reset link → `set_password`.

### ATO-P0.4 — Host-header poisoning of the reset link
- **Vulnerable pattern:** reset URL built from `Host` / `X-Forwarded-Host` instead of a configured
  canonical base URL. Attacker sends `Host: attacker.example.com`; the emailed link points there.
- **Source → sink:** request `Host` header → mailer link builder → email body → victim clicks →
  token posted to `attacker.example.com`. (Overlaps ATO-P8.1.)

### ATO-P0.5 — Reset token leaked via Referer / third-party resources
- **Vulnerable pattern:** token lives in the URL query string and the reset page loads cross-origin
  resources (images, fonts, analytics, CDN scripts). The full URL — token included — leaks in the
  `Referer` header to third parties.
- **Source → sink:** token in `?token=` → reset page renders external `<img>/<script>` → browser
  sends `Referer: .../reset?token=...` to third party → token harvested.

---

## ATO-P1 — OAuth / OIDC flow exploitation  · priority 1

**Detection (grep, multi-language):**
```bash
# JS/TS
grep -rn "passport-oauth2\|openid-client\|oauth.*Strategy\|state\|redirect_uri\|email_verified" .
# Python
grep -rn "allauth\|social_auth\|authlib\|state\|redirect_uri\|email_verified\|SOCIALACCOUNT" .
# Ruby
grep -rn "omniauth\|doorkeeper\|request.env\['omniauth" .
grep -rn "redirect_uri\|state\|email_verified\|info.email" .
# PHP
grep -rn "socialite\|league/oauth2\|redirect_uri\|state\|getEmail\|verified" .
# Java
grep -rn "spring-security-oauth2\|OAuth2\|redirectUri\|state\|email_verified\|getAttribute" .
# Go
grep -rn "x/oauth2\|AuthCodeURL\|redirect_uri\|oauth2.Config\|EmailVerified" .
```

### ATO-P1.1 — Missing / unvalidated `state`
- **Vulnerable pattern:** authorization request has no `state`, or the callback never compares it to a
  session-bound value. Enables login CSRF and forced account-linking.
- **Source → sink:** attacker-initiated `code` → victim's browser hits callback → app links attacker's
  external identity to victim's local account (or logs victim into attacker's account).

### ATO-P1.2 — `redirect_uri` validation bypass
- **Vulnerable pattern:** `redirect_uri` checked by prefix/`startsWith`/`contains` instead of exact
  match. Bypasses: `https://example.com.attacker.example.com`, `https://example.com/../attacker`,
  `https://example.com@attacker.example.com`, backslash/encoded variants `%5c`, fragment tricks.
- **Source → sink:** attacker-controlled `redirect_uri` → provider redirect with `code` →
  `attacker.example.com` → attacker exchanges `code` for tokens.

### ATO-P1.3 — Auto-link / auto-create on unverified email
- **Vulnerable pattern:** on OAuth login the provider-supplied email is matched to an existing local
  account (or auto-creates one) **without** requiring the email be verified on *both* sides
  (`email_verified` ignored).
- **Source → sink:** attacker sets a provider account's email to `victim@example.com` (unverified) →
  OAuth login → app matches on email → attacker gains victim's account.

### ATO-P1.4 — Open redirect in the flow leaks `code` / token
- **Vulnerable pattern:** a `return_to` / `next` / `continue` redirect inside the authenticated flow
  forwards to an attacker URL carrying the `code` or fragment token.
- **Source → sink:** open-redirect param → 302 to `attacker.example.com` with `code`/`#access_token`
  → attacker exchanges/uses it.

### ATO-P1.5 — OAuth token stored/logged/exposed in plaintext
- **Vulnerable pattern:** `access_token` / `refresh_token` stored unencrypted, written to logs, or
  returned in an API/HTML response. (Overlaps ATO-P6.) 
- **Source → sink:** provider token → plaintext store/log/response → attacker reads → impersonates via
  provider API.

---

## ATO-P2 — SAML assertion manipulation  · priority 2

**Detection (grep, multi-language):**
```bash
# JS/TS
grep -rn "passport-saml\|saml2-js\|node-saml\|validateSignature\|NameID\|InResponseTo" .
# Python
grep -rn "python3-saml\|djangosaml2\|pysaml2\|OneLogin_Saml2\|get_nameid\|signature" .
# Ruby
grep -rn "ruby-saml\|omniauth-saml\|OneLogin::RubySaml\|name_id\|validate_signature" .
# PHP
grep -rn "simplesamlphp\|onelogin\|laravel-saml2\|getNameId\|validateSignature" .
# Java
grep -rn "spring-security-saml2\|opensaml\|Assertion\|SignatureValidator\|getNameID" .
# Go
grep -rn "crewjam/saml\|russellhaering/gosaml2\|ValidateResponse\|NameID\|Signature" .
```

### ATO-P2.1 — XPath injection / unsigned-attribute trust
- **Vulnerable pattern:** identity read with a `//`-anchored XPath (matches anywhere) instead of an
  anchor into the *signed* `SignedInfo`/assertion. Attacker places `NameID`/email **outside** the
  signed region; signature verifies on the original, app reads the attacker's node.
- **Source → sink:** attacker-injected unsigned `NameID` → XPath extraction → user lookup → login as
  anyone.

### ATO-P2.2 — Signature wrapping (XSW)
- **Vulnerable pattern:** attacker duplicates the signed assertion and adds a forged unsigned
  assertion; validator checks the signed one, processor consumes the unsigned one.
- **Source → sink:** wrapped response → signature passes → identity read from forged assertion → ATO.

### ATO-P2.3 — Comment / canonicalization truncation in NameID
- **Vulnerable pattern:** `admin@example.com<!---->.attacker.example.com` — parser differential means
  one layer verifies the full string while another reads only `admin@example.com`.
- **Source → sink:** comment-laden `NameID` → parser truncation → matches a higher-value account.

### ATO-P2.4 — AuthnContext spoofing
- **Vulnerable pattern:** app trusts an `AuthnContextClassRef` (claiming MFA/kerberos) placed outside
  the signed assertion and skips its own 2FA.
- **Source → sink:** injected AuthnContext → MFA-satisfied flag → 2FA skipped.

---

## ATO-P3 — 2FA / MFA bypass  · priority 3

**Detection (grep, multi-language):**
```bash
# JS/TS
grep -rn "speakeasy\|otplib\|totp\|verifyToken\|rememberDevice\|backupCode\|mfa\|twoFactor" .
# Python
grep -rn "pyotp\|django-otp\|verify(\|totp\|backup_code\|is_verified\|two_factor" .
# Ruby
grep -rn "rotp\|devise-two-factor\|otp_secret\|validate_and_consume_otp\|backup_code" .
# PHP
grep -rn "google2fa\|pragmarx\|verifyKey\|totp\|recovery_code\|two_factor" .
# Java
grep -rn "GoogleAuthenticator\|samstevens\|verifyCode\|totp\|backupCode\|MfaService" .
# Go
grep -rn "pquerna/otp\|totp.Validate\|VerifyCode\|BackupCode\|mfa" .
```

### ATO-P3.1 — Endpoint ignores the "2FA-pending" session state
- **Vulnerable pattern:** login sets a `2fa_pending` session flag but some endpoints/resources don't
  check it and serve data (or accept sensitive actions) to a pre-2FA session.
- **Source → sink:** password-only session → protected endpoint without pending-check → access before
  2FA completed.

### ATO-P3.2 — Alternate credential bypasses 2FA
- **Vulnerable pattern:** PATs, API keys, deploy/CI tokens, or OAuth/SAML paths authenticate without
  ever enforcing 2FA even when it's mandatory for the account.
- **Source → sink:** stolen/leaked non-session credential → API auth → full access, 2FA never invoked.

### ATO-P3.3 — "Remember this device" cookie forgeable / predictable
- **Vulnerable pattern:** trust-device cookie built from guessable fields (`user_id.device_id.timestamp`)
  or signed with a weak/leaked key; no server-side record.
- **Source → sink:** forged remember-device cookie → 2FA skipped on next login.

### ATO-P3.4 — Backup / recovery code brute force
- **Vulnerable pattern:** short backup codes (6–8 chars) with no rate limit; a post-password,
  pre-2FA session can enumerate them.
- **Source → sink:** pre-2FA session → repeated backup-code submissions → match → session upgraded.

### ATO-P3.5 — 2FA verification race condition
- **Vulnerable pattern:** OTP validation isn't atomic / one-time consumption isn't enforced; parallel
  requests let a wrong-code request ride the session upgrade from a concurrent correct-code request,
  or reuse a just-consumed code.
- **Source → sink:** concurrent OTP submissions → non-atomic upgrade → invalid attempt gains a valid
  session. (Also ATO-P9.3.)

### ATO-P3.6 — 2FA disable without re-verification
- **Vulnerable pattern:** the disable-2FA endpoint requires neither the current OTP nor the password,
  and/or is reachable via CSRF.
- **Source → sink:** attacker (via CSRF or a hijacked low-value session) disables 2FA → subsequent ATO.

---

## ATO-P4 — Session hijacking & fixation  · priority 4

**Detection (grep, multi-language):**
```bash
# JS/TS
grep -rn "express-session\|req.session.regenerate\|cookie-session\|httpOnly\|sameSite\|secure:" .
# Python
grep -rn "SESSION_ENGINE\|cycle_key\|SessionMiddleware\|SESSION_COOKIE_HTTPONLY\|SESSION_COOKIE_SECURE\|SESSION_COOKIE_SAMESITE" .
# Ruby
grep -rn "session_store\|reset_session\|httponly\|secure:\|same_site\|cookie.*domain" .
# PHP
grep -rn "session_regenerate_id\|session.cookie_httponly\|session.cookie_secure\|SameSite\|SESSION_DOMAIN" .
# Java
grep -rn "changeSessionId\|HttpOnly\|Secure\|SameSite\|SessionFixation\|migrateSession" .
# Go
grep -rn "gorilla/sessions\|HttpOnly\|Secure\|SameSite\|http.Cookie\|Domain:" .
```

### ATO-P4.1 — Session ID not rotated after auth upgrade (fixation)
- **Vulnerable pattern:** no `regenerate`/`reset_session`/`changeSessionId` after login, 2FA, or role
  change. Attacker fixes a known session id, victim authenticates into it.
- **Source → sink:** attacker-set session id → victim logs in → attacker reuses same id.

### ATO-P4.2 — Session not invalidated on password change
- **Vulnerable pattern:** password change leaves *other* sessions (and API tokens) alive.
- **Source → sink:** attacker's stolen session → victim changes password → attacker's session persists.

### ATO-P4.3 — Session not invalidated on block/disable
- **Vulnerable pattern:** admin block/disable doesn't terminate existing sessions/tokens.
- **Source → sink:** blocked user's live session → continued access post-block.

### ATO-P4.4 — No concurrent-session limit / no revoke-all
- **Vulnerable pattern:** unlimited concurrent sessions and no "revoke all" that actually kills them.
- **Source → sink:** stolen session coexists indefinitely with the victim's legitimate session.

### ATO-P4.5 — Cookie scope too broad
- **Vulnerable pattern:** cookie `Domain=.example.com` instead of `app.example.com`; any subdomain
  (incl. an attacker-controlled one) can read or set it.
- **Source → sink:** subdomain-set cookie → parent-domain session poisoning/theft.

### ATO-P4.6 — Missing cookie attributes
- **Vulnerable pattern:** session cookie lacks `HttpOnly` (JS-readable → XSS→ATO), `Secure`
  (cleartext → MITM), or `SameSite` (CSRF-usable).
- **Source → sink:** cookie without the relevant flag → theft/misuse via the corresponding vector.

---

## ATO-P5 — Email-verification bypass  · priority 5

**Detection (grep, multi-language):**
```bash
# JS/TS
grep -rn "emailVerified\|verifyEmail\|confirmationToken\|isVerified\|pendingEmail" .
# Python
grep -rn "email_verified\|EmailConfirmation\|confirm_email\|is_active\|EMAIL_VERIFICATION" .
# Ruby
grep -rn "confirmed_at\|confirmation_token\|confirmable\|unconfirmed_email\|skip_confirmation" .
# PHP
grep -rn "email_verified_at\|MustVerifyEmail\|verification\|hasVerifiedEmail" .
# Java
grep -rn "emailVerified\|VerificationToken\|isEnabled\|confirmEmail" .
# Go
grep -rn "EmailVerified\|VerificationToken\|ConfirmEmail\|IsActive" .
```

### ATO-P5.1 — Verification token predictable
- **Vulnerable pattern:** confirmation token sequential/timestamp-based/derived from email. (Same RNG
  concerns as ATO-P0.1.)
- **Source → sink:** guessable seed → confirmation token → attacker verifies an email they don't own.

### ATO-P5.2 — Verification token reusable / not invalidated
- **Vulnerable pattern:** token not consumed after verification; intercepted link works later.
- **Source → sink:** replayed confirmation token → re-verify / verify a swapped address.

### ATO-P5.3 — Email change without re-verification / multi-field bypass
- **Vulnerable pattern:** email changes take effect without verifying the new address, or a single
  request sets `email` and `email_verified=true` together (mass-assignment / over-posting).
- **Source → sink:** email + verified flag in one request → account now keyed to attacker's/victim's
  address without a real verification step → chain into reset/ATO.

### ATO-P5.4 — Race condition on email claim
- **Vulnerable pattern:** uniqueness checked at verification time, not atomically; two users verify the
  same address concurrently.
- **Source → sink:** concurrent claims → both succeed → identity collision. (Also ATO-P9.)

### ATO-P5.5 — Unverified email grants access / used for matching
- **Vulnerable pattern:** features match on an *unverified* email — invitation acceptance, OAuth
  auto-link (ATO-P1.3), commit/authorship attribution, team membership.
- **Source → sink:** attacker sets an unverified email to `victim@example.com` → matching logic grants
  victim-scoped access.

---

## ATO-P6 — Credential & token leakage  · priority 6

**Detection (grep, multi-language):**
```bash
# JS/TS
grep -rn "console.log\|logger\.\(info\|debug\)" . | grep -iE "token|secret|password|api_?key"
grep -rn "req.query.*token\|\\?token=\|===\s*token\|token\s*===" .
# Python
grep -rn "logging\.\(info\|debug\)\|print(" . | grep -iE "token|secret|password|api_?key"
grep -rn "request.GET.*token\|== token\|token ==" .
# Ruby
grep -rn "logger.\(info\|debug\)\|puts\|Rails.logger" . | grep -iE "token|secret|password|api_?key"
grep -rn "== token\|token ==\|params\[:token\]" .
# PHP
grep -rn "error_log\|var_dump\|Log::\(info\|debug\)" . | grep -iE "token|secret|password|api_?key"
grep -rn "== \$token\|\$_GET\['token'\]" .
# Java
grep -rn "log\.\(info\|debug\)\|System.out.print" . | grep -iE "token|secret|password|apiKey"
grep -rn "\.equals(token)\|token.equals\|getParameter(\"token\")" .
# Go
grep -rn "log.Print\|fmt.Print\|log.Debug" . | grep -iE "token|secret|password|apiKey"
grep -rn "== token\|r.URL.Query().Get(\"token\")" .
# Constant-time comparators (SAFE — their ABSENCE around token/secret compares is the finding):
grep -rn "secure_compare\|hmac.compare_digest\|crypto.timingSafeEqual\|hash_equals\|MessageDigest.isEqual\|subtle.ConstantTimeCompare\|ActiveSupport::SecurityUtils" .
```

### ATO-P6.1 — Token in URL / query string
- **Vulnerable pattern:** session id, API token, or reset token passed as `?token=`; logged by
  servers/proxies and leaked via Referer (see ATO-P8.3).

### ATO-P6.2 — Token in logs / debug output
- **Vulnerable pattern:** tokens/passwords written to app logs, debug traces, or error messages.

### ATO-P6.3 — Token echoed in API response
- **Vulnerable pattern:** endpoint returns a token that should be shown once, or returns a reversible
  "hash".

### ATO-P6.4 — Secret hardcoded in client-side / bundle
- **Vulnerable pattern:** API keys/secrets in JS bundles, HTML source, or mobile resources.

### ATO-P6.5 — Token in webhook / integration payload
- **Vulnerable pattern:** tokens forwarded to external services in webhook bodies, error-reporting, or
  integration callbacks.

### ATO-P6.6 — Non-constant-time comparison
- **Vulnerable pattern:** token/secret compared with `==` / `.equals` / `!=` instead of a
  constant-time comparator → timing side channel to recover the value byte-by-byte.
- **Source → sink (all P6):** secret value → leak channel (URL/log/response/bundle/webhook/timing) →
  attacker reads/reconstructs it → authenticates as the victim.

---

## ATO-P7 — Account enumeration  · priority 7

**Detection (grep, multi-language):**
```bash
# JS/TS / Python / Ruby / PHP / Java / Go — differential responses on login/reset/register
grep -rni "user not found\|no such user\|email not found\|invalid password\|wrong password" .
grep -rni "already taken\|already registered\|already exists\|email exists" .
grep -rni "failed_attempts\|lockout\|account.*lock" .
```

### ATO-P7.1 — Different error message (exists vs not)
- **Vulnerable pattern:** login says "user not found" vs "wrong password"; reset says "email sent" vs
  "no account"; register says "email already taken".
- **Source → sink:** email probe → differential message → confirmed-valid account list → targeted
  spray/reset.

### ATO-P7.2 — Timing difference
- **Vulnerable pattern:** hash-on-hit but fast-return-on-miss → measurable timing oracle even when the
  message is uniform.

### ATO-P7.3 — Different status / body length / headers
- **Vulnerable pattern:** different HTTP status, `Content-Length`, or headers for exists vs not.

### ATO-P7.4 — Rate-limit / lockout side channel
- **Vulnerable pattern:** lockout/`failed_attempts` counters exist only for real accounts, so only
  valid emails ever get throttled — a boolean oracle.

---

## ATO-P8 — Host-header attacks  · priority 8

**Detection (grep, multi-language):**
```bash
grep -rn "req.headers.host\|request.host\|HTTP_HOST\|SERVER_NAME\|getHeader(\"Host\")\|r.Host" . | grep -iE "url|link|mail|reset|base"
grep -rni "x-forwarded-host\|x-original-host\|x-forwarded-server" .
grep -rni "base_url\|root_url\|default_url_options\|APP_URL\|SITE_URL\|canonical" .
```

### ATO-P8.1 — Password-reset link built from Host / X-Forwarded-Host
- Same as ATO-P0.4. Any user-facing link built from request headers is in scope.

### ATO-P8.2 — Web-cache poisoning via Host
- **Vulnerable pattern:** a manipulated Host header is reflected into a cacheable response, poisoning
  it for other users (redirect/script to attacker host).

### ATO-P8.3 — Token in URL leaks via Referer of loaded resources
- Same class as ATO-P0.5, generalized to any tokenized URL that loads cross-origin resources.
- **Source → sink (all P8):** attacker-controlled `Host`/`X-Forwarded-Host` or tokenized URL →
  link/cache/Referer → victim → token/redirect delivered to `attacker.example.com`.

---

## ATO-P9 — Race conditions in auth flows  · priority 9

**Detection (grep, multi-language):** look for auth-state mutations *without* a transaction, row lock,
unique constraint, or atomic upsert.
```bash
grep -rn "transaction\|SELECT .* FOR UPDATE\|with_lock\|advisory_lock\|Mutex\|synchronized\|SERIALIZABLE" . | grep -iE "user|email|session|reset|otp|register|merge"
grep -rn "find_or_create\|first_or_create\|get_or_create\|firstOrCreate\|ON CONFLICT\|upsert\|INSERT.*IGNORE" .
```

### ATO-P9.1 — Registration race
- Two concurrent registrations with the same email both succeed (check-then-insert, no unique index).
### ATO-P9.2 — Password-reset race
- Concurrent reset requests yield multiple simultaneously-valid tokens.
### ATO-P9.3 — 2FA verification race
- See ATO-P3.5.
### ATO-P9.4 — Session-upgrade race
- A resource request slips between the 2FA check and the session-state write and sees upgraded state.
### ATO-P9.5 — Account-merge race
- Concurrent merges create duplicate/cross access or corrupt identity ownership.
- **Source → sink (all P9):** concurrent requests → non-atomic check-then-act on identity state →
  duplicate/valid artifact the attacker controls.

---

## ATO-P10 — Impersonation & delegation abuse  · priority 10

**Detection (grep, multi-language):**
```bash
grep -rni "impersonate\|sudo\|act_as\|on_behalf\|become_user\|switch_user\|loginAs\|assume" .
grep -rni "service_account\|bot\|machine_user\|system_user\|automation.*token" .
grep -rn "scope\|permission\|ability" . | grep -iE "token|api_?key|pat"
```

### ATO-P10.1 — Impersonation without audit / outliving session
- **Vulnerable pattern:** impersonation isn't logged, or it mints a real token that survives ending the
  impersonation, or an admin can impersonate a super-admin.
### ATO-P10.2 — Impersonation token theft
- **Vulnerable pattern:** impersonation yields a stealable session/token = access as the impersonated
  user.
### ATO-P10.3 — Service/bot account escalation via exposed token
- **Vulnerable pattern:** broad-scope service tokens exposed in CI logs/config/webhooks → access to
  everything the service account can reach.
### ATO-P10.4 — API-token scope mismatch
- **Vulnerable pattern:** a `read`-scoped token reaches write endpoints, or a project-A token reaches
  project B.
- **Source → sink (all P10):** obtained delegated/service credential → under-checked scope/audit →
  access beyond the credential's intended boundary.

---

## What Survives Security Actions — the highest-yield ATO test

**Principle:** a user takes a security action expecting it to lock the attacker out. Any access channel
that *survives* the action means the account is still compromised. For every cell below, trace the code
and confirm invalidation actually happens. "must invalidate" but code doesn't → finding.

Columns: **Web session** · **Remember-me cookie** · **Active reset tokens** · **API / personal tokens**
· **OAuth authorizations** · **Derived / child tokens** (refresh/CI/deploy/impersonation).

| Security action ↓ | Web session | Remember-me | Reset tokens | API/PAT | OAuth grants | Derived/child |
|---|---|---|---|---|---|---|
| **Password change** | invalidate all *other* | invalidate all | invalidate all pending | should revoke (or warn) | keep (unless policy) | invalidate refresh/child |
| **Explicit logout** | invalidate *this* | invalidate *this device* | n/a | keep | keep | keep |
| **Revoke all sessions** | invalidate ALL but current | invalidate ALL | keep | keep | keep | keep |
| **Admin block / disable** | invalidate ALL | invalidate ALL | invalidate ALL | revoke ALL | revoke ALL | revoke ALL |
| **Email change** | keep (rebind identity) | keep | invalidate old-email resets | keep | re-evaluate email-linked | keep |
| **2FA enable** | rotate session id | invalidate stale remember-device | keep | (policy: restrict token bypass) | keep | keep |
| **2FA disable** | keep | keep | keep | keep | keep | keep |
| **Role downgrade** | rotate/re-scope session | keep | keep | re-scope / revoke over-scoped | re-scope | revoke over-scoped |
| **Account delete** | invalidate ALL | invalidate ALL | invalidate ALL | revoke ALL | revoke ALL | revoke ALL |

**How to check in source:** for each action's handler, grep the invalidation calls it *actually*
performs and compare to the row. Examples of the calls to look for:
```bash
# session / token teardown that SHOULD accompany the action
grep -rn "reset_session\|destroy_all\|revoke\|delete_all\|invalidate\|expire\|cycle_key\|regenerate\|blacklist\|deleteMany\|update.*revoked" .
# then diff against: password change / block / delete / email-change / 2FA-enable handlers
```
If the handler mutates state but calls none of the expected teardown for a "must invalidate" cell,
open a candidate (privilege-transfer / persistent-access severity, not a silent-UX gap).

---

## ATO Chains — multi-step takeovers

Chains combine lower-severity bugs into full ATO. Each Phase-2 feature review must consider whether its
feature is a *link* in any chain below.

1. **Host-header → reset-link theft → ATO** — `Host: attacker.example.com` (ATO-P0.4/P8.1) → victim's
   reset email points to attacker → victim clicks → token stolen → password set.
2. **Enumeration → password spray → ATO** — ATO-P7 confirms valid emails → spray common passwords
   against only-valid accounts (weak/absent lockout ATO-P7.4).
3. **OAuth auto-link on unverified email → ATO** — ATO-P1.3: attacker's provider account carries
   `victim@example.com` unverified → auto-link → victim's account.
4. **redirect_uri bypass → code theft → ATO** — ATO-P1.2 leaks `code` to `attacker.example.com` →
   token exchange → session as victim.
5. **SAML XPath injection → login as anyone** — ATO-P2.1: unsigned `NameID` trusted → full ATO in one
   request.
6. **Reset token prediction → ATO** — ATO-P0.1: token = `hash(email+time)` → compute → set password.
7. **Alternate-credential 2FA bypass → full access** — ATO-P3.2: leaked PAT (ATO-P6.x from CI logs)
   authenticates with no 2FA.
8. **Registration race → duplicate account → ATO** — ATO-P9.1: two same-email registrations both
   succeed → identity collision.
9. **CSRF → email change → password reset → ATO** — CSRF flips victim's email (ATO-P5.3) →
   attacker requests reset on the new address → resets.
10. **Session-not-rotated → fixation → ATO** — ATO-P4.1: attacker fixes session id, victim logs in,
    attacker rides the authenticated session. Compounds with ATO-P4.5 (broad cookie scope) via a
    controlled subdomain.

---

## Token-Entropy Reference — what a secure token looks like

| Token type | Randomness source (secure) | Min entropy / length | Single-use | TTL |
|---|---|---|---|---|
| Session ID | CSPRNG (framework default) | 128 bits (≥32 hex) | rotate on auth upgrade | idle + absolute cap |
| CSRF token | CSPRNG | 128 bits | per-session/per-form | session lifetime |
| Password-reset token | CSPRNG | 128 bits (≥32 hex) | yes — delete on use & on new request | 15–60 min |
| Email-verification token | CSPRNG | 64+ bits | yes | hours–1 day |
| API key / PAT | CSPRNG | 128+ bits | n/a (stored hashed) | optional expiry |
| OAuth `state` | CSPRNG, session-bound | 128 bits | yes | short |
| TOTP code | RFC 6238 | 6 digits (~20 bits) | yes (consume) | 30 s ± 1 window; **must** rate-limit |
| Backup / recovery code | CSPRNG | 8+ chars (~41 bits) | yes | until used; **must** rate-limit |
| JWT HMAC secret | CSPRNG key | 256+ bits | n/a | rotate |

**Secure generators:** `crypto.randomBytes` (Node) · `secrets` / `os.urandom` (Python) ·
`SecureRandom` (Ruby/Java) · `random_bytes` (PHP) · `crypto/rand` (Go).
**Insecure (never for tokens):** `Math.random`, `Date.now`, `random.random`, `mt_rand`, `uniqid`,
`java.util.Random`, `math/rand`, any `hash(email+timestamp)` or password-hash-derived scheme.

---

## Language / Framework Adaptation Grep Table

| Concept | Node/Express | Python/Django | Ruby/Rails | PHP/Laravel | Java/Spring | Go |
|---|---|---|---|---|---|---|
| Login handler | `passport.authenticate` | `authenticate()`, `LoginView` | `sessions#create`, Devise | `Auth::attempt()` | `AuthenticationManager`, `@PostMapping("/login")` | custom `HandleLogin` |
| Password reset | `resetPassword`, `forgotPassword` | `default_token_generator`, `PasswordResetView` | `passwords#create`, Devise | `Password::createToken` | `PasswordResetTokenService` | `ResetPassword` |
| Session store | `express-session`, `cookie-session` | `SESSION_ENGINE`, `SessionMiddleware` | `config.session_store` | `config/session.php` | `HttpSession` | `gorilla/sessions`, `scs` |
| OAuth/OIDC | `passport-oauth2`, `openid-client` | `allauth`, `authlib` | `omniauth`, `doorkeeper` | `socialite` | `spring-security-oauth2` | `x/oauth2` |
| SAML | `passport-saml`, `node-saml` | `python3-saml`, `djangosaml2` | `ruby-saml`, `omniauth-saml` | `simplesamlphp`, `laravel-saml2` | `opensaml`, `spring-security-saml2` | `crewjam/saml` |
| 2FA / TOTP | `speakeasy`, `otplib` | `pyotp`, `django-otp` | `rotp`, `devise-two-factor` | `pragmarx/google2fa` | `samstevens/totp` | `pquerna/otp` |
| Password hash | `bcryptjs`, `argon2` | `make_password`, `PBKDF2` | `bcrypt`, `has_secure_password` | `Hash::make()` | `BCryptPasswordEncoder` | `x/crypto/bcrypt` |
| JWT | `jsonwebtoken`, `jose` | `PyJWT`, `simplejwt` | `ruby-jwt` | `firebase/php-jwt` | `jjwt`, `nimbus-jose-jwt` | `golang-jwt/jwt` |
| CSRF | `csurf`, `csrf-csrf` | `CsrfViewMiddleware` | `protect_from_forgery` | `VerifyCsrfToken` | `CsrfFilter` | `gorilla/csrf`, `nosurf` |
| Constant-time compare | `crypto.timingSafeEqual` | `hmac.compare_digest` | `ActiveSupport::SecurityUtils.secure_compare` | `hash_equals` | `MessageDigest.isEqual` | `subtle.ConstantTimeCompare` |

**Framework-specific ATO gotchas:** Django `PASSWORD_RESET_TIMEOUT` (default long); `ACCOUNT_EMAIL_VERIFICATION="optional"`.
Rails/Devise `confirmable` often disabled; reset stored as SHA256(token) — check TTL. Express/Passport
missing `req.session.regenerate()` after login. Spring `SessionCreationPolicy.STATELESS` with no token
blacklist; CSRF disabled for API → OAuth login CSRF. Laravel Sanctum tokens non-expiring by default. Go
custom session code + JWT `none`-alg pitfalls (prefer `golang-jwt/jwt`).
