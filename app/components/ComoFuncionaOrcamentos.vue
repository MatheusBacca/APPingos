<script setup lang="ts">
/**
 * "Como a tela funciona" — o único botão do topo do painel de Orçamentos.
 *
 * As seções seguem a ordem dos cartões na tela, com os mesmos nomes: quem abre
 * o guia por causa de um número acha a explicação dele na mesma posição em que o
 * viu. Cada uma diz de onde o número vem, quem mais o vê e para onde o cartão
 * leva.
 *
 * O que antes vivia em letra miúda espalhada pelas abas ("Gasto do espaço" e
 * "Meu bolso" não se somam; o Open Finance é só seu) está reunido aqui.
 */
import { ExternalLinkIcon } from '@lucide/vue'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from '@/components/ui/dialog'

const aberto = defineModel<boolean>('aberto', { required: true })

const SECOES = [
  {
    titulo: 'O mês',
    texto: 'Tudo no painel é do mês escolhido no alto. Um mês que já acabou está fechado; um mês à frente só mostra o que as parcelas já comprometeram. As setas trocam o mês, e "Hoje" volta para o atual.',
  },
  {
    titulo: 'Saldo em contas',
    texto: 'A soma das suas contas correntes conectadas pelo Open Finance, como o banco informou na última sincronização, e logo abaixo o saldo de cada conta. Só você vê. Leva às suas contas conectadas.',
  },
  {
    titulo: 'Gastos do mês',
    texto: '"Gasto do espaço" é o que vocês compraram juntos, pela parcela que cai neste mês — é o que o acerto usa. "Meu bolso" é a sua parte disso mais os seus gastos pessoais, que só você vê. Os dois números não se somam. Embaixo, as faturas abertas de cada cartão (pelo ciclo do cartão, não pelo mês do calendário) e quanto do limite cada uma já tomou — o link "Cartões" abre o detalhe delas. O "+" lança uma compra; o cartão leva ao Chico Moedas, com a lista e as categorias.',
  },
  {
    titulo: 'Sobra do mês',
    texto: 'Seu salário, menos o que você contribui com o casal, os seus gastos pessoais e o que você guardou em metas pessoais. Sem salário cadastrado não há sobra a mostrar — o cartão pede o cadastro. Leva ao Planejamento.',
  },
  {
    titulo: 'Salário do mês',
    texto: 'O seu salário do mês repartido em três: Faturas (o que está nas faturas abertas dos seus cartões), Investido (o que você guardou neste mês em metas e caixinhas) e Livre (o que sobra). A contribuição ao casal não entra aqui — ela está na Sobra do mês. Só aparece no mês corrente, porque as faturas abertas são as do ciclo de hoje.',
  },

  {
    titulo: 'Gastos por período',
    texto: 'Quanto cada mês pesa, pela competência. Os meses à frente já contam as parcelas em andamento. Os botões trocam a janela, e clicar numa barra muda o mês do painel.',
  },
  {
    titulo: 'Planejamento',
    texto: 'Quanto do que o mês tinha (o salário menos a contribuição) já foi usado, comparado com quanto do mês já passou — "no ritmo" é estar mais ou menos junto do calendário. A linha em quatro semanas (1–7, 8–14, 15–21 e 22 ao fim do mês) mostra, em cada uma, quanto foi gasto da parte do planejado que cabia nela; a semana de hoje fica com a borda acesa, e passar de 100% pinta o bloco de âmbar. Uma parcela de compra antiga conta na primeira semana. O recado no alto diz quanto falta para atingir o planejado do mês (ou quanto já passou dele). A cor do anel e do recado é a situação do mês: verde quando o gasto está abaixo do ritmo do calendário, laranja quando está no ritmo e vermelho quando está na frente dele ou já passou do planejado. Num espaço compartilhado aparece também o mês do casal: o valor central menos as parcelas e os aportes em metas do casal.',
  },
  {
    titulo: 'Investimentos',
    texto: 'O total investido e o rendimento bruto, a divisão por banco, na cor de cada um, e as caixinhas cadastradas. Os dados de banco vêm do seu Open Finance — a outra pessoa do espaço não vê.',
  },

  {
    titulo: 'Acerto do mês',
    texto: 'Quem deve a quem pelas compras do espaço neste mês, e quantos lançamentos do extrato ainda esperam destino na caixa de entrada.',
  },
  {
    titulo: 'Em que foi',
    texto: 'As categorias que mais pesaram no mês. Leva ao Chico Moedas, onde dá para abrir cada categoria e editar cada compra.',
  },
  {
    titulo: 'Últimas movimentações',
    texto: 'O que passou pelo extrato dos seus bancos conectados — compras, transferências, receitas e pagamento de fatura —, com o que já foi feito de cada uma ("Lançada", "Receita", "Esperando destino"). Só você vê. Leva à caixa de entrada. Sem banco conectado, o cartão mostra as últimas compras lançadas.',
  },

  {
    titulo: 'Metas em evolução',
    texto: 'As metas abertas, suas e do espaço, com quanto já foi guardado. Leva a Objetivos.',
  },
]
</script>

<template>
  <Dialog v-model:open="aberto">
    <DialogScrollContent class="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Como esta tela funciona</DialogTitle>
        <DialogDescription>
          O painel junta os números de Orçamentos num lugar só. Cada cartão é um atalho: toque nele para
          ver o detalhe.
        </DialogDescription>
      </DialogHeader>

      <ol class="space-y-4 text-sm">
        <li v-for="(secao, i) in SECOES" :key="secao.titulo" class="flex gap-3">
          <span class="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {{ i + 1 }}
          </span>
          <div>
            <h3 class="font-medium">{{ secao.titulo }}</h3>
            <p class="mt-0.5 text-muted-foreground">{{ secao.texto }}</p>
          </div>
        </li>
      </ol>

      <!--
        O caminho para os cartões de banco ganharem número: cadastrar o banco no
        MeuPluggy primeiro, e só então conectá-lo aqui. Sem o primeiro passo, o
        "Conectar banco" do APPingos não encontra conta nenhuma.
      -->
      <section class="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <h3 class="font-medium">Para conectar um banco novo</h3>
        <ol class="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            Cadastre o banco no MeuPluggy, em
            <a
              href="https://meu.pluggy.ai/overview"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
            >meu.pluggy.ai/overview <ExternalLinkIcon class="size-3.5" /></a>.
          </li>
          <li>
            Depois, conecte-o no APPingos em
            <NuxtLink to="/orcamentos/open-finance/contas" class="font-medium text-primary underline-offset-2 hover:underline" @click="aberto = false">
              Open Finance › Contas
            </NuxtLink>.
          </li>
        </ol>
        <p class="text-muted-foreground">
          O passo a passo completo está no
          <NuxtLink to="/orcamentos/open-finance/como-funciona" class="font-medium text-primary underline-offset-2 hover:underline" @click="aberto = false">
            guia do Open Finance
          </NuxtLink>.
        </p>
      </section>
    </DialogScrollContent>
  </Dialog>
</template>
