import { DEFAULT_LABEL_TEMPLATES } from './defaultTemplates';
import { labelsApi } from './labelsApi';
import type { LabelTemplate } from './types';

/**
 * Regra das etiquetas do Nexus: toda etiqueta é um modelo registrado em Etiquetas.
 * - Modelo **do sistema** tem `chave` e é usado pelos módulos (`obterModeloPorChave`).
 * - Modelo **editável** não tem chave: criado e mantido pelo usuário.
 * Editar um modelo do sistema grava uma linha no banco com a mesma chave (a versão editada);
 * apagar essa linha restaura o padrão que vem do código.
 */
export const ehDoSistema = (t: LabelTemplate) => Boolean(t.chave);

/** Modelo do sistema que já foi editado (existe a linha no banco com a chave). */
export const foiEditado = (t: LabelTemplate) => Boolean(t.chave) && !t.id.startsWith('template_');

/** Padrões do código com os modelos do banco por cima: a linha com a mesma chave substitui o padrão. */
export function mesclarModelos(doBanco: LabelTemplate[]): LabelTemplate[] {
  const porChave = new Map(doBanco.filter((t) => t.chave).map((t) => [t.chave as string, t]));
  const usadas = new Set<string>();
  const lista: LabelTemplate[] = DEFAULT_LABEL_TEMPLATES.map((padrao) => {
    const editado = padrao.chave ? porChave.get(padrao.chave) : undefined;
    if (editado) {
      usadas.add(editado.id);
      return editado;
    }
    return padrao;
  });
  for (const t of doBanco) if (!usadas.has(t.id) && !lista.some((m) => m.id === t.id)) lista.push(t);
  return lista;
}

/** Modelo do sistema pela chave, já com a versão editada quando houver. Se o banco não responder, vale o padrão. */
export async function obterModeloPorChave(chave: string): Promise<LabelTemplate | undefined> {
  const lista = mesclarModelos(await labelsApi.listTemplates());
  return lista.find((t) => t.chave === chave);
}

/** Troca os `{campos}` do modelo por valores reais. Texto e valor de código de barras/QR; o resto fica igual. */
export function preencherModelo(modelo: LabelTemplate, dados: Record<string, string | number | null | undefined>): LabelTemplate {
  const trocar = (t: string) =>
    t.replace(/\{([a-z_0-9]+)\}/gi, (inteiro, campo: string) => {
      const v = dados[campo];
      return v === undefined || v === null ? inteiro : String(v);
    });
  return {
    ...modelo,
    elements_json: modelo.elements_json.map((el) => {
      const props = { ...el.props };
      if (typeof props.text === 'string') props.text = trocar(props.text);
      if (typeof props.value === 'string') props.value = trocar(props.value);
      return { ...el, props };
    }),
  };
}
