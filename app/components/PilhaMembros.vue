<script setup lang="ts">
/**
 * Gente, em círculos de 20 pixels — o ÚNICO jeito de o app desenhar uma pessoa.
 *
 * Nasceu no rodapé do cartaz de Filmes ("quem está neste estado") e vale agora
 * também para Objetivos (de quem é o interesse, quem vai dar de presente). São
 * um componente só de propósito: dois desenhos de "uma pessoa" divergiriam no
 * primeiro ajuste de tamanho ou de cor, e o app passaria a ter dois vocabulários
 * visuais para a mesma coisa.
 *
 * INICIAL, E NÃO FOTO. `usePessoas()` — de onde Objetivos tira os nomes — devolve
 * só id e nome, porque ela existe justamente para nomear gente de FORA do espaço
 * ativo (quem assumiu um presente do casal, visto do espaço pessoal). Puxar
 * avatar junto seria uma coluna a mais numa consulta que roda em toda tela do
 * módulo, para um círculo de 20px.
 *
 * O "+" (entrar neste estado) é de Filmes e continua opcional: quem passa só um
 * nome não pede botão nenhum, e ele não aparece.
 */
import { PlusIcon } from '@lucide/vue'

/**
 * O mínimo para desenhar alguém. `Membro` (de `useMembros`) satisfaz isto por
 * estrutura, então Filmes continua passando a lista dele sem conversão — e
 * Objetivos, que só tem id e nome, também cabe.
 */
export interface PessoaNaPilha {
  user_id: string
  exibicao: string
}

const props = withDefaults(defineProps<{
  /** Quem desenhar. Vazio some da tela. */
  membros: PessoaNaPilha[]
  /**
   * O que esta pilha quer dizer — "Bixo Pingo vai dar de presente".
   *
   * Sem ele, o texto é a lista de nomes, que é o que Filmes sempre mostrou. Com
   * ele, o mesmo círculo carrega o papel além do nome: a inicial sozinha não diz
   * se aquele "B" é o dono do interesse ou quem se ofereceu para pagá-lo.
   */
  rotulo?: string | null
  /**
   * `sm` (20px) é o do rodapé do cartaz e das linhas de lista — o tamanho em que
   * a pessoa é um detalhe da linha. `md` (36px) é para quando ela é o ASSUNTO,
   * como no placar de Pins, onde o círculo abre o card.
   */
  tamanho?: 'sm' | 'md'
  /** Mostra o "+" para entrar neste estado. O card decide quando (hover). */
  podeEntrar?: boolean
  entrando?: boolean
}>(), { rotulo: null, tamanho: 'sm', podeEntrar: false, entrando: false })

const emit = defineEmits<{ entrar: [] }>()

/**
 * Três é o teto: mais que isso a pilha come a largura do cartaz, e ainda
 * precisa sobrar espaço para o "+".
 */
const MAX = 3

const visiveis = computed(() => props.membros.slice(0, MAX))
const excedente = computed(() => Math.max(0, props.membros.length - MAX))
const nomes = computed(() => props.membros.map(m => m.exibicao).join(', '))

/** O que o `title` e o leitor de tela dizem. */
const texto = computed(() => props.rotulo ?? nomes.value)

function inicial(nome: string): string {
  return (nome.trim()[0] ?? '?').toUpperCase()
}

/** O recuo do empilhamento acompanha o tamanho — senão os círculos se cobrem. */
const CLASSES = {
  sm: { bolha: 'size-5 text-[10px]', recuo: '-ml-1.5' },
  md: { bolha: 'size-9 text-sm', recuo: '-ml-3' },
} as const

const estilo = computed(() => CLASSES[props.tamanho])
</script>

<template>
  <div class="flex items-center gap-1">
    <!-- `title` em vez de um componente de tooltip: é o mesmo resultado para o
         usuário, sem arrastar uma dependência nova só por isto. -->
    <div v-if="membros.length" class="flex" :title="texto">
      <!--
        As iniciais ficam `aria-hidden` e o significado vai numa frase à parte:
        sem isso o leitor de tela soletrava "M A" no rodapé de cada cartaz, que
        não é informação nenhuma.
      -->
      <span
        v-for="(m, i) in visiveis"
        :key="m.user_id"
        class="grid shrink-0 place-items-center rounded-full border border-background bg-primary font-semibold text-primary-foreground"
        :class="[estilo.bolha, i > 0 ? estilo.recuo : '']"
        :style="{ zIndex: visiveis.length - i }"
        aria-hidden="true"
      >
        {{ inicial(m.exibicao) }}
      </span>
      <span
        v-if="excedente"
        class="grid shrink-0 place-items-center rounded-full border border-background bg-muted font-semibold text-muted-foreground"
        :class="[estilo.bolha, estilo.recuo]"
        aria-hidden="true"
      >
        +{{ excedente }}
      </span>

      <span class="sr-only">{{ texto }}</span>
    </div>

    <button
      v-if="podeEntrar"
      type="button"
      class="grid size-5 place-items-center rounded-full border border-dashed border-white/70 bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-50"
      :disabled="entrando"
      :aria-label="membros.length ? `Entrar junto com ${nomes}` : 'Marcar para mim também'"
      @click.stop.prevent="emit('entrar')"
    >
      <PlusIcon class="size-3" />
    </button>
  </div>
</template>
