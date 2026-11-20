<script setup lang="ts">
/**
 * O CPF da pessoa, para o app reconhecer quem é quem nos Pix do extrato.
 *
 * O extrato do Open Finance traz o CPF da outra ponta de cada transferência.
 * Com o CPF de cada pessoa do app, "Transferência recebida — Daiane Babicz" vira
 * "Pinga Fogo transferiu para Bixo Pingo" no extrato de quem recebeu — e o Pix do
 * acerto casa com o mês mesmo quando o nome no banco é diferente do cadastro.
 *
 * Privado de verdade: mora em `documento_pessoal`, que só a dona lê. Quem divide
 * o espaço nunca vê o número; vê o Pix dela reconhecido.
 */
import { toast } from 'vue-sonner'
import { IdCardIcon, LockIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { mensagemDeErro } from '@/lib/utils'
import { cpfValido, formatarCpf } from '~/lib/pix'
import { useMeuCpf, useSalvarCpf } from '~/composables/useDocumento'

const cpf = useMeuCpf()
const salvar = useSalvarCpf()

const texto = ref('')
watch(() => cpf.data.value, (v) => { texto.value = v ? formatarCpf(v) : '' }, { immediate: true })

const digitos = computed(() => texto.value.replace(/\D/g, ''))
const problema = computed(() => (digitos.value && !cpfValido(digitos.value) ? 'CPF inválido.' : null))
const mudou = computed(() => digitos.value !== (cpf.data.value ?? ''))

async function onSalvar() {
  if (!mudou.value || problema.value) return
  try {
    await salvar.mutateAsync(digitos.value || null)
    toast.success(digitos.value ? 'CPF salvo. Os Pix entre vocês passam a ser reconhecidos.' : 'CPF removido.')
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar o CPF.'))
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2 text-base">
        <IdCardIcon class="size-4 text-muted-foreground" />
        Seu CPF
      </CardTitle>
      <CardDescription>
        Para o app reconhecer, no extrato de quem divide um espaço com você, os Pix que você manda
        e recebe: "Pinga Fogo transferiu para Bixo Pingo", em vez do nome que o banco mostra.
      </CardDescription>
    </CardHeader>

    <CardContent class="space-y-3">
      <p class="flex items-start gap-2 rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
        <LockIcon class="mt-0.5 size-3.5 shrink-0" />
        <span>
          <strong class="text-foreground">Só você vê o número.</strong>
          Ninguém do espaço lê o seu CPF: o app só diz a quem recebeu um Pix que ele veio de você.
        </span>
      </p>

      <form class="flex flex-col gap-3 sm:flex-row sm:items-start" @submit.prevent="onSalvar">
        <div class="flex-1 space-y-2">
          <Label for="cpf" class="sr-only">CPF</Label>
          <Input
            id="cpf"
            v-model="texto"
            inputmode="numeric"
            autocomplete="off"
            placeholder="000.000.000-00"
            maxlength="14"
            :disabled="cpf.isPending.value"
            @blur="texto = digitos.length === 11 ? formatarCpf(digitos) : texto"
          />
          <p class="text-xs" :class="problema ? 'text-destructive' : 'text-muted-foreground'">
            <template v-if="problema">{{ problema }}</template>
            <template v-else-if="cpf.data.value && !digitos">Apague e salve para remover.</template>
            <template v-else>Só os números já bastam.</template>
          </p>
        </div>
        <Button type="submit" variant="secondary" :disabled="!mudou || !!problema || salvar.isPending.value">
          {{ salvar.isPending.value ? 'Salvando…' : 'Salvar' }}
        </Button>
      </form>
    </CardContent>
  </Card>
</template>
