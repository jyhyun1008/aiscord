const TTL = 60 * 60 * 24 * 180
const random = () => crypto.randomUUID() + crypto.randomUUID()
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('')

async function cryptKey(secret) {
  return crypto.subtle.importKey('raw', Uint8Array.from(atob(secret), c => c.charCodeAt(0)), 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function seal(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptKey(secret), new TextEncoder().encode(JSON.stringify(value)))
  return JSON.stringify({ iv: btoa(String.fromCharCode(...iv)), data: btoa(String.fromCharCode(...new Uint8Array(bytes))) })
}
export async function unseal(value, secret) {
  const { iv, data } = JSON.parse(value)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(atob(iv), c => c.charCodeAt(0)) }, await cryptKey(secret), Uint8Array.from(atob(data), c => c.charCodeAt(0)))
  return JSON.parse(new TextDecoder().decode(plain))
}
async function googleToken(env, fields) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...fields }),
  })
  const result = await response.json()
  return { ok: response.ok, ...result }
}
function popup(origin, payload) {
  // Escape '<' so neither an error nor a configuration value can terminate the script.
  const json = value => JSON.stringify(value).replaceAll('<', '\\u003c')
  return new Response(`<!doctype html><meta charset="utf-8"><title>구글 연결</title><p>이 창을 닫고 앱으로 돌아가세요.</p><script>if(window.opener)window.opener.postMessage(${json(payload)},${json(origin)});window.close()</script>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" },
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origins = (env.APP_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean)
    const origin = request.headers.get('Origin')
    const cors = { 'Access-Control-Allow-Origin': origins.includes(origin) ? origin : 'null', 'Vary': 'Origin', 'Cache-Control': 'no-store' }
    const json = (body, status = 200) => Response.json(body, { status, headers: cors })
    try {
      if (url.pathname === '/auth/start' && request.method === 'GET') {
        const appOrigin = url.searchParams.get('origin')
        const nonce = url.searchParams.get('nonce')
        if (!origins.includes(appOrigin) || !nonce || nonce.length > 128) return json({ error: 'Invalid origin or nonce' }, 400)
        const state = random()
        const verifier = random()
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
        const challenge = btoa(String.fromCharCode(...digest)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
        await env.SESSIONS.put(`state:${await hash(state)}`, JSON.stringify({ origin: appOrigin, nonce, verifier }), { expirationTtl: 600 })
        const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
        auth.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: env.REDIRECT_URI, response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.appdata', access_type: 'offline', prompt: 'consent select_account', state, code_challenge: challenge, code_challenge_method: 'S256' }).toString()
        return Response.redirect(auth.toString(), 302)
      }
      if (url.pathname === '/auth/callback' && request.method === 'GET') {
        const state = url.searchParams.get('state')
        if (!state || state.length > 128) return json({ error: 'Invalid state' }, 400)
        const key = `state:${await hash(state)}`
        const pending = await env.SESSIONS.get(key, 'json')
        if (!pending) return json({ error: 'Login expired; please try again' }, 400)
        await env.SESSIONS.delete(key)
        const fail = () => popup(pending.origin, { type: 'aiscord:google', nonce: pending.nonce, error: '구글 연결을 완료하지 못했어요. 다시 시도해 주세요' })
        const code = url.searchParams.get('code')
        if (!code || url.searchParams.has('error')) return fail()
        const result = await googleToken(env, { grant_type: 'authorization_code', code, redirect_uri: env.REDIRECT_URI, code_verifier: pending.verifier })
        if (!result.ok || !result.refresh_token || !result.access_token) return fail()
        const session = random()
        await env.SESSIONS.put(`session:${await hash(session)}`, await seal({ refresh: result.refresh_token, access: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 }, env.SESSION_ENCRYPTION_KEY), { expirationTtl: TTL })
        return popup(pending.origin, { type: 'aiscord:google', nonce: pending.nonce, session })
      }
      if (!origins.includes(origin)) return json({ error: 'Origin denied' }, 403)
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Max-Age': '600' } })
      if (url.pathname !== '/session') return json({ error: 'Not found' }, 404)
      if (!['POST', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed' }, 405)
      const bearer = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9-]{72})$/)?.[1]
      if (!bearer) return json({ error: 'Reconnect required' }, 401)
      const key = `session:${await hash(bearer)}`
      const stored = await env.SESSIONS.get(key)
      if (!stored) return json({ error: 'Reconnect required' }, 401)
      const data = await unseal(stored, env.SESSION_ENCRYPTION_KEY)
      if (request.method === 'DELETE') {
        await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', body: new URLSearchParams({ token: data.refresh }) })
        await env.SESSIONS.delete(key)
        return json({ disconnected: true })
      }
      if (data.expiresAt < Date.now() + 60000) {
        const result = await googleToken(env, { grant_type: 'refresh_token', refresh_token: data.refresh })
        if (!result.ok) {
          if (result.error === 'invalid_grant') {
            await env.SESSIONS.delete(key)
            return json({ error: 'Reconnect required' }, 401)
          }
          return json({ error: 'Google temporarily unavailable' }, 502)
        }
        data.access = result.access_token
        data.expiresAt = Date.now() + result.expires_in * 1000
        if (result.refresh_token) data.refresh = result.refresh_token
      }
      await env.SESSIONS.put(key, await seal(data, env.SESSION_ENCRYPTION_KEY), { expirationTtl: TTL })
      return json({ value: data.access, expiresAt: data.expiresAt })
    }
    catch {
      return json({ error: 'Google connection service unavailable' }, 502)
    }
  },
}
