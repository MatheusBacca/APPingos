<script setup lang="ts">
import { avaliacaoDe, recorteDa } from '@/lib/recortes'
import type { Recorte } from '@/lib/recortes'
import type { Membro } from '~/composables/useMembros'
import type { ItemDoEspaco } from '~/types/catalogo'

const props = withDefaults(defineProps<{
  itens: ItemDoEspaco[]
  recorte: Recorte
  membros: Membro[]
  /** Chaves `entryId:recorte` com mutação em voo. */
  emAndamento: Set<string>
  arrastavel?: boolean
  /** Classe de grid — a agenda usa 5 colunas fixas; a lista, responsivo. */
  classeGrade?: string
}>(), {
  arrastavel: true,
  classeGrade: 'grid-cols-5',
})

const emit = defineEmits<{
  entrar: [ItemDoEspaco]
  mover: [item: ItemDoEspaco, destino: Recorte]
}>()

const usuarioId = useUsuarioId()

/** Só quem demonstrou interesse e está neste recorte vira bolinha. */
function membrosNoRecorte(item: ItemDoEspaco): Membro[] {
  return props.membros.filter(m => recorteDa(avaliacaoDe(item, m.user_id)) === props.recorte)
}

function euEstouAqui(item: ItemDoEspaco): boolean {
  return recorteDa(avaliacaoDe(item, usuarioId.value)) === props.recorte
}
</script>

<template>
  <div class="grid gap-2" :class="classeGrade">
    <CartazDoEspaco
      v-for="item in itens"
      :key="item.id"
      :item="item"
      :arrastavel="arrastavel"
      :membros-no-estado="membrosNoRecorte(item)"
      :pode-entrar="!euEstouAqui(item)"
      :entrando="emAndamento.has(`${item.id}:${recorte}`)"
      :meu-recorte="recorteDa(avaliacaoDe(item, usuarioId))"
      @entrar="emit('entrar', item)"
      @mover="emit('mover', item, $event)"
    />
  </div>
</template>
