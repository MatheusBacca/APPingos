<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import {
  LayoutDashboardIcon,
  LogOutIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SettingsIcon,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { MODULOS_ORDENADOS, MODULOS_COM_RESUMO } from '~/modules'
import { useAuth } from '~/composables/useAuth'
import { useSidebar } from '~/composables/useSidebar'

const { sair } = useAuth()
const { aberta, alternar } = useSidebar()

/*
 * O shell esconde a sidebar no mobile por CSS — o componente continua montado.
 * Sem este gate, todo celular pagaria as consultas de todos os módulos, em toda
 * tela, para alimentar um painel que ninguém vê. 768px é o mesmo `md` do layout.
 */
const noDesktop = useMediaQuery('(min-width: 768px)')

/* Recolhida, cada link é só o ícone — o rótulo vira `title` do navegador. */
const classeLink = computed(() => aberta.value ? 'px-3' : 'justify-center px-0')
</script>

<template>
  <aside
    class="flex h-full flex-col gap-1 border-r bg-sidebar p-3 transition-[width] duration-200"
    :class="aberta ? 'w-64' : 'w-16'"
  >
    <div
      class="flex items-center gap-1"
      :class="aberta ? 'justify-between px-2 py-3' : 'flex-col py-2'"
    >
      <AppLogo :com-texto="aberta" />

      <Button
        variant="ghost"
        size="icon"
        class="shrink-0"
        :aria-label="aberta ? 'Recolher o menu' : 'Expandir o menu'"
        :title="aberta ? 'Recolher o menu' : 'Expandir o menu'"
        @click="alternar()"
      >
        <component :is="aberta ? PanelLeftCloseIcon : PanelLeftOpenIcon" class="size-4" />
      </Button>
    </div>

    <SpaceSwitcher :compacto="!aberta" />

    <Separator class="my-2" />

    <nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Módulos">
      <NuxtLink
        to="/"
        class="flex items-center gap-3 rounded-lg py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        :class="classeLink"
        active-class="!bg-sidebar-accent !text-sidebar-accent-foreground"
        title="Início"
      >
        <LayoutDashboardIcon class="size-4 shrink-0" />
        <span v-if="aberta">Início</span>
      </NuxtLink>

      <NuxtLink
        v-for="modulo in MODULOS_ORDENADOS"
        :key="modulo.slug"
        :to="modulo.rota"
        class="flex items-center gap-3 rounded-lg py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        :class="classeLink"
        active-class="!bg-sidebar-accent !text-sidebar-accent-foreground"
        :title="modulo.rotulo"
      >
        <ModuleIcon :nome="modulo.icone" class="size-4 shrink-0" />
        <template v-if="aberta">
          <span class="flex-1">{{ modulo.rotulo }}</span>
          <span
            v-if="!modulo.ativo"
            class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            em breve
          </span>
        </template>
      </NuxtLink>
    </nav>

    <!--
      O painel de resumos — os mesmos widgets do dashboard, aqui sempre à vista.
      Módulo sem nada a dizer some por inteiro, e a seção some junto quando
      nenhum tem: uma caixa vazia fixa no canto seria pior que não ter painel.
      Recolhida não há largura para um resumo, e não montar também desliga as
      consultas dele.
    -->
    <section
      v-if="noDesktop && aberta"
      class="mt-2 shrink-0 space-y-2 empty:hidden"
      aria-label="Resumos dos módulos"
    >
      <ResumoDoModulo
        v-for="modulo in MODULOS_COM_RESUMO"
        :key="modulo.slug"
        :modulo="modulo"
        variante="lateral"
      />
    </section>

    <Separator class="my-2" />

    <div class="flex items-center gap-1" :class="aberta ? '' : 'flex-col'">
      <Button
        variant="ghost"
        :size="aberta ? 'sm' : 'icon'"
        :class="aberta ? 'flex-1 justify-start gap-2' : ''"
        title="Espaços"
        as-child
      >
        <NuxtLink to="/espacos">
          <SettingsIcon class="size-4" />
          <span v-if="aberta">Espaços</span>
        </NuxtLink>
      </Button>

      <ThemeToggle />

      <Button variant="ghost" size="icon" aria-label="Sair" title="Sair" @click="sair">
        <LogOutIcon class="size-4" />
      </Button>
    </div>
  </aside>
</template>
