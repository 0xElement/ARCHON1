// src/intel/attack-chain-engine.js — Autonomous Agent OS canonical path
// (spec RECOMMENDED_REPO_STRUCTURE). Attack chains = the reused attack-graph
// (multi-hop discovery) + chain-verifier (deterministic curl/openssl/dig replay).
'use strict'
module.exports = {
  ...require('../pipeline/attack-graph'),
  chainVerifier: require('../pipeline/chain-verifier'),
}
