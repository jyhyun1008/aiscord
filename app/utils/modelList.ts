import type { Model } from './openrouter'

export type ModelSort = 'name' | 'price-asc' | 'price-desc'

export interface ModelGroup {
  company: string
  models: Model[]
}

export const OTHER_COMPANY = '기타'

interface Company {
  name: string
  prefixes: string[]
  /** public/icons/ai/<logo>.svg */
  logo: string
  color: string
}

// Display order of the groups. An id's prefix isn't always the company: Meta publishes
// under two prefixes, and `~` marks an alias that follows a family's latest version.
const COMPANIES: Company[] = [
  { name: 'OpenRouter', prefixes: ['openrouter'], logo: 'openrouter', color: '#6467f2' },
  { name: 'OpenAI', prefixes: ['openai'], logo: 'openai', color: '#10a37f' },
  { name: 'Anthropic', prefixes: ['anthropic'], logo: 'anthropic', color: '#d97757' },
  { name: 'Google', prefixes: ['google'], logo: 'google', color: '#4285f4' },
  { name: 'Meta', prefixes: ['meta', 'meta-llama'], logo: 'meta', color: '#0668e1' },
  { name: 'xAI', prefixes: ['x-ai'], logo: 'xai', color: '#3a3f46' },
  { name: 'DeepSeek', prefixes: ['deepseek'], logo: 'deepseek', color: '#4d6bfe' },
  { name: 'Mistral', prefixes: ['mistralai'], logo: 'mistral', color: '#fa520f' },
  { name: 'Alibaba (Qwen)', prefixes: ['qwen'], logo: 'qwen', color: '#615ced' },
  { name: 'Z.ai', prefixes: ['z-ai'], logo: 'zai', color: '#3859ff' },
  { name: 'Moonshot (Kimi)', prefixes: ['moonshotai'], logo: 'kimi', color: '#3a3f46' },
  { name: 'MiniMax', prefixes: ['minimax'], logo: 'minimax', color: '#e2167e' },
  { name: 'ByteDance', prefixes: ['bytedance', 'bytedance-seed'], logo: 'bytedance', color: '#325ab4' },
  { name: 'Tencent', prefixes: ['tencent'], logo: 'tencent', color: '#0052d9' },
  { name: 'Xiaomi', prefixes: ['xiaomi'], logo: 'xiaomimimo', color: '#ff6900' },
  { name: 'NVIDIA', prefixes: ['nvidia'], logo: 'nvidia', color: '#76b900' },
  { name: 'Microsoft', prefixes: ['microsoft'], logo: 'microsoft', color: '#00a4ef' },
  { name: 'Amazon', prefixes: ['amazon'], logo: 'aws', color: '#ff9900' },
  { name: 'Cohere', prefixes: ['cohere'], logo: 'cohere', color: '#39594d' },
  { name: 'Perplexity', prefixes: ['perplexity'], logo: 'perplexity', color: '#20808d' },
]

function findCompany(id: string) {
  const prefix = id.split('/')[0]!.replace(/^~/, '')
  return COMPANIES.find(c => c.prefixes.includes(prefix))
}

export function companyOf(id: string) {
  return findCompany(id)?.name ?? OTHER_COMPANY
}

export function companyLogo(id: string) {
  const company = findCompany(id)
  return company ? { slug: company.logo, color: company.color } : null
}

/** Input + output per token; null for routers, whose price depends on what they pick. */
function totalPrice(m: Model) {
  return m.promptPrice === null || m.completionPrice === null ? null : m.promptPrice + m.completionPrice
}

export function sortModels(models: Model[], sort: ModelSort) {
  const byName = (a: Model, b: Model) => a.name.localeCompare(b.name)
  if (sort === 'name') return [...models].sort(byName)
  const direction = sort === 'price-asc' ? 1 : -1
  return [...models].sort((a, b) => {
    const pa = totalPrice(a)
    const pb = totalPrice(b)
    // Unknown prices can't be ranked, so they trail in either direction
    if (pa === null || pb === null) return pa === pb ? byName(a, b) : pa === null ? 1 : -1
    return (pa - pb) * direction || byName(a, b)
  })
}

/** Split an already sorted list by company, keeping its order inside each group. */
export function groupByCompany(models: Model[]): ModelGroup[] {
  const groups = new Map<string, Model[]>()
  for (const m of models) {
    const company = companyOf(m.id)
    if (!groups.has(company)) groups.set(company, [])
    groups.get(company)!.push(m)
  }
  const order = [...COMPANIES.map(c => c.name), OTHER_COMPANY]
  return order.flatMap(company => {
    const list = groups.get(company)
    return list ? [{ company, models: list }] : []
  })
}
