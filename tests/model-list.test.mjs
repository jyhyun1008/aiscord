import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../app/utils/modelList.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
const exports = {}
vm.runInNewContext(outputText, { exports })
const { companyOf, companyLogo, sortModels, groupByCompany, OTHER_COMPANY } = exports

const model = (id, promptPrice, completionPrice = promptPrice) => ({ id, name: id, contextLength: null, promptPrice, completionPrice })
const ids = list => Array.from(list, m => m.id)

const cheap = model('google/cheap', 0.1)
const free = model('openai/free', 0)
const dear = model('anthropic/dear', 5)
const router = model('openrouter/auto', null)

test('prefixes that share a company land in one group', () => {
  assert.equal(companyOf('meta/muse'), 'Meta')
  assert.equal(companyOf('meta-llama/llama-4'), 'Meta')
  assert.equal(companyOf('~anthropic/claude-latest'), 'Anthropic')
  assert.equal(companyOf('typesafe/unknown'), OTHER_COMPANY)
})

test('price sorting runs both ways and always leaves unknown prices last', () => {
  assert.deepEqual(ids(sortModels([dear, router, free, cheap], 'price-asc')), ['openai/free', 'google/cheap', 'anthropic/dear', 'openrouter/auto'])
  assert.deepEqual(ids(sortModels([dear, router, free, cheap], 'price-desc')), ['anthropic/dear', 'google/cheap', 'openai/free', 'openrouter/auto'])
})

test('sorting leaves the shared list untouched', () => {
  const list = [dear, free]
  sortModels(list, 'price-asc')
  assert.deepEqual(ids(list), ['anthropic/dear', 'openai/free'])
})

test('groups follow the fixed company order, unknown companies last, sort kept inside', () => {
  const sorted = sortModels([model('zzz/x', 1), dear, model('anthropic/cheap', 1), free], 'price-asc')
  const groups = groupByCompany(sorted)
  assert.deepEqual(Array.from(groups, g => g.company), ['OpenAI', 'Anthropic', OTHER_COMPANY])
  assert.deepEqual(ids(groups[1].models), ['anthropic/cheap', 'anthropic/dear'])
})

test('aliases and multi-prefix companies find their logo; unknown companies have none', () => {
  assert.equal(companyLogo('~anthropic/claude-latest').slug, 'anthropic')
  assert.equal(companyLogo('meta-llama/llama-4').slug, 'meta')
  assert.equal(companyLogo('typesafe/unknown'), null)
})
