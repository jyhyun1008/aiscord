import katexPlugin from '@vscode/markdown-it-katex'
import hljs from 'highlight.js/lib/common'
import MarkdownIt from 'markdown-it'
import footnote from 'markdown-it-footnote'

// `html: false` escapes any tags a model writes, and markdown-it refuses javascript: links
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

type RuleInline = Parameters<typeof md.inline.ruler.before>[2]
type RuleBlock = Parameters<typeof md.block.ruler.before>[2]

// CommonJS default: bundlers disagree on whether it arrives wrapped
const math = (katexPlugin as unknown as { default?: typeof katexPlugin }).default ?? katexPlugin
md.use(math, { throwOnError: false, strict: 'ignore' })
// Its bundled types target an older markdown-it
md.use(footnote as unknown as Parameters<typeof md.use>[0])

const HANGUL = /[가-힣]/

/** `\(…\)` and `\[…\]`: LLMs favor these over dollars, and markdown would strip the backslashes. */
const bracketMath: RuleInline = (state, silent) => {
  const { src, pos } = state
  if (src[pos] !== '\\') return false
  const open = src[pos + 1]
  if (open !== '(' && open !== '[') return false
  const end = src.indexOf(open === '(' ? '\\)' : '\\]', pos + 2)
  if (end < 0) return false
  const content = src.slice(pos + 2, end)
  // `\[주의\]` is someone escaping punctuation, not a formula
  if (HANGUL.test(content)) return false
  if (!silent) state.push(open === '(' ? 'math_inline' : 'math_inline_block', 'math', 0).content = content
  state.pos = end + 2
  return true
}
md.inline.ruler.before('escape', 'bracket_math', bracketMath)

/** A `\[` block spread over several lines, which the inline rule can't see past a paragraph. */
const bracketMathBlock: RuleBlock = (state, startLine, endLine, silent) => {
  const line = (n: number) => state.src.slice(state.bMarks[n]! + state.tShift[n]!, state.eMarks[n]).trim()
  const first = line(startLine)
  if (!first.startsWith('\\[')) return false
  let last = startLine
  while (last < endLine && !line(last).endsWith('\\]')) last++
  if (last === endLine) return false
  const content = Array.from({ length: last - startLine + 1 }, (_, i) => line(startLine + i))
    .join('\n')
    .slice(2, -2)
  if (HANGUL.test(content)) return false
  if (silent) return true
  const token = state.push('math_block', 'math', 0)
  token.block = true
  token.content = content
  token.map = [startLine, last + 1]
  state.line = last + 1
  return true
}
md.block.ruler.before('blockquote', 'bracket_math_block', bracketMathBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] })

/** Models write `<br>` in table cells, where markdown has no line break of its own. */
const breakTag: RuleInline = (state, silent) => {
  const match = /^<br\s*\/?>/i.exec(state.src.slice(state.pos, state.pos + 8))
  if (!match) return false
  if (!silent) state.push('hardbreak', 'br', 0)
  state.pos += match[0].length
  return true
}
md.inline.ruler.before('autolink', 'break_tag', breakTag)

/** `- [x] done`: runs last because the brackets are only one text token after text_join. */
md.core.ruler.push('task_list', (state) => {
  const { tokens } = state
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i]!
    if (inline.type !== 'inline' || tokens[i - 1]!.type !== 'paragraph_open' || tokens[i - 2]!.type !== 'list_item_open') continue
    const first = inline.children?.[0]
    const box = first?.type === 'text' ? /^\[([ xX])\]\s/.exec(first.content) : null
    if (!first || !box) continue
    first.content = first.content.slice(box[0].length)
    const token = new state.Token('task_box', '', 0)
    token.meta = { checked: box[1] !== ' ' }
    inline.children!.unshift(token)
    tokens[i - 2]!.attrJoin('class', 'task-item')
  }
})
md.renderer.rules.task_box = (tokens, idx) =>
  `<input type="checkbox" disabled${tokens[idx]!.meta.checked ? ' checked' : ''}> `

md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]!
  const lang = token.info.trim().split(/\s+/)[0] ?? ''
  const code = token.content.replace(/\n$/, '')
  const body = lang && hljs.getLanguage(lang)
    ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    : md.utils.escapeHtml(code)
  return `<div class="code-block"><div class="code-head"><span>${md.utils.escapeHtml(lang || 'text')}</span>`
    + `<button type="button" data-copy-code>복사</button></div><pre><code class="hljs">${body}</code></pre></div>`
}

const defaultLink = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx]!.attrSet('target', '_blank')
  tokens[idx]!.attrSet('rel', 'noopener noreferrer')
  return defaultLink(tokens, idx, options, env, self)
}

// Never load remote images on their own: a poisoned model could put the conversation in the
// URL, and showing the answer would send it out. As a link, nothing leaves without a click.
md.renderer.rules.image = (tokens, idx) => {
  const token = tokens[idx]!
  const src = token.attrGet('src') ?? ''
  const label = md.utils.escapeHtml(token.content || src)
  return `<a class="image-link" href="${md.utils.escapeHtml(src)}" target="_blank" rel="noopener noreferrer">🖼 ${label}</a>`
}

/** `id` keeps footnote anchors unique when several answers sit on one page. */
export function renderMarkdown(text: string, id?: string) {
  return md.render(text, { docId: id })
}
