
const __roots = require('../../paths') // portable roots (KURU_*_ROOT) — see paths.js
// ════════════════════════════════════════════════════════════════════════════
// Code-review squad dispatcher — phase1-maps white-box methodology
// ════════════════════════════════════════════════════════════════════════════
// Replaces the old 6-framework→chain flow with a two-phase, feature-by-feature,
// STACK-AGNOSTIC process that reviews any project the same way (Rails, Django,
// Express/Nest, Spring, Laravel, Go, .NET, …) — no per-app or per-framework preset:
//
//   Phase 0   sourceDir validation
//   Phase 0b  App Blueprint — CURATOR reads inventories + tree + bootstrap/auth/
//             config files → a 1-page architecture/auth/data-flow/shared-infra doc
//             that grounds discovery + every feature mapper (catches cross-feature
//             vulns the feature-by-feature pass would miss in isolation)
//   Phase 0a  Inventories — scripted enumeration (routes/endpoints, auth checks, DB
//             queries, render/output, uploads/downloads, tokens/actors, background
//             jobs, business-logic/service objects) via multi-language grep specs
//   Phase 0b  Feature discovery — CURATOR auto-discovers from the surface (or meta.features)
//   Phase 1   Feature mapping — ONE agent per feature, in RAM-safe waves; each
//             builds features/<slug>.md (Endpoint/Action Ledger + auth/actor/data/
//             worker/same-functionality maps + ranked Phase-2 leads + depth status)
//   Phase 1c  Consolidation — CURATOR aggregates coverage matrices + review queue + gate
//   Phase 2   Vuln assessment — per feature × per class, routed to the class specialist
//             with that class's module + pattern catalog (access-control/IDOR, XSS, …)
//   Phase 2v  AUDITOR reverse-check verdicts (+ PROBER runtime validation if deployUrl)
//   Phase 3   SCRIBE merges per-feature reports into the final report (CVSS)
//
// Agents (current env, working together): CURATOR (discovery+consolidation),
// the 6 specialists (per-feature mappers → per-class assessors), AUDITOR (verify),
// PROBER (runtime), SCRIBE (report).
//
// dispatch.meta:
//   sourceDir   (required, absolute) — the source tree to review
//   features    string[] (optional)   — explicit feature-slug queue (overrides discovery)
//   vulnClasses string[] (optional)   — default ['access-control','xss']; ['all'] = every catalog
//   deployUrl   (optional)            — enables PROBER runtime validation
//   testAccounts(optional)            — { attacker, victim } creds for runtime probing
//   outputDir   (optional)            — default <INTEL>/code-review/<taskId>
//   maxFeatures (optional)            — cap mapped features (default: NO cap — every feature the source has)
//   maxPhase2   (optional)            — cap features deep-assessed in Phase 2 (default: ALL mapped features)
//   phasesOnly  (optional)            — subset of PHASES to run (reuse prior artifacts)

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const sourcePlanner = require('./source-planner') // M3: rank the Phase-2 queue + re-plan from findings
const candidateIndex = require('../pipeline/candidate-index') // M5: deduped candidate index + validation queue
const decisionLog = require('../pipeline/decision-log') // M6: agentic decision log

const METH = path.join(__roots.AGENTS_ROOT, 'squads/code-review/methodology')

// Read the live-findings JSONL (candidates streamed by emitCandidate) — the re-plan reads it to
// task itself from its own evidence. Fail-soft: missing/partial file → [].
function readLiveFindings(taskId) {
  try {
    const raw = fs.readFileSync(`${__roots.INTEL_ROOT}/live-findings-${taskId}.jsonl`, 'utf8')
    const out = []
    for (const l of raw.split('\n')) { const s = l.trim(); if (!s) continue; try { out.push(JSON.parse(s)) } catch {} }
    return out
  } catch { return [] }
}

// vuln class → { specialist, phase-2 module, pattern catalog }. The slugs match
// common/patterns/<slug>.json — a null catalog auto-resolves to that pattern
// catalog in phase2Prompt (when the pattern flag is on), else the specialist's
// own skill. access-control, xss + account-takeover keep dedicated methodology-pack
// modules; account-takeover's catalog also backs the authentication-session class.
const CLASS = {
  'access-control':        { agent: 'marshal', module: 'phase2_access_control_idor_v1.md', catalog: 'access_control_40_pattern_catalog.md' },
  'multi-tenant':          { agent: 'marshal', module: null, catalog: null },
  'admin-privileged':      { agent: 'marshal', module: null, catalog: null },
  'business-logic':        { agent: 'marshal', module: null, catalog: null },
  'account-takeover':      { agent: 'siphon',  module: 'phase2_account_takeover_v1.md', catalog: 'account_takeover_pattern_catalog.md' },
  'authentication-session':{ agent: 'siphon',  module: null, catalog: 'account_takeover_pattern_catalog.md' },
  'cryptography-secrets':  { agent: 'siphon',  module: null, catalog: null },
  'xss':                   { agent: 'cipher',  module: 'phase2_xss_html_injection_v1.md', catalog: 'xss_50_pattern_catalog.md' },
  'data-exposure':         { agent: 'cipher',  module: null, catalog: null },
  'logging-audit':         { agent: 'cipher',  module: null, catalog: null },
  'sqli':                  { agent: 'quill',   module: null, catalog: null },
  'injection':             { agent: 'quill',   module: null, catalog: null },
  'deserialization':       { agent: 'quill',   module: null, catalog: null },
  'ssrf':                  { agent: 'beacon',  module: null, catalog: null },
  'webhooks':              { agent: 'beacon',  module: null, catalog: null },
  'cloud-infra':           { agent: 'beacon',  module: null, catalog: null },
  'api-security':          { agent: 'beacon',  module: null, catalog: null },
  'graphql':               { agent: 'beacon',  module: null, catalog: null },
  'rce':                   { agent: 'breaker', module: null, catalog: null },
  'path-traversal':        { agent: 'breaker', module: null, catalog: null },
  'file-handling':         { agent: 'breaker', module: null, catalog: null },
  'race-conditions':       { agent: 'breaker', module: null, catalog: null },
  'supply-chain':          { agent: 'breaker', module: null, catalog: null },
}
// Broad default floor when classes aren't explicitly set AND inventories are
// skipped (was just access-control+xss — too thin). With inventories present,
// selectVulnClasses() refines this from the discovered surface.
const DEFAULT_CLASSES = ['access-control', 'authentication-session', 'xss', 'injection', 'data-exposure', 'business-logic']
// Auto-select vuln classes from the Phase-1 inventory surface (counts by
// inventory name, preset-agnostic via substring match). Always keeps a baseline
// floor, then adds surface-specific classes whose inventory actually matched.
function selectVulnClasses(counts) {
  const sel = new Set(['access-control', 'business-logic', 'xss', 'injection', 'data-exposure'])
  const add = (...cs) => cs.forEach(c => sel.add(c))
  for (const [name, n] of Object.entries(counts || {})) {
    if (!n) continue
    if (/auth|token|actor|session/.test(name)) add('authentication-session', 'account-takeover', 'access-control')
    if (/route|endpoint|rest|api/.test(name)) add('api-security', 'access-control')
    if (/graphql/.test(name)) add('graphql', 'api-security')
    if (/db|quer|search|count/.test(name)) add('sqli', 'injection')
    if (/render|output|response|shaping|serial/.test(name)) add('xss', 'data-exposure')
    if (/upload|download|export|file/.test(name)) add('file-handling', 'ssrf', 'path-traversal')
    if (/worker|job/.test(name)) add('race-conditions', 'injection')
    if (/service|finder|polic/.test(name)) add('access-control', 'business-logic')
  }
  return [...sel].filter(c => CLASS[c])
}
const MAPPER_POOL = ['marshal', 'siphon', 'cipher', 'quill', 'beacon', 'breaker']
// Phase 3 freehand source review — the THIRD phase of the three-phase source review, ON by DEFAULT
// (core coverage, not an experiment). 'active' ⇒ candidates feed the report; 'shadow' ⇒ report-neutral;
// 'off' (ARCHON_THREE_PHASE_SOURCE_REVIEW_OFF=1) ⇒ the legacy byte-identical 8-phase flow. Computed via
// paths.sourceReviewMode (no direct env read — grep-gate). See ULTRAPLAN.md §5.3.
const FH_MODE = typeof __roots.sourceReviewMode === 'function' ? __roots.sourceReviewMode() : 'active'
const PHASES = ['inventories', 'blueprint', 'discovery', 'mapping', 'consolidate', 'phase2',
  ...(FH_MODE !== 'off' ? ['freehand'] : []), 'verify', 'report']
const WAVE = 3 // RAM-safe parallelism (mirrors GATE-134 stocks batching)
// ONE comprehensive source-file extension set — the SAME list gates BOTH preflight file-detection AND
// the scripted inventory grep, so any language a real codebase ships in gets enumerated (not just JS/TS).
// Real source can be anything; keep this broad. The mapping agents also read the live tree directly, so
// a truly exotic extension is still reviewed — this just keeps the scripted surface honest across stacks.
const SOURCE_EXTS = ['js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'vue', 'svelte', 'py', 'pyw', 'rb', 'pl', 'pm',
  'go', 'rs', 'zig', 'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hxx', 'm', 'mm', 'java', 'kt', 'kts', 'scala',
  'groovy', 'cs', 'fs', 'vb', 'swift', 'dart', 'ex', 'exs', 'erl', 'hrl', 'clj', 'cljs', 'hs', 'ml', 'mli',
  'php', 'phtml', 'html', 'htm', 'ejs', 'hbs', 'lua', 'r', 'tf', 'hcl', 'sh', 'bash', 'zsh', 'ps1', 'proto',
  'thrift', 'gql', 'graphql', 'sql']

// The fixed Phase-1 feature-map contract (enforced in the prompt; full template on disk).
const FEATURE_SECTIONS = [
  'Feature Identity', 'Feature Purpose', 'Entry Points', 'Files Reviewed',
  'Endpoint / Action Ledger', 'Full Code Paths', 'Authorization Map',
  'Authentication / Actor Context Map', 'Data Exposure Map', 'Background Job Map',
  'Same-Functionality Map', 'Security-Sensitive Areas for Phase 2 (ranked)', 'Coverage Notes',
]
const LEDGER_COLS = 'Entry Point | Method/Trigger | File | Class/Method | Object Lookup | Auth Check | Object Authorized | Response/State Change | Serializer/Worker | Same-Functionality Siblings | Phase1 Status | Phase2 Priority | Gaps'
const DEPTH = 'Discovered → Mapped → Traced → AuthZ Verified → Deep Complete'

// ── helpers ──────────────────────────────────────────────────────────────────
function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

async function runWaves(items, size, fn) {
  const out = []
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size)
    out.push(...await Promise.all(batch.map((it, j) => fn(it, i + j))))
  }
  return out
}

// Detect the primary language/stack of the source tree — INFORMATIONAL ONLY (labels the inventory
// manifest). It never changes behaviour: inventory + feature discovery are identical for every
// project, so any repo (Rails, Django, Express/Nest, Spring, Laravel, Go, .NET, …) reviews the same way.
function detectStack(sourceDir) {
  const has = (p) => { try { return fs.existsSync(path.join(sourceDir, p)) } catch { return false } }
  if (has('Gemfile') || has('config/routes.rb')) return 'ruby'
  if (has('manage.py') || has('pyproject.toml') || has('requirements.txt')) return 'python'
  if (has('go.mod')) return 'go'
  if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) return 'java/kotlin'
  if (has('composer.json')) return 'php'
  if (has('Program.cs') || has('Startup.cs')) return 'dotnet'
  if (has('package.json')) return 'node'
  if (has('Cargo.toml')) return 'rust'
  return 'generic'
}

// Scripted inventory enumeration (grep — universally available). ONE comprehensive, multi-language
// spec set surfaces the review surface of ANY project (no per-app or per-framework preset). Each
// spec writes one inventory file; counts feed the coverage denominator. Fail-soft per spec.
function buildInventories(sourceDir, invDir, stack, log) {
  fs.mkdirSync(invDir, { recursive: true })
  const CODE = SOURCE_EXTS.map(e => `--include=*.${e}`) // any-language surface (shared with preflight)
  const specs = [
    ['01_routes_endpoints', '(@(app|router)\\.(get|post|put|delete|patch)|app\\.(get|post|put|delete|route)|router\\.(get|post|put|delete|use)|@(Get|Post|Put|Delete|Patch|RequestMapping|RestController|Path)\\b|http\\.HandleFunc|Route::(get|post|put|delete)|\\bresources?\\b|\\bnamespace\\b|\\bdraw\\b|def [a-z_]+\\(.*request|\\b(field|mutation|resolver)\\b)', CODE],
    ['02_auth_checks', '(authorize|authenticate|permission|access_control|can\\?|allowed\\?|isAuthenticated|@PreAuthorize|@RolesAllowed|require_role|ensure_|before_action|@login_required|IsAuthenticated|hasRole|checkAccess|current_user)', CODE],
    ['03_db_queries', '(SELECT |INSERT INTO|UPDATE |DELETE FROM|find_by|findOne|findAll|\\.query\\(|\\.where\\(|\\.raw\\(|prepareStatement|createQuery|execute\\(|sequelize\\.query|knex\\()', CODE],
    ['04_render_output', '(render|innerHTML|dangerouslySetInnerHTML|\\.html\\(|template|res\\.send|\\braw\\(|\\bexpose |\\brepresent |Serializer|Presenter|\\bEntity\\b|toJSON)', CODE],
    ['05_uploads_downloads', '(upload|download|send_file|send_data|sendFile|multipart|res\\.download|presigned|object_storage|ExportService|\\barchive\\b|FileUpload|MultipartFile)', CODE],
    ['06_tokens_actors', '(token|session|cookie|jwt|api_key|access_token|personal_access_token|current_user|currentUser|principal|\\bactor\\b|impersonat|Authorization)', CODE],
    ['07_background_jobs', '(class .*Worker\\b|perform_async|perform_in|perform_later|sidekiq|ActiveJob|@Scheduled|@Async|@shared_task|celery|\\.enqueue|\\bcron\\b|implements Job\\b|extends Job\\b)', CODE],
    ['08_business_logic', '(class .*(Service|Policy|Finder|UseCase|Handler|Manager|Processor)\\b|def execute\\b|def call\\b|rule \\{|def perform\\b|state_machine|\\btransition\\b|\\bworkflow\\b)', CODE],
  ]
  const counts = {}
  for (const [name, pattern, globs] of specs) {
    const file = path.join(invDir, `${name}.txt`)
    try {
      const cmd = `grep -rEn --exclude-dir={node_modules,vendor,.git,dist,build,coverage,.next,target,.venv,__pycache__} ${globs.join(' ')} -e ${JSON.stringify(pattern)} . 2>/dev/null | head -8000`
      // timeout so a runaway/blocked grep is KILLED rather than freezing the whole daemon; on
      // timeout execSync throws → the catch below records 0 (fail-soft), same as a no-match exit 1.
      const out = execSync(cmd, { cwd: sourceDir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell: '/bin/bash', timeout: 120000, killSignal: 'SIGKILL' })
      fs.writeFileSync(file, out)
      counts[name] = out ? out.trimEnd().split('\n').filter(Boolean).length : 0
    } catch (e) {
      // grep exits 1 when no matches — that's a 0, not an error
      try { fs.writeFileSync(file, '') } catch {}
      counts[name] = 0
    }
  }
  const manifest = `# Phase 1 — Source-of-Truth Inventory Manifest

Target: \`${sourceDir}\`
Stack: **${stack}**
Method: scripted grep enumeration (source-parsed; the agents re-grep + read live code during mapping).

## Inventory files

| File | Matches |
|---|---|
${Object.entries(counts).map(([n, c]) => `| \`${n}.txt\` | ${c} |`).join('\n')}

## Reconciliation rule
Every inventory item must land in exactly one of: (1) mapped to a feature + ledger row,
(2) shared infrastructure mapped to all consuming features, (3) not security-relevant (with reason),
(4) unclear → Phase 1 gap, (5) dead/unreachable (with evidence). No item disappears silently.
`
  fs.writeFileSync(path.join(invDir, '00_MANIFEST.md'), manifest)
  log(`  📇 Inventories: ${Object.entries(counts).map(([n, c]) => `${n}=${c}`).join(', ')}`)
  return counts
}

// ── prompt builders (self-contained — read the ported methodology pack) ───────
function commonHeader(taskId, sourceDir, outDir, invDir) {
  return `Source tree (read-only target): ${sourceDir}
Phase-1 inventories (grep enumeration, your starting denominator): ${invDir}/
Output dir (write your artifacts here, absolute paths): ${outDir}/
Methodology pack (read these for the exact contract): ${METH}/
Use bash (rg/grep/cat/sed) to enumerate and read source. This is MAPPING + EVIDENCE work — produce files, not chat.`
}

function blueprintPrompt(taskId, sourceDir, outDir, invDir) {
  return `You are CURATOR, code-review squad leader. Produce the APP BLUEPRINT — a one-page architectural orientation that EVERY downstream feature reviewer reads first. Understand the whole system BEFORE the parts.

${commonHeader(taskId, sourceDir, outDir, invDir)}

Read the inventories + the source-tree layout + the key bootstrap/config files (framework entrypoints, routing tables, auth middleware, ORM/models, settings/env, docker/CI). Do NOT map features yet — this is orientation.

Write a concise (~1 page) blueprint to ${outDir}/phase1-maps/app-blueprint.md with EXACTLY these sections:
1. ## What this application is — purpose, domain, primary actors/personas.
2. ## Tech stack & infrastructure — languages, framework(s), datastores, queues/workers, external services, how it deploys.
3. ## Authentication & authorization model — how a request is authenticated (session/JWT/OAuth/API key), how identity → roles, where authZ is enforced (middleware/decorators/policy objects), and how object ownership / tenancy is checked. Name the EXACT files.
4. ## Shared infrastructure & cross-cutting code — middleware, base controllers, serializers, input parsing/sanitization, file storage, payment, rate-limiting, logging — anything MANY features depend on (where cross-feature vulns hide).
5. ## Data flow & trust boundaries — where untrusted input enters, how it reaches sinks (DB/render/shell/HTTP), and which trust boundaries it crosses.
6. ## Highest-risk areas to prioritize — 3-7 architectural hot spots for Phase 2, each with the file/dir and why.

Cite exact files/dirs. Then reply one line: stack, auth mechanism, top architectural risk.`
}

function featureMapPrompt(agent, feature, taskId, sourceDir, outDir, invDir) {
  const outFile = `${outDir}/phase1-maps/features/${feature.slug}.md`
  return `You are ${agent.toUpperCase()}, a Phase-1 feature-mapping agent on the code-review squad (leader CURATOR).

${commonHeader(taskId, sourceDir, outDir, invDir)}

## Your single feature: ${feature.name} (slug: ${feature.slug})
${feature.keywords ? `Scope keywords/paths: ${feature.keywords}` : ''}

Phase 1 is **mapping, not vulnerability hunting** — do NOT report confirmed vulns. Record security-sensitive
areas, suspicious paths, Phase-2 leads, gaps, assumptions, and required follow-up.

## Method (feature-by-feature, evidence-based)
0. Read the App Blueprint at ${outDir}/phase1-maps/app-blueprint.md FIRST — use its auth/authZ model + shared-infra map when tracing this feature's auth/actor/object-lookup/serializer paths (so you catch where this feature relies on shared, possibly-flawed, infrastructure).
1. grep the inventory files in ${invDir}/ scoped to this feature's keywords, then read the live source under ${sourceDir}.
2. Build the Endpoint/Action Ledger — ONE ROW per route+method / mutation / worker / action. Never merge GET/POST/PUT/DELETE. Never "CRUD reviewed".
3. Trace auth / actor / object-lookup / serializer / worker paths for representative and high-risk rows.
4. Record an honest depth status per row: ${DEPTH}.

## Required output — write the file to: ${outFile}
Use EXACTLY this section order (read ${METH}/templates/phase1_feature_map_template.md for the full table shapes):
${FEATURE_SECTIONS.map((s, i) => `${i + 1}. ## ${s}`).join('\n')}

The Endpoint / Action Ledger table columns (exact):
${LEDGER_COLS}

Ranked Security-Sensitive Areas: for each lead give exact file/method/route, why it matters, what Phase 2 must verify, the likely pattern class (access-control/IDOR, XSS, sqli, ssrf, rce, account-takeover), and which surface (Web/REST/GraphQL/worker/same-functionality) it affects.
Coverage Notes must be honest: what's AuthZ-verified vs mapped-only, assumptions, unmapped files, blockers.

Write the complete markdown file with bash (mkdir -p the dir first). Then reply with a one-line summary: rows mapped, top lead, residual gaps.`
}

function discoveryPrompt(taskId, sourceDir, outDir, invDir, cap) {
  return `You are CURATOR, code-review squad leader. Discover the FEATURE QUEUE for a Phase-1 white-box review.

${commonHeader(taskId, sourceDir, outDir, invDir)}

Read the App Blueprint at ${outDir}/phase1-maps/app-blueprint.md (architecture/auth/shared-infra/data-flow) and the
inventories + source tree layout (top-level dirs, route/controller/module groupings), then propose the
distinct security-relevant FEATURE AREAS to map (e.g. authentication, file-upload, admin, api-keys, search, webhooks…).
Group by business capability, not by file. ${Number.isFinite(cap) ? `Cap at ${cap} features (most security-relevant first).` : `List EVERY distinct security-relevant feature area the source has — do NOT cap or omit any (order most security-relevant first).`}

Write the queue to ${outDir}/phase1-maps/feature-queue.json as:
{"features":[{"slug":"kebab-slug","name":"Display Name","keywords":"comma,separated,grep,hints"}, ...]}

Then reply with the JSON array only (no prose) so the orchestrator can parse it.`
}

function consolidationPrompt(taskId, outDir, features) {
  return `You are CURATOR, code-review squad leader. Consolidate Phase 1.

Read every feature map in ${outDir}/phase1-maps/features/*.md (${features.length} features: ${features.map(f => f.slug).join(', ')}).
Read the consolidated templates: ${METH}/templates/phase1_consolidated_templates.md and the gate ${METH}/checklists/phase1_completion_gate.md.

Write these files under ${outDir}/phase1-maps/consolidated/ (use bash, follow the templates):
- 00_INDEX.md
- feature_coverage_matrix.md          (per-feature depth-status rollup)
- source_inventory_coverage_matrix.md (inventory items reconciled vs gaps — the denominator vs numerator)
- same_functionality_cross_feature_map.md (recurring patterns reviewed as classes, not one-offs)
- phase2_review_queue.md              (ranked, evidence-backed Phase-2 leads aggregated from each map's top risks + gaps, each pointing back to features/<slug>.md)
- phase1_completion_gate.md           (honest: incomplete reconciliation / unresolved rows = blockers; evidence not confidence)

Then reply with a one-line summary: features consolidated, total ledger rows, top Phase-2 classes, open blockers.`
}

// Deterministic path for a Phase-2 job's structured candidate JSONL — the records that stream to the
// live board. phase2Prompt tells the specialist to write here; the dispatcher reads it after the job.
function candFileFor(outDir, cls, slug) { return `${outDir}/phase2/${cls}/${slug}.candidates.jsonl` }

// Resolve a specialist-emitted source path against the reviewed tree. Agents emit RELATIVE paths
// (e.g. 'routes/auth.js'); the streaming TRIAGER runs from the daemon cwd, not sourceDir, so a relative
// path would read the wrong file (or nothing) and silently drop the finding — worst on monorepos /
// subdirectory reviews. Normalizing to absolute at emission makes every downstream consumer correct.
function _absFile(file, sourceDir) {
  const f = String(file || '').trim()
  if (!f) return ''
  return (path.isAbsolute(f) || !sourceDir) ? f : path.resolve(sourceDir, f)
}

// Shape a specialist-emitted SOURCE candidate into a live-findings record. It NEVER sets a `url` or any
// runtime field — that is exactly what keeps deriveConfirmationStatus (finding-schema.js) at
// SOURCE_CONFIRMED, so a source-only finding can never become RUNTIME_CONFIRMED. type='candidate'
// passes isCandidate; cwe=cls gives canonicalKey a per-class dedup discriminator.
function toLiveCandidate(c, cls, feature, agent, sourceDir) {
  if (!c || typeof c !== 'object') return null
  const title = (String(c.hypothesis || c.pattern || c.title || '').split(/[\n.:]/)[0].trim().slice(0, 120))
    || `${cls} candidate in ${feature.name || feature.slug}`
  const status = (c.status === 'NEEDS_LIVE_VALIDATION' || c.status === 'DISPROVEN') ? c.status : 'SOURCE_CONFIRMED'
  return {
    type: 'candidate', agent: String(agent).toUpperCase(), original_agent: String(agent),
    severity: c.severity || 'Medium', cwe: c.cwe || c.vuln_class || cls, title,
    details: String(c.evidence || c.hypothesis || '').slice(0, 2000),
    feature: c.feature || feature.slug, pattern: c.pattern || '', pattern_id: c.pattern_id || '',
    // absolute so the TRIAGER (which runs from the daemon cwd) reads the right source file; file_rel keeps
    // the specialist's original relative path for display.
    file: _absFile(c.file, sourceDir), file_rel: c.file || '', line: c.line ?? '', source: c.source || '', sink: c.sink || '',
    endpoint: c.endpoint || '', confidence: c.confidence ?? '', hypothesis: c.hypothesis || '',
    evidence: c.evidence || '', status, required_blackbox_proof: c.required_blackbox_proof || '',
    confirmation_status: status === 'NEEDS_LIVE_VALIDATION' ? 'NEEDS_LIVE_VALIDATION' : 'SOURCE_CONFIRMED',
  }
}

// Read a job's candidate JSONL + push each shaped record to the emit sink. Fail-soft: a missing file
// (specialist wrote none) or malformed lines yield 0 without throwing.
function emitCandidatesFromFile(candFile, cls, feature, agent, taskId, emitCandidate, log, sourceDir) {
  let raw; try { raw = fs.readFileSync(candFile, 'utf8') } catch { return 0 }
  let n = 0
  for (const line of raw.split('\n')) {
    const s = line.trim(); if (!s) continue
    let c; try { c = JSON.parse(s) } catch { continue }
    const rec = toLiveCandidate(c, cls, feature, agent, sourceDir)
    if (rec) { try { emitCandidate(taskId, rec); n++ } catch {} }
  }
  if (n && typeof log === 'function') log(`  📡 ${String(agent).toUpperCase()} → ${n} candidate(s) to the live board [${cls}/${feature.slug}]`)
  return n
}

function phase2Prompt(cls, agent, feature, taskId, sourceDir, outDir) {
  const c = CLASS[cls]
  const mapFile = `${outDir}/phase1-maps/features/${feature.slug}.md`
  const outFile = `${outDir}/phase2/${cls}/${feature.slug}.md`
  const candFile = candFileFor(outDir, cls, feature.slug)
  const moduleLine = c.module ? `Vuln module (follow it exactly): ${METH}/prompts/${c.module}` : `(no dedicated module for ${cls} — use your ${cls}-review skill)`
  let catalogLine = c.catalog ? `Pattern catalog (apply EVERY pattern): ${METH}/catalogs/${c.catalog}` : `(no catalog — apply your skill's full pattern set for ${cls})`
  if (!c.catalog) {
    // Use the structured catalog engine whenever a catalog exists. The flag still controls
    // downstream experimental pattern-id correlation, but static review quality should not
    // depend on an env flag being set.
    const p = (() => { try { return require('../intel/pattern-catalog').catalogPathFor(cls) } catch { return null } })()
    if (p) catalogLine = `Pattern catalog (apply EVERY pattern): ${p}`
  }
  return `You are ${agent.toUpperCase()}, Phase-2 ${cls} assessor on the code-review squad.

Source tree: ${sourceDir}
Phase-1 feature map (your input — read it fully): ${mapFile}
${moduleLine}
${catalogLine}
Router + anti-drift contract: ${METH}/prompts/phase2_vulnerability_assessment_router.md , ${METH}/checklists/anti_drift_execution_contract.md
Report template + CVSS: ${METH}/templates/phase2_feature_report_template.md , ${METH}/templates/cvss_scoring_guide.md

## Execution (per-feature, row-by-row — NOT batch/coordinator output)
1. Load the feature map's Endpoint/Action Ledger, files, gaps, required follow-up, same-functionality notes, ranked leads.
2. Build a reverse-check matrix: review EVERY ledger row + EVERY listed file + EVERY unresolved Mapped/Traced/Discovered/GAP/Verify item + same-functionality siblings — ranked leads set ORDER, not scope.
3. Re-read the source behind each row. Apply the full ${cls} pattern catalog.
4. Produce a source-backed per-feature report (evidence tables, review matrix, findings with file:line traces + CVSS, gaps). NOT an orchestration log.

## Structured candidates (REQUIRED — this is what streams to the LIVE findings board during the run)
For EVERY finding, also append ONE JSON object (JSONL, one per line) to: ${candFile}  (mkdir -p first)
Each object MUST have exactly these fields:
{"feature":"${feature.slug}","pattern":"<pattern / test-case name>","pattern_id":"<catalog id or ''>","file":"<source path>","line":<number>,"source":"<where untrusted input enters>","sink":"<the dangerous sink>","endpoint":"<affected route/action or ''>","severity":"Critical|High|Medium|Low|Info","confidence":<0-100>,"hypothesis":"<what an attacker does>","evidence":"<the vulnerable code snippet / file:line trace>","status":"SOURCE_CONFIRMED|NEEDS_LIVE_VALIDATION","required_blackbox_proof":"<what a live test must show, or ''>"}
Status rule: a source-only finding is SOURCE_CONFIRMED (you read the bug in the code) or NEEDS_LIVE_VALIDATION (needs a live hit to prove) — NEVER RUNTIME_CONFIRMED (you have no live evidence here). Emit candidates AS you confirm them, not only at the end.

## Audit trail (REQUIRED — proves the FULL ${cls} catalog was considered, not just the hits)
- Pattern coverage: write ${outDir}/phase2/${cls}/${feature.slug}_pattern_review.md — for EACH pattern in the ${cls} catalog, one line: pattern name + result state (matched_candidate / reviewed_no_issue / not_applicable / needs_more_context).
- Rejected patterns: for each pattern you REJECT, append one JSON line to ${outDir}/rejected/${cls}-${feature.slug}.jsonl (mkdir -p first): {"pattern":"…","file":"…","reason":"false_positive|not_applicable|reviewed_no_issue|duplicate","note":"…"}

Write the report to: ${outFile} (mkdir -p first). Then reply one line: rows reverse-checked, findings (by severity), residual gaps.`
}

// Phase 3 — freehand senior-pentester review (Autonomous OS Block D). Open-ended
// reasoning to surface novel / business-logic vulns that the pattern pass misses.
// fhDir = phase2/freehand (active, AUDITOR-globbed) or a non-globbed sibling (shadow).
function freehandPrompt(agent, feature, taskId, sourceDir, outDir, fhDir) {
  const mapFile = `${outDir}/phase1-maps/features/${feature.slug}.md`
  const outFile = `${fhDir}/${feature.slug}.md`
  return `You are ${agent.toUpperCase()}, Phase-3 FREEHAND security reviewer on the code-review squad — a senior pentester, NOT a pattern matcher.

Source tree: ${sourceDir}
Phase-1 feature map (read fully): ${mapFile}
Methodology (follow it): ${METH}/prompts/phase3_freehand_review_v1.md
Candidate template (one block per finding): ${METH}/templates/phase3_freehand_candidate_template.md

Pattern review (Phase 2) already covered the KNOWN classes. Your job is the UNKNOWN: logic
flaws, trust-boundary mistakes, state/race issues, abuse of intended functionality, multi-step
chains, and anything that "feels wrong" when you read the code as an attacker. Ask the
methodology's senior-pentester questions of THIS feature; reason about how a real attacker would
abuse it, not which signature matches.

Each candidate MUST follow the template, including the **Required black-box proof** field — a
source-only novel candidate is a HYPOTHESIS (NEEDS-LIVE), never CONFIRMED. Cite file:line for every claim.

## Structured candidates (REQUIRED — streams to the LIVE board like Phase 2)
For EVERY novel candidate, also append ONE JSON object (JSONL) to: ${fhDir}/${feature.slug}.candidates.jsonl  (mkdir -p first)
{"feature":"${feature.slug}","vuln_class":"<business-logic|access-control|…>","pattern":"freehand","file":"<source path>","line":<number>,"source":"<input>","sink":"<sink/abuse>","endpoint":"<route/action or ''>","severity":"Critical|High|Medium|Low|Info","confidence":<0-100>,"hypothesis":"<the abuse/logic flaw>","evidence":"<code + file:line trace>","status":"SOURCE_CONFIRMED|NEEDS_LIVE_VALIDATION","required_blackbox_proof":"<what a live test must show, or ''>"}
A novel/logic candidate you can only reason about (not prove in code) is NEEDS_LIVE_VALIDATION, never RUNTIME_CONFIRMED.

Write your candidates to: ${outFile} (mkdir -p first). Reply one line: novel candidates found, top risk, what needs live proof.`
}

function auditorPrompt(taskId, outDir, features, classes, deployUrl) {
  const liveLine = deployUrl
    ? `A live target IS available (${deployUrl}): a finding you actually exercised there with a captured response is RUNTIME_CONFIRMED; a source-substantiated finding you did NOT fire live is SOURCE_CONFIRMED.`
    : `NO live target is available (source-only review): the strongest verdict you can issue is SOURCE_CONFIRMED — you can confirm a bug by reading code, but you CANNOT mark it RUNTIME_CONFIRMED without live proof. Do not over-claim.`
  return `You are AUDITOR, the independent verifier. Reverse-check the Phase-2 code-review findings — never trust the assessor's claim.

Read the Phase-2 reports under ${outDir}/phase2/**/*.md (classes: ${classes.join(', ')}; features: ${features.map(f => f.slug).join(', ')}).
For each reported finding: re-read the cited source path, confirm the auth/object-lookup/sink claim is real, and issue a
confirmation status with a one-line evidence reason. ${liveLine}

Confirmation status vocabulary (use EXACTLY these):
- RUNTIME_CONFIRMED     — substantiated AND proven against the running target (captured live response).
- SOURCE_CONFIRMED      — substantiated from source, but never fired at a live target.
- NEEDS_LIVE_VALIDATION — a plausible hypothesis that needs a live target to settle.
- DISPROVEN             — checked and refuted from source.
Demote anything you cannot substantiate from source.

Write verdicts to ${outDir}/phase2/AUDITOR-VERDICTS.md (a table: feature | class | finding | status | evidence). Reply one line: runtime-confirmed/source-confirmed/needs-live/disproven counts.`
}

function scribePrompt(taskId, projectId, squad, sourceDir, outDir, features, classes, deployUrl, coverage) {
  return `You are SCRIBE, the reporter. Merge the per-feature Phase-2 reports into ONE final code-review report.

Inputs (read all):
- ${outDir}/phase1-maps/consolidated/phase1_completion_gate.md and phase2_review_queue.md
- ${outDir}/phase2/**/*.md  (per-feature reports, classes: ${classes.join(', ')})
- ${outDir}/phase2/AUDITOR-VERDICTS.md  (report RUNTIME_CONFIRMED / SOURCE_CONFIRMED / NEEDS_LIVE_VALIDATION findings; note DISPROVEN separately)

COVERAGE (deterministic — use these EXACT numbers; do NOT imply the whole codebase was deep-reviewed):
deeply reviewed ${coverage ? coverage.deeplyReviewed : (features ? features.length : 0)} of ${coverage ? coverage.mapped : (features ? features.length : 0)} mapped features${coverage && coverage.capped > 0 ? ` — the other ${coverage.capped} are mapped-only (Phase-2 cap), reviewed at map depth but not deep-assessed` : ''}. Open the report's coverage section with exactly this fact.

Produce an executive white-box code-review report: scope + coverage (features mapped, depth-status rollup), then findings
ordered by CVSS — each tagged with its **confirmation status** (RUNTIME_CONFIRMED / SOURCE_CONFIRMED / NEEDS_LIVE_VALIDATION),
file:line trace, impact, and fix. Be explicit that SOURCE_CONFIRMED means "proven in code, not yet exercised against a
running app"${deployUrl ? '' : ' (this was a source-only review — nothing is RUNTIME_CONFIRMED)'} — never present a source finding as if it were live-proven. Add a recurring-pattern
section (same-functionality classes) and honest gaps. Do NOT include orchestration logs. Keep per-feature structure traceable.

Write the report to ${outDir}/FINAL-REPORT-${taskId}.md AND to ${__roots.INTEL_ROOT}/code-review/FINAL-REPORT-${taskId}.md.
Reply one line: features covered, findings by confirmation status + severity, top risk.`
}

// ── main ──────────────────────────────────────────────────────────────────────
async function runCodeReview(dispatch, deps) {
  const { spawnAgent, trackCosts, updateProgress, log, logActivity, _isTaskCancelled, onFindingsReady, emitCandidate, startStreamingTriage } = deps
  const { taskId, projectId, squad } = dispatch
  const meta = dispatch.meta || {}
  const sourceDir = meta.sourceDir
  // Cancellation parity with the black-box pipeline: the operator's ■ Cancel writes a
  // signal that the daemon turns into task.status='cancelled'. Poll it at every phase
  // boundary so a cancelled white-box run halts between waves instead of grinding on
  // (running agents are already killed by spawnAgent's shared watchdog). Fail-soft.
  const cancelled = () => { try { return typeof _isTaskCancelled === 'function' && _isTaskCancelled(taskId) } catch { return false } }
  const bail = (where) => { log(`🛑 code-review cancelled — halting before ${where}`); return { cancelled: true } }

  const runPhase = (p) => !Array.isArray(meta.phasesOnly) || meta.phasesOnly.length === 0 || meta.phasesOnly.includes(p)
  const outDir = meta.outputDir || `${__roots.INTEL_ROOT}/code-review/${taskId}`
  const deployUrl = meta.deployUrl || null

  // Phase 0 — validate
  updateProgress(4, 'Phase 0: sourceDir validation')
  const p0 = validateSourceDir(sourceDir)
  if (!p0.ok) {
    log(`🚫 Phase 0 failed: ${p0.reason}`)
    logActivity('NEXUS', `🚫 Phase 0 failed: ${p0.reason}`, { taskId, squad, projectId: projectId || '' })
    return { error: p0.reason, phase: 0 }
  }
  const stack = detectStack(sourceDir) // informational label only — behaviour is stack-agnostic
  // Classes: explicit meta.vulnClasses wins; ['all'] = every catalog; otherwise a
  // broad default floor here, refined from the discovered surface after inventories.
  const explicitClasses = Array.isArray(meta.vulnClasses) && meta.vulnClasses.length > 0
  let vulnClasses = (explicitClasses
    ? (meta.vulnClasses.length === 1 && meta.vulnClasses[0] === 'all' ? Object.keys(CLASS) : meta.vulnClasses)
    : DEFAULT_CLASSES).filter(c => CLASS[c])
  // NO cap by default — a code review maps EVERY security-relevant feature the source has (real source
  // can be any size / any number of files). An operator may still bound it explicitly via meta.maxFeatures.
  // (Was floor-10/ceil-30, which silently truncated real features — e.g. a 101-file app mapped exactly 10.)
  const maxFeatures = meta.maxFeatures || Infinity
  // A code review must deep-assess EVERY mapped feature — never silently skip one. Default is "all
  // mapped features" (no cap); an operator can still bound it explicitly via meta.maxPhase2. (Was `|| 6`,
  // which quietly dropped features past the top 6 — wrong for static/white-box, where coverage is the point.)
  const maxPhase2 = meta.maxPhase2 || Infinity
  fs.mkdirSync(`${outDir}/phase1-maps/features`, { recursive: true })
  fs.mkdirSync(`${outDir}/phase1-maps/consolidated`, { recursive: true })
  for (const c of vulnClasses) fs.mkdirSync(`${outDir}/phase2/${c}`, { recursive: true })
  const invDir = `${outDir}/phase1-maps/inventories`
  log(`✅ Phase 0: sourceDir=${sourceDir} (${p0.fileCount} code files) · stack=${stack} · classes=${vulnClasses.join(',')}`)
  logActivity('NEXUS', `✅ Phase 0: source valid (${stack})`, {
    taskId, squad, projectId: projectId || '',
    details: `Path: ${sourceDir}\nFiles: ${p0.fileCount}\nStack: ${stack}\nVuln classes: ${vulnClasses.join(', ')}\nOutput: ${outDir}\nDeploy URL: ${deployUrl || '(none — runtime validation skipped)'}`,
  })

  // Phase 0a — inventories
  if (runPhase('inventories')) {
    updateProgress(10, 'Phase 0a: scripted inventory enumeration')
    const invCounts = buildInventories(sourceDir, invDir, stack, log)
    // Auto-select the vuln classes that the discovered surface actually warrants
    // (unless the operator pinned an explicit list).
    if (!explicitClasses) {
      vulnClasses = selectVulnClasses(invCounts)
      for (const c of vulnClasses) fs.mkdirSync(`${outDir}/phase2/${c}`, { recursive: true })
      log(`  🎯 Auto-selected ${vulnClasses.length} vuln classes from surface: ${vulnClasses.join(', ')}`)
    }
  }

  // Phase 0b — App Blueprint (understand the whole system before mapping the parts).
  // Produces app-blueprint.md (architecture / auth model / shared infra / data flow)
  // that discovery + every feature mapper read first — surfaces cross-feature vulns
  // (shared serializer, global middleware, one auth gate) that per-feature passes miss.
  if (cancelled()) return bail('Phase 0b blueprint')
  if (runPhase('blueprint')) {
    updateProgress(13, 'Phase 0b: CURATOR app blueprint')
    logActivity('CURATOR', `🧭 Phase 0b: app blueprint (architecture / auth / shared infra / data flow)`, { taskId, squad, projectId: projectId || '' })
    const bRes = await spawnAgent('curator', taskId, blueprintPrompt(taskId, sourceDir, outDir, invDir), `task-${taskId}-blueprint`, null)
    trackCosts([bRes])
  }

  // Phase 0c — feature queue
  let features = []
  if (Array.isArray(meta.features) && meta.features.length) {
    features = meta.features.map(f => typeof f === 'string' ? { slug: slugify(f), name: f } : f).slice(0, maxFeatures)
    log(`📋 Feature queue from meta.features: ${features.length}`)
  } else if (runPhase('discovery')) {
    updateProgress(16, 'Phase 0c: CURATOR feature discovery')
    const dRes = await spawnAgent('curator', taskId, discoveryPrompt(taskId, sourceDir, outDir, invDir, maxFeatures), `task-${taskId}-discovery`, null)
    trackCosts([dRes])
    try {
      const qf = `${outDir}/phase1-maps/feature-queue.json`
      if (fs.existsSync(qf)) features = JSON.parse(fs.readFileSync(qf, 'utf8')).features || []
      else { const m = (dRes.output || dRes.stdout || '').match(/\[[\s\S]*\]/); if (m) features = JSON.parse(m[0]) }
    } catch (e) { log(`  ⚠️ discovery parse failed: ${e.message}`) }
    features = (features || []).map(f => ({ ...f, slug: slugify(f.slug || f.name) })).slice(0, maxFeatures)
    log(`📋 Discovered ${features.length} features`)
  }
  if (!features.length) {
    log(`🚫 No feature queue — aborting (provide meta.features or enable discovery)`)
    return { error: 'empty feature queue', phase: 'discovery' }
  }

  // Phase 1 — per-feature mapping (one agent per feature, RAM-safe waves)
  if (cancelled()) return bail('Phase 1 mapping')
  if (runPhase('mapping')) {
    updateProgress(25, `Phase 1: mapping ${features.length} features (waves of ${WAVE})`)
    logActivity('CURATOR', `🗺️ Phase 1: ${features.length} feature-mapping agents`, { taskId, squad, projectId: projectId || '', details: features.map(f => f.slug).join(', ') })
    // Bump progress as each feature maps so the bar moves continuously and task.lastUpdate stays
    // fresh (the stuck-task watchdog keys off it) — a large codebase can spend a long time here.
    let mapped = 0
    const results = await runWaves(features, WAVE, async (feature, idx) => {
      const agent = MAPPER_POOL[idx % MAPPER_POOL.length]
      const r = await spawnAgent(agent, taskId, featureMapPrompt(agent, feature, taskId, sourceDir, outDir, invDir), `task-${taskId}-map-${feature.slug}`, null)
      updateProgress(25 + Math.round(28 * (++mapped) / features.length), `Phase 1: mapped ${mapped}/${features.length} features`)
      return r
    })
    trackCosts(results)
  }

  // Phase 1c — consolidation
  if (cancelled()) return bail('Phase 1c consolidation')
  if (runPhase('consolidate')) {
    updateProgress(55, 'Phase 1c: CURATOR consolidation')
    const cRes = await spawnAgent('curator', taskId, consolidationPrompt(taskId, outDir, features), `task-${taskId}-consolidate`, null)
    trackCosts([cRes])
  }

  // M1: stream candidates to the LIVE board WHILE Phase 2/3 run (parity with black-box Phase 2.7).
  // The streamer tails live-findings-<taskId>.jsonl (filled by emitCandidate) and triages each source
  // candidate → VALIDATED-FINDINGS live. We STOP it after freehand, BEFORE the AUDITOR reverse-check
  // (Phase 2v) + onFindingsReady reconcile — so there is never a concurrent VALIDATED writer.
  let _streamer = null
  if (typeof startStreamingTriage === 'function' && (runPhase('phase2') || (FH_MODE !== 'off' && runPhase('freehand')))) {
    try { _streamer = startStreamingTriage(taskId); log(`📥 streaming triage ONLINE — source candidates triaged live as specialists report them`) }
    catch (e) { log(`⚠️ streaming-triage start failed (non-fatal): ${e.message}`) }
  }

  // Phase 2 — vuln assessment (top-N features × each class, routed to specialists)
  const p2Features = features.slice(0, maxPhase2)
  if (maxPhase2 < features.length) log(`ℹ️ Phase 2 capped to top ${maxPhase2}/${features.length} features (raise meta.maxPhase2 for full coverage)`)
  if (cancelled()) return bail('Phase 2 assessment')
  if (runPhase('phase2')) {
    updateProgress(62, `Phase 2: ${p2Features.length} features × ${vulnClasses.length} classes`)
    let jobs = []
    for (const cls of vulnClasses) for (const feature of p2Features) jobs.push({ cls, feature })
    // M3 planner: order the queue by CURATOR's ranked review queue so the highest-value leads run (and
    // stream to the board) FIRST — parity with the black-box attack plan. Pure reorder; never drops a job.
    try {
      const rq = fs.readFileSync(`${outDir}/phase1-maps/consolidated/phase2_review_queue.md`, 'utf8')
      jobs = sourcePlanner.rankJobs(jobs, sourcePlanner.parseRankedFeatures(rq, p2Features.map(f => f.slug)))
    } catch { /* no ranked queue yet → natural order */ }
    // Bump progress per assessment job (feature × class) — keeps the bar moving and lastUpdate
    // fresh across what is usually the longest phase, however many jobs the codebase warrants.
    let assessed = 0
    const results = await runWaves(jobs, WAVE, async ({ cls, feature }) => {
      const agent = CLASS[cls].agent
      const r = await spawnAgent(agent, taskId, phase2Prompt(cls, agent, feature, taskId, sourceDir, outDir), `task-${taskId}-p2-${cls}-${feature.slug}`, null)
      // Stream this job's source candidates to the live board the moment it returns (M0). Fail-soft +
      // no-op when the emit sink isn't injected (unit tests), so the batch path is unchanged without it.
      if (typeof emitCandidate === 'function') {
        try { emitCandidatesFromFile(candFileFor(outDir, cls, feature.slug), cls, feature, agent, taskId, emitCandidate, log, sourceDir) } catch (e) { log(`  ⚠️ candidate emit failed [${cls}/${feature.slug}]: ${e.message}`) }
      }
      updateProgress(62 + Math.round(16 * (++assessed) / jobs.length), `Phase 2: assessed ${assessed}/${jobs.length} (feature × class)`)
      return r
    })
    trackCosts(results)

    // M3 re-plan: the run tasks itself from its own findings. Any feature×class a LIVE candidate points
    // at but that wasn't assessed becomes a follow-up job (bounded to known features/classes — an unknown
    // class has no specialist). Usually empty under full coverage; the self-tasking primitive for bounded
    // runs + newly-surfaced surfaces. One pass (no loop) → can't runaway.
    try {
      // allClasses = the FULL registry (not just the auto-selected set): a freehand/novel finding on a
      // class we didn't originally select is exactly what should spawn a structured follow-up assessment.
      const extra = sourcePlanner.replanJobs(jobs, readLiveFindings(taskId), p2Features, Object.keys(CLASS))
      if (extra.length) {
        log(`🧠 Re-plan: +${extra.length} follow-up assessment(s) from live findings`)
        logActivity('CURATOR', `🧠 Re-plan: +${extra.length} follow-up job(s) from findings`, { taskId, squad, projectId: projectId || '' })
        // M6: record the self-tasking decision to the agentic decision log (auditable reasoning trail).
        try {
          decisionLog.append(taskId, { agent: 'CURATOR', decision: `re-plan: +${extra.length} follow-up assessment(s)`,
            reason: 'live findings surfaced feature×class pairs not yet assessed', evidence: extra.map(e => `${e.cls}/${e.feature.slug}`).join(', ').slice(0, 300),
            task_created: extra.map(e => `p2r-${e.cls}-${e.feature.slug}`).join(', ').slice(0, 300), confidence: 75, result: 'queued',
            next_recommendation: 'assess the follow-up jobs, then re-triage' }, { intelRoot: __roots.INTEL_ROOT })
        } catch { /* fail-soft */ }
        const more = await runWaves(extra, WAVE, async ({ cls, feature }) => {
          const agent = CLASS[cls].agent
          const r = await spawnAgent(agent, taskId, phase2Prompt(cls, agent, feature, taskId, sourceDir, outDir), `task-${taskId}-p2r-${cls}-${feature.slug}`, null)
          if (typeof emitCandidate === 'function') { try { emitCandidatesFromFile(candFileFor(outDir, cls, feature.slug), cls, feature, agent, taskId, emitCandidate, log, sourceDir) } catch {} }
          return r
        })
        trackCosts(more)
      }
    } catch (e) { log(`⚠️ re-plan (non-fatal): ${e.message}`) }
  }

  // Phase 3 — freehand senior-pentester review (Autonomous OS Block D, flag-gated).
  // ACTIVE ⇒ candidates land under phase2/freehand/ so the EXISTING phase2/**/*.md
  // glob routes them through AUDITOR Phase 2v + the evidence contract (NOVEL/source-
  // only ⇒ NEEDS-LIVE, never CONFIRMED) with zero verifier/reporter edits. SHADOW ⇒
  // a non-globbed sibling that AUDITOR/SCRIBE never read (report byte-stable).
  if (cancelled()) return bail('Phase 3 freehand')
  if (FH_MODE !== 'off' && runPhase('freehand')) {
    const fhDir = FH_MODE === 'active' ? `${outDir}/phase2/freehand` : `${outDir}/phase3-freehand-shadow`
    fs.mkdirSync(fhDir, { recursive: true })
    const maxFreehand = meta.maxFreehand || maxPhase2
    const fhFeatures = p2Features.slice(0, maxFreehand)
    updateProgress(78, `Phase 3 (freehand): ${fhFeatures.length} features [${FH_MODE}]`)
    logActivity('CURATOR', `🔎 Phase 3 freehand review (${FH_MODE}): ${fhFeatures.length} features`, { taskId, squad, projectId: projectId || '' })
    const results = await runWaves(fhFeatures, WAVE, async (feature, idx) => {
      const agent = MAPPER_POOL[idx % MAPPER_POOL.length]
      const r = await spawnAgent(agent, taskId, freehandPrompt(agent, feature, taskId, sourceDir, outDir, fhDir), `task-${taskId}-fh-${feature.slug}`, null)
      // Freehand candidates stream to the live board too (M2), through the same sink as Phase 2.
      if (typeof emitCandidate === 'function') {
        try { emitCandidatesFromFile(`${fhDir}/${feature.slug}.candidates.jsonl`, 'freehand', feature, agent, taskId, emitCandidate, log, sourceDir) } catch (e) { log(`  ⚠️ freehand candidate emit [${feature.slug}]: ${e.message}`) }
      }
      return r
    })
    trackCosts(results)
  }

  // Drain + stop the live streamer before the authoritative AUDITOR pass overwrites the board.
  if (_streamer) {
    try { const n = await _streamer.stop(); log(`📥 streaming triage drained — ${n} finding(s) surfaced live during the run`) }
    catch (e) { log(`⚠️ streaming-triage stop (non-fatal): ${e.message}`) }
    _streamer = null
  }

  // M5: deterministic audit artifacts from the streamed candidates — a deduped, CAND-numbered index +
  // the black-box validation queue (NEEDS-LIVE subset, keyed to CAND-ids for white-box). Fail-soft.
  try {
    const cands = readLiveFindings(taskId).filter(f => f && (f.type === 'candidate' || f.source === 'code-review'))
    if (cands.length) {
      const idx = candidateIndex.buildCandidateIndex(cands)
      const cdir = `${outDir}/phase1-maps/consolidated`
      fs.mkdirSync(cdir, { recursive: true })
      fs.writeFileSync(`${cdir}/candidate_findings_index.md`, candidateIndex.renderIndexMd(idx))
      fs.writeFileSync(`${cdir}/blackbox_validation_queue.md`, candidateIndex.renderQueueMd(candidateIndex.buildValidationQueue(idx)))
      log(`🗂️  Audit artifacts: ${idx.length} candidate(s) indexed → candidate_findings_index.md + blackbox_validation_queue.md`)
    }
  } catch (e) { log(`⚠️ audit-artifact write (non-fatal): ${e.message}`) }

  // Phase 2v — AUDITOR verify (+ PROBER runtime if deployUrl)
  if (cancelled()) return bail('Phase 2v verify')
  if (runPhase('verify')) {
    if (deployUrl) {
      updateProgress(82, 'Phase 2v: PROBER runtime validation')
      const uRes = await spawnAgent('prober', taskId,
        `You are PROBER, runtime validator. Probe the deployed instance at ${deployUrl} (testAccounts: ${JSON.stringify(meta.testAccounts || null)}) to confirm/refute the Phase-2 candidates under ${outDir}/phase2/. Write runtime verdicts to ${outDir}/phase2/PROBER-RUNTIME.md.`,
        `task-${taskId}-prober`, null)
      trackCosts([uRes])
    }
    updateProgress(86, 'Phase 2v: AUDITOR reverse-check')
    const kRes = await spawnAgent('auditor', taskId, auditorPrompt(taskId, outDir, p2Features, vulnClasses, deployUrl), `task-${taskId}-auditor`, null)
    trackCosts([kRes])
  }

  // Live-board parity with black-box: AUDITOR verdicts now exist, so surface findings on the board
  // NOW (one phase earlier, ~86%) — the daemon's onFindingsReady hook runs the SAME normalize→triage→
  // enrich chain it would otherwise run only after SCRIBE. Fail-soft; the daemon's end-of-run chain
  // is a guarded fallback if this didn't materialize.
  if (typeof onFindingsReady === 'function' && !cancelled()) {
    try { await onFindingsReady(taskId, outDir) } catch (e) { log(`⚠️ onFindingsReady (non-fatal): ${e.message}`) }
  }

  // Phase 3 — SCRIBE report
  if (cancelled()) return bail('Phase 3 report')
  if (runPhase('report')) {
    updateProgress(94, 'Phase 3: SCRIBE final report')
    const vRes = await spawnAgent('scribe', taskId, scribePrompt(taskId, projectId, squad, sourceDir, outDir, p2Features, vulnClasses, deployUrl, { mapped: features.length, deeplyReviewed: p2Features.length, capped: Math.max(0, features.length - p2Features.length) }), `task-${taskId}-scribe`, null, { timeoutMs: 30 * 60 * 1000 })
    trackCosts([vRes])
  }

  updateProgress(100, 'Complete')
  return {
    stack, sourceDir, fileCount: p0.fileCount,
    features: features.map(f => f.slug),
    featuresMapped: features.length,
    phase2Features: p2Features.map(f => f.slug),
    vulnClasses,
    outputDir: outDir,
  }
}

// ── Phase 0 source validation (unchanged contract) ────────────────────────────
function validateSourceDir(sourceDir) {
  if (!sourceDir) return { ok: false, reason: 'missing dispatch.meta.sourceDir' }
  if (typeof sourceDir !== 'string') return { ok: false, reason: 'dispatch.meta.sourceDir must be a string' }
  if (!path.isAbsolute(sourceDir)) return { ok: false, reason: `sourceDir must be absolute path, got: ${sourceDir}` }
  let stat
  try { stat = fs.statSync(sourceDir) } catch (e) {
    return { ok: false, reason: `sourceDir not accessible: ${String(e.message || e).slice(0, 120)}` }
  }
  if (!stat.isDirectory()) return { ok: false, reason: `sourceDir is not a directory: ${sourceDir}` }
  const CODE_EXTS = SOURCE_EXTS.map(e => '.' + e) // same any-language set the inventory grep uses
  let fileCount = 0
  function walk(dir, depth) {
    if (depth > 3) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (fileCount > 100) return
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'vendor') continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full, depth + 1)
      else if (e.isFile() && CODE_EXTS.some(ext => e.name.endsWith(ext))) fileCount++
    }
  }
  walk(sourceDir, 0)
  if (fileCount === 0) {
    return { ok: false, reason: `sourceDir has no recognized code files (~50 extensions checked). Is this a source tree?` }
  }
  return { ok: true, fileCount }
}

module.exports = {
  runCodeReview,
  validateSourceDir,
  // exported for tests/introspection
  detectStack,
  buildInventories,
  selectVulnClasses,
  DEFAULT_CLASSES,
  CLASS,
  MAPPER_POOL,
  PHASES,
  phase2Prompt,
  freehandPrompt,
  FH_MODE,
}
