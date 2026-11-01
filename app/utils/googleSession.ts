import { DriveAuthError, type DriveToken } from '~/utils/googleDrive'

export function connectGoogleSession(base: string): Promise<string> {
  const nonce = crypto.randomUUID()
  const workerOrigin = new URL(base).origin
  // Open synchronously in the click handler, before awaiting anything.
  const popup = window.open(`${base}/auth/start?${new URLSearchParams({ origin: location.origin, nonce })}`, 'aiscord-google', 'width=520,height=680')
  if (!popup) return Promise.reject(new Error('구글 로그인 창을 허용해 주세요'))
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, session?: string) => {
      clearInterval(poll)
      clearTimeout(timeout)
      window.removeEventListener('message', receive)
      popup.close()
      if (error) reject(error)
      else resolve(session!)
    }
    const receive = (event: MessageEvent) => {
      if (event.origin !== workerOrigin || event.source !== popup || event.data?.type !== 'aiscord:google' || event.data.nonce !== nonce) return
      if (typeof event.data.session === 'string') finish(undefined, event.data.session)
      else finish(new Error(event.data.error || '구글 연결에 실패했어요'))
    }
    window.addEventListener('message', receive)
    const poll = setInterval(() => { if (popup.closed) finish(new Error('구글 연결 창을 닫았어요')) }, 1000)
    const timeout = setTimeout(() => finish(new Error('연결 시간이 지났어요. 다시 시도해 주세요')), 10 * 60 * 1000)
  })
}

export async function googleSessionToken(base: string, session: string): Promise<DriveToken> {
  const response = await fetch(`${base}/session`, { method: 'POST', headers: { Authorization: `Bearer ${session}` } })
  if (response.status === 401) throw new DriveAuthError()
  if (!response.ok) throw new Error('구글 연결 서비스에 접속하지 못했어요. 잠시 후 다시 시도해 주세요')
  return response.json()
}

export async function disconnectGoogleSession(base: string, session: string) {
  const response = await fetch(`${base}/session`, { method: 'DELETE', headers: { Authorization: `Bearer ${session}` } })
  if (!response.ok && response.status !== 401) throw new Error('구글 연결 해제에 실패했어요. 다시 시도해 주세요')
}
