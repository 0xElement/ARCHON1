# Security Policy

## Reporting a vulnerability in ARCHON

Please report security issues **privately** via GitHub Security Advisories:
**Security → Report a vulnerability** on this repository. Do not open a public issue for a
suspected vulnerability. We aim to acknowledge within a few days and will coordinate a fix and
disclosure timeline with you.

Include: affected version/commit, a description, reproduction steps, and impact.

## Authorized use only

ARCHON is an **offensive** security tool: it generates and fires payloads against web targets.
Run it **only** against systems you own or are explicitly authorized to test (a signed engagement,
a bug-bounty program in scope, a CTF, or your own lab). Unauthorized testing is illegal.

The tool ships with a safety perimeter, and it must stay intact:
- **Scope is fail-closed** — a dispatch with no scope config is blocked (`agents/scope-prevalidator.js`;
  override only in a lab with `ARCHON_SCOPE_OVERRIDE=1`).
- **Impact demonstration is gated** — payloads that *prove* impact (e.g. real RCE) fire only behind
  the active-PoC 3-gate perimeter (engagement mode + permission token + `ARCHON_ACTIVE_POC`); the
  default fires nothing beyond detection payloads.
- Do not remove, weaken, or bypass these gates in a contribution.

## No secrets or client data in the repo

This is a public repository. It must never contain:
- private keys, API tokens, or credentials;
- real client hostnames, internal infrastructure, real IP addresses, or personal data (emails, names);
- hardcoded developer/home paths.

Enforcement (defense in depth):
- **`scripts/scan-secrets.js`** — a self-contained scanner for the classes above, verified by
  `test/scan-secrets.test.js`. Run it any time with `npm run scan`.
- **Pre-commit hook** (`.githooks/pre-commit`) — blocks a commit that introduces any of the above.
  Enable it once per clone: `git config core.hooksPath .githooks` (also done by `npm run setup`).
- **CI** runs the scanner on every push and pull request.

If you must commit a genuine false positive (an example key in the KB, a documentation placeholder),
add a trailing `scan-allow` comment on that line. Use it sparingly.

## Supported versions

The `main` branch is the supported line; security fixes land there. Pin a commit for reproducibility.
