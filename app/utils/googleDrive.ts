const GSI_SCRIPT = 'https://accounts.google.com/gsi/client'
const API = 'https://www.googleapis.com'
// The app's own hidden folder: Aiscord can't see the user's other files, nor they this one
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const FILE_NAME = 'aiscord-backup.json'

export interface DriveToken {
  value: string
  expiresAt: number
}

declare global {
  interface Window {
    google?: any
  }
}

let script: Promise<void> | null = null

function loadGsi() {
  script ??= new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = GSI_SCRIPT
    el.onload = () => resolve()
    el.onerror = () => {
      script = null
      reject(new Error('구글 로그인을 불러오지 못했어요'))
    }
    document.head.append(el)
  })
  return script
}

/** Opens Google's popup, so call this from a click. There's no refresh token without a server. */
export async function requestDriveToken(clientId: string) {
  await loadGsi()
  return new Promise<DriveToken>((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response: any) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description ?? response.error ?? '구글 연결에 실패했어요'))
          return
        }
        resolve({
          value: response.access_token,
          expiresAt: Date.now() + Number(response.expires_in ?? 3600) * 1000,
        })
      },
      // Without this a closed popup leaves the promise waiting forever
      error_callback: (error: any) => {
        reject(new Error(error?.type === 'popup_closed' ? '구글 연결을 취소했어요' : '구글 로그인 창을 열지 못했어요'))
      },
    })
    client.requestAccessToken()
  })
}

async function drive(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  })
  if (!res.ok) {
    if (res.status === 401) throw new DriveAuthError()
    throw new Error(`구글 드라이브 요청이 실패했어요 (${res.status})`)
  }
  return res
}

export class DriveAuthError extends Error {
  constructor() {
    super('구글 연결이 만료됐어요. 다시 연결해 주세요')
  }
}

export async function findBackupFile(token: string) {
  const query = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='${FILE_NAME}'`,
    fields: 'files(id)',
  })
  const { files } = await (await drive(token, `/drive/v3/files?${query}`)).json() as { files: { id: string }[] }
  return files[0]?.id ?? null
}

export async function downloadBackup(token: string, fileId: string) {
  return (await drive(token, `/drive/v3/files/${fileId}?alt=media`)).text()
}

export async function uploadBackup(token: string, fileId: string | null, content: string) {
  let id = fileId
  if (!id) {
    const res = await drive(token, '/drive/v3/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] }),
    })
    id = (await res.json() as { id: string }).id
  }
  await drive(token, `/upload/drive/v3/files/${id}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: content,
  })
}
