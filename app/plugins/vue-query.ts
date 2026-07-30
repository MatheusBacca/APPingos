import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'

export default defineNuxtPlugin((nuxtApp) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Uso de casal: dois dispositivos, mudanças pouco frequentes.
        // 1 min evita refetch a cada troca de aba sem deixar dado velho na tela.
        staleTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  })

  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient })
})
