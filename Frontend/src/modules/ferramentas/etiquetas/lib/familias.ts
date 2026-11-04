import type { LabelTemplate } from './types';

/** Famílias de modelo (campo `category` do modelo), na ordem das abas do catálogo. */
export const FAMILIAS: Record<string, string> = {
  expedicao: 'Caixas e volumes',
  producao: 'Produtos acabados',
  estoque: 'Matérias-primas',
  embalagens: 'Embalagens e apoio',
  qualidade: 'Controle de qualidade',
  custom: 'Personalizadas',
};

export const familiaDe = (t: LabelTemplate) => (t.category && FAMILIAS[t.category] ? t.category : 'custom');
