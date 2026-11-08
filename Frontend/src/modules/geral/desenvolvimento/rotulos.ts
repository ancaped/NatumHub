import type { VarianteBadge } from '../components/ui/ReportKit';
import type { MapaActivity, MapaModule } from './types';

/** Situação do módulo: os mesmos selos na lista, na ficha e no assistente. */
export const STATUS_MODULO: Record<string, { rotulo: string; variante: VarianteBadge }> = {
  live: { rotulo: 'No ar', variante: 'saudavel' },
  stub: { rotulo: 'Rascunho', variante: 'aguardando' },
  planned: { rotulo: 'Planejado', variante: 'ordem' },
  descontinuado: { rotulo: 'Descontinuado', variante: 'descontinuado' },
};

export function statusModulo(status: string) {
  return STATUS_MODULO[status] || { rotulo: status, variante: 'descontinuado' as VarianteBadge };
}

/** Etapa do chamado (feedbacks.status) em português. */
export const STATUS_CHAMADO: Record<string, string> = {
  pending: 'Triagem',
  queued: 'Fila',
  in_progress: 'Em andamento',
  planned: 'Planejado',
  awaiting_review: 'Homologação',
  resolved: 'Finalizado',
  wont_fix: 'Recusado',
};

export function statusChamado(status: string): string {
  return STATUS_CHAMADO[status] || status;
}

export function tipoChamado(tipo: string): { rotulo: string; variante: VarianteBadge } {
  return tipo === 'bug' ? { rotulo: 'Bug', variante: 'critico' } : { rotulo: 'Sugestão', variante: 'aguardando' };
}

/** Nome do módulo pela chave; sem cadastro, a própria chave. */
export function criarNomeModulo(modules: MapaModule[]): (key?: string | null) => string {
  const m = new Map(modules.map((x) => [x.moduleKey, x.label]));
  return (key) => (key ? m.get(key) || key : '—');
}

/** Atividade do mapa numa frase ("criou o módulo Simulador MRP"). */
export function fraseAtividade(a: MapaActivity, nome: (key?: string | null) => string): string {
  const meta = (a.meta || {}) as Record<string, unknown>;
  const txt = (k: string) => (typeof meta[k] === 'string' ? (meta[k] as string) : '');
  switch (a.action) {
    case 'module_created':
      return `criou o módulo ${nome(txt('moduleKey'))}`;
    case 'module_updated':
      return `alterou o módulo ${nome(txt('moduleKey'))}`;
    case 'module_moved': {
      const n = Number(meta.count) || 0;
      return n === 1 ? 'moveu 1 módulo no organograma' : `moveu ${n} módulos no organograma`;
    }
    case 'edge_created':
      return `ligou ${nome(txt('from'))} a ${nome(txt('to'))}`;
    case 'task_created':
      return 'abriu uma tarefa na antiga fila do mapa';
    case 'ai_implemented':
      return 'concluiu uma tarefa da antiga fila do mapa';
    case 'seed':
      return 'montou o mapa inicial';
    default:
      return a.action.replace(/_/g, ' ');
  }
}

/** Quem fez é agente de IA? (token de agente ou nomes usados pelos agentes) */
export function ehAgente(actor?: string | null): boolean {
  if (!actor) return false;
  const a = actor.toLowerCase();
  return a === 'ia' || a === 'ai' || a.includes('agente') || a.startsWith('cursor') || a.includes('composer');
}
