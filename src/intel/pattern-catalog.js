// src/intel/pattern-catalog.js
//
// The pattern-catalog engine (Autonomous Agent OS Block E). The ONLY I/O for the
// structured catalogs under common/patterns/. mtime-cached, fail-soft. Markdown
// catalogs (access-control 40, xss 50) stay the source of truth — the engine just
// extracts their canonical ids by regex; the 4 previously-null code-review classes
// (sqli/ssrf/rce/account-takeover) ship as full inline catalogs. No ajv, no
// js-yaml (catalogs are JSON). See ULTRAPLAN.md §5.4.

'use strict'

const fs = require('fs')
const path = require('path')
const agentPaths = require('../../paths')

const PATTERNS_DIR = path.join(agentPaths.AGENTS_ROOT, 'common', 'patterns')

// tiny mtime cache: file → { mtime, json }
const _cache = new Map()
function _readJson(file) {
  try {
    const mtime = fs.statSync(file).mtimeMs
    const hit = _cache.get(file)
    if (hit && hit.mtime === mtime) return hit.json
    const json = JSON.parse(fs.readFileSync(file, 'utf8'))
    _cache.set(file, { mtime, json })
    return json
  } catch { return null }
}

function _index() { return _readJson(path.join(PATTERNS_DIR, 'index.json')) || { classes: {} } }

function _descriptor(cls) {
  const file = (_index().classes || {})[cls]
  if (!file) return null
  return _readJson(path.join(PATTERNS_DIR, file))
}

// Absolute path to the human-readable catalog for a class (markdown SoT or the JSON descriptor).
function catalogPathFor(cls) {
  const d = _descriptor(cls)
  if (!d) return null
  if (d.source === 'markdown' && d.markdown) return path.join(agentPaths.AGENTS_ROOT, d.markdown)
  const file = (_index().classes || {})[cls]
  return file ? path.join(PATTERNS_DIR, file) : null
}

// All canonical pattern ids for a class (extracted from the markdown SoT, or the inline patterns).
function patternIds(cls) {
  const d = _descriptor(cls)
  if (!d) return []
  if (d.source === 'inline') return (d.patterns || []).map(p => p.pattern_id).filter(Boolean)
  if (d.source === 'markdown' && d.markdown && d.id_regex) {
    try {
      const md = fs.readFileSync(path.join(agentPaths.AGENTS_ROOT, d.markdown), 'utf8')
      const re = new RegExp(d.id_regex, 'g')
      const ids = new Set()
      let m
      while ((m = re.exec(md)) !== null) {
        ids.add((m[1] != null ? m[1] : m[0]).trim())
        if (m.index === re.lastIndex) re.lastIndex++ // guard zero-width matches
      }
      return [...ids]
    } catch { return [] }
  }
  return []
}

function catalogFor(cls) { return _descriptor(cls) }

function patternFor(patternId) {
  for (const cls of Object.keys(_index().classes || {})) {
    const d = _descriptor(cls)
    if (d && d.source === 'inline') {
      const hit = (d.patterns || []).find(p => p.pattern_id === patternId)
      if (hit) return hit
    }
  }
  return null
}

// A canonical `task` object (validates against task.schema.json) proposing the
// pattern's suggested validation step. engagement_id is filled by the caller.
function validationTaskFor(patternId, { engagementId = '(pending)' } = {}) {
  const p = patternFor(patternId)
  return {
    task_id: `VT-${patternId}`,
    engagement_id: engagementId,
    mode: 'whitebox',
    status: 'proposed',
    schemaVersion: '1',
    pattern_id: patternId,
    objective: (p && p.suggested_validation_task) || `Validate ${patternId} against the live target.`,
    vuln_class: p ? p.vuln_class : undefined,
  }
}

module.exports = { catalogPathFor, patternIds, catalogFor, patternFor, validationTaskFor }
