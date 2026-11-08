import { apiFetch } from '../../geral/lib/http';
import SeletorPessoa, { usePessoasKits } from './SeletorPessoa';
import Drawer from '../../geral/components/ui/Drawer';
import { usePreviaServidor, mensagemErroServidor } from '../lib/usePreviaServidor';
import { useState } from 'react';
import { FileText } from 'lucide-react';
import {
  formatQtyPerKitLabel,
  kitComponentNeedQty,
  kitOrderComponentNeed,
} from '../lib/kitComponentQty';
import {
  linesFromPreview,
  parsePackagingDeductions,
  serializePackagingDeductions,
  splitPackagingLines,
  type PackagingPreviewResponse,
  type ViraPackagingLine,
} from '../lib/viraPackaging';

export default function DrawerEditarOrdemConversao({ ctx }: { ctx: any }) {
  const { viraComposicao, fetchViraComposicao, avisar, abrirPrevia, editViraAssembledBy, editViraCheckedBy, editViraMotivo, editViraNotes, editViraPackagingLines, editViraQuantityAssembled, editViraStatus, handleUpdateViraOrder, selectedViraOrder, setEditViraAssembledBy, setEditViraCheckedBy, setEditViraMotivo, setEditViraNotes, setEditViraPackagingLines, setEditViraQuantityAssembled, setEditViraStatus, setLancarErpViraId, setShowEditViraOrderModal, submittingEditViraOrder } = ctx;
  const pessoas = usePessoasKits(avisar, abrirPrevia);
  const de = selectedViraOrder.deProdutoCodigo;
  const para = selectedViraOrder.paraProdutoCodigo;
  const receita = (viraComposicao || []).find((vc: any) => vc.deProdutoCodigo === de && vc.paraProdutoCodigo === para) || null;
  const [receitaFator, setReceitaFator] = useState<string>(receita ? String(receita.quantidade) : '');
  const [receitaBaixa, setReceitaBaixa] = useState<boolean>(!!receita?.baixaOrigemNaVenda);
  const [salvandoReceita, setSalvandoReceita] = useState(false);
  const fatorNovo = parseFloat(String(receitaFator).replace(',', '.')) || 0;
  const receitaMudou = !receita || Math.abs((parseFloat(receita.quantidade) || 0) - fatorNovo) > 1e-9 || !!receita.baixaOrigemNaVenda !== receitaBaixa;
  const salvarReceita = async () => {
    if (fatorNovo <= 0) {
      avisar('Informe o fator de conversão (maior que zero).', 'erro');
      return;
    }
    setSalvandoReceita(true);
    try {
      const res = await apiFetch('/turnovers/composicao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deProdutoCodigo: de, paraProdutoCodigo: para, quantidade: fatorNovo, baixaOrigemNaVenda: receitaBaixa }),
      });
      if (res.ok) {
        await fetchViraComposicao();
        avisar('Fator do par salvo. Vale para as próximas ordens.', 'sucesso');
      } else {
        const err = await res.json().catch(() => ({}));
        avisar(err.error || 'Erro ao salvar o fator.', 'erro');
      }
    } catch (e) {
      console.error(e);
      avisar('Erro de conexão.', 'erro');
    } finally {
      setSalvandoReceita(false);
    }
  };
  return (
    <>
        <Drawer
          onClose={() => setShowEditViraOrderModal(false)}
          title={`Lote ${selectedViraOrder.orderNumber}`}
          subtitle="Retorno de lote / ordem de conversão"
          size="lg"
        >
            <form onSubmit={handleUpdateViraOrder} className="space-y-4 text-xs font-medium text-zinc-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Status da Produção</label>
                  <select
                    value={editViraStatus}
                    onChange={(e) => setEditViraStatus(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 font-bold text-zinc-900 bg-white"
                  >
                    <option value="PENDING">Em Montagem (Pendente)</option>
                    <option value="COMPLETED">Concluída</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Lançado no ERP?</label>
                  <div className="flex items-center min-h-11 sm:min-h-9">
                    {selectedViraOrder.erpLaunched === 1 ? (
                      <span className="px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-800">
                        Lançado no ERP
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLancarErpViraId(selectedViraOrder.id)}
                        title="Salve a ordem antes: o lançamento usa o que está salvo"
                        className="px-3 py-1.5 min-h-11 sm:min-h-0 rounded-xl bg-zinc-900 text-white text-xs font-bold cursor-pointer"
                      >
                        Lançar no ERP
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Quem montou</label>
                  <SeletorPessoa valor={editViraAssembledBy} onChange={setEditViraAssembledBy} pessoas={pessoas.pessoas} adicionar={pessoas.adicionar} remover={pessoas.remover} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Quem conferiu</label>
                  <SeletorPessoa valor={editViraCheckedBy} onChange={setEditViraCheckedBy} pessoas={pessoas.pessoas} adicionar={pessoas.adicionar} remover={pessoas.remover} />
                </div>
              </div>

              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
                <h4 className="font-extrabold text-[10px] uppercase text-zinc-500 tracking-wider">
                  Ajuste de Quantidade Realizada (itens PARA)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-zinc-400 font-bold block">QTD. PROGRAMADA PARA:</span>
                    <span className="font-bold text-zinc-650 block">{selectedViraOrder.quantity} un</span>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Qtd. real convertida</label>
                    <input
                      type="number"
                      value={editViraQuantityAssembled}
                      onChange={(e) => setEditViraQuantityAssembled(parseFloat(e.target.value) || 0)}
                      className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900"
                      required
                    />
                  </div>
                </div>
              </div>

              {editViraPackagingLines.length > 0 && (
                <div className="border border-zinc-200 rounded-xl p-4 space-y-3">
                  <h4 className="font-extrabold text-[10px] uppercase text-zinc-500 tracking-wider">
                    Embalagens — confirmar retornos
                  </h4>
                  {editViraPackagingLines
                    .filter((l) => l.role === 'return')
                    .map((line) => {
                      const i = editViraPackagingLines.indexOf(line);
                      return (
                        <label
                          key={`edit-ret-${line.code}-${i}`}
                          className="flex items-center gap-2 text-[11px] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={line.returned !== false}
                            onChange={(e) => {
                              const next = [...editViraPackagingLines];
                              next[i] = { ...line, returned: e.target.checked };
                              setEditViraPackagingLines(next);
                            }}
                          />
                          <span className="font-bold text-zinc-600 w-16">Retornou</span>
                          <span className="font-mono flex-1 truncate">
                            {line.code} · {line.description}
                          </span>
                          <span className="font-bold text-zinc-700">{line.qty}</span>
                        </label>
                      );
                    })}
                  {editViraPackagingLines.filter((l) => l.role === 'consume').length > 0 && (
                    <div className="pt-2 border-t border-zinc-100 space-y-1">
                      <p className="text-[9px] font-bold text-amber-700 uppercase">Saídas (destino)</p>
                      {editViraPackagingLines
                        .filter((l) => l.role === 'consume')
                        .map((line, i) => (
                          <div key={`edit-con-${line.code}-${i}`} className="flex justify-between text-[11px]">
                            <span className="font-mono truncate">
                              {line.code} · {line.description}
                            </span>
                            <span className="font-bold">{line.qty}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Motivo / embalagem</label>
                <input
                  type="text"
                  value={editViraMotivo}
                  onChange={(e) => setEditViraMotivo(e.target.value)}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs"
                  placeholder="Ex.: origem não retornou — danificada"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block flex items-center gap-1">
                  <FileText size={10} />
                  Observações de Retorno / Ocorrências
                </label>
                <textarea
                  value={editViraNotes}
                  onChange={(e) => setEditViraNotes(e.target.value)}
                  placeholder="Ex: Conversão concluída..."
                  rows={3}
                  className="w-full border border-zinc-300 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditViraOrderModal(false)}
                  className="px-4 py-2 border border-zinc-300 rounded-xl hover:bg-zinc-50 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingEditViraOrder}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {submittingEditViraOrder ? 'Salvando...' : 'Salvar Retorno'}
                </button>
              </div>
            </form>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-extrabold text-[10px] uppercase text-zinc-500 tracking-wider">Ajustar embalagens e fator deste par</h4>
                <span className="font-mono text-[10px] text-zinc-500">{de} → {para}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Fator de conversão (1→N)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={receitaFator}
                    onChange={(e) => setReceitaFator(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 min-h-11 sm:min-h-0 text-xs font-bold text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
                <button
                  type="button"
                  disabled={salvandoReceita || !receitaMudou}
                  onClick={() => void salvarReceita()}
                  className="min-h-11 sm:min-h-9 px-4 rounded-xl border border-zinc-300 bg-white text-xs font-bold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 cursor-pointer"
                >
                  {salvandoReceita ? 'Salvando...' : 'Salvar fator'}
                </button>
              </div>
              <label className="flex items-start gap-2 cursor-pointer min-h-11 sm:min-h-0">
                <input type="checkbox" checked={receitaBaixa} onChange={(e) => setReceitaBaixa(e.target.checked)} className="mt-0.5 shrink-0" />
                <span className="text-zinc-700">
                  <b className="text-zinc-900">Vende como o destino:</b> a venda do destino baixa a origem no planejamento.
                </span>
              </label>
              <p className="text-[10px] text-zinc-500">
                As embalagens confirmadas nesta ordem viram a sugestão da próxima ordem deste par. A mudança do fator vale para as próximas ordens; não altera esta ordem nem lançamentos já feitos no ERP.
              </p>
            </div>
        </Drawer>
    </>
  );
}
