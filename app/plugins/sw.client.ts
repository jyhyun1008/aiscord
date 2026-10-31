export default defineNuxtPlugin(() => {
  if (import.meta.dev || !('serviceWorker' in navigator)) return
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.warn('Aiscord service worker registration failed:', error)
    })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
})
