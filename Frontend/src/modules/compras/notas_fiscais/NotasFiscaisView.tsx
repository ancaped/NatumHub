import { apiFetch } from '../../geral/lib/http';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, FileText, RefreshCw, Package, Truck } from 'lucide-react';
import { useGlobalNavActive } from '../../geral/components/layout/NavShellContext';
import Drawer from '../../geral/components/ui/Drawer';
import { ReportHeader, ReportTabs, FilterBar, StatusBadge, TabelaPainel, BotaoAcao } from '../../geral/components/ui/ReportKit';


interface NotasFiscaisViewProps {
  onBackToHub: () => void;
}

interface InvoiceHeader {
  invoiceNumber: string;
  invoiceDate: string | null;
  supplierId: string | null;
  supplierName: string | null;
  totalValue: number;
  itemsCount: number;
  itemEncontrado?: string | null;
  pedidos: number[];
}

interface VinculoItem {
  itemId: string;
  nRegistro: number;
  dPedido: string | null;
  qtdePedida: number;
  chegou: number;
  quantidade: number;
}

interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  itemCode: string;
  description: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  supplierName: string | null;
  supplierId: string | null;
  invoiceDate: string | null;
  cfop: string | null;
  icmsValue: number;
  ipiValue: number;
  freightValue: number;
  entryDate: string | null;
  carrierName: string | null;
  supplierCnpj: string | null;
  paymentInstallments: string | null;
}

interface InvoiceDetail {
  invoiceNumber: string;
  invoiceDate: string | null;
  supplierId: string | null;
  supplierName: string | null;
  totalValue: number;
  items: InvoiceItem[];
  cfop: string | null;
  icmsValue: number;
  ipiValue: number;
  freightValue: number;
  entryDate: string | null;
  carrierName: string | null;
  supplierCnpj: string | null;
  paymentInstallments: string | null;
  fteNumber?: string | null;
  fteValue?: number;
  fteCarrierName?: string | null;
  fteCarrierCnpj?: string | null;
  fteIssueDate?: string | null;
  fteEntryDate?: string | null;
  fteCifFob?: string | null;
  fteSerie?: string | null;
  fteCfop?: string | null;
  fteNatureza?: string | null;
  fteIcmsValue?: number;
  vinculos: VinculoItem[];
}

type AbaPeriodo = '30' | '90' | 'todas';

const fmtData = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const fmtNum = (n: number) => Number(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const vazio: React.CSSProperties = { padding: 20, textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' };

export default function NotasFiscaisView({ onBackToHub }: NotasFiscaisViewProps) {
  const globalNav = useGlobalNavActive();
  const [invoices, setInvoices] = useState<InvoiceHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [periodo, setPeriodo] = useState<AbaPeriodo>('todas');

  // Detail drawer
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'geral' | 'itens' | 'frete'>('geral');

  const loadInvoices = useCallback(async (termo: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (termo.trim()) params.set('search', termo.trim());
      const res = await apiFetch(`/compras/notas?${params.toString()}`);
      if (res.ok) setInvoices(await res.json());
    } catch (e) {
      console.error('Erro ao carregar notas fiscais:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (window as any).__current_page__ = 'Módulo de Compras > Notas Fiscais';
  }, []);

  // A busca vai ao servidor (acha também por código/descrição do item); as abas de período filtram na tela.
  useEffect(() => {
    const timer = setTimeout(() => { loadInvoices(search); }, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [search, loadInvoices]);

  const handleOpenDetail = async (invoiceNumber: string, supplierId: string | null) => {
    setDrawerLoading(true);
    setSelectedInvoice(null);
    setActiveTab('geral');
    try {
      const params = new URLSearchParams();
      if (supplierId) params.set('supplier_id', supplierId);
      const res = await apiFetch(`/compras/notas/${invoiceNumber}?${params.toString()}`);
      if (res.ok) setSelectedInvoice(await res.json());
    } catch (e) {
      console.error('Erro ao carregar detalhes da nota fiscal:', e);
    } finally {
      setDrawerLoading(false);
    }
  };

  const formatCurrency = (val: number) =>
    (val ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatDate = fmtData;

  const ultimaNota = useMemo(() => {
    const datas = invoices.map((i) => (i.invoiceDate || '').slice(0, 10)).filter(Boolean);
    return datas.length ? datas.reduce((a, b) => (a > b ? a : b)) : null;
  }, [invoices]);

  const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(`${iso}T12:00:00`).getTime()) / 86400000);

  const noPeriodo = useCallback((inv: InvoiceHeader, dias: number) => {
    const d = (inv.invoiceDate || '').slice(0, 10);
    return d !== '' && diasDesde(d) <= dias;
  }, []);

  const visiveis = useMemo(() => {
    if (periodo === 'todas') return invoices;
    return invoices.filter((i) => noPeriodo(i, Number(periodo)));
  }, [invoices, periodo, noPeriodo]);

  const abas = [
    { id: '30', label: 'Últimos 30 dias', contagem: invoices.filter((i) => noPeriodo(i, 30)).length },
    { id: '90', label: 'Últimos 90 dias', contagem: invoices.filter((i) => noPeriodo(i, 90)).length },
    { id: 'todas', label: 'Todas', contagem: invoices.length },
  ];

  const hasFte = useMemo(() => {
    if (!selectedInvoice) return false;
    return !!(
      selectedInvoice.fteNumber ||
      (selectedInvoice.fteValue && selectedInvoice.fteValue > 0) ||
      selectedInvoice.fteCarrierName
    );
  }, [selectedInvoice]);

  const dadoParado = ultimaNota !== null && diasDesde(ultimaNota) > 7;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-zinc-50 p-6 font-sans text-zinc-900">
      <ReportHeader
        titulo="Notas fiscais de compra"
        subtitulo={
          <>
            Notas de entrada importadas do ERP, com o pedido de cada item.
            {dadoParado && ultimaNota && (
              <>
                {' '}
                <StatusBadge variante="ordem" title="A importação de notas do ERP não traz notas mais recentes que esta data.">
                  Última nota importada do ERP: {fmtData(ultimaNota)}
                </StatusBadge>
              </>
            )}
          </>
        }
        acoes={
          <>
            {!globalNav && <BotaoAcao onClick={onBackToHub}><ArrowLeft size={13} /> Voltar</BotaoAcao>}
            <BotaoAcao onClick={() => loadInvoices(search)} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar
            </BotaoAcao>
          </>
        }
      />
      <ReportTabs abas={abas} ativa={periodo} onChange={(id) => setPeriodo(id as AbaPeriodo)} />
      <FilterBar busca={search} onBusca={setSearch} placeholder="Buscar por nº da nota, fornecedor ou item (código/descrição)..." />

      <TabelaPainel>
        <thead>
          <tr>
            <th>Nota</th>
            <th>Emissão</th>
            <th>Fornecedor</th>
            <th className="numeric-col">Itens</th>
            <th>Pedido(s)</th>
            <th className="numeric-col">Valor</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={6} style={vazio}>Carregando notas fiscais...</td></tr>
          )}
          {!loading && visiveis.length === 0 && (
            <tr><td colSpan={6} style={vazio}>Nenhuma nota fiscal encontrada.</td></tr>
          )}
          {!loading && visiveis.map((inv) => (
            <tr key={`${inv.invoiceNumber}-${inv.supplierId}`} style={{ cursor: 'pointer' }} onClick={() => handleOpenDetail(inv.invoiceNumber, inv.supplierId)}>
              <td>
                <span className="product-code" style={{ fontWeight: 700 }}>#{inv.invoiceNumber}</span>
                {inv.itemEncontrado && (
                  <div style={{ marginTop: 2 }}>
                    <StatusBadge variante="apoio" title="Item da nota que casou com a busca">contém {inv.itemEncontrado}</StatusBadge>
                  </div>
                )}
              </td>
              <td>{fmtData(inv.invoiceDate)}</td>
              <td style={{ fontWeight: 600 }}>{inv.supplierName || 'Não informado'}</td>
              <td className="numeric-col">{inv.itemsCount}</td>
              <td>
                {(inv.pedidos ?? []).length === 0
                  ? '—'
                  : (inv.pedidos ?? []).map((n) => (
                      <span key={n} className="product-code" style={{ marginRight: 6 }}>#{n}</span>
                    ))}
              </td>
              <td className="numeric-col">{formatCurrency(inv.totalValue)}</td>
            </tr>
          ))}
        </tbody>
      </TabelaPainel>

      {/* Detail Drawer */}
      <Drawer
        isOpen={Boolean(selectedInvoice || drawerLoading)}
        onClose={() => setSelectedInvoice(null)}
        badge="Nota Fiscal de Compra"
        title={selectedInvoice ? `NF #${selectedInvoice.invoiceNumber}` : 'Carregando...'}
        subtitle={selectedInvoice ? `${selectedInvoice.supplierName || 'Fornecedor não informado'} | ${formatDate(selectedInvoice.invoiceDate)}` : undefined}
        tabs={[
          { id: 'geral', label: 'Dados Gerais', icon: FileText },
          { id: 'itens', label: 'Itens Faturados', icon: Package, badge: selectedInvoice?.items?.length },
          { id: 'frete', label: 'Frete / CTe', icon: Truck, badge: hasFte ? 'CTe' : undefined },
        ]}
        activeTab={activeTab}
        onTabChange={(tabId) => setActiveTab(tabId as any)}
        size="xl"
        loading={drawerLoading}
        loadingText="Carregando detalhes da nota fiscal..."
        footer={
          <button
            onClick={() => setSelectedInvoice(null)}
            className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-all"
          >
            Fechar Detalhes
          </button>
        }
      >
        {selectedInvoice && (
          <div className="space-y-6">
                  {activeTab === 'geral' && (
                    <div className="animate-in fade-in duration-200">
                      {/* Info Header */}
                      <div className="px-6 py-5 grid grid-cols-2 md:grid-cols-3 gap-6">
                        <div className="space-y-1">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Valor Total Faturado</span>
                          <p className="text-base font-black text-zinc-900">{formatCurrency(selectedInvoice.totalValue)}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">CNPJ Fornecedor</span>
                          <p className="text-sm font-mono font-bold text-zinc-700">{selectedInvoice.supplierCnpj || '-'}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Data Emissão</span>
                          <p className="text-sm font-semibold text-zinc-700">{formatDate(selectedInvoice.invoiceDate)}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Data de Entrada</span>
                          <p className="text-sm font-semibold text-zinc-700">{formatDate(selectedInvoice.entryDate)}</p>
                        </div>
                        {(selectedInvoice.icmsValue > 0 || selectedInvoice.ipiValue > 0) && (
                          <div className="space-y-1">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Impostos (itens)</span>
                            <p className="text-xs font-semibold text-zinc-700 flex flex-wrap gap-2">
                              {selectedInvoice.icmsValue > 0 && <span className="bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">ICMS: {formatCurrency(selectedInvoice.icmsValue)}</span>}
                              {selectedInvoice.ipiValue > 0 && <span className="bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">IPI: {formatCurrency(selectedInvoice.ipiValue)}</span>}
                            </p>
                          </div>
                        )}
                        {selectedInvoice.freightValue > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Frete (NF)</span>
                            <p className="text-sm font-bold text-emerald-700">{formatCurrency(selectedInvoice.freightValue)}</p>
                          </div>
                        )}
                        {selectedInvoice.carrierName && (
                          <div className="space-y-1 col-span-2">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Transportadora (NF)</span>
                            <p className="text-xs font-medium text-zinc-700 truncate bg-zinc-50 p-2 rounded-lg border border-zinc-150">{selectedInvoice.carrierName}</p>
                          </div>
                        )}
                      </div>

                      {/* Contas a Pagar / Duplicatas */}
                      {(() => {
                        let installments: { numero: string; vencimento: string | null; valor: number }[] = [];
                        if (selectedInvoice.paymentInstallments) {
                          try {
                            installments = JSON.parse(selectedInvoice.paymentInstallments);
                          } catch {}
                        }
                        if (installments.length === 0) return null;
                        return (
                          <div className="px-6 py-5 border-t border-zinc-100 bg-zinc-50/20">
                            <h4 className="text-xs font-bold text-zinc-800 uppercase tracking-wider mb-3">Contas a Pagar / Parcelas</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {installments.map((inst, i) => (
                                <div key={i} className="bg-white border border-zinc-200 p-3 rounded-xl shadow-sm hover:border-zinc-350 transition-all">
                                  <div className="text-[10px] text-zinc-400 font-bold font-mono">Parc. {inst.numero}</div>
                                  <div className="text-sm font-extrabold text-zinc-950 mt-1">{formatCurrency(inst.valor)}</div>
                                  <div className="text-[10px] text-zinc-500 font-medium mt-1">Venc: {formatDate(inst.vencimento)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {activeTab === 'itens' && (
                    <div className="p-6 space-y-4 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-zinc-900">Itens Faturados</h4>
                        <span className="text-xs font-semibold text-zinc-500 bg-zinc-100 px-2 py-1 rounded-lg">
                          {(selectedInvoice.items ?? []).length} itens
                        </span>
                      </div>

                      <div className="space-y-3">
                        {(selectedInvoice.items ?? []).map((item, index) => (
                          <div key={item.id || index} className="bg-white border border-zinc-150 rounded-xl p-4 shadow-sm space-y-2 hover:border-zinc-300 transition-colors">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-zinc-800 text-sm truncate">
                                    {item.description || 'Produto Sem Descrição'}
                                  </p>
                                  {item.cfop && (
                                    <span className="px-1.5 py-0.5 bg-zinc-100 border border-zinc-250 text-zinc-650 rounded text-[9px] font-mono">
                                      CFOP {item.cfop}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] font-mono text-zinc-400 mt-0.5">
                                  Cód. Item: {item.itemCode}
                                </p>
                              </div>
                            </div>

                            {/* Pedido vinculado */}
                            {(() => {
                              const vs = (selectedInvoice.vinculos ?? []).filter((v) => v.itemId === item.id);
                              if (vs.length === 0) return <p className="text-[11px] text-zinc-400">Sem pedido</p>;
                              return (
                                <p className="text-[11px] text-zinc-600 flex flex-wrap gap-x-4 gap-y-0.5">
                                  {vs.map((v) => (
                                    <span key={v.nRegistro}>
                                      Pedido <strong className="font-mono">#{v.nRegistro}</strong> de {fmtData(v.dPedido)} · pedido {fmtNum(v.qtdePedida)}, chegou {fmtNum(v.chegou)} · esta NF cobre {fmtNum(v.quantidade)}
                                    </span>
                                  ))}
                                </p>
                              );
                            })()}

                            {/* Quantities/Price row */}
                            <div className="grid grid-cols-3 gap-4 text-xs pt-1">
                              <div>
                                <span className="text-zinc-400 font-medium">Quantidade</span>
                                <p className="font-bold text-zinc-900">{item.quantity.toLocaleString('pt-BR')} {item.unit || 'UN'}</p>
                              </div>
                              <div>
                                <span className="text-zinc-400 font-medium">Preço Unitário</span>
                                <p className="font-semibold text-zinc-800">{formatCurrency(item.unitPrice)}</p>
                              </div>
                              <div className="text-right">
                                <span className="text-zinc-400 font-medium">Valor Total</span>
                                <p className="font-extrabold text-zinc-900">{formatCurrency(item.totalValue)}</p>
                              </div>
                            </div>

                            {/* Impostos do Item */}
                            {(item.icmsValue > 0 || item.ipiValue > 0) && (
                              <div className="flex gap-4 pt-1.5 border-t border-zinc-100/50 mt-1">
                                {item.icmsValue > 0 && (
                                  <span className="text-[10px] text-zinc-500">
                                    ICMS: <strong className="text-zinc-700">{formatCurrency(item.icmsValue)}</strong>
                                  </span>
                                )}
                                {item.ipiValue > 0 && (
                                  <span className="text-[10px] text-zinc-500">
                                    IPI: <strong className="text-zinc-700">{formatCurrency(item.ipiValue)}</strong>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === 'frete' && (
                    <div className="animate-in fade-in duration-200">
                      {hasFte ? (
                        <div className="px-6 py-5 bg-amber-50/10">
                          <h4 className="text-xs font-bold text-zinc-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Truck className="h-4 w-4 text-amber-700 animate-bounce" style={{ animationDuration: '3s' }} />
                            Conhecimento de Frete (CTe) Vinculado
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-5 bg-white border border-zinc-200/80 p-5 rounded-2xl shadow-sm">
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Nº Conhecimento</span>
                              <p className="text-sm font-mono font-bold text-zinc-900">{selectedInvoice.fteNumber || '-'}</p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Valor Doc. Fiscal</span>
                              <p className="text-sm font-black text-zinc-900">
                                {formatCurrency(selectedInvoice.fteValue || 0)}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">CIF / FOB</span>
                              <p className="text-sm font-semibold text-zinc-700">
                                {selectedInvoice.fteCifFob === '1' ? 'CIF' : selectedInvoice.fteCifFob === '2' ? 'FOB' : selectedInvoice.fteCifFob || '-'}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Série</span>
                              <p className="text-sm font-semibold text-zinc-700">{selectedInvoice.fteSerie || '-'}</p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">CFOP Frete</span>
                              <p className="text-sm font-mono font-semibold text-zinc-700">{selectedInvoice.fteCfop || '-'}</p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">ICMS Frete</span>
                              <p className="text-sm font-semibold text-zinc-700">
                                {(selectedInvoice.fteIcmsValue || 0) > 0
                                  ? formatCurrency(selectedInvoice.fteIcmsValue || 0)
                                  : '-'}
                              </p>
                            </div>
                            <div className="space-y-1 col-span-2 md:col-span-3">
                              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Natureza</span>
                              <p className="text-xs font-medium text-zinc-700">{selectedInvoice.fteNatureza || '-'}</p>
                            </div>
                            <div className="space-y-1 col-span-2 md:col-span-3 border-t border-zinc-100 pt-3 mt-1">
                              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Transportadora (CTe)</span>
                              <p className="text-xs font-medium text-zinc-750 truncate">
                                {selectedInvoice.fteCarrierName || '-'}
                                {selectedInvoice.fteCarrierCnpj ? (
                                  <span className="ml-2 font-mono text-zinc-500 text-[10px] bg-zinc-100 px-2 py-0.5 rounded">CNPJ {selectedInvoice.fteCarrierCnpj}</span>
                                ) : null}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Emissão CTe</span>
                              <p className="text-xs font-semibold text-zinc-700">{formatDate(selectedInvoice.fteIssueDate || null)}</p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Entrada CTe</span>
                              <p className="text-xs font-semibold text-zinc-700">{formatDate(selectedInvoice.fteEntryDate || null)}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400">
                            <Truck size={20} />
                          </div>
                          <h5 className="font-bold text-zinc-700 text-sm">Nenhum Conhecimento de Frete</h5>
                          <p className="text-xs text-zinc-400 max-w-sm">
                            Esta nota fiscal não possui informações de CTe vinculadas no sistema local do ERP.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
