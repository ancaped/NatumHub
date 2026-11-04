import React from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { EstadoEditor } from './editor';
import { moverItem } from './montagem';
import { TIPOS_COLUNA } from './tipos';

export interface OpcaoPop {
  code: string;
  title: string;
}

const MAX_COLUNAS = 14;
const campo = 'mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 bg-white';
const miudo = 'rounded-lg border border-zinc-200 px-2 py-1.5 text-xs bg-white';
const icone = 'p-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 cursor-pointer disabled:cursor-default';

/** Editor do rascunho: dados do formulário, folha (orientação, linhas, cabeçalho) e colunas (rótulo, tipo, limite, largura, ordem). */
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
  const somaLargura = valor.columns.reduce((a, c) => a + (c.width ?? 0), 0);

  return (
    <div className="space-y-5 text-sm">
      <section className="grid gap-3 sm:grid-cols-2">
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
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-600">Folha</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-500">Orientação
            <select className={campo} value={valor.orientation} onChange={(e) => set('orientation', e.target.value)}>
              <option value="portrait">Vertical (A4 em pé)</option>
              <option value="landscape">Horizontal (A4 deitado)</option>
            </select>
          </label>
          <label className="text-xs text-zinc-500">Linhas por folha
            <input className={campo} inputMode="numeric" value={valor.rowsPerSheet} onChange={(e) => set('rowsPerSheet', e.target.value.replace(/\D/g, ''))} placeholder="Padrão da orientação" />
            <span className="block mt-1 text-[11px] text-zinc-500">1 a 60. Menos linhas deixa cada linha mais alta.</span>
          </label>
        </div>
        <div>
          <span className="block text-xs text-zinc-500 mb-1">Cabeçalho (o Mês/Ano sempre sai)</span>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-zinc-900" checked={valor.showArea} onChange={(e) => set('showArea', e.target.checked)} /> Setor/Área
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-zinc-900" checked={valor.showEquip} onChange={(e) => set('showEquip', e.target.checked)} /> Equipamento/ID
            </label>
          </div>
        </div>
        <label className="block text-xs text-zinc-500">Áreas (uma por linha; cada área é uma folha)
          <textarea className={campo} rows={3} value={valor.areasTexto} onChange={(e) => set('areasTexto', e.target.value)} />
        </label>
      </section>

      <section>
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-600">Colunas ({valor.columns.length}/{MAX_COLUNAS})</h3>
          <button
            type="button"
            disabled={valor.columns.length >= MAX_COLUNAS}
            onClick={() => set('columns', [...valor.columns, { label: '', kind: 'texto', limit: '', width: null }])}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 bg-white text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-40 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Coluna
          </button>
        </div>
        <ul className="space-y-1.5">
          {valor.columns.map((c, i) => (
            <li key={i} className="grid grid-cols-[1fr_6.5rem_5rem_4.5rem_auto] gap-1.5 items-center">
              <input className={miudo} value={c.label} onChange={(e) => setColuna(i, { label: e.target.value })} placeholder="Rótulo" aria-label={`Rótulo da coluna ${i + 1}`} />
              <select className={miudo} value={c.kind} onChange={(e) => setColuna(i, { kind: e.target.value })} aria-label={`Tipo da coluna ${i + 1}`}>
                {TIPOS_COLUNA.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
              </select>
              <input className={miudo} value={c.limit ?? ''} onChange={(e) => setColuna(i, { limit: e.target.value })} placeholder="Limite" aria-label={`Limite da coluna ${i + 1}`} />
              <input
                className={miudo}
                inputMode="decimal"
                value={c.width ?? ''}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''));
                  setColuna(i, { width: e.target.value.trim() === '' || !Number.isFinite(n) ? null : n });
                }}
                placeholder="Auto %"
                aria-label={`Largura da coluna ${i + 1} em %`}
              />
              <span className="flex gap-1">
                <button type="button" className={icone} disabled={i === 0} onClick={() => set('columns', moverItem(valor.columns, i, i - 1))} aria-label="Subir coluna"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" className={icone} disabled={i === valor.columns.length - 1} onClick={() => set('columns', moverItem(valor.columns, i, i + 1))} aria-label="Descer coluna"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" className={icone} disabled={valor.columns.length <= 1} onClick={() => set('columns', valor.columns.filter((_, j) => j !== i))} aria-label="Remover coluna"><Trash2 className="w-3.5 h-3.5" /></button>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[11px] text-zinc-500">
          Largura em % da folha (5 a 80). Em branco, a coluna divide o espaço que sobrar conforme o tipo.
          {somaLargura > 100 && <span className="text-red-700 font-semibold"> As larguras somam {Math.round(somaLargura)}%: a folha reduz todas proporcionalmente.</span>}
        </p>
      </section>

      <section className="grid gap-3">
        <label className="text-xs text-zinc-500">Limites de aceitação
          <textarea className={campo} rows={3} value={valor.limits} onChange={(e) => set('limits', e.target.value)} placeholder="Ex.: Temperatura: 20 a 35 °C" />
        </label>
        <label className="text-xs text-zinc-500">Especificações (uma por linha; saem abaixo da tabela, na impressão)
          <textarea className={campo} rows={4} value={valor.specifications} onChange={(e) => set('specifications', e.target.value)} placeholder="Ex.: Limpeza comum: solução de glutaraldeído 2%" />
        </label>
      </section>
    </div>
  );
}
