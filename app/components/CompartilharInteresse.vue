<script setup lang="ts">
/**
 * Onde mais este interesse aparece.
 *
 * Compartilhar não MOVE o interesse: ele continua morando no espaço em que nasceu,
 * e cada espaço marcado aqui passa a vê-lo também. É o que permite guardar um
 * presente no espaço pessoal e ainda assim mostrá-lo no espaço do casal para a outra
 * pessoa poder dizer "eu dou".
 *
 * A casa do interesse não aparece na lista: ele já está lá por definição, e um item
 * marcado que não desmarca só ensina que a marcação não faz nada.
 *
 * Só o dono compartilha — a policy de `interesse_compartilhamento` exige
 * `sou_dono_do_interesse`. Para quem não é dono, o botão nem aparece; o rótulo de
 * onde ele está compartilhado, sim, porque saber quem mais vê é do interesse de
 * todos.
 */
import { toast } from 'vue-sonner'
import { Share2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { mensagemDeErro } from '@/lib/utils'
import type { InteresseComAgrupamentos } from '~/types/interesse'
import {
  useCompartilharInteresse,
  useDescompartilharInteresse,
} from '~/composables/useInteresses'
import { useSpaceStore } from '~/stores/space'

const props = defineProps<{ interesse: InteresseComAgrupamentos }>()

const store = useSpaceStore()
const compartilhar = useCompartilharInteresse()
const descompartilhar = useDescompartilharInteresse()

/** Os espaços em que dá para compartilhar: os meus, menos a casa do interesse. */
const candidatos = computed(() =>
  store.espacos.filter(e => e.id !== props.interesse.space_id),
)

const compartilhadoEm = computed(
  () => new Set(props.interesse.compartilhamentos.map(c => c.space_id)),
)

async function alternar(spaceId: string) {
  const jaEsta = compartilhadoEm.value.has(spaceId)

  try {
    if (jaEsta) {
      await descompartilhar.mutateAsync({ interesseId: props.interesse.id, spaceId })
      toast.success('Deixou de compartilhar.')
    }
    else {
      await compartilhar.mutateAsync({ interesseId: props.interesse.id, spaceId })
      toast.success('Compartilhado.')
    }
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mudar o compartilhamento.'))
  }
}
</script>

<template>
  <DropdownMenu v-if="candidatos.length">
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="sm" class="gap-1.5">
        <Share2Icon class="size-4" />
        {{ compartilhadoEm.size ? `Compartilhado (${compartilhadoEm.size})` : 'Compartilhar' }}
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent align="end" class="w-64">
      <DropdownMenuLabel>Mostrar também em</DropdownMenuLabel>
      <DropdownMenuSeparator />

      <DropdownMenuCheckboxItem
        v-for="espaco in candidatos"
        :key="espaco.id"
        :model-value="compartilhadoEm.has(espaco.id)"
        @select.prevent="alternar(espaco.id)"
      >
        {{ espaco.nome }}
      </DropdownMenuCheckboxItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
