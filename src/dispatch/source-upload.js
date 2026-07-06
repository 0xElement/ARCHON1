'use strict'
// Source-archive upload support for the dashboard: turn an uploaded .zip of a
// source tree into a real on-disk directory the daemon can read, the same way it
// reads a pasted absolute path. Security-critical, so extraction is zip-slip
// guarded — a crafted archive can NOT write outside the destination directory.

const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')

// Extract a zip buffer into destDir. Every entry's resolved path must stay inside
// destDir (zip-slip guard) or we throw before writing it. Returns { files, dirs, root }.
function extractZipSafe(buffer, destDir) {
  let zip
  try { zip = new AdmZip(buffer) } catch (e) { throw new Error(`not a valid zip archive (${(e && e.message) || e})`) }
  const entries = zip.getEntries()
  if (!entries.length) throw new Error('archive is empty')
  const root = path.resolve(destDir)
  fs.mkdirSync(root, { recursive: true })
  let files = 0, dirs = 0
  for (const e of entries) {
    const target = path.resolve(root, e.entryName)
    // zip-slip guard: the resolved target must be root itself or live under it.
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(`unsafe path in archive (zip-slip): ${e.entryName}`)
    }
    if (e.isDirectory) {
      fs.mkdirSync(target, { recursive: true }); dirs++
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, e.getData())
      files++
    }
  }
  if (!files) throw new Error('archive contains no files')
  return { files, dirs, root }
}

// A "project.zip" usually extracts to a single top-level "project/" folder. When
// that is the case, point the source path at that inner folder so the review sees
// the real tree root, not a one-item wrapper. Ignores macOS zip cruft.
function collapseSingleRoot(root) {
  let entries
  try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch { return root }
  const visible = entries.filter(e => e.name !== '__MACOSX' && e.name !== '.DS_Store')
  if (visible.length === 1 && visible[0].isDirectory()) return path.join(root, visible[0].name)
  return root
}

module.exports = { extractZipSafe, collapseSingleRoot }
