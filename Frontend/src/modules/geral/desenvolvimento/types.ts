import type { Feedback, FeedbackDetail, FeedbackNote } from '../lib/types';

export type { Feedback, FeedbackDetail, FeedbackNote };

export interface MapaGroup {
  key: string;
  label: string;
  hubView: string;
  sortOrder: number;
  color?: string | null;
}

export interface MapaDetail {
  tabs?: { id: string; label: string; desc?: string }[];
  functions?: { name: string; desc?: string }[];
  notes?: string;
  codeRefs?: string[];
}

export interface MapaModule {
  moduleKey: string;
  groupKey: string;
  label: string;
  purpose: string;
  status: string; // 'live' | 'stub' | 'planned'
  sortOrder: number;
  posX: number;
  posY: number;
  frontendPath?: string | null;
  backendPath?: string | null;
  routerPrefix?: string | null;
  aiHints: unknown;
  detail: MapaDetail;
}

export interface MapaEdge {
  id: string;
  fromKey: string;
  toKey: string;
  kind: string;
  note: string;
}

export interface MapaRoute {
  id: string;
  moduleKey?: string | null;
  methods: string[];
  path: string;
  summary: string;
  auth: string;
  source?: string | null;
}

export interface MapaTask {
  id: string;
  type: string;
  title: string;
  payload: unknown;
  targets: unknown;
  acceptance: unknown;
  notes: string;
  status: string; // 'open' | 'done'
  createdBy?: string | null;
  createdAt: string;
  doneAt?: string | null;
}

export interface MapaActivity {
  id: string;
  at: string;
  actor?: string | null;
  action: string;
  meta: Record<string, unknown>;
}

export interface MapaSnapshot {
  groups: MapaGroup[];
  modules: MapaModule[];
  edges: MapaEdge[];
  routes: MapaRoute[];
  tasksOpen: MapaTask[];
  activity: MapaActivity[];
}

export type DesenvolvimentoTab = 'mapa' | 'fila' | 'timeline' | 'novo_modulo';

export type FilaSubTab = 'triagem' | 'execucao' | 'homologacao' | 'finalizados';
