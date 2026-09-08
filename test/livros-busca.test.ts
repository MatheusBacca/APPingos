import { describe, expect, it } from 'vitest'
import {
  autoresUnicos,
  capaDaObra,
  creditoDeAutores,
  anoDoVolume,
  capaDoVolume,
  idDaObra,
  normalizarVolume,
  tituloPrincipal,
  normalizarDoc,
  textoDaDescricao,
} from '../server/utils/livros'

describe('autoresUnicos', () => {
  it('mantém a primeira grafia e descarta as variantes', () => {
    expect(autoresUnicos(['José Saramago', 'Jose Saramago'])).toEqual(['José Saramago'])
    expect(autoresUnicos(['Jose Saramago', 'José Saramago'])).toEqual(['Jose Saramago'])
  })

  it('ignora caixa e espaço nas pontas', () => {
    expect(autoresUnicos(['Ana Maria', '  ana maria  '])).toEqual(['Ana Maria'])
  })

  it('preserva autores realmente diferentes, na ordem', () => {
    expect(autoresUnicos(['Ana', 'Bruno', 'Caio'])).toEqual(['Ana', 'Bruno', 'Caio'])
  })

  it('descarta entradas vazias', () => {
    expect(autoresUnicos(['', 'Ana'])).toEqual(['Ana'])
  })
})

describe('idDaObra', () => {
  it('tira o prefixo /works/', () => {
    expect(idDaObra('/works/OL27448W')).toBe('OL27448W')
  })

  it('aceita o id já limpo', () => {
    expect(idDaObra('OL27448W')).toBe('OL27448W')
  })

  it('devolve null para ausente ou vazio', () => {
    expect(idDaObra(undefined)).toBeNull()
    expect(idDaObra('')).toBeNull()
    expect(idDaObra('/works/')).toBeNull()
  })
})

describe('capaDaObra', () => {
  it('monta a URL no tamanho grande', () => {
    expect(capaDaObra(12345)).toBe('https://covers.openlibrary.org/b/id/12345-L.jpg')
  })

  it('devolve null sem capa', () => {
    expect(capaDaObra(undefined)).toBeNull()
  })
})

describe('textoDaDescricao', () => {
  /*
   * Os dois formatos convivem na base: string crua nos registros antigos,
   * objeto `{ type, value }` nos novos. Tratar só um deixaria metade das
   * sinopses de fora, sem erro nenhum.
   */
  it('lê a string crua dos registros antigos', () => {
    expect(textoDaDescricao('Um romance.')).toBe('Um romance.')
  })

  it('lê o objeto dos registros novos', () => {
    expect(textoDaDescricao({ value: 'Um romance.' })).toBe('Um romance.')
  })

  it('devolve null para ausente ou em branco', () => {
    expect(textoDaDescricao(undefined)).toBeNull()
    expect(textoDaDescricao('   ')).toBeNull()
    expect(textoDaDescricao({})).toBeNull()
  })
})

describe('normalizarDoc', () => {
  it('traduz um resultado completo', () => {
    const livro = normalizarDoc({
      key: '/works/OL27448W',
      title: 'Torto Arado',
      author_name: ['Itamar Vieira Junior'],
      first_publish_year: 2019,
      cover_i: 999,
      number_of_pages_median: 280,
    })

    expect(livro).toEqual({
      tipo: 'livro',
      fonte: 'open-library',
      fonte_id: 'OL27448W',
      titulo: 'Torto Arado',
      autores: ['Itamar Vieira Junior'],
      ano: 2019,
      capa_url: 'https://covers.openlibrary.org/b/id/999-L.jpg',
      sinopse: null,
      paginas: 280,
    })
  })

  /*
   * Caso REAL, e o motivo de `autoresUnicos` existir: a busca por "Torto Arado"
   * devolveu "Itamar Vieira Junior" e "Itamar Vieira Júnior" no mesmo registro.
   * Um `Set` cru não pega — as duas strings são diferentes de verdade —, e o
   * crédito da capa saía com o nome duas vezes.
   */
  it('remove autor repetido, inclusive quando muda só o acento', () => {
    const livro = normalizarDoc({
      key: '/works/OL1W',
      title: 'X',
      author_name: ['Itamar Vieira Junior', 'Itamar Vieira Júnior', 'Bruno'],
    })

    expect(livro?.autores).toEqual(['Itamar Vieira Junior', 'Bruno'])
  })

  it('descarta o que não dá para adicionar nem mostrar', () => {
    expect(normalizarDoc({ title: 'Sem chave' })).toBeNull()
    expect(normalizarDoc({ key: '/works/OL1W' })).toBeNull()
  })

  it('trata páginas ausentes e zeradas como desconhecidas', () => {
    expect(normalizarDoc({ key: '/works/OL1W', title: 'X' })?.paginas).toBeNull()
    expect(normalizarDoc({ key: '/works/OL1W', title: 'X', number_of_pages_median: 0 })?.paginas).toBeNull()
  })
})

describe('tituloPrincipal', () => {
  /*
   * O caso real que motivou a função: o título completo da capa devolvia ZERO
   * na Open Library, e "O Caibalion" devolvia oito — incluindo exatamente
   * aquela edição. Copiar o título inteiro da livraria é o gesto mais natural
   * que existe, e sem o corte a busca falhava para quem sabia o que queria.
   */
  it('corta o subtítulo e o selo de edição', () => {
    expect(tituloPrincipal('O Caibalion: Um estudo da filosofia hermética do Antigo Egito e da Grécia - Edição especial'))
      .toBe('O Caibalion')
  })

  it('reconhece os quatro separadores de capa', () => {
    expect(tituloPrincipal('Título: subtítulo')).toBe('Título')
    expect(tituloPrincipal('Título - Edição especial')).toBe('Título')
    expect(tituloPrincipal('Título – Edição especial')).toBe('Título')
    expect(tituloPrincipal('Título — Edição especial')).toBe('Título')
  })

  /* Sem separador não há o que encurtar — e tentar de novo com o mesmo termo
   * seria uma requisição desperdiçada. */
  it('devolve null quando não há o que cortar', () => {
    expect(tituloPrincipal('Torto Arado')).toBeNull()
    expect(tituloPrincipal('  Dom Casmurro  ')).toBeNull()
  })

  /*
   * Hífen dentro de palavra composta não é separador de subtítulo. Cortar em
   * "Cem" faria a busca piorar em vez de melhorar.
   */
  it('ignora hífen sem espaço, que é palavra composta', () => {
    expect(tituloPrincipal('Bem-vindo ao deserto do real')).toBeNull()
  })

  it('recusa uma cabeça curta demais para buscar', () => {
    expect(tituloPrincipal('A: uma história')).toBeNull()
  })
})

describe('normalizarVolume (Google Books)', () => {
  it('traduz um volume para o mesmo formato da Open Library', () => {
    expect(normalizarVolume({
      id: 'zyTCAlFPjgYC',
      volumeInfo: {
        title: 'O Caibalion',
        authors: ['Três Iniciados'],
        publishedDate: '2018-03',
        description: '  Um estudo da filosofia hermética.  ',
        pageCount: 160,
        imageLinks: { thumbnail: 'http://books.google.com/x?edge=curl&zoom=1' },
      },
    })).toEqual({
      tipo: 'livro',
      fonte: 'google-books',
      fonte_id: 'zyTCAlFPjgYC',
      titulo: 'O Caibalion',
      autores: ['Três Iniciados'],
      ano: 2018,
      capa_url: 'https://books.google.com/x?zoom=1',
      sinopse: 'Um estudo da filosofia hermética.',
      paginas: 160,
    })
  })

  /*
   * As duas correções de URL não são cosméticas: em HTTP a capa é bloqueada
   * dentro de uma página HTTPS e simplesmente não aparece, sem erro visível; e
   * `edge=curl` desenha uma "página dobrada" que num grid lê como imagem
   * defeituosa.
   */
  it('força https e tira o efeito de página dobrada', () => {
    expect(capaDoVolume({ thumbnail: 'http://x/y?edge=curl&a=1' })).toBe('https://x/y?a=1')
  })

  it('escolhe o maior tamanho disponível', () => {
    expect(capaDoVolume({ smallThumbnail: 'http://p', large: 'https://g' })).toBe('https://g')
    expect(capaDoVolume(undefined)).toBeNull()
  })

  it('lê o ano em qualquer precisão de publishedDate', () => {
    expect(anoDoVolume('2019')).toBe(2019)
    expect(anoDoVolume('2019-05')).toBe(2019)
    expect(anoDoVolume('2019-05-20')).toBe(2019)
    expect(anoDoVolume(undefined)).toBeNull()
    expect(anoDoVolume('sem data')).toBeNull()
  })

  it('descarta volume sem id ou sem título', () => {
    expect(normalizarVolume({ volumeInfo: { title: 'X' } })).toBeNull()
    expect(normalizarVolume({ id: 'abc' })).toBeNull()
  })
})

describe('creditoDeAutores', () => {
  it('escreve a lista com "e" antes do último', () => {
    expect(creditoDeAutores(['Ana'])).toBe('Ana')
    expect(creditoDeAutores(['Ana', 'Bruno'])).toBe('Ana e Bruno')
    expect(creditoDeAutores(['Ana', 'Bruno', 'Caio'])).toBe('Ana, Bruno e Caio')
  })

  it('diz que não sabe quando não há autor', () => {
    expect(creditoDeAutores([])).toBe('Autoria desconhecida')
  })
})
