interface Stamped {
  id: string
  changedAt?: number
  updatedAt?: number
}

interface ThreadLike extends Stamped {
  projectId: string
}

interface SettingsLike {
  /** 0 until the user changes something, so a fresh device takes the other copy's */
  changedAt: number
}

export interface Backup<P extends Stamped = Stamped, T extends ThreadLike = ThreadLike, M = unknown, S extends SettingsLike = SettingsLike> {
  version: 1
  exportedAt: number
  projects: P[]
  threads: T[]
  /** When each removed project or thread went away, so a merge won't bring it back */
  deleted: Record<string, number>
  /** Thread id → its whole history */
  messages: Record<string, M[]>
  /** Absent in older backups */
  settings?: S
}

const stamp = (item: Stamped) => item.changedAt ?? item.updatedAt ?? 0

export function parseBackup(text: string): Backup<any, any, any> {
  let data: any
  try {
    data = JSON.parse(text)
  }
  catch {
    throw new Error('Aiscord 백업 파일이 아니에요')
  }
  if (data?.version !== 1 || !Array.isArray(data.projects) || !Array.isArray(data.threads)) {
    throw new Error('Aiscord 백업 파일이 아니에요')
  }
  return { ...data, deleted: data.deleted ?? {}, messages: data.messages ?? {} }
}

/** Newest copy of each id, keeping `local`'s order, minus anything deleted after its last change. */
function mergeItems<T extends Stamped>(local: T[], remote: T[], deleted: Record<string, number>) {
  const merged = new Map(local.map(item => [item.id, item]))
  for (const item of remote) {
    const mine = merged.get(item.id)
    if (!mine || stamp(item) > stamp(mine)) merged.set(item.id, item)
  }
  return [...merged.values()].filter(item => (deleted[item.id] ?? -1) < stamp(item))
}

/**
 * Combine two copies thread by thread: the most recently changed thread wins whole, so
 * editing one thread on two devices keeps only the later one. `fromRemote` lists the
 * threads whose history has to be written locally. Settings are one unit: the newer set
 * wins, and `settingsFromRemote` says it has to be applied here.
 */
export function mergeBackups<P extends Stamped, T extends ThreadLike, M, S extends SettingsLike>(local: Backup<P, T, M, S>, remote: Backup<P, T, M, S>) {
  const deleted = { ...local.deleted }
  for (const [id, at] of Object.entries(remote.deleted)) deleted[id] = Math.max(deleted[id] ?? 0, at)

  const projects = mergeItems(local.projects, remote.projects, deleted)
  const projectIds = new Set(projects.map(p => p.id))
  const threads = mergeItems(local.threads, remote.threads, deleted).filter(t => projectIds.has(t.projectId))

  const mine = new Map(local.threads.map(t => [t.id, t]))
  const messages: Record<string, M[]> = {}
  const fromRemote: string[] = []
  for (const thread of threads) {
    const own = mine.get(thread.id)
    const useRemote = !own || thread !== own
    messages[thread.id] = (useRemote ? remote : local).messages[thread.id] ?? []
    if (useRemote) fromRemote.push(thread.id)
  }

  const settingsFromRemote = !!remote.settings && remote.settings.changedAt > (local.settings?.changedAt ?? -1)
  const settings = settingsFromRemote ? remote.settings : local.settings

  const merged: Backup<P, T, M, S> = { version: 1, exportedAt: Date.now(), projects, threads, deleted, messages, settings }
  return { merged, fromRemote, settingsFromRemote }
}

/**
 * A fresh install starts with a seed project. Leave it out when the other copy already has
 * projects, or every new device adds another empty #일반.
 */
export function dropUntouchedSeed<P extends Stamped, T extends ThreadLike, M, S extends SettingsLike>(local: Backup<P, T, M, S>, remote: Backup<P, T, M, S>) {
  if (!remote.projects.length) return local
  const used = new Set(local.threads.map(t => t.projectId))
  return { ...local, projects: local.projects.filter(p => p.changedAt !== undefined || used.has(p.id)) }
}
