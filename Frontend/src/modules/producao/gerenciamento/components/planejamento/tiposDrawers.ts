import type { HolidayInfo } from '../../../../geral/lib/brazilHolidays';
import type { PlanejamentoItem } from '../PlanejamentoSemanalTab';

export type DiaSemana = {
  date: Date;
  dateStr: string;
  label: string;
  dayNumber: number;
  holiday: HolidayInfo | null;
};

export type ScheduleModalItem = {
  product?: any | null;
  targetDate?: string;
  targetReator?: string;
};

export type LinkLoteModalItem = {
  item: PlanejamentoItem;
  batchItems?: PlanejamentoItem[];
  lote: string;
  loadingUltimoLote?: boolean;
  ultimoLote?: string | null;
  dataUltimoLote?: string | null;
  quantidadeKgLote?: number | null;
  autoQty?: number | null;
  sugestaoProximo?: string | null;
  origemUltimoLote?: string | null;
};

export type EditQtyModalItem = {
  item: PlanejamentoItem;
  newQty: number;
  batchItems?: PlanejamentoItem[];
  batchMasses?: Record<string, number>;
};

export type TechnicalModalItem = {
  item: PlanejamentoItem;
  batchItems?: PlanejamentoItem[];
  processoTermico: string;
  origemFormulacao: 'completa' | 'base';
  baseCodigo: string;
  baseNome: string;
  reatorId: string;
  recipienteDetalhe: string;
  dataPlanejada: string;
  quantidadeKg: number;
  linhaEnvase: string;
  loteErp: string;
  observacoes: string;
  loadingUltimoLote?: boolean;
  ultimoLote?: string | null;
  dataUltimoLote?: string | null;
  quantidadeKgLote?: number | null;
  sugestaoProximo?: string | null;
};

export type HeuristicStats = {
  totalBatches: number;
  totalKg: number;
  groupedBases: number;
  avoidedHolidays: number;
  caldeiraDays: number;
};

export type Setter<T> = React.Dispatch<React.SetStateAction<T>>;
