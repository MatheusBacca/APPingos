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
import { VERSAO_ATUAL, textoDeNovaVersao } from '~/changelog'

/*
 * "Uma nova versão do APPingos chegou!"
 *
 * O único aviso do app que não passa pelo banco: quem sabe se a pessoa está numa
 * versão velha é o service worker dela, não o servidor. Com `registerType:
 * 'prompt'` no nuxt.config, `needRefresh` liga quando um SW novo já foi baixado
 * e está esperando para assumir.
 *
 * Toast persistente e com botão porque recarregar sozinho no meio de um
 * formulário perderia o que a pessoa estava digitando — e ela é quem escolhe a
 * hora.
 *
 * É irmão da notificação de release, não substituto: aquela conta O QUE chegou e
 * espera na caixa; esta diz que o build aberto ficou velho e some ao atualizar.
 */
const { $pwa } = useNuxtApp()

/**
 * A versão que está ESPERANDO, e não a que está rodando.
 *
 * Este código é o do build VELHO — `VERSAO_ATUAL` aqui é a versão que a pessoa
 * está deixando para trás, e anunciá-la no toast seria dizer o número errado
 * justamente na frase que existe para dar a novidade. Quem sabe a versão nova é
 * o servidor, então o número vem de `/versao.json`, escrito no build (ver o hook
 * em nuxt.config.ts).
 *
 * `cache: 'no-store'` e nada de precache: o arquivo não entra nos `globPatterns`
 * do Workbox de propósito — precacheado, ele responderia com a versão velha, que
 * é exatamente o valor que não serve aqui.
 *
 * Falhou (offline, dev server, deploy no meio do caminho), ou veio igual à que já
 * está rodando? Cai no texto sem número. Um toast sem o número continua útil; um
 * toast com o número errado, não.
 */
async function versaoQueChegou(): Promise<string | null> {
  try {
    const r = await fetch('/versao.json', { cache: 'no-store' })
    if (!r.ok) return null

    const { versao } = await r.json() as { versao?: string }
    return versao && versao !== VERSAO_ATUAL ? versao : null
  }
  catch {
    return null
  }
}

watch(() => $pwa?.needRefresh, async (precisa) => {
  if (!precisa) return

  const { titulo, descricao } = textoDeNovaVersao(await versaoQueChegou())

  toast(titulo, {
    description: descricao,
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: 'Atualizar',
      onClick: () => $pwa?.updateServiceWorker(),
    },
  })
})
</script>
