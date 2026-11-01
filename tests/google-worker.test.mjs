import test from 'node:test'
import assert from 'node:assert/strict'
import worker, { seal, unseal } from '../worker/index.mjs'

const secret = btoa('x'.repeat(32))
const origin = 'https://app.example'
function setup() {
  const map = new Map()
  return { map, env: {
    APP_ORIGINS: origin, GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret', SESSION_ENCRYPTION_KEY: secret,
    REDIRECT_URI: 'https://worker.example/auth/callback',
    SESSIONS: {
      async put(k, v) { map.set(k, v) },
      async get(k, type) { const v = map.get(k); return v && type === 'json' ? JSON.parse(v) : v ?? null },
      async delete(k) { map.delete(k) },
    },
  } }
}
const digest = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex')
const session = 'a'.repeat(72)
const request = (method = 'POST', from = origin) => new Request('https://worker.example/session', { method, headers: { Origin: from, Authorization: `Bearer ${session}` } })

test('refresh tokens are encrypted and tampering is rejected', async () => {
  const value = await seal({ refresh: 'private-refresh' }, secret)
  assert.ok(!value.includes('private-refresh'))
  assert.deepEqual(await unseal(value, secret), { refresh: 'private-refresh' })
  await assert.rejects(unseal(value, btoa('y'.repeat(32))))
})

test('authorization restricts origins and uses offline access and PKCE', async () => {
  const { env } = setup()
  const denied = await worker.fetch(new Request('https://worker.example/auth/start?origin=https://evil.example&nonce=abc'), env)
  assert.equal(denied.status, 400)
  const response = await worker.fetch(new Request(`https://worker.example/auth/start?origin=${origin}&nonce=abc`), env)
  const location = new URL(response.headers.get('Location'))
  assert.equal(location.searchParams.get('access_type'), 'offline')
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256')
  assert.ok(location.searchParams.get('state'))
  assert.equal((await worker.fetch(request('POST', 'https://evil.example'), env)).status, 403)
  assert.equal((await worker.fetch(request(), env)).status, 401)
})

test('valid cached tokens are returned without exposing refresh token', async () => {
  const { env } = setup()
  await env.SESSIONS.put(`session:${await digest(session)}`, await seal({ access: 'access', refresh: 'private', expiresAt: Date.now() + 300000 }, secret))
  const response = await worker.fetch(request(), env)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.value, 'access')
  assert.equal(body.refresh, undefined)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
})

test('expired access token refreshes; revoked authorization removes session', async t => {
  const { env, map } = setup()
  const key = `session:${await digest(session)}`
  await env.SESSIONS.put(key, await seal({ access: 'old', refresh: 'private', expiresAt: 0 }, secret))
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.body.get('grant_type'), 'refresh_token')
    return Response.json({ access_token: 'new', expires_in: 3600 })
  })
  assert.equal((await (await worker.fetch(request(), env)).json()).value, 'new')
  await env.SESSIONS.put(key, await seal({ access: 'old', refresh: 'private', expiresAt: 0 }, secret))
  globalThis.fetch = async () => Response.json({ error: 'invalid_grant' }, { status: 400 })
  assert.equal((await worker.fetch(request(), env)).status, 401)
  assert.equal(map.has(key), false)
})

test('callback rejects unknown state before exchanging code', async () => {
  const { env } = setup()
  const response = await worker.fetch(new Request('https://worker.example/auth/callback?state=unknown&code=code'), env)
  assert.equal(response.status, 400)
})

test('callback exchanges the code, encrypts credentials, and returns only a session', async t => {
  const { env, map } = setup()
  const response = await worker.fetch(new Request(`https://worker.example/auth/start?origin=${origin}&nonce=browser-nonce`), env)
  const state = new URL(response.headers.get('Location')).searchParams.get('state')
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.body.get('grant_type'), 'authorization_code')
    assert.equal(init.body.get('redirect_uri'), env.REDIRECT_URI)
    assert.ok(init.body.get('code_verifier'))
    return Response.json({ access_token: 'google-access', refresh_token: 'google-refresh', expires_in: 3600 })
  })
  const callback = new Request(`https://worker.example/auth/callback?state=${state}&code=google-code`)
  const result = await worker.fetch(callback, env)
  const html = await result.text()
  assert.equal(result.status, 200)
  assert.ok(html.includes('browser-nonce'))
  assert.ok(html.includes(origin))
  assert.ok(!html.includes('google-refresh'))
  assert.ok(!html.includes('google-access'))
  const stored = [...map.entries()].find(([key]) => key.startsWith('session:'))?.[1]
  assert.equal((await unseal(stored, secret)).refresh, 'google-refresh')
  assert.equal((await worker.fetch(callback, env)).status, 400)
})

test('disconnect revokes Google authorization and removes the session', async t => {
  const { env, map } = setup()
  const key = `session:${await digest(session)}`
  await env.SESSIONS.put(key, await seal({ refresh: 'private' }, secret))
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://oauth2.googleapis.com/revoke')
    assert.equal(init.body.get('token'), 'private')
    return new Response(null)
  })
  assert.equal((await worker.fetch(request('DELETE'), env)).status, 200)
  assert.equal(map.has(key), false)
})
