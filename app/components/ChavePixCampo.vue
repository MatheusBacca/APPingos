<script setup lang="ts">
/**
 * A chave Pix de quem está logado — para receber o acerto do mês.
 *
 * Mora em Espaços, junto do apelido: é dado da pessoa, vale em todos os espaços,
 * e quem divide um espaço com ela é quem a lê (`profile_select`). O Pix copia e
 * cola do acerto é gerado com ela na tela de quem PAGA.
 */
import { toast } from 'vue-sonner'
import { KeyRoundIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { mensagemDeErro } from '@/lib/utils'
import { ROTULO_TIPO_CHAVE, TIPOS_CHAVE_PIX, normalizarChavePix, problemaNaChavePix } from '~/lib/pix'
import type { TipoChavePix } from '~/lib/pix'
import { useDefinirChavePix, usePerfil } from '~/composables/usePerfil'

const perfil = usePerfil()
const definir = useDefinirChavePix()

const tipo = ref<TipoChavePix>('cpf')
const valor = ref('')

watch(() => perfil.data.value, (p) => {
  if (!p) return
  tipo.value = p.chave_pix_tipo ?? 'cpf'
  valor.value = p.chave_pix ?? ''
}, { immediate: true })

const normalizada = computed(() => (valor.value.trim() ? normalizarChavePix(tipo.value, valor.value) : ''))
const problema = computed(() => (normalizada.value ? problemaNaChavePix(tipo.value, normalizada.value) : null))

const mudou = computed(() =>
  normalizada.value !== (perfil.data.value?.chave_pix ?? '')
  || (!!normalizada.value && tipo.value !== perfil.data.value?.chave_pix_tipo),
)

const EXEMPLO: Record<TipoChavePix, string> = {
  cpf: '000.000.000-00',
  cnpj: '00.000.000/0000-00',
  email: 'voce@exemplo.com',
  telefone: '(41) 99999-0000',
  aleatoria: '123e4567-e89b-12d3-a456-426614174000',
}

async function salvar() {
  if (!mudou.value || problema.value) return
  try {
    await definir.mutateAsync(normalizada.value ? { chave: normalizada.value, tipo: tipo.value } : null)
    valor.value = normalizada.value
    toast.success(normalizada.value ? 'Chave Pix salva.' : 'Chave Pix removida.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar a chave Pix.'))
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2 text-base">
        <KeyRoundIcon class="size-4 text-muted-foreground" />
        Sua chave Pix
      </CardTitle>
      <CardDescription>
        Para receber o acerto do mês: quem te deve abre o Pix pronto, com o valor certo. Só quem
        divide um espaço com você vê a chave.
      </CardDescription>
    </CardHeader>

    <CardContent>
      <form class="flex flex-col gap-3 sm:flex-row sm:items-start" @submit.prevent="salvar">
        <div class="space-y-2">
          <Label for="chave-pix-tipo" class="sr-only">Tipo de chave</Label>
          <select
            id="chave-pix-tipo"
            v-model="tipo"
            class="h-9 rounded-md border bg-background px-2 text-sm"
            :disabled="perfil.isPending.value"
          >
            <option v-for="t in TIPOS_CHAVE_PIX" :key="t" :value="t">{{ ROTULO_TIPO_CHAVE[t] }}</option>
          </select>
        </div>

        <div class="flex-1 space-y-2">
          <Label for="chave-pix" class="sr-only">Chave Pix</Label>
          <Input
            id="chave-pix"
            v-model="valor"
            :placeholder="EXEMPLO[tipo]"
            :disabled="perfil.isPending.value"
            autocomplete="off"
          />
          <p class="text-xs" :class="problema ? 'text-destructive' : 'text-muted-foreground'">
            <template v-if="problema">{{ problema }}</template>
            <template v-else-if="!normalizada">Apague o campo e salve para remover a chave.</template>
            <template v-else>Vai no Pix como <code>{{ normalizada }}</code>.</template>
          </p>
        </div>

        <Button type="submit" variant="secondary" :disabled="!mudou || !!problema || definir.isPending.value">
          {{ definir.isPending.value ? 'Salvando…' : 'Salvar' }}
        </Button>
      </form>
    </CardContent>
  </Card>
</template>
