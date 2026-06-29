// src/reporting/remediation-writer.js — Autonomous Agent OS canonical path
// (spec RECOMMENDED_REPO_STRUCTURE). Remediation guidance comes from the static KB
// (common/remediation/*.yaml) and the offensive-vaccine remediation generator;
// SCRIBE weaves it into the report.
'use strict'
const path = require('path')
const agentPaths = require('../../paths')
module.exports = {
  offensiveVaccine: require('../safety/offensive-vaccine'),
  remediationDir: path.join(agentPaths.AGENTS_ROOT, 'common', 'remediation'),
}
