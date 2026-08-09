<script setup lang="ts">
import { mensagemDeErro } from '@/lib/utils'
import { MapPinIcon, PenLineIcon, SearchIcon } from '@lucide/vue'
import { Input } from '@/components/ui/input'
import type { LugarSugerido } from '~~/server/utils/places'
import type { ParadaParaSalvar } from '~/types/viagem'
import { useBuscaDeLugares } from '~/composables/useBuscaDeLugares'

/**
 * A barra que transforma o que se digita numa parada.
 *
 * Duas saídas, e a segunda não é consolo: o Google não conhece "casa da vó" nem
 * "aquele mirante", e um roteiro de casal tem desses. Escrever à mão gera uma
 * parada de texto livre — ela conta na lista e no dia, mas não entra na rota,
 * porque não há como pedir direções até um lugar que o Maps não indexa. A tela
 * diz isso na hora de adicionar, e não depois, quando o mapa "esqueceu" a parada.
 */
const emit = defineEmits<{ adicionar: [ParadaParaSalvar] }>()

const termo = ref('')
const { busca, alvo, ativa } = useBuscaDeLugares(termo)

function adicionarLugar(lugar: LugarSugerido) {
  emit('adicionar', {
    google_place_id: lugar.placeId,
    nome: lugar.nome,
    endereco: lugar.endereco,
    dia: null,
    anotacao: null,
  })
  termo.value = ''
}

function adicionarTexto() {
  const nome = termo.value.trim()
  if (!nome) return

  emit('adicionar', {
    google_place_id: null,
    nome,
    endereco: null,
    dia: null,
    anotacao: null,
  })
  termo.value = ''
}

/**
 * Enter pega a primeira sugestão, e só vira texto livre quando não há nenhuma.
 *
 * O contrário — Enter sempre virando texto — é uma armadilha: a pessoa digita,
 * vê "Jardim Botânico" no topo da lista, aperta Enter esperando aquilo, e ganha
 * uma parada escrita à mão com o texto que digitou, fora da rota. O erro só
 * aparece depois, quando o mapa ignora a parada.
 */
function aoApertarEnter() {
  const primeira = busca.data.value?.[0]
  if (ativa.value && primeira) adicionarLugar(primeira)
  else adicionarTexto()
}
</script>

<template>
  <div class="space-y-2">
    <div class="relative">
      <SearchIcon class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        v-model="termo"
        placeholder="Buscar um lugar no Google Maps…"
        class="pl-9"
        autocomplete="off"
        @keydown.enter.prevent="aoApertarEnter"
      />
    </div>

    <div v-if="ativa" class="overflow-hidden rounded-lg border">
      <p v-if="busca.isPending.value" class="px-3 py-2 text-sm text-muted-foreground">
        Buscando…
      </p>

      <p v-else-if="busca.isError.value" class="px-3 py-2 text-sm text-destructive">
        {{ mensagemDeErro(busca.error.value, 'Falha ao buscar lugares.') }}
      </p>

      <template v-else>
        <button
          v-for="lugar in busca.data.value"
          :key="lugar.placeId"
          type="button"
          class="flex w-full items-start gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/60"
          @click="adicionarLugar(lugar)"
        >
          <MapPinIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0">
            <span class="block truncate font-medium">{{ lugar.nome }}</span>
            <span v-if="lugar.endereco" class="block truncate text-xs text-muted-foreground">
              {{ lugar.endereco }}
            </span>
          </span>
        </button>

        <p
          v-if="!busca.data.value?.length"
          class="px-3 py-2 text-sm text-muted-foreground"
        >
          Nada encontrado para "{{ alvo }}".
        </p>
      </template>

      <!--
        Sempre disponível, inclusive com resultados na tela: o lugar certo pode
        simplesmente não estar no Maps, e descobrir isso não deveria custar
        apagar tudo e começar de novo.
      -->
      <button
        type="button"
        class="flex w-full items-center gap-2 border-t bg-muted/30 px-3 py-2 text-left text-sm hover:bg-muted/60"
        @click="adicionarTexto"
      >
        <PenLineIcon class="size-4 shrink-0 text-muted-foreground" />
        <span class="min-w-0">
          <span class="block truncate">Adicionar "{{ alvo }}" como texto</span>
          <span class="block text-xs text-muted-foreground">Fica na lista, mas fora da rota</span>
        </span>
      </button>
    </div>
  </div>
</template>
