import type { PresetId } from '~/utils/context'

export interface Project {
  id: string
  name: string
  /** Sent as the system message of every thread in this project */
  instructions: string
  /** Facts saved from conversations; every thread in the project gets them too */
  memo?: string
  /** Model new threads start with */
  model: string
  /** How much to spend on each question; unset means the default */
  preset?: PresetId
  /** Last edit, for choosing between copies when syncing; the seed project has none */
  changedAt?: number
}

export interface Thread {
  id: string
  projectId: string
  title: string
  model: string
  createdAt: number
  updatedAt: number
  /** Card preview of the last message, so the gallery needn't load every history */
  preview: string
  previewRole: 'user' | 'assistant' | null
  messageCount: number
  /** Totals over the current history; threads from before these existed get them on demand */
  tokens?: number
  cost?: number
  /** Stands in for every message up to and including `summarizedUntil` when asking the model */
  summary?: string
  summarizedUntil?: string
  /** Last change of any kind, for syncing; `updatedAt` only moves for new messages and orders the list */
  changedAt?: number
}

interface Workspace {
  projects: Project[]
  threads: Thread[]
  /** When things were removed, so syncing doesn't bring them back */
  deleted: Record<string, number>
}

const KEY = 'aiscord:workspace'

function seed(): Workspace {
  return {
    projects: [{ id: newId(), name: '일반', instructions: '', model: DEFAULT_MODEL }],
    threads: [],
    deleted: {},
  }
}

const loaded = loadJson<Workspace | null>(KEY, null) ?? seed()
const state = reactive<Workspace>({ ...loaded, deleted: loaded.deleted ?? {} })
/** Moves on every local change; syncing watches it */
const revision = ref(0)

function save() {
  saveJson(KEY, state)
  revision.value++
}

if (import.meta.client) {
  // The seed project's id ends up in the URL, so it has to survive a reload
  saveJson(KEY, state)
  // Another tab's write would otherwise be overwritten by this tab's stale copy
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return
    Object.assign(state, JSON.parse(e.newValue))
  })
}

export function useWorkspace() {
  const threadsOf = (projectId: string) =>
    state.threads.filter(t => t.projectId === projectId).sort((a, b) => b.updatedAt - a.updatedAt)

  function createProject(fields: Omit<Project, 'id'>) {
    const project = { id: newId(), ...fields, changedAt: Date.now() }
    state.projects.push(project)
    save()
    return project
  }

  function updateProject(id: string, fields: Partial<Project>) {
    const project = state.projects.find(p => p.id === id)
    if (!project) return
    Object.assign(project, fields, { changedAt: Date.now() })
    save()
  }

  function addMemo(id: string, text: string) {
    const project = state.projects.find(p => p.id === id)
    if (!project) return
    project.memo = [project.memo?.trim(), text].filter(Boolean).join('\n')
    project.changedAt = Date.now()
    save()
  }

  function moveProject(from: number, to: number) {
    if (to < 0 || to >= state.projects.length) return
    state.projects.splice(to, 0, state.projects.splice(from, 1)[0]!)
    save()
  }

  /** Removes the project and hands back its thread ids so their histories can be dropped too. */
  function removeProject(id: string) {
    const removed = state.threads.filter(t => t.projectId === id).map(t => t.id)
    for (const key of [id, ...removed]) state.deleted[key] = Date.now()
    state.projects = state.projects.filter(p => p.id !== id)
    state.threads = state.threads.filter(t => t.projectId !== id)
    save()
    return removed
  }

  function createThread(projectId: string, title: string, model: string) {
    const now = Date.now()
    const thread: Thread = {
      id: newId(),
      projectId,
      title,
      model,
      createdAt: now,
      updatedAt: now,
      preview: '',
      previewRole: null,
      messageCount: 0,
      tokens: 0,
      cost: 0,
      changedAt: now,
    }
    state.threads.push(thread)
    save()
    return thread
  }

  function updateThread(id: string, fields: Partial<Thread>) {
    const thread = state.threads.find(t => t.id === id)
    if (!thread) return
    Object.assign(thread, fields, { changedAt: Date.now() })
    save()
  }

  function removeThreadMeta(id: string) {
    state.threads = state.threads.filter(t => t.id !== id)
    state.deleted[id] = Date.now()
    save()
  }

  /** Take in a merged copy; not a local change, so it doesn't trigger another sync. */
  function replaceAll(projects: Project[], threads: Thread[], deleted: Record<string, number>) {
    Object.assign(state, { projects, threads, deleted })
    saveJson(KEY, state)
  }

  return {
    state,
    revision,
    threadsOf,
    createProject,
    updateProject,
    addMemo,
    moveProject,
    removeProject,
    createThread,
    updateThread,
    removeThreadMeta,
    replaceAll,
  }
}
