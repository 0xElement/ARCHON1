'use strict'

// A finding set is "source-shaped" (a code review) when most of its records carry a source
// location (file / code block) and NO live URL. This gates the code-review template in the
// shared triager + writer: source findings show a vulnerable code block and file:line, never
// a curl PoC or raw HTTP request (a live black-box finding has a url and gets the curl template).
//
// Kept pure + tested because it selects which report template a finding is written with —
// a wrong guess for a whole run would either fabricate curl PoCs for source findings or
// drop the code block from live ones.
function isSourceFindingSet(findings) {
  if (!Array.isArray(findings) || findings.length === 0) return false
  const source = findings.filter(f =>
    f && typeof f === 'object' && !f.url && (f.file || f.code_block || f.vulnerable_code)
  ).length
  return source >= findings.length / 2
}

module.exports = { isSourceFindingSet }
