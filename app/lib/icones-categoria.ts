/**
 * O desenho de cada categoria e de cada compra.
 *
 * As categorias são do espaço e têm os nomes de vocês ("Mercado", "Super",
 * "Comida fora"...), então o ícone não sai de uma tabela de nomes fixos: o nome
 * passa por `categoriaBaseDoNome` (palavras-chave, sem acento) e cai numa das
 * categorias-base, que têm desenho. O que não cair em nenhuma fica com a
 * etiqueta genérica.
 *
 * Numa COMPRA, a loja conhecida ganha da categoria: o selo do iFood diz mais
 * rápido que o desenho de uma bicicleta. Não são logos (não temos as marcas) —
 * é a cor da marca com a sigla, que é o que o olho procura numa lista.
 */
import type { Component } from 'vue'
import {
  ArrowLeftRightIcon,
  BanknoteIcon,
  BedDoubleIcon,
  BikeIcon,
  CarTaxiFrontIcon,
  ClapperboardIcon,
  CroissantIcon,
  DumbbellIcon,
  FuelIcon,
  Gamepad2Icon,
  GiftIcon,
  GraduationCapIcon,
  HeartPulseIcon,
  HouseIcon,
  LandmarkIcon,
  PartyPopperIcon,
  PawPrintIcon,
  PhoneIcon,
  PillIcon,
  PlaneIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  ShirtIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  SmartphoneIcon,
  SparklesIcon,
  SquareParkingIcon,
  TagIcon,
  TvIcon,
  UtensilsIcon,
} from '@lucide/vue'
import { categoriaBaseDoNome, reconhecerEstabelecimento } from '~/lib/estabelecimentos'
import type { CategoriaBase, Estabelecimento } from '~/lib/estabelecimentos'

export const ICONE_CATEGORIA_BASE: Record<CategoriaBase, Component> = {
  mercado: ShoppingCartIcon,
  restaurante: UtensilsIcon,
  delivery: BikeIcon,
  padaria: CroissantIcon,
  transporte: CarTaxiFrontIcon,
  combustivel: FuelIcon,
  estacionamento: SquareParkingIcon,
  viagem: PlaneIcon,
  hospedagem: BedDoubleIcon,
  streaming: TvIcon,
  cinema: ClapperboardIcon,
  lazer: PartyPopperIcon,
  jogos: Gamepad2Icon,
  compras: ShoppingBagIcon,
  eletronicos: SmartphoneIcon,
  roupas: ShirtIcon,
  saude: HeartPulseIcon,
  farmacia: PillIcon,
  educacao: GraduationCapIcon,
  casa: HouseIcon,
  contas: ReceiptIcon,
  telefone: PhoneIcon,
  pet: PawPrintIcon,
  beleza: SparklesIcon,
  academia: DumbbellIcon,
  impostos: LandmarkIcon,
  tarifas: BanknoteIcon,
  seguros: ShieldCheckIcon,
  presentes: GiftIcon,
  transferencia: ArrowLeftRightIcon,
  outros: TagIcon,
}

export const ICONE_SEM_CATEGORIA: Component = TagIcon

export function iconeDaCategoria(nome: string | null | undefined): Component {
  const base = categoriaBaseDoNome(nome)
  return base ? ICONE_CATEGORIA_BASE[base] : ICONE_SEM_CATEGORIA
}

export type DesenhoDaCompra =
  | { tipo: 'marca', estabelecimento: Estabelecimento }
  | { tipo: 'icone', icone: Component }

/** A loja conhecida pela descrição; senão o desenho da categoria. */
export function desenhoDaCompra(descricao: string, categoriaNome: string | null | undefined): DesenhoDaCompra {
  const estabelecimento = reconhecerEstabelecimento(descricao)
  if (estabelecimento) return { tipo: 'marca', estabelecimento }
  return { tipo: 'icone', icone: iconeDaCategoria(categoriaNome) }
}
