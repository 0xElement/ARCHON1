'use strict'
// Tool-independent JS-bundle discovery: extract JS bundle URLs from a page's HTML with NO external
// tool (subjs/LinkFinder). This is what makes a JS-heavy SPA's whole API surface get analyzed even
// when the recon tools aren't installed — the coverage gap the operator hit on Juice Shop.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { extractScriptUrls, discoverJsUrls } = require('../agents/js-bundle-analyzer')

const SPA_ROOT = `<!doctype html><html><head>
  <link rel="modulepreload" href="/vendor.a1b2.js">
  <script src="runtime.js"></script>
  <script src="/polyfills-XYZ.js" defer></script>
  <script src="main-C3_5rkBN.js" type="module"></script>
  <script src="https://cdn.example.com/analytics.js"></script>
  <link rel="stylesheet" href="/styles.css">
  <script>import('/assets/lazy-chunk-99.js')</script>
</head><body></body></html>`

test('extractScriptUrls pulls every JS bundle from SPA HTML (script src + modulepreload + inline import), resolves relative, keeps only .js', () => {
  const urls = extractScriptUrls(SPA_ROOT, 'https://juice.test/')
  assert.ok(urls.includes('https://juice.test/runtime.js'), 'relative <script src>')
  assert.ok(urls.includes('https://juice.test/polyfills-XYZ.js'))
  assert.ok(urls.includes('https://juice.test/main-C3_5rkBN.js'), 'hashed main bundle (the API surface)')
  assert.ok(urls.includes('https://juice.test/vendor.a1b2.js'), 'modulepreload <link>')
  assert.ok(urls.includes('https://juice.test/assets/lazy-chunk-99.js'), 'inline import() lazy chunk')
  assert.ok(urls.includes('https://cdn.example.com/analytics.js'), 'absolute third-party bundle')
  assert.ok(!urls.some(u => /\.css/.test(u)), 'stylesheets excluded')
})

test('extractScriptUrls is safe on empty / garbage / unresolvable input', () => {
  assert.deepEqual(extractScriptUrls('', 'https://t/'), [])
  assert.deepEqual(extractScriptUrls('<html>no scripts here</html>', 'https://t/'), [])
  assert.deepEqual(extractScriptUrls(SPA_ROOT, 'not a url'), []) // unresolvable base → all skipped, no throw
})

test('discoverJsUrls fetches seeds via injected fetchImpl, aggregates + dedupes across pages (no network, no tool)', async () => {
  const pages = {
    'https://juice.test/': '<script src="main.js"></script>',
    'https://juice.test/login': '<script src="/main.js"></script><script src="/login-abc.js"></script>',
  }
  const stub = async (url) => pages[url] || '' // missing page → '' → fail-soft
  const urls = await discoverJsUrls(['https://juice.test/', 'https://juice.test/login', 'https://juice.test/missing'], { fetchImpl: stub })
  assert.ok(urls.includes('https://juice.test/main.js'))
  assert.ok(urls.includes('https://juice.test/login-abc.js'))
  assert.equal(urls.filter(u => u === 'https://juice.test/main.js').length, 1, 'main.js deduped across seeds')
})
