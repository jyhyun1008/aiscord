export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: { enabled: false },
  devServer: { port: 3224 },
  runtimeConfig: {
    // NUXT_PUBLIC_GOOGLE_CLIENT_ID; empty hides Google Drive sync
    public: { googleClientId: '' },
  },
  css: ['~/assets/css/main.css', '~/assets/css/markdown.css'],
  app: {
    head: {
      title: 'Aiscord',
      htmlAttrs: { lang: 'ko' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#5865f2' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/icons/aiscord.svg' }],
    },
  },
})
