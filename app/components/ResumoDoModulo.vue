<script setup lang="ts">
/**
 * As linhas de resumo de um módulo — o mesmo conteúdo, dois formatos.
 *
 * O conteúdo vem inteiro do composable registrado em `app/modules.ts`; aqui só
 * se decide como ele aparece. É essa separação que impede o cartão do dashboard
 * e o bloco da sidebar de divergirem na primeira manutenção.
 */
// `computed` explícito (e não auto-importado) porque este componente é montado
// fora do Nuxt no teste — ver test/resumo-do-modulo.test.ts.
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { AppModule } from '~/modules'
import { CLASSE_TOM } from '~/types/resumo'
import type { LinhaResumo } from '~/types/resumo'

const props = defineProps<{
  modulo: AppModule
  /**
   * `cartao`: no dashboard, dentro do cartão do módulo — sem nada a dizer, cai
   * na descrição estática, porque o cartão existe de qualquer jeito (é a
   * navegação). `lateral`: na sidebar do desktop — sem nada a dizer, some.
   */
  variante: 'cartao' | 'lateral'
}>()

/*
 * Chamado uma vez, no setup. Parece chamada condicional de composable, mas não
 * é: quem monta este componente passa `:key="modulo.slug"`, então uma instância
 * nunca troca de módulo — outro módulo é outra instância.
 *
 * O try/catch não é decoração. Este componente é montado pela sidebar no boot,
 * então um resumo que estoure no setup levava o app inteiro junto: o erro subia
 * até o Nuxt e virava uma tela 500, em vez de faltar um resumo no canto. Agora
 * um widget quebrado degrada para "nada a dizer" — o cartão do dashboard cai na
 * descrição do módulo e o bloco da sidebar some.
 */
function iniciarResumo(): ComputedRef<LinhaResumo[]> | undefined {
  try {
    return props.modulo.resumo?.()
  }
  catch (e) {
    console.error(`[resumo] o módulo "${props.modulo.slug}" falhou ao montar:`, e)
    return undefined
  }
}

const resumo = iniciarResumo()

const linhas = computed<LinhaResumo[]>(() => {
  try {
    return resumo?.value ?? []
  }
  catch (e) {
    console.error(`[resumo] o módulo "${props.modulo.slug}" falhou ao calcular:`, e)
    return []
  }
})
</script>

<template>
  <p
    v-if="!linhas.length && variante === 'cartao'"
    class="mt-0.5 block text-sm text-muted-foreground"
  >
    {{ modulo.descricao }}
  </p>

  <div
    v-else-if="linhas.length"
    :class="variante === 'lateral' ? 'rounded-lg bg-sidebar-accent/50 px-3 py-2' : 'mt-1'"
  >
    <NuxtLink
      v-if="variante === 'lateral'"
      :to="modulo.rota"
      class="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
    >
      <ModuleIcon :nome="modulo.icone" class="size-3" />
      {{ modulo.rotulo }}
    </NuxtLink>

    <ul class="space-y-0.5">
      <li
        v-for="linha in linhas"
        :key="linha.chave"
        class="flex items-baseline gap-2 text-sm"
      >
        <!--
          `title` porque a linha é estreita por natureza (a sidebar tem 256px):
          um título de filme comprido continua legível no hover em vez de virar
          reticências e ponto final.
        -->
        <span
          class="min-w-0 flex-1 truncate"
          :title="linha.nota ? `${linha.rotulo} · ${linha.nota}` : linha.rotulo"
        >
          <span :class="linha.destaque ? 'font-medium' : ''">{{ linha.rotulo }}</span>
          <!--
            A nota carrega o sentido que a cor sozinha não pode carregar: qual
            mês é aquele saldo, quem mandou o convite.
          -->
          <span v-if="linha.nota" class="text-xs text-muted-foreground">
            · {{ linha.nota }}
          </span>
        </span>

        <span
          v-if="linha.valor"
          class="shrink-0 font-medium tabular-nums"
          :class="CLASSE_TOM[linha.tom ?? 'neutro']"
        >
          <span v-if="linha.valorDescrito" class="sr-only">{{ linha.valorDescrito }}</span>
          {{ linha.valor }}
        </span>
      </li>
    </ul>
  </div>
</template>
