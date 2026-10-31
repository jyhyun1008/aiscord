import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../app/utils/context.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
const exports = {}
vm.runInNewContext(outputText, { exports })
const { estimateTokens, contextBudget, usableMessages, splitForSummary, trimToBudget, buildSystemPrompt, summaryRequest } = exports

const user = content => ({ role: 'user', content })
const ai = content => ({ role: 'assistant', content })
const words = n => 'a'.repeat(n * 4)

test('Korean text counts heavier than Latin text of the same length', () => {
  assert.equal(estimateTokens('aaaaaaaa'), 2)
  assert.ok(estimateTokens('가나다라마바사아') > 4)
})

test('the budget follows the model but stays capped and has a default', () => {
  assert.equal(contextBudget(8000), 6000)
  assert.equal(contextBudget(2000000), 80000)
  assert.equal(contextBudget(null), 24000)
})

test('failed and unfinished turns are left out, partial answers stay', () => {
  const list = [user('q'), { ...ai(''), error: 'x' }, { ...ai('부분'), error: 'x' }, { ...ai(''), pending: true }]
  assert.deepEqual(Array.from(usableMessages(list), m => m.content), ['q', '부분'])
})

test('nothing is split while the history fits', () => {
  assert.equal(splitForSummary([user(words(10)), ai(words(10))], 100), null)
})

test('a split keeps recent messages and lands on a question', () => {
  const list = [user(words(40)), ai(words(40)), user(words(40)), ai(words(10)), user(words(5)), ai(words(5))]
  assert.equal(splitForSummary(list, 100), 4)
})

test('a long final question is kept whole and never summarized away', () => {
  const list = [user(words(50)), ai(words(50)), user(words(500))]
  assert.equal(splitForSummary(list, 100), 2)
})

test('a history that is one huge turn has nothing to split', () => {
  assert.equal(splitForSummary([user(words(500))], 100), null)
})

test('trimming drops the oldest and starts on a question', () => {
  const list = [user(words(60)), ai(words(60)), user(words(10)), ai(words(10))]
  assert.deepEqual(Array.from(trimToBudget(list, 50), m => m.content.length), [40, 40])
})

test('the system prompt skips the parts that are empty', () => {
  assert.equal(buildSystemPrompt({ instructions: '' }), '')
  assert.equal(buildSystemPrompt({ instructions: '지침', memo: ' 메모 ', summary: '요약' }), '지침\n\n## 프로젝트 메모\n메모\n\n## 이전 대화 요약\n요약')
})

test('a follow-up summary carries the previous one forward', () => {
  const [, request] = summaryRequest([user('질문'), ai('답')], '옛 요약')
  assert.ok(request.content.includes('옛 요약'))
  assert.ok(request.content.includes('사용자: 질문'))
  assert.ok(request.content.includes('AI: 답'))
})
