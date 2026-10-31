// Cache the app shell only. AI, Google Drive, and other external requests stay online.
const CACHE = 'aiscord-shell-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icons/aiscord.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png']
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('aiscord-shell-') && key !== CACHE).map(key => caches.delete(key)),
  )).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  const navigation = req.mode === 'navigate'
  const asset = url.pathname.startsWith('/_nuxt/')
  const shell = SHELL.includes(url.pathname)
  if (!navigation && !asset && !shell) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const key = navigation ? '/' : req
    if (asset) {
      const hit = await cache.match(key)
      if (hit) return hit
    }
    try {
      const res = await fetch(req)
      if (res.ok && res.type === 'basic') await cache.put(key, res.clone())
      return res
    } catch {
      return (await cache.match(key)) || Response.error()
    }
  })())
})
