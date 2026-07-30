import fs from 'node:fs'
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // SPA + PWA. Reversível: ligar SSR depois se quisermos link com preview.
  ssr: false,

  modules: [
    '@nuxtjs/supabase',
    '@pinia/nuxt',
    'shadcn-nuxt',
    '@vite-pwa/nuxt',
  ],

  css: ['~/assets/css/tailwind.css'],

  vite: {
    plugins: [tailwindcss()],

    // Sem isto o build quebra em todo componente que faz `defineProps<TipoImportado>()`
    // — praticamente todo shadcn-vue. O compiler-sfc precisa ler os arquivos de tipo
    // e, sob o Vite 8, não recebe acesso ao fs por conta própria.
    vue: {
      script: {
        fs: {
          fileExists: (file: string) => fs.existsSync(file),
          readFile: (file: string) => {
            try {
              return fs.readFileSync(file, 'utf-8')
            }
            catch {
              return undefined
            }
          },
          realpath: (file: string) => fs.realpathSync(file),
        },
      },
    },
  },

  shadcn: {
    prefix: '',
    componentDir: '@/components/ui',
  },

  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirmar',
      exclude: ['/cadastro', '/convite/**'],
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'pt-BR' },
      title: 'APPingos',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'O nosso app: orçamento, filmes, livros, viagens, objetivos e treinos.' },
        { name: 'theme-color', content: '#0f172a' },
        // iOS: sem isto o app instalado não abre em standalone
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'APPingos' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/favicon-192.png' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
      ],
    },
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'APPingos',
      short_name: 'APPingos',
      description: 'O nosso app: orçamento, filmes, livros, viagens, objetivos e treinos.',
      lang: 'pt-BR',
      start_url: '/',
      display: 'standalone',
      background_color: '#0b1220',
      theme_color: '#0f172a',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      navigateFallback: '/',
    },
    client: {
      installPrompt: true,
    },
    devOptions: {
      enabled: false,
      type: 'module',
    },
  },

  runtimeConfig: {
    // servidor apenas — a chave do TMDB nunca vai para o client
    tmdbApiKey: '',
  },
})
