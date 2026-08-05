<script setup lang="ts">
import { mensagemDeErro } from '@/lib/utils'
import { LockIcon, Trash2Icon, UsersIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatarDia } from '@/lib/datas'
import { ehAdmin } from '~/types/database.types'
import type { StatusItem } from '~/types/catalogo'
import { useItem, useAvaliar, useMarcarAssistiramComigo, useRemoverItem } from '~/composables/useCatalogo'
import { useMembros } from '~/composables/useMembros'
import { useUsuarioId } from '~/composables/useUsuarioId'
import { useSpaceStore } from '~/stores/space'

const route = useRoute()
const entryId = route.params.id as string
const router = useRouter()
const usuarioId = useUsuarioId()

const { data: item, isPending, isError, error } = useItem(entryId)
const { data: membros } = useMembros()
const avaliar = useAvaliar()
const remover = useRemoverItem()

useHead({ title: () => `${item.value?.media.titulo ?? 'Carregando…'} · APPingos` })

const minhaAvaliacao = computed(() =>
  item.value?.avaliacoes.find(a => a.user_id === usuarioId.value) ?? null,
)

const jaEnviei = computed(() => !!minhaAvaliacao.value?.enviado_em)

/** Só as avaliações de fato enviadas — as linhas em branco que nascem ao
 *  adicionar o filme não são opinião de ninguém. */
const avaliacoesEnviadas = computed(() =>
  (item.value?.avaliacoes ?? []).filter(a => a.enviado_em),
)

const aindaNaoAvaliaram = computed(() => {
  const enviaram = new Set(avaliacoesEnviadas.value.map(a => a.user_id))
  return (membros.value ?? []).filter(m => !enviaram.has(m.user_id))
})

function nomeDoMembro(userId: string): string {
  return membros.value?.find(m => m.user_id === userId)?.nome ?? 'Alguém'
}

// ---- Formulário de avaliação (estrelas + resenha juntos) --------------------

const notaRascunho = ref<number | null>(null)
const resenhaRascunho = ref('')
const enviando = ref(false)

// O rascunho é semeado UMA vez, com o que houver salvo (uma nota solta de antes
// desta tela existir, por exemplo). Re-semear a cada mudança de `minhaAvaliacao`
// parecia inofensivo, mas apagava o que a pessoa estava digitando: salvar uma
// data revalida o item, o watcher disparava, e as estrelas voltavam para o
// estado do banco no meio do preenchimento.
const rascunhoIniciado = ref(false)

watch([item, jaEnviei], () => {
  if (!item.value || rascunhoIniciado.value || jaEnviei.value) return
  notaRascunho.value = minhaAvaliacao.value?.nota ?? null
  resenhaRascunho.value = minhaAvaliacao.value?.resenha ?? ''
  rascunhoIniciado.value = true
}, { immediate: true })

async function onEnviarAvaliacao() {
  if (notaRascunho.value == null) return
  enviando.value = true
  try {
    await avaliar.mutateAsync({
      entryId,
      nota: notaRascunho.value,
      resenha: resenhaRascunho.value.trim() || null,
      enviado_em: new Date().toISOString(),
    })
    toast.success('Avaliação enviada.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para enviar a avaliação.'))
  }
  finally {
    enviando.value = false
  }
}

// ---- Status e datas (continuam editáveis depois do envio) -------------------

async function salvarCampo(campos: Partial<{ status: StatusItem, planejado_para: string | null, visto_em: string | null }>, erro: string) {
  try {
    await avaliar.mutateAsync({ entryId, ...campos })
  }
  catch (e) {
    toast.error(mensagemDeErro(e, erro))
  }
}

function onMudarData(campo: 'planejado_para' | 'visto_em', valor: string) {
  salvarCampo({ [campo]: valor || null }, 'Não deu para salvar a data.')
}

// ---- "Assistiram comigo" (dono/admin) ---------------------------------------

const store = useSpaceStore()
const marcarCompanhia = useMarcarAssistiramComigo()
const selecionados = ref<string[]>([])
const marcandoCompanhia = ref(false)

const podeMarcarCompanhia = computed(() =>
  ehAdmin(store.espacoAtivo?.papel)
  && !!minhaAvaliacao.value?.visto_em
  && candidatosACompanhia.value.length > 0,
)

/** Todo mundo menos eu, com o que já está registrado para cada um. */
const candidatosACompanhia = computed(() =>
  (membros.value ?? [])
    .filter(m => m.user_id !== usuarioId.value)
    .map((membro) => {
      const av = item.value?.avaliacoes.find(a => a.user_id === membro.user_id)
      return {
        membro,
        situacao: av?.visto_em
          ? (av.visto_em === minhaAvaliacao.value?.visto_em
              ? 'já com a mesma data'
              : `hoje marcado em ${formatarDia(av.visto_em)}`)
          : 'sem data de assistido',
      }
    }),
)

async function onMarcarCompanhia() {
  marcandoCompanhia.value = true
  try {
    const total = await marcarCompanhia.mutateAsync({ entryId, usuarios: selecionados.value })
    selecionados.value = []
    toast.success(total === 1 ? 'Marcado para uma pessoa.' : `Marcado para ${total} pessoas.`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para marcar.'))
  }
  finally {
    marcandoCompanhia.value = false
  }
}

async function onRemover() {
  if (!confirm(`Remover "${item.value?.media.titulo}" da lista de vocês?`)) return
  try {
    await remover.mutateAsync(entryId)
    toast.success('Removido.')
    await router.push('/filmes')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para remover.'))
  }
}
</script>

<template>
  <div class="space-y-4">
    <BotaoVoltar para="/filmes" rotulo="Voltar para Filmes & Séries" />

    <div v-if="isPending" class="space-y-4">
      <Skeleton class="h-8 w-2/3" />
      <div class="flex gap-4">
        <Skeleton class="aspect-[2/3] w-40 shrink-0 rounded-lg" />
        <Skeleton class="h-40 flex-1" />
      </div>
    </div>

    <div v-else-if="isError || !item" class="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p class="font-medium text-destructive">Não encontrei este item.</p>
      <p class="mt-1 text-muted-foreground">
        {{ mensagemDeErro(error, 'Ele pode ter sido removido.') }}
      </p>
    </div>

    <div v-else class="space-y-8">
      <div class="flex flex-col gap-4 sm:flex-row">
        <div class="w-40 shrink-0">
          <PosterCard :titulo="item.media.titulo" :capa-url="item.media.capa_url" />
        </div>

        <div class="min-w-0 flex-1 space-y-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h1 class="text-xl font-semibold leading-tight">{{ item.media.titulo }}</h1>
              <p v-if="item.media.titulo_original && item.media.titulo_original !== item.media.titulo" class="text-sm text-muted-foreground">
                {{ item.media.titulo_original }}
              </p>
              <p class="mt-1 text-sm text-muted-foreground">
                {{ [item.media.ano, item.media.tipo === 'serie' ? 'Série' : 'Filme'].filter(Boolean).join(' · ') }}
              </p>
            </div>

            <Button variant="ghost" size="icon" aria-label="Remover da lista" @click="onRemover">
              <Trash2Icon class="size-4 text-muted-foreground" />
            </Button>
          </div>

          <p v-if="item.media.sinopse" class="text-sm text-muted-foreground">
            {{ item.media.sinopse }}
          </p>

          <!--
            Sair de "Visto" limpa a data: "estou assistindo" contradiz "terminei
            no dia X", e sem isto o recorte continuaria mostrando o item como
            assistido, porque `visto_em` preenchido vence o status.
          -->
          <StatusSelect
            :status="minhaAvaliacao?.status ?? 'quero'"
            @update:status="salvarCampo(
              $event === 'visto' ? { status: $event } : { status: $event, visto_em: null },
              'Não deu para salvar.',
            )"
          />
        </div>
      </div>

      <section>
        <h2 class="mb-1 text-sm font-medium">Suas datas</h2>
        <p class="mb-3 text-xs text-muted-foreground">
          São suas — cada pessoa do espaço marca as próprias, e elas aparecem na agenda.
        </p>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label for="planejado">Quero ver em</Label>
            <Input
              id="planejado"
              type="date"
              :model-value="minhaAvaliacao?.planejado_para ?? ''"
              @change="onMudarData('planejado_para', ($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="space-y-1.5">
            <Label for="visto">Assisti em</Label>
            <Input
              id="visto"
              type="date"
              :model-value="minhaAvaliacao?.visto_em ?? ''"
              @change="onMudarData('visto_em', ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>
      </section>

      <!-- Só dono/admin, e só depois de ter a própria data: é ela que será copiada. -->
      <section v-if="podeMarcarCompanhia">
        <h2 class="mb-1 flex items-center gap-2 text-sm font-medium">
          <UsersIcon class="size-4 text-muted-foreground" />
          Quem assistiu com você
        </h2>
        <p class="mb-3 text-xs text-muted-foreground">
          Marca a mesma data que a sua ({{ formatarDia(minhaAvaliacao!.visto_em!) }}) para quem
          estava junto. A nota e a resenha continuam sendo de cada um.
        </p>

        <ul class="space-y-2">
          <li v-for="companhia in candidatosACompanhia" :key="companhia.membro.user_id" class="flex items-center gap-2 text-sm">
            <input
              :id="`comigo-${companhia.membro.user_id}`"
              v-model="selecionados"
              type="checkbox"
              :value="companhia.membro.user_id"
              class="size-4 rounded border-input"
            >
            <label :for="`comigo-${companhia.membro.user_id}`" class="flex-1">
              {{ companhia.membro.nome }}
            </label>
            <span class="text-xs text-muted-foreground">{{ companhia.situacao }}</span>
          </li>
        </ul>

        <Button
          class="mt-3"
          size="sm"
          variant="outline"
          :disabled="!selecionados.length || marcandoCompanhia"
          @click="onMarcarCompanhia"
        >
          {{ marcandoCompanhia ? 'Salvando…' : 'Assistiram comigo' }}
        </Button>
      </section>

      <section>
        <h2 class="mb-3 text-sm font-medium">Sua avaliação</h2>

        <div v-if="jaEnviei" class="rounded-lg border bg-muted/40 p-3">
          <NotaEstrelas :nota="minhaAvaliacao!.nota" somente-leitura />
          <p v-if="minhaAvaliacao!.resenha" class="mt-2 text-sm">{{ minhaAvaliacao!.resenha }}</p>
          <p class="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <LockIcon class="size-3" />
            Avaliação enviada — nota e resenha não mudam mais.
          </p>
        </div>

        <form v-else class="space-y-3 rounded-lg border p-3" @submit.prevent="onEnviarAvaliacao">
          <div class="space-y-1.5">
            <Label>Sua nota</Label>
            <NotaEstrelas :nota="notaRascunho" @update:nota="notaRascunho = $event" />
          </div>

          <div class="space-y-1.5">
            <Label for="resenha">Sua resenha <span class="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea id="resenha" v-model="resenhaRascunho" rows="3" placeholder="O que você achou?" />
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <Button type="submit" :disabled="notaRascunho == null || enviando">
              {{ enviando ? 'Enviando…' : 'Enviar' }}
            </Button>
            <p class="text-xs text-muted-foreground">
              Depois de enviar, a nota e a resenha ficam fixas.
            </p>
          </div>
        </form>
      </section>

      <section>
        <h2 class="mb-3 text-sm font-medium">Avaliações</h2>

        <div class="space-y-3">
          <div
            v-for="avaliacao in avaliacoesEnviadas"
            :key="avaliacao.user_id"
            class="flex items-start gap-3 rounded-lg border bg-card p-3"
          >
            <span class="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium">
              {{ nomeDoMembro(avaliacao.user_id).charAt(0).toUpperCase() }}
            </span>

            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">
                {{ nomeDoMembro(avaliacao.user_id) }}
                <span v-if="avaliacao.user_id === usuarioId" class="font-normal text-muted-foreground">(você)</span>
              </p>

              <NotaEstrelas class="mt-1" :nota="avaliacao.nota" somente-leitura tamanho="sm" />

              <p v-if="avaliacao.resenha" class="mt-1 text-sm text-muted-foreground">
                {{ avaliacao.resenha }}
              </p>
            </div>
          </div>

          <p v-if="!avaliacoesEnviadas.length" class="text-sm text-muted-foreground">
            Ninguém avaliou ainda.
          </p>

          <p v-else-if="aindaNaoAvaliaram.length" class="text-xs text-muted-foreground">
            Falta {{ aindaNaoAvaliaram.map(m => m.nome).join(', ') }} avaliar.
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
