import type { Feedback, MapaModule } from './types';

/** Chamado pertence ao módulo quando o moduleKey está gravado. Sem chave, usa a página. */
export function chamadoDoModulo(f: Feedback, module: MapaModule): boolean {
  const chave = (f.moduleKey || '').trim().toLowerCase();
  const alvo = module.moduleKey.toLowerCase();
  if (chave) return chave === alvo;
  const pagina = (f.page || '').toLowerCase();
  if (!pagina) return false;
  if (pagina.includes(alvo)) return true;
  if (module.routerPrefix && pagina.includes(module.routerPrefix.toLowerCase())) return true;
  return false;
}

export function chamadoAberto(f: Feedback): boolean {
  return f.status !== 'resolved' && f.status !== 'wont_fix';
}

export function contarAbertosPorModulo(feedbacks: Feedback[], modules: MapaModule[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const module of modules) {
    const n = feedbacks.filter((f) => chamadoAberto(f) && chamadoDoModulo(f, module)).length;
    if (n > 0) counts[module.moduleKey] = n;
  }
  return counts;
}
