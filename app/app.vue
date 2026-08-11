<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <Toaster position="top-center" rich-colors />
  </div>
</template>

<script setup lang="ts">
import { toast } from 'vue-sonner'
import { Toaster } from '@/components/ui/sonner'
import 'vue-sonner/style.css'

/*
 * "Nova versão do APPingos disponível!"
 *
 * O único aviso do pedido de notificações que não passa pelo banco: quem sabe se
 * a pessoa está numa versão velha é o service worker dela, não o servidor. Com
 * `registerType: 'prompt'` no nuxt.config, `needRefresh` liga quando um SW novo
 * já foi baixado e está esperando para assumir.
 *
 * Toast persistente e com botão porque recarregar sozinho no meio de um
 * formulário perderia o que a pessoa estava digitando — e ela é quem escolhe a
 * hora.
 */
const { $pwa } = useNuxtApp()

watch(() => $pwa?.needRefresh, (precisa) => {
  if (!precisa) return

  toast('Nova versão do APPingos disponível!', {
    description: 'Recarregue para pegar as novidades.',
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: 'Atualizar',
      onClick: () => $pwa?.updateServiceWorker(),
    },
  })
})
</script>
