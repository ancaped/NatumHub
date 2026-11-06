import { apiJson } from '../../../geral/lib/http';
import { getAllSystemVariables } from './systemVariables';
import type { LabelTemplate } from './types';

export interface SugestaoCampo {
  valor: string;
  origem: 'historico' | 'sistema';
}

/** Campos `{nome}` do modelo que o operador preenche à mão: os do sistema (`{lot}`, `{product_name}`...) ficam de fora. */
export function camposDoModelo(modelo: LabelTemplate): string[] {
  const sistema = new Set(getAllSystemVariables().map((v) => v.token.toLowerCase()));
  const vistos = new Set<string>();
  const lista: string[] = [];
  for (const el of Array.isArray(modelo.elements_json) ? modelo.elements_json : []) {
    const props = (el.props ?? {}) as unknown as Record<string, unknown>;
    for (const texto of [props.text, props.value]) {
      if (typeof texto !== 'string') continue;
      for (const m of texto.matchAll(/\{([a-z_0-9]+)\}/gi)) {
        const campo = m[1].toLowerCase();
        if (sistema.has(`{${campo}}`) || vistos.has(campo)) continue;
        vistos.add(campo);
        lista.push(campo);
      }
    }
  }
  return lista;
}

/** `data_entrada` → `Data entrada`. */
export function nomeDoCampo(campo: string): string {
  const t = campo.replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const camposApi = {
  async sugerir(campo: string, q: string): Promise<SugestaoCampo[]> {
    try {
      const params = new URLSearchParams({ campo, q, limit: '8' });
      const data = await apiJson<SugestaoCampo[]>(`/api/ferramentas/etiquetas/campos/sugestoes?${params}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  /** Guarda o que foi impresso para sugerir de novo. Falha aqui não pode atrapalhar a impressão. */
  async gravar(valores: Record<string, string>): Promise<void> {
    const lista = Object.entries(valores)
      .filter(([, v]) => v.trim())
      .map(([campo, valor]) => ({ campo, valor }));
    if (!lista.length) return;
    try {
      await apiJson('/api/ferramentas/etiquetas/campos/valores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valores: lista }) });
    } catch {
      /* só as sugestões deixam de aprender */
    }
  },
};

/** O modelo usa campos do sistema (produto, lote, datas, caixa): o Drawer pede o produto e os dados do lote. */
export function usaDadosDoSistema(modelo: LabelTemplate): boolean {
  const sistema = new Set(getAllSystemVariables().map((v) => v.token.toLowerCase()));
  for (const el of Array.isArray(modelo.elements_json) ? modelo.elements_json : []) {
    const props = (el.props ?? {}) as unknown as Record<string, unknown>;
    for (const texto of [props.text, props.value]) {
      if (typeof texto !== 'string') continue;
      for (const m of texto.matchAll(/\{([a-z_0-9]+)\}/gi)) if (sistema.has(`{${m[1].toLowerCase()}}`)) return true;
    }
  }
  return false;
}
