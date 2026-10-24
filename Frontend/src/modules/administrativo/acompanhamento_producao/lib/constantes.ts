export const CATEGORIAS_ENVASE = [
  { id: 'Shampoo', label: 'Shampoo', icon: '', colorClass: 'bg-zinc-100 text-zinc-700 border-zinc-200 font-mono text-[10px]' },
  { id: 'Máscaras', label: 'Máscaras', icon: '', colorClass: 'bg-zinc-100 text-zinc-700 border-zinc-200 font-mono text-[10px]' },
  { id: 'Condicionador', label: 'Condicionador', icon: '', colorClass: 'bg-zinc-100 text-zinc-700 border-zinc-200 font-mono text-[10px]' },
  { id: 'Óleos', label: 'Óleos', icon: '', colorClass: 'bg-zinc-100 text-zinc-700 border-zinc-200 font-mono text-[10px]' },
  { id: 'AOX', label: 'AOX (Oxidante)', icon: '', colorClass: 'bg-zinc-100 text-zinc-700 border-zinc-200 font-mono text-[10px]' },
  { id: 'Outros', label: 'Outros', icon: '', colorClass: 'bg-zinc-100 text-zinc-700 border-zinc-200 font-mono text-[10px]' },
] as const;

export const CORES_PREDEFINIDAS = [
  { id: 'Branco', label: 'Branco / Neutro', hex: '#f4f4f5', dotClass: 'bg-zinc-200 border border-zinc-400', badgeClass: 'bg-zinc-100 text-zinc-800 border-zinc-300' },
  { id: 'Amarelo/Dourado', label: 'Amarelo / Dourado', hex: '#facc15', dotClass: 'bg-yellow-400', badgeClass: 'bg-yellow-50 text-yellow-800 border-yellow-300' },
  { id: 'Laranja', label: 'Laranja', hex: '#fb923c', dotClass: 'bg-orange-400', badgeClass: 'bg-orange-50 text-orange-800 border-orange-300' },
  { id: 'Vermelho', label: 'Vermelho', hex: '#ef4444', dotClass: 'bg-red-500', badgeClass: 'bg-red-50 text-red-700 border-red-200' },
  { id: 'Rosa/Pink', label: 'Rosa / Pink', hex: '#ec4899', dotClass: 'bg-pink-500', badgeClass: 'bg-pink-50 text-pink-700 border-pink-200' },
  { id: 'Ruivo/Cobre', label: 'Ruivo / Cobre', hex: '#d97706', dotClass: 'bg-amber-600', badgeClass: 'bg-amber-50 text-amber-800 border-amber-200' },
  { id: 'Roxo/Violeta', label: 'Roxo / Violeta (Matizador)', hex: '#9333ea', dotClass: 'bg-purple-600', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'Azul', label: 'Azul', hex: '#3b82f6', dotClass: 'bg-blue-500', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'Verde', label: 'Verde', hex: '#10b981', dotClass: 'bg-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'Castanho/Marrom', label: 'Castanho / Marrom', hex: '#78350f', dotClass: 'bg-amber-900', badgeClass: 'bg-amber-100 text-amber-950 border-amber-300' },
  { id: 'Preto', label: 'Preto', hex: '#18181b', dotClass: 'bg-zinc-900', badgeClass: 'bg-zinc-100 text-zinc-900 border-zinc-400' },
] as const;

export const ORDEM_CORES_FABRICA: Record<string, number> = {
  'Branco': 0,
  'Amarelo/Dourado': 1,
  'Laranja': 2,
  'Vermelho': 3,
  'Rosa/Pink': 4,
  'Ruivo/Cobre': 5,
  'Roxo/Violeta': 6,
  'Azul': 7,
  'Verde': 8,
  'Castanho/Marrom': 9,
  'Preto': 10,
};

/** Validade da busca remota repetida (resposta vazia) e dos lotes que ela trouxe. */
export const REMOTE_LOOKUP_TTL_MS = 60_000;
export const REMOTE_LOTES_TTL_MS = 10 * 60_000;

export const STATUS_OPTIONS = [
  { value: 'Pesagem', label: 'Pesagem', category: 'Pesagem e Produção', color: 'amber' },
  { value: 'Produzido', label: 'Produzido', category: 'Pesagem e Produção', color: 'blue' },
  { value: 'Liberado para Envase', label: 'Liberado para Envase', category: 'Pesagem e Produção', color: 'teal' },
  { value: 'Rotulagem', label: 'Rotulagem', category: 'Embalagem', color: 'cyan' },
  { value: 'Envase', label: 'Envase', category: 'Embalagem', color: 'purple' },
  { value: 'Ordem Parcial', label: 'Ordem Parcial', category: 'Embalagem', color: 'indigo' },
  { value: 'Ordem Finalizada', label: 'Ordem Finalizada', category: 'Embalagem', color: 'emerald' },
] as const;

export const MOTIVOS_PAUSA_PADRAO = [
  'Falta de Insumo / Matéria-Prima',
  'Aguardando Embalagem / Frasco / Caixa',
  'Aguardando Rótulo',
  'Aguardando Laudo / CQ',
  'Manutenção / Quebra de Máquina',
  'Ajuste / Correção de Formulação',
  'Outro Motivo'
];

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
