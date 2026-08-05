import { mensagemDeErro } from '@/lib/utils'
import { toast } from 'vue-sonner'
import { useResgatarConvite } from '~/composables/useEspacos'

const CHAVE_LS = 'appingos:convite-pendente'

/**
 * Guarda o código de convite entre a página /convite e o momento em que uma
 * sessão de fato existe (login imediato, cadastro sem confirmação de e-mail,
 * ou o retorno do link de confirmação).
 *
 * Existe porque o cadastro por e-mail não dá sessão na hora — só depois que a
 * pessoa clica no link de confirmação, que pode ser minutos depois e, em
 * teoria, num outro carregamento da página. O localStorage é o que sobrevive
 * a essa lacuna no mesmo navegador; se a confirmação for aberta em outro
 * navegador ou dispositivo, o convite fica para ser digitado à mão em
 * Espaços — limitação inerente a fluxos de link por e-mail, não só nossa.
 */
export function useConvitePendente() {
  const resgatar = useResgatarConvite()

  function salvar(codigo: string) {
    if (import.meta.client) localStorage.setItem(CHAVE_LS, codigo)
  }

  function ler(): string | null {
    return import.meta.client ? localStorage.getItem(CHAVE_LS) : null
  }

  function limpar() {
    if (import.meta.client) localStorage.removeItem(CHAVE_LS)
  }

  /** Chamar sempre que uma sessão nova começa a existir. */
  async function resolverSeHouver() {
    const codigo = ler()
    if (!codigo) return

    try {
      await resgatar.mutateAsync(codigo)
      toast.success('Você entrou no espaço do convite.')
    }
    catch (e) {
      // Código expirado/já usado não deveria travar o login/cadastro — a
      // pessoa continua e pode digitar o código à mão em Espaços depois.
      toast.error(mensagemDeErro(e, 'Não foi possível entrar no espaço do convite.'))
    }
    finally {
      limpar()
    }
  }

  return { salvar, ler, limpar, resolverSeHouver }
}
