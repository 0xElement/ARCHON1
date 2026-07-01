// test/agents-wiring.test.js
//
// Unit test for EVERY agent — deterministic wiring, no LLM calls. For each persona on disk it
// asserts: SOUL.md exists + non-trivial, ownership maps it to its real squad home, the model
// router resolves a valid model+effort, and every persona path resolves without throwing. Plus
// roster consistency both ways (ownership ↔ SOUL.md). This is the "did you test all agents"
// coverage: it proves each agent is CORRECTLY WIRED (behavior still needs a live run).

const assert = require('node:assert')
const { test } = require('node:test')
const fs = require('fs')
const path = require('path')
const agentPaths = require('../paths')
const mr = require('../src/routing/model-router')
const ownership = require('../ownership.json')
const OWN = ownership.map || ownership
const ROOT = path.join(__dirname, '..')

// Discover every agent from its SOUL.md, recording the squad home (3 dirs up: .../<home>/agents/<name>/SOUL.md).
function discover() {
  const out = []
  const walk = (d) => {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name === 'SOUL.md' && /\/agents\/[^/]+\/SOUL\.md$/.test(p)) {
        out.push({ name: path.basename(path.dirname(p)), home: path.relative(ROOT, path.dirname(path.dirname(path.dirname(p)))) })
      }
    }
  }
  walk(path.join(ROOT, 'squads')); walk(path.join(ROOT, '_universal'))
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

const AGENTS = discover()

test(`roster: at least 28 agents have a persona (found ${AGENTS.length})`, () => {
  assert.ok(AGENTS.length >= 28, `expected ≥28 agents, got ${AGENTS.length}: ${AGENTS.map(a => a.name).join(', ')}`)
})

// ── every agent, fully wired ──────────────────────────────────────────────────────────────
for (const { name, home } of AGENTS) {
  test(`agent ${name} (${home}) is wired`, () => {
    // 1. persona exists + is real (not an empty stub), and paths.js resolves to it
    const soul = agentPaths.soulPath(name)
    assert.ok(fs.existsSync(soul), `SOUL.md not resolvable for ${name}: ${soul}`)
    assert.ok(fs.statSync(soul).size > 80, `SOUL.md is a stub for ${name} (${fs.statSync(soul).size} bytes)`)
    // 2. ownership: a squad-homed agent MUST be mapped to that home; _universal agents default
    if (home !== '_universal') assert.strictEqual(OWN[name], home, `ownership[${name}] should be "${home}", got "${OWN[name]}"`)
    // 3. model router resolves a real Claude model + effort for this agent
    const m = mr.getModelForAgent(name)
    assert.ok(m && typeof m.model === 'string' && /^claude-/.test(m.model), `no valid model for ${name}: ${JSON.stringify(m)}`)
    assert.ok(m.effort, `no effort tier for ${name}`)
    // 4. every persona path resolves without throwing
    assert.doesNotThrow(() => { agentPaths.skillsDir(name); agentPaths.personaState(name); agentPaths.lessonsPath(name); agentPaths.personaCode(name) }, `a persona path threw for ${name}`)
  })
}

// ── roster consistency both directions ──────────────────────────────────────────────────────
test('consistency: every agent in ownership.json has a SOUL.md on disk', () => {
  const missing = Object.keys(OWN).filter(a => !fs.existsSync(agentPaths.soulPath(a)))
  assert.deepStrictEqual(missing, [], `ownership agents without a persona: ${missing.join(', ')}`)
})

test('consistency: every squad persona on disk is mapped in ownership.json', () => {
  const orphan = AGENTS.filter(a => a.home !== '_universal' && !OWN[a.name]).map(a => a.name)
  assert.deepStrictEqual(orphan, [], `squad personas not in ownership: ${orphan.join(', ')}`)
})

test('every agent resolves to one of the known model families', () => {
  const bad = AGENTS.map(a => a.name).filter(n => { const m = mr.getModelForAgent(n); return !m || !['powerful', 'balanced', 'fast', 'reasoning'].includes(m.family) })
  assert.deepStrictEqual(bad, [], `agents with an unknown model family: ${bad.join(', ')}`)
})
