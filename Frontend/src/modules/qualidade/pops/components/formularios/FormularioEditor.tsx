import React from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { TIPOS_COLUNA } from './tipos';
import { moverItem } from './montagem';
import type { EstadoEditor } from './editor';

export interface OpcaoPop {
  code: string;
  title: string;
}

const campo = 'mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 bg-white';

/** Editor do rascunho: título, POP (com busca), periodicidade, orientação, áreas, limites, colunas e linhas por folha. */
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
        <label className="text-xs text-zinc-500">Folha
          <select className={campo} value={valor.orientation} onChange={(e) => set('orientation', e.target.value)}>
            <option value="portrait">Vertical</option>
            <option value="landscape">Horizontal</option>
          </select>
        </label>
        <label className="text-xs text-zinc-500">Linhas por folha
          <input className={campo} type="number" min={0} max={60} value={valor.rowsPerSheet} onChange={(e) => set('rowsPerSheet', e.target.value)} placeholder="Padrão (14 vertical, 8 horizontal)" />
        </label>
        <label className="text-xs text-zinc-500">Áreas (uma por linha; cada área é uma folha)
          <textarea className={campo} rows={4} value={valor.areasTexto} onChange={(e) => set('areasTexto', e.target.value)} />
        </label>
        <label className="text-xs text-zinc-500">Limites de aceitação
          <textarea className={campo} rows={4} value={valor.limits} onChange={(e) => set('limits', e.target.value)} placeholder="Ex.: Temperatura: 20 a 35 °C" />
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-zinc-600">Colunas ({valor.columns.length})</span>
          <button
            type="button"
            onClick={() => set('columns', [...valor.columns, { label: '', kind: 'texto', limit: '' }])}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            <Plus className="w-3.5 h-3.5" /> Coluna
          </button>
        </div>
        <ul className="space-y-1.5">
          {valor.columns.map((c, i) => (
            <li key={i} className="grid grid-cols-[1fr_7rem_8rem_auto] gap-1.5 items-center">
              <input className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs" value={c.label} onChange={(e) => setColuna(i, { label: e.target.value })} placeholder="Rótulo" />
              <select className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs" value={c.kind} onChange={(e) => setColuna(i, { kind: e.target.value })}>
                {TIPOS_COLUNA.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
              </select>
              <input className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs" value={c.limit ?? ''} onChange={(e) => setColuna(i, { limit: e.target.value })} placeholder="Limite" />
              <span className="flex gap-0.5">
                <button type="button" title="Subir" disabled={i === 0} onClick={() => set('columns', moverItem(valor.columns, i, i - 1))} className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" title="Descer" disabled={i === valor.columns.length - 1} onClick={() => set('columns', moverItem(valor.columns, i, i + 1))} className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" title="Remover" disabled={valor.columns.length <= 1} onClick={() => set('columns', valor.columns.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-red-50 text-red-600 disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
