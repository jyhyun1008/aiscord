import hljs from 'highlight.js/lib/common'
import MarkdownIt from 'markdown-it'

// `html: false` escapes any tags a model writes, and markdown-it refuses javascript: links
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

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

export function renderMarkdown(text: string) {
  return md.render(text)
}
