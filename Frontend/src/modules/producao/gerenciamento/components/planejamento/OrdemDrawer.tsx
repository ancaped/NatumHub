import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, Edit3, Tag, Settings, ShieldCheck, CheckCircle2, XCircle, Trash2, ChevronUp, ChevronDown, Flame, Snowflake } from 'lucide-react';
import Drawer from '../../../../geral/components/ui/Drawer';
import { unidadesDeKg, ehBaseProduto } from '../../../lib/unitConversion';
import { previsaoEnvase } from '../../../lib/processoProduto';
import { situacaoOrdem, validarAlocacao, type CellBatchGroup, type PlanejamentoItem, type ReatorConfig } from './lib/planejamentoSemanal';
import type { DiaSemana, EditQtyModalItem } from './tiposDrawers';

export interface AcoesOrdem {
  handleOpenTechnicalModal: (item: PlanejamentoItem, batchItems?: PlanejamentoItem[]) => void;
  handleOpenLinkLoteModal: (item: PlanejamentoItem, batchItems?: PlanejamentoItem[]) => void;
  handleOpenBatchMassEditModal: (batchItems: PlanejamentoItem[]) => void;
  handleToggleBatchAprovacao: (batchItems: PlanejamentoItem[]) => void;
  handleToggleAprovacao: (item: PlanejamentoItem) => void;
  handleDeleteBatch: (batchItems: PlanejamentoItem[]) => void;
  handleMoveOrder: (item: PlanejamentoItem, direction: 'up' | 'down') => void;
  setEditQtyModalItem: (v: EditQtyModalItem | null) => void;
  setCoberturaAberta: (v: boolean) => void;
  moverOrdens: (itens: PlanejamentoItem[], reatorId: string, dateStr: string) => Promise<boolean>;
}

interface Props {
  batch: CellBatchGroup;
  /** Quantas ordens/bateladas há na mesma célula (reator + dia); só com mais de uma faz sentido subir/descer. */
  gruposNaCelula: number;
  weekDays: DiaSemana[];
  reatores: ReatorConfig[];
  plannedItems: PlanejamentoItem[];
  diasAteEnvasePorCodigo: Map<string, number>;
  acoes: AcoesOrdem;
  onClose: () => void;
}

function Acao({ icone: Icone, texto, onClick, perigo, ativo }: { icone: React.ComponentType<{ size?: number; className?: string }>; texto: string; onClick: () => void; perigo?: boolean; ativo?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full min-h-11 px-3 flex items-center gap-2.5 text-left text-sm font-medium border-b border-zinc-100 last:border-b-0 cursor-pointer transition-colors ${
        perigo ? 'text-red-600 hover:bg-red-50' : ativo ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-800 hover:bg-zinc-50'
      }`}
    >
      <Icone size={16} className={perigo ? 'text-red-500' : 'text-zinc-500'} />
      {texto}
    </button>
  );
}

/** Painel de uma ordem/batelada: o que ela é e todas as ações, escritas por extenso. */
export function OrdemDrawer({ batch, gruposNaCelula, weekDays, reatores, plannedItems, diasAteEnvasePorCodigo, acoes, onClose }: Props) {
  const p = batch.primaryItem;
  const sit = situacaoOrdem(batch);
  const reatorAtual = reatores.find(r => r.id === p.reator_id);
  const [movendo, setMovendo] = useState(false);
  const diasUteis = weekDays.filter(d => !d.holiday);
  const [dia, setDia] = useState(diasUteis.some(d => d.dateStr === p.data_planejada) ? p.data_planejada : (diasUteis[0]?.dateStr ?? p.data_planejada));
  const [reatorId, setReatorId] = useState(p.reator_id);
  const [salvando, setSalvando] = useState(false);

  const motivo = useMemo(() => validarAlocacao({
    reatorId, dateStr: dia, kg: batch.totalKg, reatores, plannedItems, ignoreIds: new Set(batch.items.map(i => i.id)),
  }), [reatorId, dia, batch, reatores, plannedItems]);
  const mesmoLugar = reatorId === p.reator_id && dia === p.data_planejada;

  const depoisDeFechar = (fn: () => void) => () => { onClose(); fn(); };
  const editarKg = () => {
    if (batch.isMulti) acoes.handleOpenBatchMassEditModal(batch.items);
    else acoes.setEditQtyModalItem({ item: p, newQty: p.quantidade_planejada });
  };

  const mover = async () => {
    setSalvando(true);
    const ok = await acoes.moverOrdens(batch.items, reatorId, dia);
    setSalvando(false);
    if (ok) onClose();
  };

  const diaRotulo = weekDays.find(d => d.dateStr === p.data_planejada);
  return (
    <Drawer
      onClose={onClose}
      size="sm"
      title={batch.isMulti ? `Batelada (${batch.items.length} itens)` : (p.descricao || p.codigo_produto)}
      subtitle={`${diaRotulo ? `${diaRotulo.label} ${diaRotulo.dayNumber}` : p.data_planejada} · ${reatorAtual?.nome ?? p.reator_id}`}
      badge={<span className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${sit.classe}`}>{sit.rotulo}</span>}
    >
      <div className="flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-200 text-xs flex flex-col gap-1.5">
          {batch.items.map(it => {
            const un = unidadesDeKg(it.quantidade_planejada, it.descricao, ehBaseProduto({ codigo: it.codigo_produto, descricao: it.descricao }));
            const dias = diasAteEnvasePorCodigo.get(it.codigo_produto);
            return (
              <div key={it.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {batch.isMulti && <div className="font-semibold text-zinc-800 truncate">{it.descricao || it.codigo_produto}</div>}
                  <div className="text-zinc-500 font-mono">{it.codigo_produto}{dias !== undefined ? ` · envase ≥ ${previsaoEnvase(it.data_planejada, dias)}` : ''}</div>
                </div>
                <div className="font-mono text-zinc-800 shrink-0 text-right">
                  <strong>{Number(it.quantidade_planejada).toLocaleString('pt-BR')} kg</strong>
                  <div className="text-zinc-500">{un == null ? '— un' : `~${un.toLocaleString('pt-BR')} un`}</div>
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-1.5 text-zinc-500">
            {batch.isQuente ? <Flame size={12} className="text-amber-500" /> : <Snowflake size={12} className="text-zinc-400" />}
            {batch.isQuente ? 'Processo quente' : 'Processo frio'}
            {batch.loteErp && <span className="font-mono text-emerald-700">· lote #{batch.loteErp}</span>}
          </div>
        </div>

        <Acao icone={ArrowRightLeft} texto="Mover para…" ativo={movendo} onClick={() => setMovendo(v => !v)} />
        {movendo && (
          <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex flex-col gap-2 text-xs">
            <label className="flex flex-col gap-1 font-semibold text-zinc-700">
              Dia
              <select value={dia} onChange={e => setDia(e.target.value)} className="min-h-11 px-2 rounded-lg border border-zinc-300 bg-white text-sm font-normal">
                {diasUteis.map(d => <option key={d.dateStr} value={d.dateStr}>{d.label} ({d.dayNumber})</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-semibold text-zinc-700">
              Reator
              <select value={reatorId} onChange={e => setReatorId(e.target.value)} className="min-h-11 px-2 rounded-lg border border-zinc-300 bg-white text-sm font-normal">
                {reatores.filter(r => r.ativo || r.id === p.reator_id).map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
            </label>
            {motivo && <p className="text-red-600">{motivo}</p>}
            <button
              type="button"
              disabled={!!motivo || mesmoLugar || salvando}
              onClick={mover}
              className="min-h-11 rounded-lg bg-zinc-900 text-white text-sm font-semibold disabled:bg-zinc-200 disabled:text-zinc-400 cursor-pointer disabled:cursor-not-allowed"
            >
              {salvando ? 'Movendo…' : mesmoLugar ? 'Escolha outro dia ou reator' : 'Mover'}
            </button>
          </div>
        )}
        {gruposNaCelula > 1 && (
          <>
            <Acao icone={ChevronUp} texto="Subir na sequência do dia" onClick={() => acoes.handleMoveOrder(p, 'up')} />
            <Acao icone={ChevronDown} texto="Descer na sequência do dia" onClick={() => acoes.handleMoveOrder(p, 'down')} />
          </>
        )}
        <Acao icone={Edit3} texto="Editar kg" onClick={depoisDeFechar(editarKg)} />
        <Acao icone={Tag} texto={batch.loteErp ? 'Vincular lote (trocar)' : 'Vincular lote'} onClick={depoisDeFechar(() => acoes.handleOpenLinkLoteModal(p, batch.items))} />
        <Acao icone={Settings} texto="Parâmetros" onClick={depoisDeFechar(() => acoes.handleOpenTechnicalModal(p, batch.items))} />
        <Acao icone={ShieldCheck} texto="Ver insumos" onClick={depoisDeFechar(() => acoes.setCoberturaAberta(true))} />
        <Acao
          icone={batch.isAprovado ? XCircle : CheckCircle2}
          texto={batch.isAprovado ? 'Tirar aprovação' : 'Aprovar'}
          onClick={depoisDeFechar(() => batch.isMulti ? acoes.handleToggleBatchAprovacao(batch.items) : acoes.handleToggleAprovacao(p))}
        />
        <Acao icone={Trash2} texto="Remover" perigo onClick={depoisDeFechar(() => acoes.handleDeleteBatch(batch.items))} />
      </div>
    </Drawer>
  );
}
