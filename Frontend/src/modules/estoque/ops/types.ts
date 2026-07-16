export type EstoqueOpsMode =
  | 'itens'
  | 'almoxarifado'
  | 'supermercado'
  | 'pecas'
  | 'equipamentos'
  | 'manutencoes'
  | 'movimentacoes';

export interface AlmoxOpsItem {
  code: string;
  description: string;
  unit: string;
  categoryId?: string | null;
  active: boolean;
  minQty: number;
  idealQty: number;
  location?: string | null;
  notes?: string | null;
  qtyOnHand: number;
  avgUnitCost: number;
  erpQty?: number | null;
  belowMin: boolean;
  section: string;
  source: string;
  erpDescription?: string | null;
  lifespanDays?: number | null;
  installedAt?: string | null;
  expiresAt?: string | null;
  nextExchangeAt?: string | null;
  exchangeStatus?: string | null;
}

export interface AlmoxMovement {
  id: string;
  itemCode: string;
  itemDescription?: string | null;
  movementType: string;
  quantity: number;
  unitCost?: number | null;
  reason?: string | null;
  documentRef?: string | null;
  occurredAt: string;
  variantLabel?: string | null;
  packLabel?: string | null;
  packCount?: number | null;
  contentPerPack?: number | null;
  totalPaid?: number | null;
  sector?: string | null;
}

export interface ItemStats {
  itemCode: string;
  qtyOnHand: number;
  minQty: number;
  idealQty: number;
  avgDailyOut30: number;
  avgDailyOut90: number;
  suggestedBuyQty: number;
  belowMin: boolean;
  erpQty?: number | null;
  avgUnitCost30?: number | null;
}

export interface CatalogHit {
  code: string;
  description: string;
  unit: string;
  categoryId?: string | null;
  alreadyLinked: boolean;
}

export interface Equipment {
  id: string;
  code: string;
  name: string;
  sector?: string | null;
  status: string;
  maintenanceIntervalDays?: number | null;
  lastMaintenanceAt?: string | null;
  nextMaintenanceAt?: string | null;
  notes?: string | null;
  pecaCodes: string[];
}

export interface Maintenance {
  id: string;
  equipmentId: string;
  equipmentCode?: string | null;
  equipmentName?: string | null;
  kind: string;
  status: string;
  routine?: string | null;
  itemCode?: string | null;
  itemDescription?: string | null;
  quantity: number;
  technician?: string | null;
  cost?: number | null;
  notes?: string | null;
  occurredAt: string;
  completedAt?: string | null;
}

export const MODE_TO_VIEW: Record<EstoqueOpsMode, string> = {
  itens: 'estoque_itens',
  almoxarifado: 'estoque_almoxarifado',
  supermercado: 'estoque_supermercado',
  pecas: 'estoque_pecas',
  equipamentos: 'estoque_equipamentos',
  manutencoes: 'estoque_manutencoes',
  movimentacoes: 'estoque_movimentacoes',
};

export const VIEW_TO_MODE: Record<string, EstoqueOpsMode> = {
  estoque_itens: 'itens',
  estoque_almoxarifado: 'almoxarifado',
  estoque_supermercado: 'supermercado',
  estoque_pecas: 'pecas',
  estoque_equipamentos: 'equipamentos',
  estoque_manutencoes: 'manutencoes',
  estoque_movimentacoes: 'movimentacoes',
};

export const SECTION_LABELS: Record<string, string> = {
  almoxarifado: 'Almoxarifado',
  supermercado: 'Supermercado',
  pecas: 'Peças',
};

export function sectionForMode(mode: EstoqueOpsMode): string | undefined {
  if (mode === 'almoxarifado' || mode === 'supermercado' || mode === 'pecas') return mode;
  return undefined;
}
