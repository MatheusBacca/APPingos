<script setup lang="ts">
/**
 * Conectar/desconectar o Spotify — em Espaços, junto do resto da conta.
 *
 * Fica aqui, e não em Músicas, porque conectar é sobre a SUA conta e não sobre
 * o módulo: o mesmo lugar que o plano da agenda do Google escolheu, e o mesmo
 * lugar onde já se vê quem é quem.
 */
import { MusicIcon, PlugZapIcon, UnplugIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatarDia } from '@/lib/datas'
import { mensagemDeErro } from '@/lib/utils'
import {
  temEscopoDeEscuta,
  useAlternarMostrarEscuta,
  useDesconectarSpotify,
  useIntegracaoSpotify,
} from '~/composables/useSpotify'

const { data: integracao, isPending } = useIntegracaoSpotify()
const desconectar = useDesconectarSpotify()
const alternarEscuta = useAlternarMostrarEscuta()

/**
 * Quem conectou antes da fase 3 não concedeu `user-read-currently-playing`.
 *
 * Escopo se concede autorizando de novo — não chega num deploy. Sem este aviso
 * a pessoa ligaria o interruptor e nada apareceria, sem explicação nenhuma.
 */
const faltaEscopo = computed(() =>
  !!integracao.value && !temEscopoDeEscuta(integracao.value.escopos),
)

async function onAlternarEscuta(mostrar: boolean) {
  try {
    await alternarEscuta.mutateAsync(mostrar)
    toast.success(mostrar
      ? 'Quem divide o espaço com você passa a ver o que você está ouvindo.'
      : 'Pronto — ninguém mais vê o que você está ouvindo.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mudar.'))
  }
}

const confirmando = ref(false)

/*
 * O resultado da volta do Spotify chega na URL porque o callback é uma
 * navegação do navegador, não um `$fetch` — não há promessa para um `catch`
 * pegar. A tela traduz o código em frase e limpa a query, para um F5 não
 * repetir o aviso.
 */
const RECADOS: Record<string, { texto: string, tom: 'ok' | 'erro' }> = {
  'conectado': { texto: 'Spotify conectado!', tom: 'ok' },
  'cancelado': { texto: 'Você cancelou a conexão com o Spotify.', tom: 'erro' },
  'estado-invalido': { texto: 'O pedido expirou. Clique em Conectar de novo.', tom: 'erro' },
  'sem-codigo': { texto: 'O Spotify não devolveu o código de autorização.', tom: 'erro' },
  'sem-refresh': { texto: 'O Spotify não liberou acesso contínuo. Tente conectar de novo.', tom: 'erro' },
  'falhou': { texto: 'Não deu para conectar o Spotify.', tom: 'erro' },
  'nao-configurado': { texto: 'O Spotify ainda não foi configurado neste ambiente (falta a chave no .env).', tom: 'erro' },
  'use-loopback': { texto: 'O Spotify não aceita "localhost". Abra o app em http://127.0.0.1:3000 e conecte por lá.', tom: 'erro' },
}

const route = useRoute()
const router = useRouter()

onMounted(() => {
  const recado = RECADOS[String(route.query.spotify ?? '')]
  if (!recado) return

  if (recado.tom === 'ok') toast.success(recado.texto)
  else toast.error(recado.texto)

  router.replace({ query: { ...route.query, spotify: undefined } })
})

function conectar() {
  // Navegação de verdade, e não `$fetch`: o fluxo é um redirecionamento para o
  // site do Spotify, e um XHR não tem para onde levar a pessoa.
  window.location.href = '/api/spotify/auth/iniciar'
}

async function onDesconectar() {
  try {
    await desconectar.mutateAsync()
    confirmando.value = false
    toast.success('Spotify desconectado.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para desconectar.'))
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2 text-base">
        <MusicIcon class="size-4 text-muted-foreground" />
        Spotify
      </CardTitle>
      <CardDescription>
        Conectar é por pessoa: mostra as suas playlists para quem divide o espaço com você.
      </CardDescription>
    </CardHeader>

    <CardContent>
      <div v-if="isPending" class="h-9 w-40 animate-pulse rounded-md bg-muted" />

      <div v-else-if="integracao" class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm">
          Conectado
          <span v-if="integracao.spotify_user_id" class="text-muted-foreground">
            como {{ integracao.spotify_user_id }}
          </span>
          <span class="block text-xs text-muted-foreground">
            desde {{ formatarDia(integracao.conectado_em.slice(0, 10)) }}
          </span>
        </p>

        <Button variant="ghost" size="sm" class="gap-1.5" @click="confirmando = true">
          <UnplugIcon class="size-4" />
          Desconectar
        </Button>
      </div>

      <!--
        Interruptor separado, e nascendo desligado: conectar a conta serve para
        as playlists. Dizer o que está tocando agora é outra permissão, e
        assumi-la junto seria decidir pela pessoa.
      -->
      <div v-if="integracao" class="mt-4 border-t pt-4">
        <label class="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            class="mt-0.5 size-4 shrink-0 accent-primary"
            :checked="integracao.mostrar_escuta"
            :disabled="faltaEscopo || alternarEscuta.isPending.value"
            @change="onAlternarEscuta(($event.target as HTMLInputElement).checked)"
          >
          <span class="text-sm">
            Mostrar o que estou ouvindo
            <span class="block text-xs text-muted-foreground">
              Aparece na barra lateral de quem divide o espaço com você, enquanto o app
              estiver aberto. Nada fica guardado depois que a música passa.
            </span>
          </span>
        </label>

        <p v-if="faltaEscopo" class="mt-2 text-xs text-destructive">
          Você conectou antes desta função existir. Clique em Desconectar e conecte de novo
          para autorizar a leitura do que está tocando.
        </p>
      </div>

      <div v-else class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted-foreground">
          A busca de músicas já funciona sem isto. Conectar serve para as playlists.
        </p>

        <Button class="gap-1.5" @click="conectar">
          <PlugZapIcon class="size-4" />
          Conectar
        </Button>
      </div>
    </CardContent>

    <Dialog :open="confirmando" @update:open="confirmando = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desconectar o Spotify?</DialogTitle>
          <DialogDescription>
            As suas playlists saem do APPingos e ninguém do espaço as vê mais. Nada é apagado
            no Spotify, e as músicas do catálogo continuam onde estão.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" @click="confirmando = false">Cancelar</Button>
          <Button
            variant="destructive"
            :disabled="desconectar.isPending.value"
            @click="onDesconectar"
          >
            {{ desconectar.isPending.value ? 'Desconectando…' : 'Desconectar' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Card>
</template>
