<script setup lang="ts">
/**
 * "Para quem é isto" — um membro do espaço, ou qualquer outra pessoa.
 *
 * As duas respostas são legítimas e por isso são dois campos no banco: escolher um
 * membro guarda o `user_id` (o nome acompanha se a pessoa trocar de apelido), e
 * texto livre guarda a string ("minha mãe", "o chefe do amigo secreto"). Só um dos
 * dois vale por vez, e é este componente que garante isso — deixar os dois
 * preenchidos faria a tela ter de decidir qual mostrar.
 *
 * Um dropdown com "Outra pessoa…" no fim, em vez de um campo de texto sempre
 * visível ao lado da lista: o caso comum é presente para quem usa o app, e dois
 * campos concorrendo pela mesma resposta convidam a preencher os dois.
 */
import { CheckIcon, UserIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Membro } from '~/composables/useMembros'

const props = defineProps<{
  membros: Membro[]
  /** Quem está preenchendo — não faz sentido dar um presente para si mesmo. */
  euId?: string | null
}>()

const userId = defineModel<string | null>('userId', { required: true })
const texto = defineModel<string>('texto', { required: true })

/**
 * O modo de texto livre fica ligado enquanto houver texto, e não é desligado
 * automaticamente quando o campo esvazia: quem apagou para redigitar veria o campo
 * desaparecer no meio da frase.
 */
const livre = ref(texto.value.trim().length > 0)

watch(texto, (valor) => {
  if (valor.trim()) livre.value = true
})

const opcoes = computed(() => props.membros.filter(m => m.user_id !== props.euId))

const escolhido = computed(() => opcoes.value.find(m => m.user_id === userId.value) ?? null)

const rotulo = computed(() => {
  if (escolhido.value) return escolhido.value.exibicao
  if (texto.value.trim()) return texto.value.trim()
  return 'Ninguém em especial'
})

function escolherMembro(membro: Membro) {
  userId.value = membro.user_id
  texto.value = ''
  livre.value = false
}

function limpar() {
  userId.value = null
  texto.value = ''
  livre.value = false
}

function abrirTextoLivre() {
  userId.value = null
  livre.value = true
}
</script>

<template>
  <div class="space-y-1.5">
    <Label>Para quem <span class="text-muted-foreground">(opcional)</span></Label>

    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button type="button" variant="outline" class="w-full justify-start gap-2 font-normal">
          <UserIcon class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate text-left" :class="escolhido || texto.trim() ? '' : 'text-muted-foreground'">
            {{ rotulo }}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" class="w-56">
        <DropdownMenuItem class="gap-2" @select="limpar">
          <span class="flex-1">Ninguém em especial</span>
          <CheckIcon v-if="!userId && !texto.trim()" class="size-4 text-primary" />
        </DropdownMenuItem>

        <template v-if="opcoes.length">
          <DropdownMenuSeparator />
          <DropdownMenuItem
            v-for="membro in opcoes"
            :key="membro.user_id"
            class="gap-2"
            @select="escolherMembro(membro)"
          >
            <span class="flex-1 truncate">{{ membro.exibicao }}</span>
            <CheckIcon v-if="membro.user_id === userId" class="size-4 text-primary" />
          </DropdownMenuItem>
        </template>

        <DropdownMenuSeparator />
        <DropdownMenuItem class="gap-2" @select="abrirTextoLivre">
          <span class="flex-1">Outra pessoa…</span>
          <CheckIcon v-if="livre && !userId" class="size-4 text-primary" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <Input
      v-if="livre"
      v-model="texto"
      placeholder="minha mãe"
      autocomplete="off"
      aria-label="Para quem, por escrito"
    />
  </div>
</template>
