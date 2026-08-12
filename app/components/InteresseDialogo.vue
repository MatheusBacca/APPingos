<script setup lang="ts">
/**
 * Formulário de um interesse — o título, para onde ele aponta e para quem é.
 *
 * O produto NÃO entra aqui, e é a decisão que organiza a tela: um interesse pode
 * ter vários candidatos, então "adicionar produto" pertence ao detalhe, ao lado
 * dos que já existem. Um campo de produto no diálogo de criação sugeriria um por
 * interesse e faria a segunda captura parecer um interesse novo.
 *
 * `destino` tem default 'compra' porque é de longe o caso comum — a extensão do
 * Chrome só produz interesses de compra — e porque um seletor obrigatório logo no
 * primeiro campo transforma "anotar uma ideia" em formulário.
 */
import { toast } from 'vue-sonner'
import { CheckIcon } from '@lucide/vue'
import { mensagemDeErro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DESTINOS, ESTADOS, rotuloDestino, rotuloEstado } from '~/types/interesse'
import type { DestinoInteresse, EstadoInteresse, InteresseComProdutos } from '~/types/interesse'
import { useRegistrarInteresse, useAtualizarInteresse } from '~/composables/useInteresses'

const props = defineProps<{
  /** Preenchido = o diálogo abre em modo de edição. */
  interesse?: InteresseComProdutos | null
}>()

const emit = defineEmits<{ criado: [id: string] }>()

const aberto = defineModel<boolean>('aberto', { required: true })

const registrar = useRegistrarInteresse()
const atualizar = useAtualizarInteresse()

const editando = computed(() => !!props.interesse)
const salvando = computed(() => registrar.isPending.value || atualizar.isPending.value)

const titulo = ref('')
const destino = ref<DestinoInteresse>('compra')
const estado = ref<EstadoInteresse>('rascunho')
const paraQuem = ref('')
const observacao = ref('')

function reiniciar() {
  titulo.value = ''
  destino.value = 'compra'
  estado.value = 'rascunho'
  paraQuem.value = ''
  observacao.value = ''
}

function preencherCom(interesse: InteresseComProdutos) {
  titulo.value = interesse.titulo
  destino.value = interesse.destino
  estado.value = interesse.estado
  paraQuem.value = interesse.para_quem ?? ''
  observacao.value = interesse.observacao ?? ''
}

// Mesmo padrão de CompraDialogo: o formulário se prepara ao ABRIR, não na
// montagem — o componente fica montado no rodapé da página entre um uso e outro.
watch(aberto, (estaAberto) => {
  if (!estaAberto) return
  if (props.interesse) preencherCom(props.interesse)
  else reiniciar()
})

const podeSalvar = computed(() => titulo.value.trim().length > 0 && !salvando.value)

async function salvar() {
  if (!podeSalvar.value) return

  const campos = {
    titulo: titulo.value.trim(),
    destino: destino.value,
    para_quem: paraQuem.value.trim() || null,
    observacao: observacao.value.trim() || null,
  }

  try {
    if (props.interesse) {
      await atualizar.mutateAsync({ ...campos, id: props.interesse.id, estado: estado.value })
      toast.success('Interesse atualizado.')
    }
    else {
      const id = await registrar.mutateAsync(campos)
      toast.success('Interesse registrado.')
      emit('criado', id)
    }
    aberto.value = false
  }
  catch (e) {
    toast.error(mensagemDeErro(e, 'Não deu para salvar o interesse.'))
  }
}
</script>

<template>
  <Dialog v-model:open="aberto">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ editando ? 'Editar interesse' : 'Novo interesse' }}</DialogTitle>
        <DialogDescription>
          A ideia crua, antes de ter meta e prazo. Os produtos entram depois, no detalhe.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="salvar">
        <div class="space-y-1.5">
          <Label for="interesse-titulo">O que é</Label>
          <Input
            id="interesse-titulo"
            v-model="titulo"
            placeholder="Trocar o sofá"
            autocomplete="off"
            required
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label>Isso aponta para</Label>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button type="button" variant="outline" class="w-full justify-start">
                  {{ rotuloDestino(destino) }}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  v-for="opcao in DESTINOS"
                  :key="opcao.valor"
                  class="gap-2"
                  @select="destino = opcao.valor"
                >
                  <span class="flex-1">{{ opcao.rotulo }}</span>
                  <CheckIcon v-if="opcao.valor === destino" class="size-4 text-primary" />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <!--
            O estado só aparece na edição. Interesse novo é rascunho por
            definição, e oferecer "convertido" na criação seria oferecer um estado
            impossível.
          -->
          <div v-if="editando" class="space-y-1.5">
            <Label>Em que pé está</Label>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button type="button" variant="outline" class="w-full justify-start">
                  {{ rotuloEstado(estado) }}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  v-for="opcao in ESTADOS"
                  :key="opcao.valor"
                  class="gap-2"
                  @select="estado = opcao.valor"
                >
                  <span class="flex-1">{{ opcao.rotulo }}</span>
                  <CheckIcon v-if="opcao.valor === estado" class="size-4 text-primary" />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div class="space-y-1.5">
            <Label for="interesse-para-quem">Para quem <span class="text-muted-foreground">(opcional)</span></Label>
            <Input
              id="interesse-para-quem"
              v-model="paraQuem"
              placeholder="minha mãe"
              autocomplete="off"
            />
          </div>
        </div>

        <div class="space-y-1.5">
          <Label for="interesse-observacao">Por que interessa <span class="text-muted-foreground">(opcional)</span></Label>
          <Textarea
            id="interesse-observacao"
            v-model="observacao"
            rows="3"
            placeholder="a sala pede algo mais claro; medir a parede antes"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" @click="aberto = false">Cancelar</Button>
          <Button type="submit" :disabled="!podeSalvar">
            {{ salvando ? 'Salvando…' : editando ? 'Salvar' : 'Registrar' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
