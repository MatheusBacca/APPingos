import { useQueryClient } from '@tanstack/vue-query'

export function useAuth() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const store = useSpaceStore()
  const queryClient = useQueryClient()
  const router = useRouter()

  async function entrar(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) throw error
    await router.push('/')
  }

  async function cadastrar(nome: string, email: string, senha: string) {
    // `nome` vai em raw_user_meta_data; o trigger handle_new_user lê de lá para
    // montar o profile e o espaço pessoal.
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } },
    })
    if (error) throw error

    // Se a confirmação de e-mail estiver ligada no projeto, não há sessão ainda.
    return { precisaConfirmar: !data.session }
  }

  async function sair() {
    await supabase.auth.signOut()
    store.limpar()
    queryClient.clear()
    await router.push('/login')
  }

  return { user, entrar, cadastrar, sair }
}
