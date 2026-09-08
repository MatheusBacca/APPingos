<script setup lang="ts">
/**
 * Mover um interesse de estado sem passar pela tela de edição.
 *
 * Antes o estado só se mexia dentro do diálogo de edição — que pede título,
 * destino, para quem e observação para mudar uma palavra. Pior: o diálogo é
 * inteiro do DONO (é ele quem descreve a vontade), então quem se ofereceu para
 * dar o presente não tinha caminho nenhum para dizer "já comprei" e mover o
 * card para Convertido. O banco sempre permitiu — o trigger
 * `interesse_intencao_protegida` protege a INTENÇÃO e libera o estado de
 * propósito, porque mover no kanban é coordenação, não reescrita do desejo. O
 * que faltava era a porta.
 *
 * Duas portas, na verdade, e é a mesma peça:
 *
 *   `menu`   — os três pontinhos no canto do card da lista. É o gesto de quem
 *              está varrendo a lista e quer mover um item sem entrar nele.
 *   `rotulo` — o próprio selo do estado, dentro do detalhe. Ali o selo já
 *              estava escrito na tela; torná-lo clicável é o caminho mais curto
 *              que existe, e não acrescenta nenhum controle novo.
 *
 * `@click.stop.prevent` no gatilho não é adorno: na lista o card inteiro é um
 * `NuxtLink`, e sem isso abrir o menu navegaria para o detalhe.
 */
import { toast } from 'vue-sonner'
import { CheckIcon, ChevronDownIcon, EllipsisVerticalIcon } from '@lucide/vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { mensagemDeErro } from '@/lib/utils'
import { ESTADOS, rotuloEstado } from '~/types/interesse'
import type { EstadoInteresse } from '~/types/interesse'
import { useAtualizarInteresse } from '~/composables/useInteresses'

const props = withDefaults(defineProps<{
  id: string
  estado: EstadoInteresse
  /** Só para a frase do toast dizer de qual interesse ele está falando. */
  titulo: string
  variante?: 'menu' | 'rotulo'
}>(), { variante: 'menu' })

const atualizar = useAtualizarInteresse()

async function mover(destino: EstadoInteresse) {
  if (destino === props.estado) return

  try {
    await atualizar.mutateAsync({ id: props.id, estado: destino })
    toast.success(`"${props.titulo}" agora está em ${rotuloEstado(destino)}.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mudar o estado.'))
  }
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        v-if="variante === 'menu'"
        type="button"
        class="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :aria-label="`Mover ${titulo} de estado`"
        @click.stop.prevent
      >
        <EllipsisVerticalIcon class="size-4" />
      </button>

      <button
        v-else
        type="button"
        class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :aria-label="`Estado: ${rotuloEstado(estado)}. Trocar.`"
        @click.stop.prevent
      >
        {{ rotuloEstado(estado) }}
        <ChevronDownIcon class="size-3" />
      </button>
    </DropdownMenuTrigger>

    <DropdownMenuContent align="end" class="w-44" @click.stop.prevent>
      <DropdownMenuLabel class="text-xs text-muted-foreground">Mover para</DropdownMenuLabel>
      <DropdownMenuItem
        v-for="opcao in ESTADOS"
        :key="opcao.valor"
        class="gap-2"
        :disabled="opcao.valor === estado"
        @select="mover(opcao.valor)"
      >
        <CheckIcon v-if="opcao.valor === estado" class="size-4 text-primary" />
        <span v-else class="size-4" />
        {{ opcao.rotulo }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
