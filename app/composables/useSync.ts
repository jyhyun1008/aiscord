import type { Message } from '~/composables/useChat'
import type { Project, Thread } from '~/composables/useWorkspace'
import type { Backup } from '~/utils/backup'
import type { DriveToken } from '~/utils/googleDrive'

type AppBackup = Backup<Project, Thread, Message>

const LAST_SYNC_KEY = 'aiscord:last-sync'
// Long enough that a conversation in progress isn't uploaded after every answer
const AUTO_SYNC_DELAY = 30000
const TOKEN_MARGIN = 60000

const status = reactive({
  syncing: false,
  /** Holds a usable token, so changes upload on their own */
  connected: false,
  lastSyncedAt: loadJson<number | null>(LAST_SYNC_KEY, null),
})
let token: DriveToken | null = null
let timer: ReturnType<typeof setTimeout> | undefined

export function useSync() {
  const ui = useUi()
  const chat = useChat()
  const workspace = useWorkspace()
  const toast = useToast()
  const clientId = useRuntimeConfig().public.googleClientId as string

  const hasToken = () => !!token && token.expiresAt - TOKEN_MARGIN > Date.now()

  async function collect(): Promise<AppBackup> {
    const { projects, threads, deleted } = workspace.state
    const messages: Record<string, Message[]> = {}
    for (const thread of threads) {
      messages[thread.id] = chat.histories.get(thread.id) ?? await idbGet<Message[]>(thread.id) ?? []
    }
    // Plain copies: reactive proxies can't go through IndexedDB
    return JSON.parse(JSON.stringify({ version: 1, exportedAt: Date.now(), projects, threads, deleted, messages }))
  }

  async function apply({ merged, fromRemote }: ReturnType<typeof mergeBackups<Project, Thread, Message>>) {
    const kept = new Set(merged.threads.map(t => t.id))
    for (const thread of workspace.state.threads) {
      if (!kept.has(thread.id)) chat.dropHistory(thread.id)
    }
    for (const id of fromRemote) await chat.replaceHistory(id, merged.messages[id] ?? [])
    workspace.replaceAll(merged.projects, merged.threads, merged.deleted)
  }

  function ensureIdle() {
    if (chat.anyRunning.value) throw new Error('답변이 끝난 뒤에 다시 해 주세요')
  }

  /** Pull, merge, push. Needs a token already, so it can run without a click. */
  async function syncWithDrive(access: string) {
    const remoteId = await findBackupFile(access)
    const remoteText = remoteId ? await downloadBackup(access, remoteId) : null
    const local = await collect()
    const remote = remoteText ? parseBackup(remoteText) as AppBackup : { ...local, projects: [], threads: [], deleted: {}, messages: {} }
    const result = mergeBackups(dropUntouchedSeed(local, remote), remote)
    await apply(result)
    await uploadBackup(access, remoteId, JSON.stringify(result.merged))
    status.lastSyncedAt = Date.now()
    saveJson(LAST_SYNC_KEY, status.lastSyncedAt)
  }

  async function run(access: string) {
    status.syncing = true
    try {
      await syncWithDrive(access)
    }
    catch (e) {
      if (e instanceof DriveAuthError) {
        token = null
        status.connected = false
      }
      throw e
    }
    finally {
      status.syncing = false
    }
  }

  /** From a click: the only place Google's popup may open. */
  async function syncNow() {
    if (status.syncing) return
    try {
      ensureIdle()
      if (!hasToken()) {
        token = await requestDriveToken(clientId)
        status.connected = true
      }
      await run(token!.value)
      toast.show('구글 드라이브와 동기화했어요')
    }
    catch (e) {
      toast.error(e)
    }
  }

  /** Upload a little after changes stop, for as long as the current token lasts. */
  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (!hasToken()) {
        status.connected = false
        return
      }
      if (status.syncing || chat.anyRunning.value) return schedule()
      run(token!.value).catch(toast.error)
    }, AUTO_SYNC_DELAY)
  }

  async function exportFile() {
    const data = await collect()
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    // sv formats as YYYY-MM-DD in the user's own time zone
    link.download = `aiscord-backup-${new Date().toLocaleDateString('sv')}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importFile(file: File) {
    try {
      ensureIdle()
      const remote = parseBackup(await file.text()) as AppBackup
      const local = await collect()
      await apply(mergeBackups(dropUntouchedSeed(local, remote), remote))
      toast.show('백업을 가져왔어요')
    }
    catch (e) {
      toast.error(e)
    }
  }

  return { status, enabled: !!clientId, syncNow, schedule, exportFile, importFile }
}
