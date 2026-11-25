import React, { useEffect, useState } from 'react';
import { Sparkles, Check, AlertTriangle } from 'lucide-react';
import Drawer from '../../geral/components/ui/Drawer';
import type { TipoAviso } from '../../geral/components/ui/Aviso';
import { agruparLinhas, type LinhaBase } from '../../geral/lib/linhas';
import { rotuloGrupoAlocacao, sugerirAlocacao } from './api';
import type { Estrutura, SugestaoResultado } from './types';

interface SugestaoDrawerProps {
  open: boolean;
  estruturaId: string;
  estruturaAtiva?: Estrutura | null;
  janelaMeses: number;
  metaMeses: number;
  usarMetaLinha: boolean;
  linhasConfigs: LinhaBase[];
  onClose: () => void;
  onApplied: () => Promise<void>;
  avisar: (msg: string, tipo?: TipoAviso) => void;
}

export function SugestaoDrawer({
  open,
  estruturaId,
  estruturaAtiva = null,
  janelaMeses,
  metaMeses,
  usarMetaLinha,
  linhasConfigs,
  onClose,
  onApplied,
  avisar,
}: SugestaoDrawerProps) {
  const [linhaPrefix, setLinhaPrefix] = useState('ALL');
  const [incluirSaindo, setIncluirSaindo] = useState(true);
  const [manterFixados, setManterFixados] = useState(true);
  const [limparNaoFixados, setLimparNaoFixados] = useState(true);
  const [considerarOpsChegando, setConsiderarOpsChegando] = useState(true);

  const [calculando, setCalculando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [previa, setPrevia] = useState<SugestaoResultado | null>(null);

  useEffect(() => {
    if (open && estruturaAtiva?.linhasPermitidas.length === 1) {
      setLinhaPrefix(estruturaAtiva.linhasPermitidas[0]);
    } else if (open && (estruturaAtiva?.linhasPermitidas.length ?? 0) === 0) {
      setLinhaPrefix('ALL');
    }
  }, [open, estruturaAtiva]);

  useEffect(() => {
    if (!open) {
      setPrevia(null);
      return;
    }
    let cancelado = false;
    (async () => {
      setCalculando(true);
      try {
        const res = await sugerirAlocacao(
          {
            estruturaId,
            janelaMeses,
            metaMeses,
            usarMetaLinha,
            linhaPrefix,
            incluirSaindoDeLinha: incluirSaindo,
            manterFixados,
            limparNaoFixados,
            considerarOpsChegando,
          },
          false,
        );
        if (!cancelado) setPrevia(res);
      } catch (e) {
        if (!cancelado) {
          avisar(e instanceof Error ? e.message : 'Erro ao simular sugestão.', 'erro');
        }
      } finally {
        if (!cancelado) setCalculando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [
    open,
    estruturaId,
    janelaMeses,
    metaMeses,
    usarMetaLinha,
    linhaPrefix,
    incluirSaindo,
    manterFixados,
    limparNaoFixados,
    considerarOpsChegando,
    avisar,
  ]);

  if (!open) return null;

  const aplicar = async () => {
    setAplicando(true);
    try {
      const res = await sugerirAlocacao(
        {
          estruturaId,
          janelaMeses,
          metaMeses,
          usarMetaLinha,
          linhaPrefix,
          incluirSaindoDeLinha: incluirSaindo,
          manterFixados,
          limparNaoFixados,
          considerarOpsChegando,
        },
        true,
      );
      avisar(
        `Sugestão aplicada: ${res.resumo.propostasCount} endereços preenchidos (${res.resumo.produtosAlocados} produtos).`,
        'sucesso',
      );
      await onApplied();
      onClose();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao aplicar sugestão.', 'erro');
    } finally {
      setAplicando(false);
    }
  };

  const opcoesLinhas = agruparLinhas(linhasConfigs).filter((g) => g.nivel === 0);

  return (
    <Drawer
      isOpen={open}
      onClose={onClose}
      size="lg"
      title="Sugerir Alocação Automática"
      subtitle="Organização híbrida: zona por grupo (Linha / Kits próximos / Coloração) + Curva ABC + Picking / Pulmão"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-xs font-bold rounded-xl border border-zinc-200 bg-white text-zinc-700 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={calculando || aplicando || !previa || previa.propostas.length === 0}
            onClick={aplicar}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-zinc-900 text-white disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="h-4 w-4" />
            {aplicando ? 'Aplicando...' : 'Aplicar Sugestão'}
          </button>
        </div>
      }
    >
      <div className="p-4 sm:p-5 space-y-4 text-xs">
        {estruturaAtiva && (estruturaAtiva.linhasPermitidas?.length ?? 0) > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span>
              Prateleira ativa (<strong>{estruturaAtiva.nome}</strong>) dedicada a:{' '}
              <strong>
                {estruturaAtiva.linhasPermitidas
                  .map((lp) => rotuloGrupoAlocacao(lp, linhasConfigs))
                  .join(', ')}
              </strong>
              .
            </span>
          </div>
        )}
        <div className="panel-card !p-3 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="space-y-1">
              <span className="font-semibold text-zinc-600 block">Escopo de grupo / linha</span>
              <select
                value={linhaPrefix}
                onChange={(e) => setLinhaPrefix(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white"
              >
                <option value="ALL">Todos os grupos permitidos</option>
                {opcoesLinhas.map(({ linha }) => (
                  <React.Fragment key={linha.linha_prefix}>
                    <option value={linha.linha_prefix}>{linha.nome_linha}</option>
                    <option value={`kits:${linha.linha_prefix}`}>
                      Kits — {linha.nome_linha}
                    </option>
                  </React.Fragment>
                ))}
                <option value="coloracao">Coloração</option>
              </select>
            </label>
            <div className="space-y-1.5 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={manterFixados}
                  onChange={(e) => setManterFixados(e.target.checked)}
                />
                <span>Manter posições travadas (fixadas)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={limparNaoFixados}
                  onChange={(e) => setLimparNaoFixados(e.target.checked)}
                />
                <span>Replanejar posições não fixadas</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={incluirSaindo}
                  onChange={(e) => setIncluirSaindo(e.target.checked)}
                />
                <span>Incluir produtos saindo de linha</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={considerarOpsChegando}
                  onChange={(e) => setConsiderarOpsChegando(e.target.checked)}
                />
                <span>Reservar pulmão para OPs chegando</span>
              </label>
            </div>
          </div>
        </div>

        {calculando ? (
          <div className="p-8 text-center text-zinc-500 font-semibold">
            Calculando prévia da sugestão...
          </div>
        ) : previa ? (
          <>
            <div className="panel-card !p-3 space-y-1.5">
              <div className="flex flex-wrap gap-3 justify-between items-center">
                <div className="flex items-center gap-2 font-bold text-zinc-900">
                  <Sparkles className="h-4 w-4 shrink-0" />
                  Prévia: {previa.resumo.propostasCount} alocações para{' '}
                  {previa.resumo.produtosAlocados} produtos ({previa.resumo.posicoesUsadas} posições ·
                  ocupação média {previa.resumo.ocupacaoMediaPct.toFixed(0)}%)
                </div>
                {previa.resumo.removidasCount > 0 && (
                  <span className="text-zinc-500">
                    Substitui {previa.resumo.removidasCount} alocações não fixadas
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-600">
                <span>
                  Acesso manual (sem paleteira):{' '}
                  <strong className="font-mono text-zinc-900">
                    {previa.resumo.propostasManualCount ?? 0}
                  </strong>
                </span>
                <span>
                  Empilhadeira:{' '}
                  <strong className="font-mono text-zinc-900">
                    {previa.resumo.propostasEmpilhadeiraCount ?? 0}
                  </strong>
                </span>
                {(previa.resumo.produtosComOpCobertos ?? 0) > 0 && (
                  <span className="text-amber-800 font-semibold">
                    {previa.resumo.produtosComOpCobertos} itens com OP chegando previstos
                  </span>
                )}
              </div>
            </div>

            {previa.naoAlocados.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {previa.naoAlocados.length} produtos não alocados na simulação
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1 text-[11px] text-amber-800">
                  {previa.naoAlocados.slice(0, 30).map((n) => (
                    <div key={n.produtoCodigo} className="flex justify-between gap-2">
                      <span className="truncate">
                        <strong>{n.produtoCodigo}</strong> — {n.produtoDescricao}
                      </span>
                      <span className="shrink-0 font-semibold">{n.motivo}</span>
                    </div>
                  ))}
                  {previa.naoAlocados.length > 30 && (
                    <div>... e mais {previa.naoAlocados.length - 30} itens.</div>
                  )}
                </div>
              </div>
            )}

            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
              <div className="px-3 py-2 bg-zinc-50 border-b border-zinc-200 font-bold text-zinc-700">
                Alocações propostas ({previa.propostas.length})
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-zinc-100">
                {previa.propostas.length === 0 ? (
                  <div className="p-4 text-center text-zinc-500">
                    Nenhuma nova alocação proposta (verifique se os produtos possuem caixa e qtde/cx vinculados).
                  </div>
                ) : (
                  previa.propostas.map((p, idx) => (
                    <div
                      key={`${p.posicaoId}-${p.produtoCodigo}-${idx}`}
                      className="px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono font-bold text-zinc-900">
                            {p.posicaoCodigo}
                          </span>
                          <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-700 font-bold">
                            {p.papel}
                          </span>
                          {p.acessoEquipamento && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded border border-zinc-200 text-zinc-600 font-semibold">
                              {p.acessoEquipamento === 'empilhadeira' ? 'Empilh.' : 'Manual'}
                            </span>
                          )}
                          <span className="font-mono text-zinc-700">{p.produtoCodigo}</span>
                        </div>
                        <div className="text-zinc-500 truncate">
                          {p.produtoDescricao}
                          {p.motivoEscolha ? ` · ${p.motivoEscolha}` : ''}
                        </div>
                      </div>
                      <div className="text-right font-mono shrink-0">
                        <div className="font-bold text-zinc-900">{p.totalCaixas} cx</div>
                        <div className="text-[10px] text-zinc-500">
                          {p.fileirasLargura}×{p.camadasAltura} · {p.larguraOcupadaCm.toFixed(1)} cm
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Drawer>
  );
}
