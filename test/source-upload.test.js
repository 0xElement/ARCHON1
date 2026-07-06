// test/source-upload.test.js
//
// Covers src/dispatch/source-upload.js — zip extraction for the source-upload
// feature. Builds real zip buffers with adm-zip and asserts safe extraction,
// zip-slip rejection, single-root collapse, and rejection of junk/empty archives.

const assert = require('node:assert')
const { test } = require('node:test')
const fs = require('fs')
const os = require('os')
const path = require('path')
const AdmZip = require('adm-zip')
const { extractZipSafe, collapseSingleRoot } = require('../src/dispatch/source-upload')

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'archon-upload-test-'))
}

test('extractZipSafe writes files under dest', () => {
  const zip = new AdmZip()
  zip.addFile('proj/index.js', Buffer.from('console.log(1)'))
  zip.addFile('proj/lib/util.js', Buffer.from('module.exports = {}'))
  const dest = path.join(tmpDir(), 'out')
  const r = extractZipSafe(zip.toBuffer(), dest)
  assert.strictEqual(r.files, 2)
  assert.ok(fs.existsSync(path.join(dest, 'proj/index.js')))
  assert.strictEqual(fs.readFileSync(path.join(dest, 'proj/lib/util.js'), 'utf8'), 'module.exports = {}')
})

test('extractZipSafe rejects a zip-slip entry (../ escape)', () => {
  // adm-zip sanitizes ../ in addFile(), so poison the entryName after adding to
  // build a genuinely malicious archive (as an external zip tool could produce).
  const zip = new AdmZip()
  zip.addFile('placeholder.txt', Buffer.from('pwned'))
  zip.getEntries()[0].entryName = '../evil.txt'
  const base = tmpDir()
  const dest = path.join(base, 'out')
  assert.throws(() => extractZipSafe(zip.toBuffer(), dest), /zip-slip/i)
  // the escaped file must NOT exist outside dest
  assert.ok(!fs.existsSync(path.join(base, 'evil.txt')))
})

test('extractZipSafe rejects a non-zip buffer', () => {
  assert.throws(() => extractZipSafe(Buffer.from('not a zip at all'), path.join(tmpDir(), 'o')), /valid zip/i)
})

test('extractZipSafe rejects an archive with no files (dirs only)', () => {
  const zip = new AdmZip()
  zip.addFile('emptydir/', Buffer.alloc(0)) // directory entry only
  assert.throws(() => extractZipSafe(zip.toBuffer(), path.join(tmpDir(), 'o')), /no files|empty/i)
})

test('collapseSingleRoot descends into a single wrapper directory', () => {
  const zip = new AdmZip()
  zip.addFile('project/a.js', Buffer.from('1'))
  zip.addFile('project/b.js', Buffer.from('2'))
  const dest = path.join(tmpDir(), 'out')
  const r = extractZipSafe(zip.toBuffer(), dest)
  const collapsed = collapseSingleRoot(r.root)
  assert.strictEqual(path.basename(collapsed), 'project')
  assert.ok(fs.existsSync(path.join(collapsed, 'a.js')))
})

test('collapseSingleRoot stays at root when multiple top-level entries', () => {
  const zip = new AdmZip()
  zip.addFile('a.js', Buffer.from('1'))
  zip.addFile('b.js', Buffer.from('2'))
  const dest = path.join(tmpDir(), 'out')
  const r = extractZipSafe(zip.toBuffer(), dest)
  assert.strictEqual(collapseSingleRoot(r.root), r.root)
})

test('collapseSingleRoot ignores __MACOSX/.DS_Store cruft', () => {
  const zip = new AdmZip()
  zip.addFile('project/a.js', Buffer.from('1'))
  zip.addFile('__MACOSX/._a.js', Buffer.from('junk'))
  zip.addFile('.DS_Store', Buffer.from('junk'))
  const dest = path.join(tmpDir(), 'out')
  const r = extractZipSafe(zip.toBuffer(), dest)
  assert.strictEqual(path.basename(collapseSingleRoot(r.root)), 'project')
})
