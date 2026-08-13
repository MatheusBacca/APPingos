/**
 * A precedência entre apelido e nome.
 *
 * Parece óbvia demais para ter teste, mas é ela que decide o que aparece em
 * TODA tela que mostra gente — e o caso que quebra não é "tem apelido" ou "não
 * tem": é o apelido que existe como string vazia ou só espaços, que um `??`
 * deixaria passar e mostraria uma pessoa sem nome nenhum.
 */
import { describe, expect, it } from 'vitest'
import { APELIDO_MAX, APELIDO_MIN, PAPEL_ROTULO, ehAdmin, nomeDeExibicao } from '~/types/database.types'

describe('nomeDeExibicao', () => {
  it('usa o apelido quando existe', () => {
    expect(nomeDeExibicao({ nome: 'Matheus Bacca', apelido: 'Bacca' })).toBe('Bacca')
  })

  it('cai no nome de cadastro sem apelido', () => {
    expect(nomeDeExibicao({ nome: 'Matheus Bacca', apelido: null })).toBe('Matheus Bacca')
    expect(nomeDeExibicao({ nome: 'Matheus Bacca' })).toBe('Matheus Bacca')
  })

  it('trata apelido vazio ou em branco como ausente', () => {
    expect(nomeDeExibicao({ nome: 'Ana Paula', apelido: '' })).toBe('Ana Paula')
    expect(nomeDeExibicao({ nome: 'Ana Paula', apelido: '   ' })).toBe('Ana Paula')
  })

  it('mantém o apelido inteiro, com espaços no meio', () => {
    expect(nomeDeExibicao({ nome: 'Ana Paula', apelido: 'Dona Ana' })).toBe('Dona Ana')
  })
})

describe('limites do apelido', () => {
  // Se um destes mudar sem a migration mudar junto, o formulário passa a
  // aceitar o que o CHECK do banco recusa — e o erro só aparece ao salvar.
  it('espelham o CHECK da coluna', () => {
    expect(APELIDO_MIN).toBe(2)
    expect(APELIDO_MAX).toBe(24)
  })
})

/**
 * `ehAdmin` espelha `is_space_admin` no banco, e o que ele NÃO inclui é o que
 * importa: um papel que escorregue para dentro desta função ganha os poderes de
 * admin em todas as telas de uma vez, e em silêncio, porque nada mais quebra.
 */
describe('ehAdmin', () => {
  it('dono e admin são admin', () => {
    expect(ehAdmin('dono')).toBe(true)
    expect(ehAdmin('admin')).toBe(true)
  })

  it('membro não é', () => {
    expect(ehAdmin('membro')).toBe(false)
  })

  it('valor ausente ou desconhecido não é', () => {
    expect(ehAdmin(null)).toBe(false)
    expect(ehAdmin(undefined)).toBe(false)
    expect(ehAdmin('inventado')).toBe(false)
  })
})

/** Todo papel do CHECK precisa de rótulo, senão a tela mostra vazio. */
describe('PAPEL_ROTULO', () => {
  it('cobre os três papéis do CHECK', () => {
    expect(Object.keys(PAPEL_ROTULO).sort()).toEqual(['admin', 'dono', 'membro'])
    for (const rotulo of Object.values(PAPEL_ROTULO)) expect(rotulo).toBeTruthy()
  })
})
