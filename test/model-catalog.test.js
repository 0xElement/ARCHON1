// test/model-catalog.test.js
//
// Covers src/routing/model-catalog.js — the model-override dropdown source.
// Offline: the SDK loader is injected, so no CLI is spawned. Verifies SDK
// normalization, config fallback on SDK failure/empty, caching, and force-refresh.

const assert = require('node:assert')
const { test } = require('node:test')
const catalog = require('../src/routing/model-catalog')

test('normalizeSdk maps ModelInfo[] → {value,label} and dedupes', () => {
  const out = catalog.normalizeSdk([
    { value: 'sonnet', displayName: 'Sonnet', resolvedModel: 'claude-sonnet-5' },
    { value: 'haiku', displayName: 'Haiku' },
    { value: 'sonnet', displayName: 'Sonnet dup' }, // duplicate value dropped
    { displayName: 'no-value' },                    // no value → dropped
    null,                                           // junk → dropped
  ])
  assert.deepStrictEqual(out, [
    { value: 'sonnet', label: 'Sonnet · claude-sonnet-5' },
    { value: 'haiku', label: 'Haiku' },
  ])
})

test('normalizeSdk on non-array → []', () => {
  assert.deepStrictEqual(catalog.normalizeSdk(undefined), [])
  assert.deepStrictEqual(catalog.normalizeSdk('nope'), [])
})

test('fromConfig returns config families as entries', () => {
  const out = catalog.fromConfig()
  assert.ok(Array.isArray(out))
  // seeded model-config.json has fast/balanced/powerful families
  assert.ok(out.length >= 1, 'at least one family')
  for (const m of out) {
    assert.ok(typeof m.value === 'string' && m.value.length)
    assert.ok(typeof m.label === 'string' && m.label.includes('·'))
  }
})

test('fetchAvailableModels uses SDK models when the loader succeeds', async () => {
  catalog._resetCache()
  let clock = 1000
  const r = await catalog.fetchAvailableModels({
    now: () => clock,
    sdkLoader: async () => [{ value: 'opus[1m]', displayName: 'Opus', resolvedModel: 'claude-opus-4-8[1m]' }],
  })
  assert.strictEqual(r.source, 'sdk')
  assert.deepStrictEqual(r.models, [{ value: 'opus[1m]', label: 'Opus · claude-opus-4-8[1m]' }])
})

test('fetchAvailableModels falls back to config when the SDK loader throws', async () => {
  catalog._resetCache()
  const r = await catalog.fetchAvailableModels({
    now: () => 1,
    sdkLoader: async () => { throw new Error('CLI not logged in') },
  })
  assert.strictEqual(r.source, 'config')
  assert.match(r.error, /CLI not logged in/)
  assert.ok(r.models.length >= 1)
})

test('fetchAvailableModels falls back to config when the SDK returns empty', async () => {
  catalog._resetCache()
  const r = await catalog.fetchAvailableModels({ now: () => 1, sdkLoader: async () => [] })
  assert.strictEqual(r.source, 'config')
})

test('fetchAvailableModels caches within TTL and force refetches', async () => {
  catalog._resetCache()
  let calls = 0
  const loader = async () => { calls++; return [{ value: 'sonnet', displayName: 'Sonnet' }] }
  let clock = 0
  const opts = () => ({ now: () => clock, sdkLoader: loader })
  await catalog.fetchAvailableModels(opts())
  clock = 1000 // still within 5-min TTL
  await catalog.fetchAvailableModels(opts())
  assert.strictEqual(calls, 1, 'second call served from cache')
  await catalog.fetchAvailableModels({ ...opts(), force: true })
  assert.strictEqual(calls, 2, 'force bypasses cache')
  catalog._resetCache()
})
