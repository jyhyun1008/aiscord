import type { Message } from '~/composables/useChat'
import type { Profile, ThemeMode } from '~/composables/useUi'
import type { Project, Thread } from '~/composables/useWorkspace'
import type { Backup } from '~/utils/backup'
import type { DriveToken } from '~/utils/googleDrive'

/** Everything personal that travels with the data; the API key deliberately doesn't. */
interface AppSettings {
  changedAt: number
  me: Profile
  ai: Profile
  bookmarks: string[]
  summaryModel: string
  theme: ThemeMode
  accent: string
}

type AppBackup = Backup<Project, Thread, Message, AppSettings>

const LAST_SYNC_KEY = 'aiscord:last-sync'
const SETTINGS_STAMP_KEY = 'aiscord:settings-changed-at'
const TOKEN_KEY = 'aiscord:drive-token'
const SESSION_KEY = 'aiscord:google-session'
const UNSYNCED_KEY = 'aiscord:unsynced'
// Debounce edits; completed answers flush as soon as all streams finish.
const AUTO_SYNC_DELAY = 2000
const TOKEN_MARGIN = 60000

const status = reactive({
  syncing: false,
  /** Holds a usable token, so changes upload on their own */
  connected: false,
  lastSyncedAt: loadJson<number | null>(LAST_SYNC_KEY, null),
  /** Local changes Drive doesn't have yet */
  unsynced: loadJson(UNSYNCED_KEY, false),
})
// Kept across reloads; it only reaches this app's hidden Drive folder, and expires by itself
let session = loadJson<string | null>(SESSION_KEY, null)
let token = loadJson<DriveToken | null>(TOKEN_KEY, null)
let timer: ReturnType<typeof setTimeout> | undefined
let expiryTimer: ReturnType<typeof setTimeout> | undefined
let changes = 0
let settingsChangedAt = loadJson(SETTINGS_STAMP_KEY, 0)
// Settings arriving from another device aren't a change made here
let applyingSettings = false

export function useSync() {
  const ui = useUi()
  const chat = useChat()
  const workspace = useWorkspace()
  const models = useModels()
  const toast = useToast()
  const clientId = useRuntimeConfig().public.googleClientId as string

  const workerUrl = (useRuntimeConfig().public.googleSyncUrl as string).replace(/\/$/, '')
  const enabled = !!workerUrl || !!clientId
  const hasAccess = () => workerUrl ? !!session : hasToken()
  const hasToken = () => !!token && token.expiresAt - TOKEN_MARGIN > Date.now()

  /** Someone who uses Drive has changes that won't upload until they reconnect. */
  const needsReconnect = computed(() =>
    enabled && !!status.lastSyncedAt && status.unsynced && !status.connected)

  function dropToken() {
    session = null
    localStorage.removeItem(SESSION_KEY)
    token = null
    status.connected = false
    clearTimeout(expiryTimer)
    localStorage.removeItem(TOKEN_KEY)
  }

  function useToken(next: DriveToken) {
    token = next
    status.connected = true
    saveJson(TOKEN_KEY, next)
    clearTimeout(expiryTimer)
    // Fire on time rather than at the next change, so the indicator can't lag behind
    if (!workerUrl) expiryTimer = setTimeout(dropToken, next.expiresAt - TOKEN_MARGIN - Date.now())
  }

  function setUnsynced(value: boolean) {
    status.unsynced = value
    saveJson(UNSYNCED_KEY, value)
  }

  async function collect(): Promise<AppBackup> {
    const { projects, threads, deleted } = workspace.state
    const messages: Record<string, Message[]> = {}
    for (const thread of threads) {
      messages[thread.id] = chat.histories.get(thread.id) ?? await idbGet<Message[]>(thread.id) ?? []
    }
    const settings: AppSettings = {
      changedAt: settingsChangedAt,
      me: ui.me,
      ai: ui.ai,
      bookmarks: models.bookmarks.value,
      summaryModel: ui.summaryModel,
      theme: ui.theme,
      accent: ui.accent,
    }
    // Plain copies: reactive proxies can't go through IndexedDB
    return JSON.parse(JSON.stringify({ version: 1, exportedAt: Date.now(), projects, threads, deleted, messages, settings }))
  }

  async function applySettings(settings: AppSettings) {
    applyingSettings = true
    Object.assign(ui, {
      me: settings.me,
      ai: settings.ai,
      summaryModel: settings.summaryModel,
      theme: settings.theme,
      accent: settings.accent,
    })
    models.setBookmarks(settings.bookmarks)
    settingsChangedAt = settings.changedAt
    saveJson(SETTINGS_STAMP_KEY, settingsChangedAt)
    // The watcher that would call this a local change runs on the next tick
    await nextTick()
    applyingSettings = false
  }

  function markSettingsChanged() {
    if (applyingSettings) return
    settingsChangedAt = Date.now()
    saveJson(SETTINGS_STAMP_KEY, settingsChangedAt)
    schedule()
  }

  async function apply({ merged, fromRemote, settingsFromRemote }: ReturnType<typeof mergeBackups<Project, Thread, Message, AppSettings>>) {
    const kept = new Set(merged.threads.map(t => t.id))
    for (const thread of workspace.state.threads) {
      if (!kept.has(thread.id)) chat.dropHistory(thread.id)
    }
    for (const id of fromRemote) await chat.replaceHistory(id, merged.messages[id] ?? [])
    workspace.replaceAll(merged.projects, merged.threads, merged.deleted)
    if (settingsFromRemote) await applySettings(merged.settings!)
  }

  function ensureIdle() {
    if (chat.anyRunning.value) throw new Error('답변이 끝난 뒤에 다시 해 주세요')
  }

  /** Pull, merge, push. Needs a token already, so it can run without a click. */
  async function syncWithDrive(access: string) {
    const remoteId = await findBackupFile(access)
    const remoteText = remoteId ? await downloadBackup(access, remoteId) : null
    if (chat.anyRunning.value) { schedule(); return false }
    const local = await collect()
    if (chat.anyRunning.value) { schedule(); return false }
    const remote = remoteText ? parseBackup(remoteText) as AppBackup : { ...local, projects: [], threads: [], deleted: {}, messages: {} }
    const result = mergeBackups(dropUntouchedSeed(local, remote), remote)
    await apply(result)
    await uploadBackup(access, remoteId, JSON.stringify(result.merged))
    status.lastSyncedAt = Date.now()
    saveJson(LAST_SYNC_KEY, status.lastSyncedAt)
    return true
  }

  async function run(access: string) {
    status.syncing = true
    const seen = changes
    try {
      if (workerUrl) {
        if (!session) throw new DriveAuthError()
        const next = await googleSessionToken(workerUrl, session)
        // Worker renews expired Google access tokens using its stored refresh token.
        token = next
        access = next.value
      }
      if (!await syncWithDrive(access)) return
      // An edit made while uploading isn't in the file
      if (changes === seen) setUnsynced(false)
    }
    catch (e) {
      if (e instanceof DriveAuthError) dropToken()
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
      if (workerUrl) {
        if (!session) {
          session = await connectGoogleSession(workerUrl)
          saveJson(SESSION_KEY, session)
        }
        status.connected = true
      }
      else if (!hasToken()) useToken(await requestDriveToken(clientId))
      await run(token?.value ?? '')
      toast.show('구글 드라이브와 동기화했어요')
    }
    catch (e) {
      toast.error(e)
    }
  }

  /** On opening the app: a token that's still good needs no click. */
  function resume() {
    if (workerUrl) {
      status.connected = !!session
      if (session) run('').catch(toast.error)
      return
    }
    if (!clientId || !token) return
    if (!hasToken()) return dropToken()
    useToken(token)
    run(token.value).catch(toast.error)
  }

  /** Debounce local edits while a Google connection is available. */
  function schedule() {
    changes++
    if (!status.unsynced) setUnsynced(true)
    clearTimeout(timer)
    if (!hasAccess()) return
    timer = setTimeout(flush, AUTO_SYNC_DELAY)
  }

  function flush() {
    clearTimeout(timer)
    if (!status.unsynced || !hasAccess()) return
    if (status.syncing || chat.anyRunning.value) {
      timer = setTimeout(flush, AUTO_SYNC_DELAY)
      return
    }
    run(token?.value ?? '').catch(toast.error)
  }

  async function disconnect() {
    try {
      if (workerUrl && session) await disconnectGoogleSession(workerUrl, session)
      clearTimeout(timer)
      dropToken()
      toast.show('구글 연결을 해제했어요')
    }
    catch (e) { toast.error(e) }
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

  return { status, enabled, persistent: !!workerUrl, needsReconnect, syncNow, disconnect, resume, schedule, flush, markSettingsChanged, exportFile, importFile }
}
