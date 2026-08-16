/**
 * Cifra simétrica para segredo guardado no banco.
 *
 * Existe separada de `spotify-conta.ts` porque não depende de nada do Nuxt nem
 * do Supabase — é `node:crypto` puro. Isso a torna testável sem subir meio
 * framework, que é o mínimo para um pedaço de código cujo bug não aparece na
 * tela: uma cifra quebrada continua "funcionando" até alguém tentar ler de
 * volta o que foi guardado.
 *
 * AES-256-GCM, e não CBC, porque GCM autentica junto: um byte trocado no banco
 * falha ao decifrar em vez de devolver lixo que seria mandado para fora.
 *
 * O formato é `iv.tag.texto`, os três em base64url — cabe numa coluna `text` e
 * não precisa de mais nada para ser lido de volta.
 */
import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const SEPARADOR = '.'

/** 12 bytes é o nonce padrão do GCM — o tamanho para o qual ele foi desenhado. */
const TAMANHO_IV = 12

/**
 * A chave de 32 bytes que o AES-256 exige, a partir de um segredo de qualquer
 * tamanho. SHA-256 aqui é derivação de formato, não proteção de senha: o
 * segredo vem do .env, com entropia de máquina, não de algo que alguém digitou.
 */
export function chaveDeCifra(segredo: string): Buffer {
  return createHash('sha256').update(segredo).digest()
}

export function cifrar(chave: Buffer, texto: string): string {
  const iv = randomBytes(TAMANHO_IV)
  const cifra = createCipheriv('aes-256-gcm', chave, iv)
  const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()])

  return [iv, cifra.getAuthTag(), dados]
    .map(b => b.toString('base64url'))
    .join(SEPARADOR)
}

/** Lança se o texto foi adulterado, truncado, ou se a chave é outra. */
export function decifrar(chave: Buffer, cifrado: string): string {
  const partes = cifrado.split(SEPARADOR)
  if (partes.length !== 3) throw new Error('formato inválido')

  const [iv, tag, dados] = partes.map(p => Buffer.from(p, 'base64url'))
  if (!iv?.length || !tag?.length || !dados) throw new Error('formato inválido')

  const decifra = createDecipheriv('aes-256-gcm', chave, iv)
  decifra.setAuthTag(tag)

  return Buffer.concat([decifra.update(dados), decifra.final()]).toString('utf8')
}
