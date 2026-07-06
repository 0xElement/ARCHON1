// src/intel/knowledge-graph.js
//
// The shared, engagement-scoped Knowledge Graph (Autonomous Agent OS Block B).
// DERIVED-FROM-JSONL — it never owns truth; it reconstructs one queryable graph
// (features, source files, candidates, confirmed findings, chains, correlations)
// from the on-disk artifacts the pipeline already writes, so a future re-sync is
// idempotent. Passive-listener: nothing in the legacy pipeline reads it; the
// Mission Director (Block A) is its only consumer. File-based under
// var/intel/kg/<engagementId>/graph.json with its OWN lock — it never contends
// with the tasks.json/dispatch-queue.json state locks. Fail-soft everywhere.
// See ULTRAPLAN.md §5.0 F-KG.

'use strict'

const fs = require('fs')
const path = require('path')
const agentPaths = require('../../paths')
const attackGraph = require('../pipeline/attack-graph')
const { evidenceTier } = require('../pipeline/evidence-tier') // M6: tier the evidence when a record lacks it

const NODE = attackGraph.NODE_TYPES
const EDGE = attackGraph.EDGE_TYPES

// ── atomic write + own advisory lock (copied minimal, precedent: versioned-memory) ──
function _writeAtomic(file, data) {
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`
  fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}
function _withLock(file, fn) {
  const lock = `${file}.lock`
  let held = false
  try {
    try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx' }); held = true } catch {
      // stale-steal after 10s (mirrors event-bus acquireLock policy)
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10000) { fs.writeFileSync(lock, String(process.pid)); held = true } } catch {}
    }
    return fn()
  } finally { if (held) { try { fs.unlinkSync(lock) } catch {} } }
}

function _kgDir(engagementId, intelRoot) {
  const d = path.join(intelRoot || agentPaths.INTEL_ROOT, 'kg', String(engagementId))
  fs.mkdirSync(d, { recursive: true })
  return d
}
function _graphFile(engagementId, intelRoot) { return path.join(_kgDir(engagementId, intelRoot), 'graph.json') }

function _emptyGraph(engagementId) { return { engagementId: String(engagementId), generatedAt: null, nodes: {}, edges: [] } }

// ── idempotent write API ──
function upsertNode(graph, id, type, props) {
  if (!id) return graph
  graph.nodes[id] = { ...(graph.nodes[id] || {}), id, type, ...(props || {}) }
  return graph
}
function upsertEdge(graph, from, to, type, props) {
  if (!from || !to) return graph
  const key = `${from}|${to}|${type}`
  if (!graph.edges.some(e => `${e.from}|${e.to}|${e.type}` === key)) graph.edges.push({ from, to, type, ...(props || {}) })
  return graph
}

function _readJsonl(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8').trim()
    if (!raw) return []
    return raw.split('\n').map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}
function _readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } }

// Resolve an engagement to its iterations (root pentest + code-review). Fail-soft:
// an unknown id is treated as a single blackbox iteration (id == taskId).
function resolveEngagement(engagementId) {
  const rec = _readJson(path.join(agentPaths.INTEL_ROOT, `engagement-${engagementId}.json`))
  if (rec && Array.isArray(rec.iterations) && rec.iterations.length) return rec
  return { engagementId: String(engagementId), iterations: [{ taskId: String(engagementId), kind: 'blackbox' }] }
}

/**
 * Derive the engagement graph from on-disk artifacts and persist it. Idempotent
 * (same inputs → same graph). Returns the graph. Fail-soft.
 */
function syncEngagement(engagementId, deps = {}) {
  const intelRoot = deps.intelRoot || agentPaths.INTEL_ROOT
  try {
    const eng = resolveEngagement(engagementId)
    const graph = _emptyGraph(engagementId)
    let rootPentestTaskId = null

    for (const it of eng.iterations) {
      const tid = it.taskId
      if (it.kind === 'blackbox' && !rootPentestTaskId) rootPentestTaskId = tid
      // findings (VALIDATED preferred; the JUDGED file is a superset when present)
      const findings = _readJsonl(path.join(intelRoot, `VALIDATED-FINDINGS-${tid}.jsonl`))
      for (const f of findings) {
        const id = f.id || f.findingId
        if (!id) continue
        const confirmed = String(f.validation_status || '').toUpperCase() === 'CONFIRMED'
        const tier = f.evidence_tier || evidenceTier(f) // M6: tier every finding for the coverage node
        upsertNode(graph, id, confirmed ? NODE.CONFIRMED : NODE.CANDIDATE, {
          title: f.title || '', severity: f.severity || '', validation_status: f.validation_status || '',
          confirmation_status: f.confirmation_status || '', evidence_tier: tier,
          iteration: it.kind, taskId: tid, file: f.file || (Array.isArray(f.source_files) ? f.source_files[0] : undefined),
        })
        // feature handled by source file (code-review iteration)
        for (const sf of (Array.isArray(f.source_files) ? f.source_files : (f.file ? [f.file] : []))) {
          upsertNode(graph, `SF:${sf}`, NODE.SOURCE_FILE, { path: sf })
          upsertEdge(graph, id, `SF:${sf}`, EDGE.FEATURE_HANDLED_BY_SOURCE_FILE)
        }
        // M6: an EVIDENCE node backs each finding (the code block / trace / captured response).
        const evText = String(f.reproduction_response || f.reproduction_result || f.reproduction || f.evidence || f.vulnerable_code || '').trim()
        if (evText) {
          upsertNode(graph, `EV:${id}`, NODE.EVIDENCE, { tier, summary: evText.slice(0, 200) })
          upsertEdge(graph, `EV:${id}`, id, EDGE.EVIDENCE_SUPPORTS_CANDIDATE)
        }
      }
      // code-review feature queue → Feature nodes
      const fq = _readJson(path.join(intelRoot, 'code-review', String(tid), 'phase1-maps', 'feature-queue.json'))
      for (const feat of (fq && Array.isArray(fq.features) ? fq.features : [])) {
        const slug = feat.slug || feat.name
        if (slug) upsertNode(graph, `FEATURE-${slug}`, NODE.FEATURE, { name: feat.name || slug, slug })
      }
    }

    // correlation map (root pentest task) → Correlation nodes + correlate edges
    const corr = _readJson(path.join(intelRoot, `correlation-${rootPentestTaskId || engagementId}.json`))
    if (corr) {
      for (const g of (corr.exact_duplicate_groups || [])) {
        const cid = `CORR-dup-${g.keep}`
        upsertNode(graph, cid, NODE.CORRELATION, { correlation_type: 'duplicate', vuln_class: g.vuln_class, keep: g.keep })
        for (const m of (g.members || [])) upsertEdge(graph, m, cid, EDGE.CANDIDATE_CORRELATES_WITH_BLACKBOX)
      }
      for (const cand of (corr.cross_view_candidates || [])) {
        const cid = `CORR-xview-${cand.vuln_class}`
        upsertNode(graph, cid, NODE.CORRELATION, { correlation_type: 'cross_view', vuln_class: cand.vuln_class })
        for (const w of (cand.whitebox || [])) upsertEdge(graph, w.id, cid, EDGE.CANDIDATE_CORRELATES_WITH_SOURCE)
        for (const b of (cand.blackbox || [])) upsertEdge(graph, b.id, cid, EDGE.CANDIDATE_CORRELATES_WITH_BLACKBOX)
      }
    }

    // chain records (Block F) → Chain nodes + membership edges
    for (const it of eng.iterations) {
      const chainRecs = _readJsonl(path.join(intelRoot, 'shadow', String(engagementId), 'chain-records.jsonl'))
      for (const ch of chainRecs) {
        if (!ch.chain_id) continue
        upsertNode(graph, ch.chain_id, NODE.CHAIN, { name: ch.name || '', severity: ch.severity || '', current_confidence: ch.current_confidence })
        for (const fid of (ch.finding_ids || [])) upsertEdge(graph, fid, ch.chain_id, EDGE.FINDING_PART_OF_ATTACK_CHAIN)
      }
      break // shadow chain records are engagement-scoped, read once
    }

    // M6: COVERAGE node — engagement-wide tier distribution + confirmed/candidate counts. Only when
    // there is something to cover, so an empty engagement stays an empty graph (fail-soft invariant).
    const fnodes = Object.values(graph.nodes).filter(n => n.type === NODE.CANDIDATE || n.type === NODE.CONFIRMED)
    if (fnodes.length > 0) {
      const tiers = {}; let confirmed = 0
      for (const n of fnodes) { if (n.type === NODE.CONFIRMED) confirmed++; const t = n.evidence_tier || 'L0'; tiers[t] = (tiers[t] || 0) + 1 }
      upsertNode(graph, `COVERAGE:${engagementId}`, NODE.COVERAGE, {
        features: Object.values(graph.nodes).filter(n => n.type === NODE.FEATURE).length,
        source_files: Object.values(graph.nodes).filter(n => n.type === NODE.SOURCE_FILE).length,
        total_findings: fnodes.length, confirmed, candidates: fnodes.length - confirmed, tiers,
      })
    }

    graph.generatedAt = deps.now || new Date().toISOString()
    const file = _graphFile(engagementId, intelRoot)
    _withLock(file, () => _writeAtomic(file, graph))
    return graph
  } catch { return _emptyGraph(engagementId) }
}

// ── pure read API ──
function getContext(engagementId) { return _readJson(_graphFile(engagementId)) || _emptyGraph(engagementId) }
function query(engagementId, { type } = {}) {
  const g = getContext(engagementId)
  const nodes = Object.values(g.nodes)
  return type ? nodes.filter(n => n.type === type) : nodes
}
function findChains(engagementId) {
  const g = getContext(engagementId)
  return Object.values(g.nodes).filter(n => n.type === NODE.CHAIN)
}

/**
 * The Mission Director's observe surface. Pure — never mutates.
 * { coverageGaps, unprovenCandidates, openChains, recommendedTasks }
 */
function observe(engagementId) {
  const g = getContext(engagementId)
  const nodes = Object.values(g.nodes)
  const unprovenCandidates = nodes.filter(n => n.type === NODE.CANDIDATE &&
    String(n.validation_status || '').toUpperCase() !== 'CONFIRMED')
  const openChains = nodes.filter(n => n.type === NODE.CHAIN && n.current_confidence !== 'high')
  const recommendedTasks = unprovenCandidates.slice(0, 20).map(n => ({
    mode: 'whitebox', type: 'validate.candidate', target: n.id,
    objective: `Validate candidate ${n.id} (${n.title || ''}) to CONFIRMED`,
  }))
  // M6: surface the COVERAGE node (tier distribution + counts) so the Mission Director can see where
  // the review is thin (many L1/L2, few L3+) and prioritize accordingly.
  const coverage = nodes.find(n => n.type === NODE.COVERAGE) || null
  return { coverageGaps: [], unprovenCandidates, openChains, recommendedTasks, coverage }
}

module.exports = {
  upsertNode, upsertEdge, syncEngagement, resolveEngagement,
  getContext, query, observe, findChains,
  NODE_TYPES: NODE, EDGE_TYPES: EDGE,
}
