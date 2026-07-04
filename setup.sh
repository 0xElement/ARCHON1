#!/usr/bin/env bash
# ARCHON — one-shot local setup (macOS / Linux; Windows → use WSL).
#
# Installs dependencies, seeds the local data layer, and checks your Claude login.
# Idempotent: safe to re-run. Run it from the repo root:  bash setup.sh
set -u

cd "$(dirname "$0")"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$1"; }
die()  { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }

bold "ARCHON setup"

# 1. Node >= 18 (hard requirement).
command -v node >/dev/null 2>&1 || die "Node.js not found. Install Node >= 18 (https://nodejs.org) and re-run."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] 2>/dev/null || die "Node >= 18 required (found $(node -v)). Upgrade and re-run."
ok "Node $(node -v)"

# 2. Dependencies (acorn + the Claude Agent SDK; playwright is optional).
bold "Installing dependencies (npm install)…"
npm install || die "npm install failed — see the output above."
ok "dependencies installed"

# 3. Seed the local data layer under var/intel (idempotent; never clobbers state).
bold "Seeding the data layer…"
node scripts/setup-local.js || die "data-layer setup failed (scripts/setup-local.js)."
ok "data layer ready (var/intel)"
node scripts/install-hooks.js || true   # enable the secret-scan pre-commit hook (explicit, side-effecting)

# 4. Preflight — the doctor reports exactly what's present vs missing (Node, the
#    claude login — the one hard gate — and the optional recon tools). ARCHON runs
#    on your Claude SUBSCRIPTION via OAuth (no API key). Informational: never aborts.
bold "Running preflight (npm run doctor)…"
node scripts/doctor.js || true

# 5. Next steps.
bold "To run ARCHON (two shells):"
echo "  npm start             # 1) the agent daemon (event-bus)"
echo "  npm run dashboard     # 2) operator portal → http://127.0.0.1:4000"
echo
echo "  Open the portal, create a dispatch (a source dir for the lightest run,"
echo "  and/or a target URL), and go. Authorized testing only — scope is fail-closed."
echo "  Re-check prerequisites anytime with:  npm run doctor"
