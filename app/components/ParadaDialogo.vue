<script setup lang="ts">
import { MapPinIcon, PenLineIcon } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { LugarDaParada, ParadaParaSalvar } from '~/types/viagem'

/**
 * Corrigir o lugar de uma parada, sem perder o resto dela.
 *
 * O caso que pede isto é sempre o mesmo: a busca devolveu o "Café Central" da
 * cidade errada, ou o lugar mudou de endereço, ou a parada nasceu como texto
 * livre e depois se descobriu que o Maps a conhece. Antes disso, o único caminho
 * era remover e adicionar de novo — e com a parada ia o dia, a anotação e a
 * posição na sequência, que é justamente o trabalho que já estava feito.
 *
 * Por isso o diálogo devolve só um `LugarDaParada`: quem chama funde os três
 * campos do lugar sobre a parada existente. Dia, anotação e ordem não passam por
 * aqui — não há como esta tela apagá-los, nem por engano de merge.
 *
 * Escolher é confirmar, e não há botão "Salvar": a busca já é uma lista de
 * opções, e um segundo passo de confirmação sobre uma escolha explícita só
 * atrasaria o único gesto que existe aqui.
 */
const props = defineProps<{
  open: boolean
  /** Nula = diálogo fechado. Preenchida = a parada que está sendo corrigida. */
  parada?: ParadaParaSalvar | null
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  'escolher': [LugarDaParada]
}>()

function escolher(lugar: LugarDaParada) {
  emit('escolher', lugar)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Corrigir endereço</DialogTitle>
        <DialogDescription>
          Busque o lugar certo no Google Maps. O dia e a anotação desta parada
          continuam como estão — só o endereço é substituído.
        </DialogDescription>
      </DialogHeader>

      <!--
        O que está gravado hoje, à vista. Sem isto, quem abriu o diálogo para
        conferir se o endereço está errado precisa fechá-lo para lembrar qual era.
      -->
      <div v-if="props.parada" class="rounded-lg border bg-muted/40 p-3">
        <p class="text-xs uppercase tracking-wide text-muted-foreground">Hoje</p>
        <p class="mt-1 flex items-center gap-1.5 font-medium">
          <component
            :is="props.parada.google_place_id ? MapPinIcon : PenLineIcon"
            class="size-3.5 shrink-0 text-muted-foreground"
          />
          <span class="truncate">{{ props.parada.nome }}</span>
        </p>
        <p v-if="props.parada.endereco" class="mt-0.5 text-xs text-muted-foreground">
          {{ props.parada.endereco }}
        </p>
        <p v-else-if="!props.parada.google_place_id" class="mt-0.5 text-xs text-muted-foreground">
          Escrita à mão — não entra na rota
        </p>
      </div>

      <!--
        `:key` no estado de abertura para a busca nascer limpa a cada parada: sem
        isto, o termo digitado na correção anterior reaparece ao abrir a próxima,
        junto de uma lista de sugestões que é de outra parada.
      -->
      <BuscaDeLugar
        :key="String(open)"
        autofocus
        placeholder="Buscar o endereço certo…"
        rotulo-texto="Trocar por"
        @escolher="escolher"
      />
    </DialogContent>
  </Dialog>
</template>
