<script setup lang="ts">
import { EllipsisIcon, LayoutDashboardIcon, RocketIcon } from '@lucide/vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { VERSAO_ATUAL_EXIBICAO } from '~/changelog'
import { MODULOS } from '~/modules'

// 5 alvos é o teto antes de virarem pequenos demais para o dedo.
const naBarra = MODULOS.filter(m => m.naBarra)
const noMais = MODULOS.filter(m => !m.naBarra)
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-safe backdrop-blur md:hidden"
    aria-label="Navegação principal"
  >
    <div class="grid h-16 grid-cols-5">
      <NuxtLink
        to="/"
        class="flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors"
        active-class="!text-primary"
      >
        <LayoutDashboardIcon class="size-5" />
        Início
      </NuxtLink>

      <NuxtLink
        v-for="modulo in naBarra"
        :key="modulo.slug"
        :to="modulo.rota"
        class="flex flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium text-muted-foreground transition-colors"
        active-class="!text-primary"
      >
        <ModuleIcon :nome="modulo.icone" class="size-5" />
        <span class="truncate">{{ modulo.rotulo.split(' ')[0] }}</span>
      </NuxtLink>

      <DropdownMenu>
        <DropdownMenuTrigger
          class="flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
        >
          <EllipsisIcon class="size-5" />
          Mais
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" class="mb-2 w-52">
          <DropdownMenuItem v-for="modulo in noMais" :key="modulo.slug" as-child class="gap-2">
            <NuxtLink :to="modulo.rota">
              <ModuleIcon :nome="modulo.icone" class="size-4 text-muted-foreground" />
              <span class="flex-1">{{ modulo.rotulo }}</span>
            </NuxtLink>
          </DropdownMenuItem>
          <DropdownMenuItem as-child class="gap-2">
            <NuxtLink to="/espacos">Espaços e convites</NuxtLink>
          </DropdownMenuItem>

          <!--
            No mobile não há rodapé de sidebar para carregar a versão, e o "Mais"
            é o único lugar do celular que junta o que não é módulo. A versão vem
            no rótulo porque é a pergunta que mais chega junto com o changelog.
          -->
          <DropdownMenuItem as-child class="gap-2">
            <NuxtLink to="/novidades">
              <RocketIcon class="size-4 text-muted-foreground" />
              <span class="flex-1">Novidades</span>
              <span class="text-xs tabular-nums text-muted-foreground">
                {{ VERSAO_ATUAL_EXIBICAO }}
              </span>
            </NuxtLink>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </nav>
</template>
