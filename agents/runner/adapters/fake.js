'use strict'
// Offline canned adapter — selected ONLY via ADAPTER=fake (or spec.adapter='fake'); sdk stays the
// production default, so this is unreachable unless a test opts in. Every runAgent / bridge call
// resolves instantly with benign PROSE (no JSON), so no phase parses a fake finding/hypothesis —
// the pipeline sails to its terminal state with zero findings. Zero network, zero LLM. Never throws.
const TEXT = process.env.ARCHON_FAKE_TEXT || 'No security issues identified. No findings. NONE.'

async function run(spec = {}) {
  return { text: TEXT, usage: { input_tokens: 0, output_tokens: 0 }, model: (spec && spec.model) || 'fake-model', raw: {} }
}

module.exports = { run }
