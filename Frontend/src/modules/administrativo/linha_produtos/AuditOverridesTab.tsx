import React, { useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { cn } from '../../geral/lib/utils';
import { Category, PRODUCT_LINE_STATUSES } from '../../geral/lib/types';
import type { LineConfig, PedirBulkOpts, ProductOverride } from './tipos';

interface Props {
  allOverrides: ProductOverride[];
  /** Só código e descrição são usados (nome do produto na tabela e na busca). */
  products: { codigo: string; descricao: string }[];
  configs: LineConfig[];
  categories: Category[];
  /** Ação em lote em 2 passos: prévia no painel e só grava no OK. */
  pedirBulk: (opts: PedirBulkOpts) => Promise<void>;
  /** Recarrega os dados da tela depois de gravar. */
  onReload: () => Promise<void> | void;
}

/** Aba Audit de Overrides da Linha de Produtos: ajustes manuais por produto, filtros por tipo e limpeza com prévia. */
export default function AuditOverridesTab({ allOverrides, products, configs, categories, pedirBulk, onReload }: Props) {
  const [selectedOverrideCodes, setSelectedOverrideCodes] = useState<Set<string>>(new Set());
  const [auditSearch, setAuditSearch] = useState('');
  const [auditTipo, setAuditTipo] = useState('ALL');
  const [auditPage, setAuditPage] = useState(1);
  const AUDIT_POR_PAGINA = 50;

  // Ajustes manuais de um override, por tipo (filtro e chips da aba Audit usam a mesma lista).
  const ajustesDoOverride = (ovr: ProductOverride) => {
    const mods: { tipo: string; rotulo: string; valor: string; semEfeito?: boolean }[] = [];
    if (ovr.estoque_ideal_manual !== null) mods.push({ tipo: 'estoque', rotulo: 'Estoque fixo', valor: `${ovr.estoque_ideal_manual} un` });
    if (ovr.media_manual !== null) mods.push({ tipo: 'media', rotulo: 'Média de vendas', valor: `${ovr.media_manual}/mês` });
    if (ovr.pedidos_manual !== null) mods.push({ tipo: 'pedidos', rotulo: 'Pedidos em carteira', valor: `${ovr.pedidos_manual} un` });
    if (ovr.is_lancamento_manual !== null) mods.push({ tipo: 'lancamento', rotulo: 'Lançamento', valor: ovr.is_lancamento_manual === 1 ? 'marcado' : 'forçado normal' });
    if (ovr.visivel === 0) mods.push({ tipo: 'oculto', rotulo: 'Oculto', valor: '' });
    if (ovr.linha_prefix_manual !== null) mods.push({ tipo: 'linha', rotulo: 'Linha', valor: configs.find(c => c.linha_prefix === ovr.linha_prefix_manual)?.nome_linha || ovr.linha_prefix_manual });
    if (ovr.status_produto !== null) mods.push({ tipo: 'status', rotulo: 'Status', valor: PRODUCT_LINE_STATUSES.find(st => st.value === ovr.status_produto)?.label || ovr.status_produto, semEfeito: ovr.status_produto === 'ativo' });
    if (ovr.categoria_produto !== null) mods.push({ tipo: 'categoria', rotulo: 'Categoria', valor: categories.find(c => c.id === ovr.categoria_produto)?.name || 'categoria removida' });
    return mods;
  };

  // Status "ativo" gravado como ajuste só repete o padrão: limpar só ele não muda nada no produto.
  const statusRedundante = (ovr: ProductOverride) => ovr.status_produto === 'ativo';

  const TIPOS_AJUSTE: { id: string; rotulo: string }[] = [
    { id: 'estoque', rotulo: 'Estoque fixo' },
    { id: 'media', rotulo: 'Média' },
    { id: 'pedidos', rotulo: 'Pedidos' },
    { id: 'lancamento', rotulo: 'Lançamento' },
    { id: 'oculto', rotulo: 'Oculto' },
    { id: 'linha', rotulo: 'Linha' },
    { id: 'status', rotulo: 'Status' },
    { id: 'categoria', rotulo: 'Categoria' },
  ];

  const contagemPorTipoAjuste = useMemo(() => {
    const cont: Record<string, number> = {};
    for (const o of allOverrides) {
      for (const m of ajustesDoOverride(o)) cont[m.tipo] = (cont[m.tipo] || 0) + 1;
    }
    cont['status_redundante'] = allOverrides.filter(statusRedundante).length;
    return cont;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOverrides, configs, categories]);

  const overridesFiltrados = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    const porTipo =
      auditTipo === 'ALL' ? allOverrides
      : auditTipo === 'status_redundante' ? allOverrides.filter(statusRedundante)
      : allOverrides.filter(o => ajustesDoOverride(o).some(m => m.tipo === auditTipo));
    if (!q) return porTipo;
    return porTipo.filter(o => {
      const desc = products.find(p => p.codigo === o.codigo)?.descricao || '';
      return o.codigo.toLowerCase().includes(q) || desc.toLowerCase().includes(q) || (o.observacao || '').toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOverrides, products, auditSearch, auditTipo, configs, categories]);

  const auditTotalPaginas = Math.max(1, Math.ceil(overridesFiltrados.length / AUDIT_POR_PAGINA));
  const auditPaginaAtual = Math.min(auditPage, auditTotalPaginas);

  const overridesPagina = overridesFiltrados.slice((auditPaginaAtual - 1) * AUDIT_POR_PAGINA, auditPaginaAtual * AUDIT_POR_PAGINA);

  const handleClearOverride = async (code: string) => {
    await pedirBulk({
      titulo: `Remover configurações manuais de ${code}`,
      codigos: [code],
      action: 'clear',
      value: null,
      confirmarRotulo: 'Remover',
      aoConcluir: async () => { await onReload(); },
    });
  };

  // Tira só o status "ativo" redundante dos overrides filtrados (2 passos: prévia e OK).
  const limparStatusRedundante = async () => {
    const codigos = overridesFiltrados.filter(statusRedundante).map(o => o.codigo);
    if (codigos.length === 0) return;
    await pedirBulk({
      titulo: `Limpar o status redundante de ${codigos.length} produto(s)`,
      codigos,
      action: 'set_status',
      value: '',
      confirmarRotulo: 'Limpar status',
      aoConcluir: async () => {
        await onReload();
      },
    });
  };

  const handleClearOverridesBulk = async () => {
    if (selectedOverrideCodes.size === 0) return;
    await pedirBulk({
      titulo: `Remover configurações manuais de ${selectedOverrideCodes.size} produto(s)`,
      codigos: Array.from(selectedOverrideCodes),
      action: 'clear',
      value: null,
      confirmarRotulo: 'Remover',
      aoConcluir: async () => {
        setSelectedOverrideCodes(new Set());
        await onReload();
      },
    });
  };

  return (
            <div className="flex-1 flex flex-col space-y-4">
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {[{ id: 'ALL', rotulo: 'Todos', n: allOverrides.length }, { id: 'status_redundante', rotulo: 'Status redundante', n: contagemPorTipoAjuste['status_redundante'] || 0 }, ...TIPOS_AJUSTE.filter(t => contagemPorTipoAjuste[t.id]).map(t => ({ ...t, n: contagemPorTipoAjuste[t.id] }))].filter(t => t.id !== 'status_redundante' || t.n > 0).map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setAuditTipo(t.id); setAuditPage(1); }}
                    className={cn(
                      'px-3 py-1.5 rounded-full border text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5',
                      auditTipo === t.id ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                    )}
                  >
                    {t.rotulo}
                    <span className={cn('font-mono text-[10px]', auditTipo === t.id ? 'text-zinc-300' : 'text-zinc-400')}>{t.n}</span>
                  </button>
                ))}
              </div>
              {auditTipo === 'status_redundante' && overridesFiltrados.length > 0 && (
                <div className="shrink-0 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-zinc-600">
                  <span>O status Ativa repete o padrão e não muda nada. Limpar só o status mantém os outros ajustes (categoria, linha...) e apaga o override que ficar vazio.</span>
                  <button
                    onClick={() => void limparStatusRedundante()}
                    className="shrink-0 px-3 py-1.5 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-lg font-bold text-zinc-700 cursor-pointer"
                  >
                    Limpar status dos {overridesFiltrados.length}
                  </button>
                </div>
              )}
              <div className="relative w-full max-w-sm shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar por código, descrição ou observação..."
                  value={auditSearch}
                  onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1); }}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-sm font-medium"
                />
              </div>

              {/* Overrides Table Card */}
              <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 border-b border-zinc-155 font-bold text-zinc-500">
                    <tr>
                      <th className="px-4 py-3.5 w-12 text-center">
                        <input
                          type="checkbox"
                          checked={overridesFiltrados.length > 0 && selectedOverrideCodes.size === overridesFiltrados.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const codes = overridesFiltrados.map(o => o.codigo);
                              setSelectedOverrideCodes(new Set(codes));
                            } else {
                              setSelectedOverrideCodes(new Set());
                            }
                          }}
                          className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                        />
                      </th>
                      <th className="px-6 py-3 w-24 text-[10px] uppercase tracking-wider">Código</th>
                      <th className="px-6 py-3 text-[10px] uppercase tracking-wider">Produto</th>
                      <th className="px-6 py-3 text-[10px] uppercase tracking-wider">Ajustes manuais</th>
                      <th className="px-6 py-3 text-[10px] uppercase tracking-wider">Observações</th>
                      <th className="px-6 py-3 w-24"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {overridesFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-zinc-400">
                          {allOverrides.length === 0
                            ? 'Nenhum override manual cadastrado. Todos os produtos seguem as regras automáticas de suas linhas.'
                            : 'Nenhum override encontrado para essa busca.'}
                        </td>
                      </tr>
                    ) : (
                      overridesPagina.map(ovr => {
                        const prod = products.find(p => p.codigo === ovr.codigo);
                        const description = prod ? prod.descricao : 'Produto não cadastrado ou oculto';
                        const isSelected = selectedOverrideCodes.has(ovr.codigo);
                        
                        const mods = ajustesDoOverride(ovr);

                        return (
                          <tr 
                            key={ovr.codigo} 
                            className={cn(
                              "hover:bg-zinc-50/70 transition-colors group cursor-pointer",
                              isSelected && "bg-zinc-50/50"
                            )}
                            onClick={() => {
                              const next = new Set(selectedOverrideCodes);
                              if (next.has(ovr.codigo)) next.delete(ovr.codigo);
                              else next.add(ovr.codigo);
                              setSelectedOverrideCodes(next);
                            }}
                          >
                            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  const next = new Set(selectedOverrideCodes);
                                  if (next.has(ovr.codigo)) next.delete(ovr.codigo);
                                  else next.add(ovr.codigo);
                                  setSelectedOverrideCodes(next);
                                }}
                                className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                              />
                            </td>
                            <td className="px-6 py-3 font-mono font-bold text-zinc-500">{ovr.codigo}</td>
                            <td className="px-6 py-3 font-bold text-zinc-800">{description}</td>
                            <td className="px-6 py-3">
                              <div className="flex flex-wrap gap-1">
                                {mods.map((m, idx) => (
                                  <span key={idx} title={m.semEfeito ? 'Igual ao padrão: não muda nada' : undefined} className={cn("px-2 py-0.5 border rounded-full text-[10px] font-bold whitespace-nowrap", m.semEfeito ? "bg-white text-zinc-400 border-dashed border-zinc-300" : "bg-zinc-100 text-zinc-700 border-zinc-200")}>
                                    <span className="text-zinc-400 font-semibold">{m.rotulo}{m.valor ? ':' : ''}</span> {m.valor}
                                  </span>
                                ))}
                                {mods.length === 0 && <span className="text-zinc-300 italic">Nenhum ajuste real salvo</span>}
                              </div>
                            </td>
                            <td className="px-6 py-3 text-zinc-500 max-w-[200px] truncate" title={ovr.observacao || undefined}>
                              {ovr.observacao || '-'}
                            </td>
                            <td className="px-6 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => handleClearOverride(ovr.codigo)}
                                className="px-2.5 py-1 bg-white hover:bg-zinc-50 text-zinc-600 hover:text-rose-700 rounded-lg font-bold border border-zinc-200 transition-colors cursor-pointer"
                                title="Limpar overrides manuais e restaurar regras padrão da linha"
                              >
                                Limpar
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                {overridesFiltrados.length > AUDIT_POR_PAGINA && (
                  <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-100 bg-zinc-50 text-xs font-semibold text-zinc-600">
                    <span>
                      {(auditPaginaAtual - 1) * AUDIT_POR_PAGINA + 1}–{Math.min(auditPaginaAtual * AUDIT_POR_PAGINA, overridesFiltrados.length)} de {overridesFiltrados.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={auditPaginaAtual <= 1}
                        onClick={() => setAuditPage(auditPaginaAtual - 1)}
                        className="px-2.5 py-1 bg-white border border-zinc-200 rounded-lg font-bold text-zinc-700 disabled:opacity-40 cursor-pointer"
                      >
                        Anterior
                      </button>
                      <span>Página {auditPaginaAtual} de {auditTotalPaginas}</span>
                      <button
                        type="button"
                        disabled={auditPaginaAtual >= auditTotalPaginas}
                        onClick={() => setAuditPage(auditPaginaAtual + 1)}
                        className="px-2.5 py-1 bg-white border border-zinc-200 rounded-lg font-bold text-zinc-700 disabled:opacity-40 cursor-pointer"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Bulk Actions Bar for Overrides */}
              {selectedOverrideCodes.size > 0 && (
                <div className="bg-zinc-900 text-white px-6 py-4 flex items-center justify-between gap-4 border-t border-zinc-800 shadow-2xl shrink-0 rounded-2xl">
                  <div className="flex items-center gap-2">
                    <span className="bg-zinc-800 text-white font-bold px-2 py-0.5 rounded text-sm">
                      {selectedOverrideCodes.size}
                    </span>
                    <span className="text-xs font-medium text-zinc-300">overrides selecionados para limpeza em lote</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleClearOverridesBulk}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer text-xs"
                    >
                      <Trash2 className="w-4 h-4" />
                      Limpar Overrides Selecionados
                    </button>
                    <button 
                      onClick={() => setSelectedOverrideCodes(new Set())}
                      className="text-xs text-zinc-400 hover:text-white px-2 py-1.5 font-medium transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
  );
}
