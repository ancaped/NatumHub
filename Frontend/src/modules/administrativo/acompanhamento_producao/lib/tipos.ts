export interface StatusHistoryEntry {
  id: number;
  loteNumber: string;
  status: string;
  category?: string | null;
  changedBy?: string | null;
  changedAt: string;
  notes?: string | null;
}

export interface AcompanhamentoLote {
  loteNumber: string;
  productCode: string;
  productDescription: string;
  quantity: number;       // Unidades
  quantityKg: number;     // Kg do lote completo
  date: string;
  details?: string | null;
  erpStatus: string;
  erpStatusLabel: string;
  customStatus?: string | null;
  category?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
  notes?: string | null;
  dataPesagem?: string | null;
  dataProducao?: string | null;
  dataLiberadoEnvase?: string | null;
  /** Laudo aprovado (AP) no ERP: libera o lote para envase (decisão 23). */
  liberadoEnvaseLaudo?: boolean;
  dataEnvase?: string | null;
  dataRotulagem?: string | null;
  dataFinalizada?: string | null;
  dataEmEspera?: string | null;
  dataPrevisao?: string | null;
  motivoEspera?: string | null;
  isTerceirizado: boolean;
  fornecedorTerceirizado?: string | null;
  fornecedor_terceirizado?: string | null;
  fichaOrdem?: any | null;
  ficha_ordem?: any | null;
  quantidadeEnvasadaParcial?: number | null;
  quantidade_envasada_parcial?: number | null;
  insumoFaltanteCodigo?: string | null;
  insumo_faltante_codigo?: string | null;
  insumoFaltanteDescricao?: string | null;
  insumo_faltante_descricao?: string | null;
  quadrosOcultos?: string[] | null;
  quadros_ocultos?: string[] | null;
  historicoReagendamentos?: any[] | null;
  historico_reagendamentos?: any[] | null;
  etapasStatus?: Record<string, {
    status?: string | null;
    motivoEspera?: string | null;
    insumoFaltanteCodigo?: string | null;
    insumoFaltanteDescricao?: string | null;
    updatedBy?: string | null;
    updatedAt?: string | null;
  }> | null;
  etapas_status?: any | null;
  /** Status efetivo por etapa calculado no servidor (conclusão automática às 18h, America/Sao_Paulo). */
  etapasEfetivas?: Partial<Record<'pesagem' | 'producao' | 'rotulagem' | 'envase', { status: string; isEspera: boolean; isConcluido: boolean }>> | null;
  /** A descrição do produto não traz medida: `quantity` (unidades) não foi calculada. */
  pesoDesconhecido?: boolean;
  planningOrdem?: number | null;
  planning_ordem?: number | null;
  reatorId?: string | null;
  /** Id da ordem em producao_planejamento_semanal (nulo para lotes que só existem no ERP/status). */
  planningId?: string | null;
  reator_id?: string | null;
}

export interface LoteAdiadoRegistro {
  id: string;
  loteNumber: string;
  productCode?: string;
  productDescription?: string;
  quantity?: number;
  quantityKg?: number;
  dataOriginal: string;
  dataAdiadoPara: string;
  dataAcao: string;
  responsavel?: string;
  etapa?: string;
  /** Registros antigos gravavam a etapa aqui. */
  origem?: string;
}

export interface TerceirizadoSolicitacao {
  id: number;
  productCode: string;
  productDescription: string;
  quantity: number;
  unit: string;
  quantityKg?: number | null;
  quantityUn?: number | null;
  status: 'SOLICITADO' | 'APROVADO' | 'VINCULADO' | 'CANCELADO';
  loteNumber?: string | null;
  fornecedor?: string | null;
  previsaoEntrega?: string | null;
  observacoes?: string | null;
  solicitadoPor?: string | null;
  aprovacaoEmbalagem?: boolean;
  aprovacaoEmbalagemPor?: string | null;
  aprovacaoEmbalagemEm?: string | null;
  aprovacaoMateriaPrima?: boolean;
  aprovacaoMateriaPrimaPor?: string | null;
  aprovacaoMateriaPrimaEm?: string | null;
  createdAt: string;
  vinculadoEm?: string | null;
}

export interface ProgramacaoEnvaseItem {
  id: number;
  dataProgramada: string;
  linha: string; // 'Linha 1' | 'Linha 2'
  ordem: number;
  loteNumber: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  quantityKg: number;
  categoriaEnvase: string; // 'Shampoo' | 'Máscaras' | 'Condicionador' | 'Óleos' | 'AOX' | 'Outros'
  isColorido?: boolean;
  cor?: string | null;
  statusEnvase: string; // 'PROGRAMADO' | 'EM_ENVASE' | 'CONCLUIDO' | 'CANCELADO'
  observacoes?: string | null;
  // Campos legados lidos pela tela; a API de programação não envia mais.
  observacaoEnvase?: string | null;
  motivoEspera?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramacaoRotulagemItem {
  id: number | string;
  dataProgramada: string;
  tipo: 'MAQUINA' | 'MANUAL';
  ordem: number;
  loteNumber: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  quantityKg: number;
  statusRotulagem: 'PROGRAMADO' | 'EM_ROTULAGEM' | 'CONCLUIDO' | 'EM_ESPERA'; // EM_ESPERA: dado legado
  observacoes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt?: string;
}


export interface KitAssemblyOrder {
  id: number;
  orderNumber: string;
  kitProductCode: string;
  kitProductDescription: string;
  quantity: number;
  status: string; // 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  createdAt?: string;
  completedAt?: string;
  assembledBy?: string;
  checkedBy?: string;
  observations?: string;
  erpLaunched?: number;
  componentsLotes?: string;
  quantityAssembled?: number;
  quantity_assembled?: number;
  created_at?: string;
  completed_at?: string;
  assembled_by?: string;
  checked_by?: string;
  erp_launched?: number;
  components_lotes?: string;
}

export interface StageDurationItem {
  stage: string;
  label: string;
  startDate?: string | null;
  endDate?: string | null;
  durationFormatted: string;
  isActive: boolean;
  isCompleted: boolean;
}

export interface LoteEtapaStatusResult {
  status: string;
  isEspera: boolean;
  isConcluido: boolean;
  motivoEspera: string | null;
  insumoFaltanteCodigo: string | null;
  insumoFaltanteDescricao: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface WeekRange {
  startIso: string;
  endIso: string;
}

export interface LoteEsperaDetails {
  isEmEspera: boolean;
  etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase' | null;
  etapaLabel: string;
  motivo: string | null;
  insumoCodigo: string | null;
  insumoDescricao: string | null;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}

export type TabType = 'planejamento_semanal' | 'lotes' | 'quadro_pesagem' | 'quadro_producao' | 'quadro_rotulagem' | 'quadro_envase' | 'quadro_ordens' | 'terceirizados' | 'kits' | 'calendar' | 'configuracoes';

export interface AcompanhamentoProducaoProps {
  onBack?: () => void;
  mode?: 'planejamento' | 'administrativo';
  initialTab?: TabType;
}
