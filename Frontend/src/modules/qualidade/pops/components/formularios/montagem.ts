import type { Formulario, FormularioDetalhe, RevisaoFormulario } from './tipos';

/** Uma folha por área; sem áreas, uma folha só (área em branco). */
export function montarFolhas(areas: string[] | null | undefined): Array<string | null> {
  const lista = (areas ?? []).map((a) => a.trim()).filter((a) => a !== '');
  return lista.length === 0 ? [null] : lista;
}

/** Medidas da folha em mm (ver `Folha`): altura A4 útil, margem, blocos fixos e altura da linha do registro. */
export const MEDIDAS_FOLHA = {
  alturaRetrato: 296,
  alturaPaisagem: 209,
  margem: 8,
  borda: 0.8,
  cabecalho: 20,
  mesArea: 6.5,
  limites: 6.5,
  cabecalhoTabela: 8,
  rodape: 22,
  linha: 7.2,
};

export function deitado(f: Pick<Formulario, 'orientation'>): boolean {
  return f.orientation === 'landscape';
}

/** Quantas linhas de 7,2 mm cabem no corpo: folha − margens − cabeçalho − Mês/Área − (limites) − cabeçalho da tabela − rodapé. */
export function linhasQueCabem(paisagem: boolean, comLimites: boolean): number {
  const m = MEDIDAS_FOLHA;
  const util =
    (paisagem ? m.alturaPaisagem : m.alturaRetrato) - 2 * m.margem - m.borda - m.cabecalho - m.mesArea -
    (comLimites ? m.limites : 0) - m.cabecalhoTabela - m.rodape;
  return Math.max(1, Math.floor(util / m.linha));
}

/** Linhas em branco por folha: o valor do formulário (manda) ou as que preenchem a folha. */
export function linhasPorFolha(f: Pick<Formulario, 'orientation' | 'rowsPerSheet'> & { limits?: string | null }): number {
  if (f.rowsPerSheet && f.rowsPerSheet > 0) return f.rowsPerSheet;
  return linhasQueCabem(deitado(f), !!f.limits?.trim());
}

export type MarcaFolha = 'rascunho' | 'obsoleto' | 'substituida' | null;

export const TEXTO_MARCA: Record<'rascunho' | 'obsoleto' | 'substituida', string> = {
  rascunho: 'RASCUNHO — NÃO VÁLIDO',
  obsoleto: 'OBSOLETO — NÃO USAR',
  substituida: 'REVISÃO SUBSTITUÍDA — NÃO USAR',
};

/** Marca da folha pelo status: rascunho e em aprovação = rascunho; obsoleto = obsoleto; vigente = sem marca. */
export function marcaDaFolha(status: string): MarcaFolha {
  if (status === 'draft' || status === 'in_review') return 'rascunho';
  if (status === 'obsolete') return 'obsoleto';
  return null;
}

/** Última publicação com cópia da folha (a vigente, ou a que valia antes de obsoletar). */
export function ultimaCopia(det: Pick<FormularioDetalhe, 'revisoes'>): RevisaoFormulario | null {
  const comCopia = (det.revisoes ?? []).filter((r) => r.temCopia && r.snapshot);
  if (comCopia.length === 0) return null;
  return comCopia.reduce((a, b) => (b.revision > a.revision ? b : a));
}

export interface ParaImprimir {
  form: Formulario;
  marca: MarcaFolha;
}

/**
 * O que a impressão oficial imprime. Vigente = ele mesmo, sem marca. Nova revisão em rascunho/aprovação = a vigente
 * (a cópia da última publicação), sem marca, até publicar. Nunca publicado = o rascunho com marca. Obsoleto = a
 * última publicada (se houver) com marca de obsoleto.
 */
export function paraImpressao(det: FormularioDetalhe): ParaImprimir {
  const ultima = ultimaCopia(det);
  if (det.status === 'published') return { form: det, marca: null };
  if (det.status === 'obsolete') return { form: ultima?.snapshot ?? det, marca: 'obsoleto' };
  if (ultima?.snapshot) return { form: ultima.snapshot, marca: null };
  return { form: det, marca: marcaDaFolha(det.status) };
}

/** Impressão do rascunho atual (nova revisão ainda não publicada), sempre com marca. */
export function paraImpressaoRascunho(det: FormularioDetalhe): ParaImprimir {
  return { form: det, marca: det.status === 'published' ? null : marcaDaFolha(det.status) };
}

/** Impressão de uma revisão guardada: a vigente sai sem marca; as demais saem como substituídas. */
export function paraImpressaoRevisao(det: FormularioDetalhe, rev: RevisaoFormulario): ParaImprimir | null {
  if (!rev.snapshot) return null;
  if (det.status === 'obsolete') return { form: rev.snapshot, marca: 'obsoleto' };
  const vigente = ultimaCopia(det);
  return { form: rev.snapshot, marca: vigente && vigente.revision === rev.revision ? null : 'substituida' };
}

export const ROTULO_STATUS: Record<string, { texto: string; classe: string }> = {
  draft: { texto: 'Rascunho', classe: 'bg-amber-50 text-amber-800 border-amber-200' },
  in_review: { texto: 'Em aprovação', classe: 'bg-sky-50 text-sky-800 border-sky-200' },
  published: { texto: 'Vigente', classe: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  obsolete: { texto: 'Obsoleto', classe: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
};

export function rotuloStatus(status: string): { texto: string; classe: string } {
  return ROTULO_STATUS[status] ?? { texto: status, classe: 'bg-zinc-100 text-zinc-600 border-zinc-200' };
}

export const ROTULO_ACAO: Record<string, string> = {
  criado: 'Criado',
  editado: 'Editado',
  enviado_aprovacao: 'Enviado para aprovação',
  devolvido: 'Devolvido ao rascunho',
  publicado: 'Aprovado e publicado',
  revalidado: 'Revalidado',
  obsoleto: 'Tornado obsoleto',
  nova_revisao: 'Nova revisão aberta',
};

export function rev2(n: number | null | undefined): string {
  return String(n ?? 0).padStart(2, '0');
}

export function fmtData(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export function fmtDataHora(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Peso de largura de cada tipo de coluna na folha. */
const PESO_COLUNA: Record<string, number> = { data: 1, hora: 0.8, numero: 1, texto: 2, sim_nao: 0.95, rubrica: 1.3 };

/** Larguras (%) das colunas da folha, proporcionais ao tipo; somam 100. */
export function largurasColunas(tipos: string[]): number[] {
  const pesos = tipos.map((t) => PESO_COLUNA[t] ?? 1);
  const total = pesos.reduce((a, b) => a + b, 0) || 1;
  return pesos.map((p) => (p / total) * 100);
}

/** Sobe/desce um item da lista (cópia nova; fora dos limites devolve igual). */
export function moverItem<T>(lista: T[], de: number, para: number): T[] {
  if (de < 0 || de >= lista.length || para < 0 || para >= lista.length) return lista;
  const copia = lista.slice();
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}
