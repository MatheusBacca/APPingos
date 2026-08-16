<script setup lang="ts">
/**
 * O que cada pessoa do espaço está ouvindo, na barra lateral.
 *
 * É a única informação do app que envelhece em segundos, e por isso ela vive
 * onde a pessoa já está olhando — abaixo do nome do espaço — em vez de numa
 * tela que é preciso abrir.
 *
 * O polling mora aqui (`useEscutaViva`) porque este componente existe enquanto
 * o app existe: sai da tela, para de perguntar.
 */
import { MusicIcon } from '@lucide/vue'
import { useIntervalFn } from '@vueuse/core'
import type { Membro } from '~/composables/useMembros'
import { useMembros } from '~/composables/useMembros'
import { useEscutaDoEspaco, useEscutaViva } from '~/composables/useSpotify'
import { useUsuarioId } from '~/composables/useUsuarioId'

const props = withDefaults(defineProps<{ compacto?: boolean }>(), { compacto: false })

const euId = useUsuarioId()
const { data: membros } = useMembros()
const { data: escutas } = useEscutaDoEspaco()

useEscutaViva()

/**
 * Depois de dois minutos sem notícia, a faixa deixa de ser "agora".
 *
 * Sem este corte a tela congelaria na última música para sempre — e diria "está
 * ouvindo" sobre alguém que fechou o Spotify há horas.
 */
const LIMITE_MS = 2 * 60 * 1000

const agora = ref(Date.now())
// O relógio precisa andar para a linha sumir sozinha; sem isto ela só sairia
// no próximo dado que chegasse.
useIntervalFn(() => { agora.value = Date.now() }, 30_000)

interface LinhaEscuta {
  membro: Membro
  titulo: string
  artistas: string | null
  capaUrl: string | null
  url: string | null
}

const linhas = computed<LinhaEscuta[]>(() => {
  const porUsuario = new Map((escutas.value ?? []).map(e => [e.user_id, e]))

  return (membros.value ?? [])
    .map((membro) => {
      const escuta = porUsuario.get(membro.user_id)
      if (!escuta?.tocando || !escuta.titulo) return null

      const idade = agora.value - new Date(escuta.atualizado_em).getTime()
      if (idade > LIMITE_MS) return null

      return {
        membro,
        titulo: escuta.titulo,
        artistas: escuta.artistas,
        capaUrl: escuta.capa_url,
        url: escuta.url_spotify,
      }
    })
    .filter((l): l is LinhaEscuta => l !== null)
})

function primeiroNome(membro: Membro): string {
  return membro.exibicao.split(' ')[0] || membro.exibicao
}
</script>

<template>
  <!-- Nada tocando: o bloco some inteiro, em vez de virar uma caixa vazia. -->
  <div v-if="linhas.length" class="space-y-1.5">
    <component
      :is="linha.url ? 'a' : 'div'"
      v-for="linha in linhas"
      :key="linha.membro.user_id"
      :href="linha.url ?? undefined"
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center gap-2 rounded-md border bg-card/60 p-1.5 transition-colors hover:bg-muted/60"
      :title="`${primeiroNome(linha.membro)} está ouvindo ${linha.titulo}${linha.artistas ? ` — ${linha.artistas}` : ''}`"
    >
      <span class="size-8 shrink-0 overflow-hidden rounded border bg-muted">
        <img
          v-if="linha.capaUrl"
          :src="linha.capaUrl"
          :alt="`Capa de ${linha.titulo}`"
          class="size-full object-cover"
        >
        <span v-else class="grid size-full place-items-center text-muted-foreground">
          <MusicIcon class="size-3.5" />
        </span>
      </span>

      <span v-if="!props.compacto" class="min-w-0 flex-1">
        <span class="flex items-center gap-1">
          <!--
            O ponto pulsando é o que diz "isto é agora". Sozinho não bastaria
            (cor não chega a quem usa leitor de tela), por isso o `title` acima
            escreve a frase inteira.
          -->
          <span class="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
          <span class="truncate text-[11px] font-medium text-muted-foreground">
            {{ linha.membro.user_id === euId ? 'Você' : primeiroNome(linha.membro) }}
          </span>
        </span>
        <span class="block truncate text-xs">{{ linha.titulo }}</span>
        <span v-if="linha.artistas" class="block truncate text-[11px] text-muted-foreground">
          {{ linha.artistas }}
        </span>
      </span>
    </component>
  </div>
</template>
