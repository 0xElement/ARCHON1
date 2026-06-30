// scrub-goal-paths.js
//
// FIX 2 (2026-05-09): Strip /root/intel/* file/dir paths from dispatch goal
// text before it lands in specialist prompts.
//
// Why: live pentest 1778394458903 was dispatched with goal text including
// the literal "/root/intel/trajectory-observations.jsonl". Result: 28+
// specialists wrote NON-CANONICAL custom-schema entries to that file
// (verdicts like "HONEST", "CONFIRMED", "DISPROVEN" — none of which are
// our canonical verdict set). Same pattern caused FORGE to write
// `/root/intel/CLOUD-SECURITY-HANDOFF-{taskId}.md` instead of using the
// proper inbox JSON.
//
// Specialists treat instructions in their goal as instructions about
// output paths. The fix: scrub the canonical artefact paths before the
// goal reaches the specialist prompt. The specialist's *own* prompt
// (HANDOFF section, WRITE_FINDINGS instructions, etc.) carries the
// authoritative canonical paths — they don't need them in the goal too.
//
// Conservative scope: we ONLY scrub `/root/intel/<something>` — paths
// like /tmp/, /var/log/, http(s)://... are left intact since those are
// usually external evidence references, not canonical squad artefact
// destinations.

const __roots = require('../../paths') // portable roots — the scrub must follow INTEL_ROOT, not a literal

const PLACEHOLDER = '[file path scrubbed — use canonical paths from your prompt]'

// Match a canonical artefact path. The non-whitespace run captures
// directories (with trailing /), files with extensions, and bare
// inner paths. Stops at whitespace, commas, semicolons, parens,
// quotes, backticks, angle brackets — anything that ends the path
// in normal prose. Trailing periods are tricky (e.g. end-of-sentence
// vs. ".jsonl"), so we strip a single trailing `.` after capture if
// it's not part of an extension.
//
// Portability fix (2026-06-30): the canonical data-layer root is INTEL_ROOT,
// which on a portable / local build resolves UNDER the repo
// (`<root>/var/intel`), NOT `/root/intel`. A `/root/intel`-only regex therefore
// no-ops on every non-server deployment — the exact build paths.js now resolves.
// Build the alternation from the resolved INTEL_ROOT *and* the legacy
// `/root/intel` literal (belt-and-suspenders for goals authored against the old
// server layout), so the scrub covers wherever artefacts actually live.
function _escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function _buildPathRe() {
  const roots = new Set(['/root/intel'])
  try { if (__roots && __roots.INTEL_ROOT) roots.add(String(__roots.INTEL_ROOT).replace(/\/+$/, '')) } catch { /* fail-soft: legacy literal still covered */ }
  const alt = [...roots].map(_escapeRe).join('|')
  return new RegExp('(?:' + alt + ')\\/[^\\s,;()\'"`<>]+', 'g')
}
const PATH_RE = _buildPathRe()

function scrubFilePathsFromGoal(goal) {
  if (typeof goal !== 'string' || !goal) return ''
  return goal.replace(PATH_RE, (match) => {
    // If the match ends with a sentence-final period that is NOT an
    // extension dot (e.g. "...inbox/." vs "...file.jsonl"), preserve
    // the period after the placeholder so the sentence still terminates.
    if (/\.$/.test(match) && !/\.[A-Za-z0-9]+$/.test(match)) {
      return PLACEHOLDER + '.'
    }
    return PLACEHOLDER
  })
}

module.exports = { scrubFilePathsFromGoal, PLACEHOLDER }
