import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'

const { version } = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

export default defineNuxtConfig({
  /*
   * `/versao.json` — a única forma de o build VELHO saber o número do novo.
   *
   * O toast de "chegou versão nova" roda no código que já está aberto no
   * navegador da pessoa, e para ele `VERSAO_ATUAL` é a versão que ela está
   * deixando. Quem conhece a versão nova é o servidor, então ela vai para um
   * arquivo que o app busca na hora do aviso (ver `versaoQueChegou` em app.vue).
   *
   * Escrito no `nitro:build:public-assets`, e não em `public/`: é valor derivado
   * do `package.json`, e um arquivo versionado no git seria mais uma ponta para
   * `npm run release` manter em dia — ou para alguém esquecer.
   *
   * Fora dos `globPatterns` do Workbox (que só pega js/css/html/svg/png/ico/woff2):
   * precacheado, ele responderia com a versão velha, que é justamente o valor que
   * não serve. No `nuxt dev` ele não existe, e o toast cai no texto sem número.
   */
  hooks: {
    'nitro:build:public-assets': (nitro) => {
      fs.writeFileSync(
        path.join(nitro.options.output.publicDir, 'versao.json'),
        `${JSON.stringify({ versao: version })}\n`,
      )
    },
  },

  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // SPA + PWA. Reversível: ligar SSR depois se quisermos link com preview.
  ssr: false,

  /*
   * Deploy novo com o app aberto não pode mais virar tela de 500.
   *
   * Num SPA a aba carrega o app uma vez e vai pedindo os pedaços conforme
   * navega. Quando um deploy troca o build, os arquivos que aquela aba ainda ia
   * pedir deixam de existir com aquele nome, e o pedido seguinte falha em
   * "Failed to fetch dynamically imported module" — 500 na cara de quem estava
   * usando. Aqui isso é o caso NORMAL, não a borda: o app é PWA, fica instalado
   * no celular dos dois e a aba sobrevive dias.
   *
   * O padrão do Nuxt (`automatic`) só recupera quando o erro acontece ao
   * NAVEGAR. `automatic-immediate` recupera também na rota em que a pessoa já
   * está, que é onde este erro apareceu de verdade. E acrescenta o gatilho que
   * de fato resolve: recarregar quando o manifesto de build muda, ou seja, no
   * instante em que a aba descobre que existe um deploy novo.
   *
   * Não é laço de recarga: `reloadNuxtApp` grava um carimbo em `sessionStorage`
   * e recusa recarregar o mesmo caminho duas vezes em 10 segundos.
   */
  experimental: {
    emitRouteChunkError: 'automatic-immediate',
  },

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
      // `/descadastrar` fora do login pelo mesmo motivo de `/convite`: o link
      // vem de fora do app (aqui, do rodapé de um e-mail) e precisa funcionar
      // para quem abriu no celular sem sessão. Ver app/pages/descadastrar.vue.
      exclude: ['/cadastro', '/convite/**', '/descadastrar'],
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
    /*
     * 'prompt', e não 'autoUpdate', por causa do "Nova versão do APPingos
     * disponível!" — o único aviso do pedido que NÃO vira linha no banco.
     *
     * A informação nasce no navegador de cada pessoa (qual service worker ela já
     * baixou?), não no servidor: gravar isso em `notificacao` avisaria também
     * quem já está na versão nova, e não haveria como marcar lida por deploy.
     * Só que `autoUpdate` atualiza sozinho e por isso NUNCA expõe `needRefresh`
     * — sem trocar para 'prompt' não há o que anunciar. O custo é real e é uma
     * troca consciente: quem ignorar o toast fica na versão velha até recarregar.
     */
    registerType: 'prompt',
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
      // Sem isto, uma versão nova só é notada num recarregamento — e um PWA
      // instalado passa dias sem recarregar. De hora em hora o SW confere.
      periodicSyncForUpdates: 3600,
    },
    devOptions: {
      enabled: false,
      type: 'module',
    },
  },

  /*
   * Duas chaves do Google, e não uma, porque elas têm naturezas opostas.
   *
   * A do Places vive atrás de `server/api/lugares/*` e nunca sai do servidor —
   * como a do TMDB. A do Embed vai no `src` do iframe, então é inerentemente
   * pública: não há como esconder, e fingir que dá seria pior que assumir. O que
   * a protege não é o segredo, é a restrição por HTTP referrer no Google Cloud
   * (localhost + o domínio do Vercel) somada ao limite de cota — por isso ela é
   * limitada à Maps Embed API e a nada mais.
   */
  runtimeConfig: {
    // servidor apenas — a chave do TMDB nunca vai para o client
    tmdbApiKey: '',
    googlePlacesApiKey: '',
    // Idem: o secret do Spotify é trocado por um token dentro do servidor, em
    // `server/utils/spotify.ts`, e nem ele nem o token chegam ao navegador.
    spotifyClientId: '',
    spotifyClientSecret: '',
    public: {
      googleMapsEmbedKey: '',
    },
  },
})
