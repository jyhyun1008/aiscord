import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../app/utils/openrouter.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
const exports = {}
vm.runInNewContext(outputText, { exports })
const { createSseParser, parseChunk } = exports

function collect(chunks) {
  const out = []
  const feed = createSseParser(data => out.push(data))
  for (const chunk of chunks) feed(chunk)
  return out
}

test('SSE parser reassembles a data line split across network chunks', () => {
  assert.deepEqual(collect(['data: {"a"', ':1}\n\ndata: [DONE]\n\n']), ['{"a":1}', '[DONE]'])
})

test('SSE parser skips OpenRouter keep-alive comments and handles CRLF', () => {
  assert.deepEqual(collect([': OPENROUTER PROCESSING\r\n\r\ndata: x\r\n']), ['x'])
})

test('a content chunk yields its text and the answering model', () => {
  const delta = parseChunk('{"model":"a/b","choices":[{"delta":{"content":"안녕"}}]}')
  assert.equal(delta.content, '안녕')
  assert.equal(delta.model, 'a/b')
})

test('the final chunk carries usage and cost', () => {
  const delta = parseChunk('{"choices":[{"delta":{"content":""}}],"usage":{"prompt_tokens":10,"completion_tokens":20,"cost":0.001}}')
  assert.equal(delta.content, undefined)
  assert.equal(delta.usage.promptTokens, 10)
  assert.equal(delta.usage.completionTokens, 20)
  assert.equal(delta.usage.cost, 0.001)
})

test('reasoning deltas stay separate from the answer', () => {
  const delta = parseChunk('{"choices":[{"delta":{"reasoning":"흠"}}]}')
  assert.equal(delta.reasoning, '흠')
  assert.equal(delta.content, undefined)
})

test('a mid-stream error surfaces even though the HTTP status was 200', () => {
  const delta = parseChunk('{"error":{"code":"server_error","message":"Provider disconnected"},"choices":[{"delta":{},"finish_reason":"error"}]}')
  assert.equal(delta.error, 'Provider disconnected')
})

test('[DONE] and malformed payloads produce nothing', () => {
  assert.equal(parseChunk('[DONE]'), null)
  assert.equal(parseChunk('{oops'), null)
})

test('cached input and a length stop are reported', () => {
  const usage = parseChunk('{"choices":[{"delta":{},"finish_reason":"length"}],"usage":{"prompt_tokens":100,"completion_tokens":5,"prompt_tokens_details":{"cached_tokens":80}}}')
  assert.equal(usage.usage.cachedTokens, 80)
  assert.equal(usage.finishReason, 'length')
})
