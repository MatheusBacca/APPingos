<script setup lang="ts">
/**
 * A ficha de um filme ou série vindo da busca, antes de ele entrar na lista.
 *
 * O cartaz da busca cabe numa coluna de grade e mostra o que cabe ali: capa,
 * título, ano. A sinopse não cabe — e é ela que decide se vale a pena. Sem esta
 * tela a pessoa precisava adicionar o filme para depois ler do que ele se trata,
 * e desfazer o engano era remover um item da lista dos dois.
 *
 * O botão é o MESMO do cartaz ("Tenho interesse"), e não uma variação: quem abre
 * a ficha e decide não deve procurar um verbo diferente do que via um segundo
 * atrás. O estado "já está na lista" também é o mesmo, pelo mesmo motivo.
 *
 * Os detalhes (gêneros, duração, temporadas) vêm de `/api/tmdb/{tipo}/{id}` e não
 * da busca — a busca não os traz. A consulta só dispara com o diálogo ABERTO:
 * carregar a ficha de vinte resultados porque eles foram desenhados na grade
 * seriam vinte chamadas ao TMDB para uma que a pessoa vai ler.
 */
import { useQuery } from '@tanstack/vue-query'
import { PlusIcon, StarIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import type { DetalheMidia, ResultadoBusca } from '~~/server/utils/tmdb'

const props = defineProps<{
  /** `null` = fechado. O resultado inteiro, para a ficha abrir já preenchida. */
  resultado: ResultadoBusca | null
  jaNaLista: boolean
  adicionando: boolean
}>()

const emit = defineEmits<{ adicionar: [ResultadoBusca], fechar: [] }>()

const aberto = computed({
  get: () => !!props.resultado,
  set: (v: boolean) => { if (!v) emit('fechar') },
})

const detalhe = useQuery({
  queryKey: computed(() => ['tmdb', 'detalhe', props.resultado?.tipo, props.resultado?.fonte_id]),
  enabled: computed(() => !!props.resultado),
  queryFn: () => $fetch<DetalheMidia>(
    `/api/tmdb/${props.resultado!.tipo}/${props.resultado!.fonte_id}`,
  ),
})

/*
 * O que a busca já sabe vale enquanto o detalhe não chega — a ficha abre com
 * título, ano, capa e sinopse na hora, e só os campos extras esperam a rede.
 * Um skeleton sobre o que já está em mão seria esconder dado para mostrar
 * carregamento.
 */
const ficha = computed(() => detalhe.data.value ?? props.resultado)

const ehSerie = computed(() => props.resultado?.tipo === 'serie')

/** "1h 52min" — minutos crus não são a unidade em que ninguém pensa em filme. */
function duracaoEmTexto(minutos: number | null | undefined): string | null {
  if (!minutos || minutos <= 0) return null
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  if (!horas) return `${resto}min`
  return resto ? `${horas}h ${resto}min` : `${horas}h`
}

/** As linhas de ficha técnica que de fato existem para este título. */
const fatos = computed<string[]>(() => {
  const d = detalhe.data.value
  if (!d) return []

  const lista: string[] = []
  if (d.generos.length) lista.push(d.generos.join(', '))

  const duracao = duracaoEmTexto(d.duracao_min)
  if (duracao) lista.push(duracao)

  if (d.temporadas) {
    lista.push(d.temporadas === 1 ? '1 temporada' : `${d.temporadas} temporadas`)
  }
  if (d.episodios) {
    lista.push(d.episodios === 1 ? '1 episódio' : `${d.episodios} episódios`)
  }

  return lista
})
</script>

<template>
  <Dialog v-model:open="aberto">
    <DialogScrollContent v-if="resultado" class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ resultado.titulo }}</DialogTitle>
        <DialogDescription>
          {{ [ehSerie ? 'Série' : 'Filme', resultado.ano].filter(Boolean).join(' · ') }}
          <template v-if="resultado.titulo_original && resultado.titulo_original !== resultado.titulo">
            · título original: {{ resultado.titulo_original }}
          </template>
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 sm:grid-cols-[9rem_1fr]">
        <div class="mx-auto w-32 sm:mx-0 sm:w-full">
          <PosterCard
            :titulo="resultado.titulo"
            :capa-url="resultado.capa_url"
            :mostrar-titulo="false"
          />
        </div>

        <div class="min-w-0 space-y-3">
          <p v-if="resultado.nota_tmdb" class="flex items-center gap-1.5 text-sm">
            <StarIcon class="size-4 fill-amber-400 text-amber-400" />
            <span class="font-semibold tabular-nums">{{ resultado.nota_tmdb.toFixed(1) }}</span>
            <span class="text-muted-foreground">no TMDB</span>
          </p>

          <div v-if="detalhe.isPending.value" class="space-y-2">
            <Skeleton class="h-4 w-2/3" />
          </div>
          <p v-else-if="fatos.length" class="text-sm text-muted-foreground">
            {{ fatos.join(' · ') }}
          </p>

          <p v-if="ficha?.sinopse" class="whitespace-pre-line text-sm leading-relaxed">
            {{ ficha.sinopse }}
          </p>
          <p v-else class="text-sm text-muted-foreground">
            O TMDB não tem sinopse em português para este título.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" @click="emit('fechar')">Fechar</Button>

        <!-- O mesmo verbo e o mesmo estado do cartaz — ver o cabeçalho. -->
        <Button
          v-if="!jaNaLista"
          class="gap-1.5"
          :disabled="adicionando"
          @click="emit('adicionar', resultado)"
        >
          <PlusIcon class="size-4" />
          {{ adicionando ? 'Adicionando…' : 'Tenho interesse' }}
        </Button>
        <span v-else class="self-center text-sm text-muted-foreground">
          Já está na lista de vocês.
        </span>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
