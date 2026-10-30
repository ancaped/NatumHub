export type TipoColuna = 'data' | 'hora' | 'numero' | 'texto' | 'sim_nao' | 'rubrica';

export const TIPOS_COLUNA: Array<{ valor: TipoColuna; rotulo: string }> = [
  { valor: 'data', rotulo: 'Data' },
  { valor: 'hora', rotulo: 'Hora' },
  { valor: 'numero', rotulo: 'Número' },
  { valor: 'texto', rotulo: 'Texto' },
  { valor: 'sim_nao', rotulo: 'Sim/Não' },
  { valor: 'rubrica', rotulo: 'Rubrica' },
];

export interface FormCampo {
  label: string;
  kind: string;
  limit?: string | null;
}

export interface Formulario {
  code: string;
  popCode: string;
  popTitle?: string | null;
  title: string;
  previousCode: string;
  periodicity: string;
  areas: string[];
  fields: FormCampo[];
  limits?: string | null;
  note?: string | null;
  status: string;
  /** Revisão vigente (ou a última publicada); nunca publicado = 0. */
  revision: number;
  /** Número que a próxima publicação vai receber. */
  nextRevision?: number;
  jaPublicado?: boolean;
  /** Publicado antes e hoje em rascunho/aprovação de nova revisão: a vigente continua valendo. */
  emRevisao?: boolean;
  orientation?: string;
  rowsPerSheet?: number | null;
  effectiveDate?: string | null;
  nextReviewDate?: string | null;
  daysToReview?: number | null;
  elaboratedBy?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  updatedAt?: string;
}

export interface RevisaoFormulario {
  id: string;
  revision: number;
  popCode: string;
  title: string;
  orientation: string;
  motivo: string;
  createdBy?: string | null;
  createdAt: string;
  /** Linhas antigas (antes do controle de documentos) não têm a cópia da folha. */
  temCopia: boolean;
  snapshot?: Formulario | null;
}

export interface EventoPop {
  id: number;
  tipo: string;
  ref: string;
  acao: string;
  deStatus?: string | null;
  paraStatus?: string | null;
  motivo?: string | null;
  usuario: string;
  criadoEm: string;
}

export interface FormularioDetalhe extends Formulario {
  revisoes: RevisaoFormulario[];
  eventos: EventoPop[];
}
