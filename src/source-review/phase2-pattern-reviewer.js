// src/source-review/phase2-pattern-reviewer.js — alias of phase2-pattern-router.js.
// The spec/handoff refers to this surface as the "pattern reviewer"; the canonical
// module is phase2-pattern-router.js. Kept as a single re-export so both names
// resolve to the same Phase-2 pattern-review surface (engine + dispatcher). See
// ROADMAP.md "Module graduation" — these thin canonical-path modules grow real
// bodies over time; until then, one source of truth, two addressable names.
'use strict'
module.exports = require('./phase2-pattern-router')
