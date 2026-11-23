import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Package, Plus, Save } from 'lucide-react';
import Drawer from '../../geral/components/ui/Drawer';
import { StatusBadge } from '../../geral/components/ui/ReportKit';
import type { TipoAviso } from '../../geral/components/ui/Aviso';
import { salvarAlocacaoPosicao, salvarVinculoProdutoCaixa } from './api';
import type { Caixa, PosicaoComItens, ProdutoDimensao } from './types';

interface ProdutoAlocacaoDrawerProps {
  produto: ProdutoDimensao | null;
  caixas: Caixa[];
  posicoes: PosicaoComItens[];
  janelaMeses: number;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onAbrirPosicao: (posicaoId: string) => void;
  avisar: (msg: string, tipo?: TipoAviso) => void;
}

export function ProdutoAlocacaoDrawer({
  produto,
  caixas,
  posicoes,
  janelaMeses,
  canEdit,
  onClose,
  onSaved,
  onAbrirPosicao,
  avisar,
}: ProdutoAlocacaoDrawerProps) {
  const [caixaId, setCaixaId] = useState('');
  const [qtdeManual, setQtdeManual] = useState('');
  const [camadasOverride, setCamadasOverride] = useState('');
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);

  const [posId, setPosId] = useState('');
  const [fileiras, setFileiras] = useState(1);
  const [camadas, setCamadas] = useState(1);
  const [fixado, setFixado] = useState(true);
  const [salvandoAloc, setSalvandoAloc] = useState(false);

  useEffect(() => {
    if (!produto) return;
    setCaixaId(produto.caixaId ?? '');
    setQtdeManual(produto.qtdeCxOrigem === 'manual' && produto.qtdeCxEfetiva ? String(produto.qtdeCxEfetiva) : '');
    setCamadasOverride(produto.camadasOverride ? String(produto.camadasOverride) : '');
    setPosId('');
    setFileiras(1);
    setCamadas(1);
    setFixado(true);
  }, [produto]);

  const posicoesDisponiveis = useMemo(() => {
    if (!produto) return [];
    const ocupadas = new Set(produto.alocacoes.map((a) => a.posicaoId));
    return posicoes.filter((p) => p.ativo && !ocupadas.has(p.id));
  }, [produto, posicoes]);

  useEffect(() => {
    if (!posId || !produto) return;
    const pos = posicoes.find((p) => p.id === posId);
    const cx = caixas.find((c) => c.id === caixaId) ?? (produto.caixaId ? caixas.find((c) => c.id === produto.caixaId) : undefined);
    if (pos && cx && cx.alturaCm > 0) {
      const cabem = Math.floor((pos.alturaCm + 1e-6) / cx.alturaCm);
      setCamadas(Math.max(1, Math.min(cabem || 1, cx.empilhamentoMax)));
    }
  }, [posId, caixaId, caixas, posicoes, produto]);

  if (!produto) return null;

  const salvarCaixa = async () => {
    setSalvandoVinculo(true);
    try {
      const qm = qtdeManual.trim() ? parseInt(qtdeManual.trim(), 10) : null;
      const co = camadasOverride.trim() ? parseInt(camadasOverride.trim(), 10) : null;
      await salvarVinculoProdutoCaixa(
        produto.codigo,
        {
          caixaId: caixaId || null,
          qtdeCxManual: qm,
          camadasOverride: co,
          observacoes: null,
        },
        true,
      );
      avisar(`Dados de caixa de ${produto.codigo} salvos.`, 'sucesso');
      await onSaved();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao salvar vínculo de caixa.', 'erro');
    } finally {
      setSalvandoVinculo(false);
    }
  };

  const alocarPosicao = async () => {
    if (!posId) return;
    setSalvandoAloc(true);
    try {
      await salvarAlocacaoPosicao(
        {
          posicaoId: posId,
          produtoCodigo: produto.codigo,
          fileirasLargura: Math.max(1, fileiras),
          camadasAltura: Math.max(1, camadas),
          fixado,
          observacoes: null,
        },
        true,
      );
      avisar(`${produto.codigo} alocado na posição.`, 'sucesso');
      setPosId('');
      await onSaved();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao alocar endereço.', 'erro');
    } finally {
      setSalvandoAloc(false);
    }
  };

  return (
    <Drawer
      isOpen={Boolean(produto)}
      onClose={onClose}
      size="md"
      title={produto.descricao}
      subtitle={`${produto.codigo} · ${produto.linhaPrefix} — ${produto.nomeLinha}`}
      badge={<StatusBadge variante={produto.curvaAbc === 'A' ? 'saudavel' : produto.curvaAbc === 'B' ? 'ordem' : 'apoio'}>Curva {produto.curvaAbc}</StatusBadge>}
    >
      <div className="p-4 sm:p-5 space-y-4 text-xs">
        {/* Endereços atuais */}
        <div className="panel-card !p-3 space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-zinc-800">
            <MapPin className="h-4 w-4" /> Endereços na Expedição
          </div>
          {produto.alocacoes.length === 0 ? (
            <p className="text-zinc-500">Nenhum endereço alocado nesta estrutura.</p>
          ) : (
            <div className="space-y-1.5">
              {produto.alocacoes.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onAbrirPosicao(a.posicaoId)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-left cursor-pointer"
                >
                  <div>
                    <span className="font-mono font-bold text-zinc-900">{a.posicaoCodigo}</span>{' '}
                    <span className="text-zinc-500">
                      ({a.papel === 'pulmao' ? 'Pulmão' : 'Picking'} · {a.fileirasLargura} fil ×{' '}
                      {a.camadasAltura} cam)
                    </span>
                  </div>
                  <span className="font-mono font-bold text-zinc-800">
                    {a.totalCaixas} cx ({a.totalUnidades.toLocaleString('pt-BR')} un)
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2 pt-1 text-zinc-600 border-t border-zinc-100">
            <span>
              Capacidade alocada: <strong>{produto.totalCaixasAlocadas} cx</strong> (
              {produto.totalUnidadesAlocadas.toLocaleString('pt-BR')} un)
            </span>
            <span>
              Estoque ERP: <strong>{Math.round(produto.estoqueAtual).toLocaleString('pt-BR')} un</strong>
              {produto.estoqueCaixas != null ? ` (${produto.estoqueCaixas} cx)` : ''}
            </span>
          </div>
        </div>

        {/* Demanda Varejo x Atacado */}
        <div className="panel-card !p-3 space-y-2">
          <div className="font-bold text-zinc-800">
            Demanda ({janelaMeses} meses) · Meta {produto.metaMesesEfetiva} meses
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-2">
              <div className="text-[10px] text-zinc-500 font-bold uppercase">Varejo</div>
              <div className="font-mono font-bold text-zinc-900 text-sm">
                {Math.round(produto.vendasVarejo).toLocaleString('pt-BR')}
              </div>
              <div className="text-[10px] text-zinc-500">
                {produto.mediaVarejo.toFixed(1)}/mês · {produto.caixasNecessariasPicking} cx pick.
              </div>
            </div>
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-2">
              <div className="text-[10px] text-zinc-500 font-bold uppercase">Atacado</div>
              <div className="font-mono font-bold text-zinc-900 text-sm">
                {Math.round(produto.vendasAtacado).toLocaleString('pt-BR')}
              </div>
              <div className="text-[10px] text-zinc-500">
                {produto.mediaAtacado.toFixed(1)}/mês · {produto.caixasNecessariasPulmao} cx pulm.
              </div>
            </div>
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-2">
              <div className="text-[10px] text-zinc-500 font-bold uppercase">Total</div>
              <div className="font-mono font-bold text-zinc-900 text-sm">
                {Math.round(produto.vendasTotal).toLocaleString('pt-BR')}
              </div>
              <div className="text-[10px] text-zinc-500">
                {produto.mediaTotal.toFixed(1)}/mês · {produto.percentualAbc.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        {/* Caixa de embarque e Qtde/Cx */}
        <div className="panel-card !p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-zinc-800 flex items-center gap-1.5">
              <Package className="h-4 w-4" /> Caixa e Embalagem
            </span>
            {produto.insumoCaixaErp && (
              <span className="text-[11px] font-mono text-zinc-500">
                ERP fórmula: {produto.insumoCaixaErp}
              </span>
            )}
          </div>
          <label className="block space-y-1">
            <span className="text-zinc-500 font-semibold">Caixa de embarque</span>
            <select
              disabled={!canEdit}
              value={caixaId}
              onChange={(e) => setCaixaId(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-200 rounded-xl bg-white"
            >
              <option value="">Sem caixa (usar fórmula ERP se vinculada)</option>
              {caixas
                .filter((c) => c.ativo)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} — {c.nome}
                  </option>
                ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-zinc-500 font-semibold block">
                Qtde/Cx manual (ERP: {produto.qtdeCxErp ?? '—'})
              </span>
              <input
                type="number"
                min={1}
                disabled={!canEdit}
                value={qtdeManual}
                onChange={(e) => setQtdeManual(e.target.value)}
                placeholder={produto.qtdeCxErp ? String(produto.qtdeCxErp) : 'Ex: 12'}
                className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-500 font-semibold block">Camadas máx. (opcional)</span>
              <input
                type="number"
                min={1}
                disabled={!canEdit}
                value={camadasOverride}
                onChange={(e) => setCamadasOverride(e.target.value)}
                placeholder="Automático"
                className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
              />
            </label>
          </div>
          {canEdit && (
            <button
              type="button"
              disabled={salvandoVinculo}
              onClick={salvarCaixa}
              className="px-3 py-2 rounded-xl bg-zinc-900 text-white font-bold flex items-center gap-1.5 hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              {salvandoVinculo ? 'Salvando...' : 'Salvar vínculo de caixa'}
            </button>
          )}
        </div>

        {/* Alocar manualmente em uma posição */}
        {canEdit && (
          <div className="panel-card !p-3 space-y-2.5">
            <div className="font-bold text-zinc-800">Alocar manualmente em um endereço</div>
            <select
              value={posId}
              onChange={(e) => setPosId(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-200 rounded-xl bg-white"
            >
              <option value="">Escolha a posição...</option>
              {posicoesDisponiveis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} ({p.papel === 'pulmao' ? 'Pulmão' : 'Picking'} · vão {p.alturaCm}cm · livre{' '}
                  {p.larguraLivreCm.toFixed(0)}cm)
                </option>
              ))}
            </select>
            {posId && (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5">
                  <span className="text-zinc-500 font-semibold">Fileiras:</span>
                  <input
                    type="number"
                    min={1}
                    value={fileiras}
                    onChange={(e) =>
                      setFileiras(Math.max(1, parseInt(e.target.value || '1', 10)))
                    }
                    className="w-16 px-2 py-1 border border-zinc-200 rounded-lg font-mono"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-zinc-500 font-semibold">Camadas:</span>
                  <input
                    type="number"
                    min={1}
                    value={camadas}
                    onChange={(e) =>
                      setCamadas(Math.max(1, parseInt(e.target.value || '1', 10)))
                    }
                    className="w-16 px-2 py-1 border border-zinc-200 rounded-lg font-mono"
                  />
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fixado}
                    onChange={(e) => setFixado(e.target.checked)}
                  />
                  <span className="font-semibold">Fixo</span>
                </label>
                <button
                  type="button"
                  disabled={salvandoAloc}
                  onClick={alocarPosicao}
                  className="ml-auto px-3 py-1.5 rounded-xl bg-zinc-900 text-white font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {salvandoAloc ? 'Salvando...' : 'Alocar'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
