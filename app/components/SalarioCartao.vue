<script setup lang="ts">
/**
 * O salário na tela de perfil: valor líquido, quando cai e com quem está aberto.
 *
 * Mora aqui, ao lado do apelido, porque é dado da PESSOA — vale em todos os
 * espaços. Mas não é coluna de `profile`: a policy `profile_select` deixa quem
 * divide um espaço ler a linha inteira, e o salário vazaria. Ele vive em `renda`,
 * e o compartilhamento é uma escolha explícita, espaço por espaço.
 *
 * O padrão é privado, e a tela diz isso antes de qualquer outra coisa: a primeira
 * pergunta de quem vai digitar o salário num app de casal é "ela vai ver?".
 */
import { toast } from 'vue-sonner'
import { LockIcon, UsersIcon, WalletIcon } from '@lucide/vue'
import { mensagemDeErro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatarDinheiro } from '@/lib/dinheiro'
import {
  useCompartilharRenda,
  useMeusCompartilhamentos,
  useMinhaRenda,
} from '~/composables/useRenda'
import { useSpaceStore } from '~/stores/space'

const store = useSpaceStore()

const renda = useMinhaRenda()
const compartilhamentos = useMeusCompartilhamentos()
const compartilhar = useCompartilharRenda()

// ---- Quem vê -----------------------------------------------------------------

/** Só os compartilhados: no pessoal não há mais ninguém para ver. */
const espacosCompartilhados = computed(() => store.espacos.filter(e => e.tipo !== 'pessoal'))

const abertoEm = (spaceId: string) => compartilhamentos.data.value?.has(spaceId) ?? false

const nenhumAberto = computed(() => !espacosCompartilhados.value.some(e => abertoEm(e.id)))

async function alternar(spaceId: string, nome: string) {
  const vaiAbrir = !abertoEm(spaceId)
  try {
    await compartilhar.mutateAsync({ spaceId, compartilhar: vaiAbrir })
    toast.success(vaiAbrir
      ? `Quem está em "${nome}" agora vê o seu salário.`
      : `Seu salário voltou a ser só seu em "${nome}".`)
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para mudar quem vê o salário.'))
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2 text-base">
        <WalletIcon class="size-4 text-muted-foreground" />
        Seu salário
      </CardTitle>
      <CardDescription>
        O valor líquido que cai na sua conta, e quando. É a base do Planejamento em Orçamentos.
      </CardDescription>
    </CardHeader>

    <CardContent class="space-y-5">
      <!--
        A privacidade vem antes do formulário, e não num rodapé: é a pergunta que a
        pessoa faz antes de digitar o número.
      -->
      <p class="flex items-start gap-2 rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
        <LockIcon class="mt-0.5 size-3.5 shrink-0" />
        <span>
          <template v-if="nenhumAberto">
            <strong class="text-foreground">Só você vê.</strong>
          </template>
          <template v-else>
            <strong class="text-foreground">Aberto só onde você escolheu, abaixo.</strong>
          </template>
          Sem compartilhar, quem divide um espaço com você vê apenas quanto você põe nas contas
          dele — nunca o salário, nem um percentual que permita calcular.
        </span>
      </p>

      <SalarioFormulario />

      <div class="space-y-2 border-t pt-4">
        <h3 class="flex items-center gap-2 text-sm font-medium">
          <UsersIcon class="size-4 text-muted-foreground" />
          Quem vê
        </h3>

        <p v-if="!espacosCompartilhados.length" class="text-xs text-muted-foreground">
          Você ainda não divide nenhum espaço — não há com quem compartilhar.
        </p>

        <template v-else>
          <ul class="space-y-2">
            <li v-for="espaco in espacosCompartilhados" :key="espaco.id" class="flex items-center gap-3">
              <span class="min-w-0 flex-1 truncate text-sm">{{ espaco.nome }}</span>
              <Button
                type="button"
                size="sm"
                :variant="abertoEm(espaco.id) ? 'default' : 'outline'"
                :aria-pressed="abertoEm(espaco.id)"
                :disabled="compartilhar.isPending.value || compartilhamentos.isPending.value"
                @click="alternar(espaco.id, espaco.nome)"
              >
                {{ abertoEm(espaco.id) ? 'Compartilhado' : 'Compartilhar' }}
              </Button>
            </li>
          </ul>
          <p class="text-xs text-muted-foreground">
            Compartilhar mostra o valor{{ renda.data.value ? ` (${formatarDinheiro(renda.data.value.valor_liquido)})` : '' }}
            a quem está naquele espaço, e o percentual da sua contribuição passa a aparecer lá. Vale
            só para aquele espaço, e você desfaz quando quiser.
          </p>
        </template>
      </div>
    </CardContent>
  </Card>
</template>
