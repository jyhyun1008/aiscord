import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../app/utils/markdown.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } })
const exports = {}
vm.runInNewContext(outputText, { exports, require: createRequire(import.meta.url), console })
const { renderMarkdown } = exports

test('remote images become links and never an <img>', () => {
  const html = renderMarkdown('![기밀](https://evil.test/x.png?q=secret)')
  assert.ok(!html.includes('<img'))
  assert.ok(html.includes('href="https://evil.test/x.png?q=secret"'))
  assert.ok(html.includes('rel="noopener noreferrer"'))
})

test('a quote in an image URL cannot break out of the link', () => {
  const html = renderMarkdown('![a](<https://evil.test/"onmouseover="x>)')
  assert.ok(!html.includes('" onmouseover') && !html.includes('"onmouseover="x"'))
})

test('model-written HTML stays escaped', () => {
  assert.ok(renderMarkdown('<img src=x onerror=alert(1)>').includes('&lt;img'))
  assert.ok(renderMarkdown('<script>x</script>').includes('&lt;script'))
})

test('every math delimiter renders', () => {
  for (const text of ['$E=mc^2$', '$$\\int_0^1 x\\,dx$$', '\\(a^2\\)', '\\[a^2\\]', '\\[\na^2\n+ b\n\\]']) {
    assert.ok(renderMarkdown(text).includes('class="katex'), text)
  }
})

test('math cannot smuggle a link or script through KaTeX', () => {
  const html = renderMarkdown('$\\href{javascript:alert(1)}{x}$')
  assert.ok(!html.includes('href="javascript'))
})

test('prices and escaped punctuation are not math', () => {
  assert.ok(!renderMarkdown('가격은 $5 그리고 $10 입니다').includes('katex'))
  assert.ok(!renderMarkdown('\\[주의\\] 확인').includes('katex'))
  assert.ok(renderMarkdown('\\[주의\\] 확인').includes('[주의]'))
})

test('code keeps math and tags literal', () => {
  assert.ok(renderMarkdown('`\\(a\\)`').includes('<code>\\(a\\)</code>'))
  assert.ok(!renderMarkdown('```\n$a$ <br>\n```').includes('katex'))
})

test('<br> breaks a line, including in table cells', () => {
  assert.ok(renderMarkdown('a<br>b').includes('<br>'))
  assert.match(renderMarkdown('| h |\n|---|\n| a<br/>b |'), /<td>a<br>\s*b<\/td>/)
})

test('task lists render as disabled checkboxes', () => {
  const html = renderMarkdown('- [ ] 할 일\n- [x] 끝')
  assert.equal(html.match(/type="checkbox" disabled/g).length, 2)
  assert.equal(html.match(/ checked/g).length, 1)
  assert.ok(!html.includes('[x]'))
})

test('a plain list and a bracket in text stay as they are', () => {
  assert.ok(!renderMarkdown('- 항목').includes('checkbox'))
  assert.ok(renderMarkdown('[x] 목록 아님').includes('[x]'))
})

test('footnotes link up and stay unique per message', () => {
  const html = renderMarkdown('본문[^1]\n\n[^1]: 설명', 'm1')
  assert.ok(html.includes('id="fn-m1-1"'))
  assert.ok(html.includes('href="#fn-m1-1"'))
  assert.ok(html.includes('설명'))
})
