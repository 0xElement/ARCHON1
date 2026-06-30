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

# 4. Claude login check — ARCHON runs on your Claude SUBSCRIPTION via OAuth (no API key).
bold "Checking Claude access…"
if command -v claude >/dev/null 2>&1; then
  ok "claude CLI found ($(command -v claude)) — make sure you've logged in (run: claude)"
elif [ -d "$HOME/.claude" ]; then
  ok "~/.claude present — Claude Code is set up on this machine"
else
  warn "No Claude login detected. ARCHON authenticates with your Claude SUBSCRIPTION (no API key)."
  warn "Install Claude Code (https://claude.ai/code) and log in once, then you're set."
fi

# 5. Next steps.
bold "Done. To run ARCHON:"
echo "  npm run dashboard     # operator portal → http://127.0.0.1:4000"
echo "  npm start             # (separate shell) the agent daemon"
echo
echo "  Open the portal, create a dispatch (a URL and/or a source dir), and go."
echo "  Authorized testing only — scope is fail-closed by default."
