/**
 * De onde sai o texto que a pessoa lê quando algo falha.
 *
 * São três formatos de erro no mesmo app, e é isso que torna a função
 * traiçoeira: o `FetchError` do ofetch (rotas de `/api/*`), os objetos simples
 * do supabase-js (`PostgrestError`, `AuthError`, que não são `Error`) e o que
 * não é nem um nem outro.
 *
 * A ordem entre os dois primeiros importa e é o que este arquivo trava: num
 * FetchError o `message` existe, mas vem como
 * `[GET] "/api/…": 503 …` e com os acentos comidos pela linha de status do
 * HTTP. O corpo JSON tem o mesmo texto inteiro, então ele vem primeiro.
 */
import { describe, expect, it } from 'vitest'
import { mensagemDeErro } from '~/lib/utils'

describe('mensagemDeErro', () => {
  it('prefere o corpo da resposta ao message montado pelo ofetch', () => {
    const fetchError = {
      message: '[GET] "/api/spotify/busca?q=radiohead": 503 NUXT_SPOTIFY_CLIENT_ID no configurados',
      data: { statusCode: 503, message: 'NUXT_SPOTIFY_CLIENT_ID não configurado no .env' },
    }

    expect(mensagemDeErro(fetchError, 'Falhou.')).toBe('NUXT_SPOTIFY_CLIENT_ID não configurado no .env')
  })

  it('continua lendo o message dos erros do supabase-js, que não têm corpo', () => {
    // O caso que motivou a função: PostgrestError não é `Error`.
    expect(mensagemDeErro({ message: 'este convite já foi usado' }, 'Código inválido.'))
      .toBe('este convite já foi usado')

    expect(mensagemDeErro(new Error('deu ruim'), 'Falhou.')).toBe('deu ruim')
  })

  it('ignora corpo sem mensagem aproveitável e cai no message', () => {
    expect(mensagemDeErro({ message: 'erro cru', data: { statusCode: 500 } }, 'Falhou.')).toBe('erro cru')
    expect(mensagemDeErro({ message: 'erro cru', data: { message: '   ' } }, 'Falhou.')).toBe('erro cru')
    expect(mensagemDeErro({ message: 'erro cru', data: 'texto solto' }, 'Falhou.')).toBe('erro cru')
    expect(mensagemDeErro({ message: 'erro cru', data: null }, 'Falhou.')).toBe('erro cru')
  })

  it('cai no texto de reserva quando não há nada legível', () => {
    for (const entrada of [null, undefined, 'texto solto', 42, {}, { message: '' }, { message: 42 }]) {
      expect(mensagemDeErro(entrada, 'Falhou.')).toBe('Falhou.')
    }
  })
})
