'use strict'
// Model catalog — the list of models offered in the dashboard's "Model override"
// dropdown. Source of truth, in order of preference:
//
//   1. The SDK's supportedModels() over the local OAuth CLI session (no API key) —
//      the models this Claude subscription actually advertises, live.
//   2. modelRouter.loadModelConfig().families — the seeded model-config.json.
//
// Never hardcodes model IDs here (CLAUDE.md rule). Fail-soft: any SDK error falls
// back to config; the dropdown always has SOMETHING. Result is cached in-memory.
//
// Injectable seams (opts) keep it unit-testable offline: `sdkLoader` replaces the
// real SDK spawn, `now` replaces the clock.

const path = require('path')
const modelRouter = require('./model-router')
const agentPaths = require('../../paths')

const AGENTS_ROOT = agentPaths.AGENTS_ROOT
const CLAUDE_BIN = process.env.KURU_CLAUDE_BIN || 'claude'
const CACHE_TTL_MS = 5 * 60 * 1000

let _cache = null // { at, models, source, error? }

// Config families → dropdown entries. Always available, offline-safe.
function fromConfig() {
  let fam = {}
  try { fam = modelRouter.loadModelConfig().families || {} } catch { fam = {} }
  const seen = new Set(), out = []
  for (const [alias, id] of Object.entries(fam)) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ value: id, label: `${id} · ${alias}` })
  }
  return out
}

// SDK ModelInfo[] → dropdown entries. `value` is the id the SDK/CLI natively
// accepts as options.model; label is the human display name (+ resolved id).
function normalizeSdk(models) {
  const out = [], seen = new Set()
  for (const m of Array.isArray(models) ? models : []) {
    if (!m || typeof m !== 'object' || !m.value || seen.has(m.value)) continue
    seen.add(m.value)
    const label = m.displayName
      ? `${m.displayName}${m.resolvedModel ? ` · ${m.resolvedModel}` : ''}`
      : String(m.value)
    out.push({ value: String(m.value), label })
  }
  return out
}

// Default SDK loader: dynamic-import the ESM SDK by absolute path (CJS-safe), open
// a streaming session that initializes (control handshake) but runs no turn, read
// the models it advertises, then abort. Timeout-guarded by the caller.
async function _defaultSdkModels(timeoutMs) {
  const { pathToFileURL } = require('url')
  const { buildSpawnEnv } = require('../../agents/runner/adapters/common')
  const sdkMain = require.resolve('@anthropic-ai/claude-agent-sdk', { paths: [AGENTS_ROOT] })
  const { query } = await import(pathToFileURL(sdkMain).href)
  const ac = new AbortController()
  // A prompt that yields nothing: the session still initializes (which is what
  // supportedModels() reads), but no user turn ever runs → no tokens, no tools.
  const idlePrompt = (async function* () {
    await new Promise((r) => { const t = setTimeout(r, timeoutMs + 2000); if (t.unref) t.unref() })
  })()
  const q = query({
    prompt: idlePrompt,
    options: {
      env: buildSpawnEnv({ omitApiKey: true }),
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      pathToClaudeCodeExecutable: CLAUDE_BIN,
      abortController: ac,
    },
  })
  try {
    return await Promise.race([
      q.supportedModels(),
      new Promise((_, rej) => { const t = setTimeout(() => rej(new Error('supportedModels timeout')), timeoutMs); if (t.unref) t.unref() }),
    ])
  } finally {
    try { ac.abort() } catch { /* best-effort teardown */ }
    try { if (typeof q.return === 'function') await q.return(undefined) } catch { /* ignore */ }
  }
}

// Returns { models: [{value,label}], source: 'sdk'|'config', error?, at }.
async function fetchAvailableModels(opts = {}) {
  const now = opts.now || Date.now
  const timeoutMs = opts.timeoutMs || 6000
  const sdkLoader = opts.sdkLoader || _defaultSdkModels
  if (!opts.force && _cache && (now() - _cache.at) < CACHE_TTL_MS) return _cache

  const fallback = fromConfig()
  let result
  try {
    const sdk = normalizeSdk(await sdkLoader(timeoutMs))
    result = sdk.length ? { models: sdk, source: 'sdk' } : { models: fallback, source: 'config' }
  } catch (e) {
    result = { models: fallback, source: 'config', error: String((e && e.message) || e) }
  }
  _cache = { at: now(), ...result }
  return _cache
}

function _resetCache() { _cache = null }

module.exports = { fetchAvailableModels, fromConfig, normalizeSdk, _resetCache }
