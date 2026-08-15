/**
 * A cifra do refresh token do Spotify.
 *
 * É o pedaço do app cujo bug NÃO aparece na tela: cifrar errado continua
 * gravando alguma coisa no banco, e o problema só aparece quando alguém tenta
 * ler de volta — possivelmente semanas depois, na cara de quem só queria ver
 * uma playlist.
 *
 * O que estes testes travam é a promessa que a migration faz: o que está na
 * linha não serve para nada sem a chave do servidor, e não pode ser adulterado
 * em silêncio.
 */
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { chaveDeCifra, cifrar, decifrar } from '~~/server/utils/cifra'

const CHAVE = chaveDeCifra('um-segredo-qualquer-do-env')
const OUTRA = chaveDeCifra('outro-segredo-qualquer')
const TOKEN = 'AQD9x_refresh_token_do_spotify_com-hifen_e_underline'

describe('chaveDeCifra', () => {
  it('devolve sempre 32 bytes, que é o que o AES-256 exige', () => {
    for (const segredo of ['x', 'a'.repeat(500), 'çãé 🎵']) {
      expect(chaveDeCifra(segredo)).toHaveLength(32)
    }
  })

  it('é determinística — a mesma chave abre o que ela fechou ontem', () => {
    expect(chaveDeCifra('igual')).toEqual(chaveDeCifra('igual'))
    expect(chaveDeCifra('igual')).not.toEqual(chaveDeCifra('diferente'))
  })
})

describe('cifrar e decifrar', () => {
  it('devolve o texto original', () => {
    expect(decifrar(CHAVE, cifrar(CHAVE, TOKEN))).toBe(TOKEN)
  })

  it('aguenta texto vazio e acentuado', () => {
    for (const texto of ['', 'ação é 🎧', 'a'.repeat(4000)]) {
      expect(decifrar(CHAVE, cifrar(CHAVE, texto))).toBe(texto)
    }
  })

  it('não deixa o token aparecer no resultado', () => {
    const cifrado = cifrar(CHAVE, TOKEN)

    expect(cifrado).not.toContain(TOKEN)
    // base64url: nada de `+`, `/` ou `=` para escapar ao ir e voltar do banco.
    expect(cifrado).toMatch(/^[\w-]+\.[\w-]+\.[\w-]*$/)
  })

  it('gera saída diferente a cada vez, mesmo para o mesmo texto', () => {
    // Se o IV fosse fixo, duas pessoas com o mesmo token teriam a mesma linha —
    // e daria para saber que são iguais sem decifrar nenhuma.
    expect(cifrar(CHAVE, TOKEN)).not.toBe(cifrar(CHAVE, TOKEN))
  })

  it('recusa a chave errada em vez de devolver lixo', () => {
    const cifrado = cifrar(CHAVE, TOKEN)
    expect(() => decifrar(OUTRA, cifrado)).toThrow()
  })

  it('recusa texto adulterado — é para isso que o GCM serve', () => {
    const cifrado = cifrar(CHAVE, TOKEN)
    const [iv, tag, dados] = cifrado.split('.')

    // Um byte trocado no fim dos dados.
    const mexido = Buffer.from(dados!, 'base64url')
    mexido[mexido.length - 1] ^= 0xFF
    expect(() => decifrar(CHAVE, `${iv}.${tag}.${mexido.toString('base64url')}`)).toThrow()

    // Tag de autenticação trocada.
    const outraTag = Buffer.from(tag!, 'base64url')
    outraTag[0] ^= 0xFF
    expect(() => decifrar(CHAVE, `${iv}.${outraTag.toString('base64url')}.${dados}`)).toThrow()
  })

  it('recusa formato que não é o nosso, sem estourar de outro jeito', () => {
    for (const entrada of ['', 'sem-pontos', 'so.dois', 'a.b.c.d']) {
      expect(() => decifrar(CHAVE, entrada), entrada).toThrow()
    }
  })
})
