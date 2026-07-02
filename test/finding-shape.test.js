'use strict'

const assert = require('assert')
const { isSourceFindingSet } = require('../src/pipeline/finding-shape')

// empty / junk → not source
assert.strictEqual(isSourceFindingSet([]), false)
assert.strictEqual(isSourceFindingSet(null), false)
assert.strictEqual(isSourceFindingSet([{}]), false)

// live black-box findings (have url) → not source
assert.strictEqual(isSourceFindingSet([
  { url: 'http://t/a', file: 'x.js' },
  { url: 'http://t/b' },
]), false)

// code-review findings (file/line/code_block, no url) → source
assert.strictEqual(isSourceFindingSet([
  { file: 'app/models/user.rb', line: 42, code_block: 'eval(params[:x])' },
  { file: 'app/controllers/foo.rb', code_block: 'raw sql' },
]), true)

// mixed, source-majority → source; url-majority → not
assert.strictEqual(isSourceFindingSet([{ file: 'a' }, { file: 'b' }, { url: 'http://t' }]), true)
assert.strictEqual(isSourceFindingSet([{ url: 'http://t/1' }, { url: 'http://t/2' }, { file: 'a' }]), false)

// a url present on a record disqualifies THAT record even if it also has a file
assert.strictEqual(isSourceFindingSet([{ url: 'http://t', file: 'a', code_block: 'x' }]), false)

console.log('✔ finding-shape: isSourceFindingSet classifies source vs live sets')
