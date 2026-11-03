import React from 'react';
import type { EstadoEditor } from './editor';

export interface OpcaoPop {
  code: string;
  title: string;
}

const campo = 'mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 bg-white';

/** Editor do rascunho, só texto: título, POP (com busca), periodicidade, áreas, limites, especificações e rótulo/limite das colunas. */
export default function FormularioEditor({
  valor,
  onChange,
  pops,
}: {
  valor: EstadoEditor;
  onChange: (v: EstadoEditor) => void;
  pops: OpcaoPop[];
}) {
  const set = <K extends keyof EstadoEditor>(k: K, v: EstadoEditor[K]) => onChange({ ...valor, [k]: v });
  const setColuna = (i: number, parte: Partial<EstadoEditor['columns'][number]>) =>
    set('columns', valor.columns.map((c, j) => (j === i ? { ...c, ...parte } : c)));
  const popTitulo = pops.find((p) => p.code === valor.popCode.trim().toUpperCase())?.title;

  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-zinc-500 sm:col-span-2">Título
          <input className={campo} value={valor.title} onChange={(e) => set('title', e.target.value)} />
        </label>
        <label className="text-xs text-zinc-500">POP vinculado
          <input className={`${campo} font-mono`} list="pops-opcoes" value={valor.popCode} onChange={(e) => set('popCode', e.target.value)} placeholder="Buscar POP-…" />
          <datalist id="pops-opcoes">
            {pops.map((p) => <option key={p.code} value={p.code}>{p.title}</option>)}
          </datalist>
          <span className="block mt-1 text-[11px] text-zinc-500">{popTitulo ?? (valor.popCode ? 'POP não encontrado na lista.' : '')}</span>
        </label>
        <label className="text-xs text-zinc-500">Periodicidade
          <input className={campo} value={valor.periodicity} onChange={(e) => set('periodicity', e.target.value)} placeholder="Diária, Por uso…" />
        </label>
        <label className="text-xs text-zinc-500">Áreas (uma por linha; cada área é uma folha)
          <textarea className={campo} rows={4} value={valor.areasTexto} onChange={(e) => set('areasTexto', e.target.value)} />
        </label>
        <label className="text-xs text-zinc-500">Limites de aceitação
          <textarea className={campo} rows={4} value={valor.limits} onChange={(e) => set('limits', e.target.value)} placeholder="Ex.: Temperatura: 20 a 35 °C" />
        </label>
        <label className="text-xs text-zinc-500 sm:col-span-2">Especificações (uma por linha; saem abaixo da tabela, na impressão)
          <textarea className={campo} rows={4} value={valor.specifications} onChange={(e) => set('specifications', e.target.value)} placeholder="Ex.: Limpeza comum: solução de glutaraldeído 2%" />
        </label>
      </div>

      <div>
        <span className="block mb-1 text-xs font-semibold text-zinc-600">Colunas ({valor.columns.length})</span>
        <ul className="space-y-1.5">
          {valor.columns.map((c, i) => (
            <li key={i} className="grid grid-cols-[1fr_10rem] gap-1.5 items-center">
              <input className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs" value={c.label} onChange={(e) => setColuna(i, { label: e.target.value })} placeholder="Rótulo" />
              <input className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs" value={c.limit ?? ''} onChange={(e) => setColuna(i, { limit: e.target.value })} placeholder="Limite" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
