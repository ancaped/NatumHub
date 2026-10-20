import React, { useState, useEffect } from 'react';
import Drawer from '../../../geral/components/ui/Drawer';
import { apiFetch } from '../../../geral/lib/http';
import { 
  TrendingUp, Layers, ClipboardList, Package, Clock, 
  Sparkles, Calculator, AlertCircle, CheckCircle2 
} from 'lucide-react';

interface ProductDetailsDrawerProps {
  productCode: string | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenLoteDetails?: (loteNumber: string) => void;
}

export const ProductDetailsDrawer: React.FC<ProductDetailsDrawerProps> = ({
  productCode,
  isOpen,
  onClose,
  onOpenLoteDetails
}) => {
  const [activeTab, setActiveTab] = useState<'geral' | 'formula' | 'lotes' | 'pedidos'>('geral');
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<any | null>(null);
  const [pendingOrders, setPendingOrders] = useState<any | null>(null);
  const [simulatedQty, setSimulatedQty] = useState(100);

  useEffect(() => {
    if (!isOpen || !productCode) {
      setDetails(null);
      setPendingOrders(null);
      return;
    }

    let isMounted = true;
    const fetchDetails = async () => {
      setLoading(true);
      setActiveTab('geral');
      try {
        const clean = encodeURIComponent(productCode.trim());
        const [detRes, pedRes] = await Promise.all([
          apiFetch(`/produtos/${clean}/detalhes`),
          apiFetch(`/produtos/${clean}/pedidos-pendentes`)
        ]);

        if (isMounted && detRes.ok) {
          const detData = await detRes.json();
          setDetails(detData);
          setSimulatedQty(detData.producao_recomendada > 0 ? detData.producao_recomendada : 100);
        }
        if (isMounted && pedRes.ok) {
          setPendingOrders(await pedRes.json());
        }
      } catch (e) {
        console.error('Erro ao carregar detalhes do produto:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDetails();
    return () => { isMounted = false; };
  }, [isOpen, productCode]);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      badge="Detalhes do Produto"
      title={loading ? 'Carregando...' : (details?.description || 'Produto')}
      subtitle={loading ? '...' : `REF: ${details?.code || productCode || ''}`}
      size="lg"
      loading={loading}
      loadingText="Carregando ficha técnica e histórico..."
      tabs={[
        { id: 'geral', label: 'Geral', icon: TrendingUp },
        { id: 'formula', label: 'Fórmula & Ingredientes', icon: Layers },
        { id: 'lotes', label: 'Lotes de Produção', icon: ClipboardList, badge: details?.lastLots?.length || 0 },
        { id: 'pedidos', label: 'Pedidos', icon: Package, badge: pendingOrders?.pending_sales_orders?.length || 0 },
      ]}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as any)}
    >
      {details ? (
        <div className="space-y-6 text-left">
          {/* TAB: GERAL */}
          {activeTab === 'geral' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-50 border border-zinc-200 p-3 rounded-xl">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase block">Estoque Atual</span>
                  <p className="text-base font-extrabold text-zinc-900 mt-1">
                    {(Number(details.currentStock) || 0).toLocaleString('pt-BR')}{' '}
                    <span className="text-xs font-semibold text-zinc-500">{details.unit || 'UN'}</span>
                  </p>
                </div>
                <div className="bg-zinc-50 border border-zinc-200 p-3 rounded-xl flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase block">Última Produção</span>
                    <p className="text-xs font-extrabold text-zinc-900 mt-1">
                      {details.lastProductionDate 
                        ? new Date(details.lastProductionDate).toLocaleDateString('pt-BR') 
                        : 'Nunca produzido'}
                    </p>
                  </div>
                  {details.lastProductionQty != null && (
                    <div className="text-[10px] text-zinc-500 font-bold mt-1">
                      Qtd: {Number(details.lastProductionQty).toLocaleString('pt-BR')} {details.unit || 'UN'}
                    </div>
                  )}
                </div>
                <div className="bg-zinc-50 border border-zinc-200 p-3 rounded-xl">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase block">Código ERP</span>
                  <p className="text-base font-extrabold text-zinc-900 mt-1 font-mono">
                    {details.code}
                  </p>
                </div>
              </div>

              {/* Vendas Ano a Ano */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 border-b border-zinc-150 pb-2">
                  <TrendingUp className="h-4 w-4 text-zinc-600" />
                  <h4 className="font-extrabold text-sm text-zinc-900">Histórico de Vendas Ano a Ano</h4>
                </div>
                {!details.salesYoy || details.salesYoy.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-2">Sem histórico de vendas registrado.</p>
                ) : (
                  <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 font-bold text-zinc-600 border-b border-zinc-200 text-[11px]">
                        <tr>
                          <th className="px-3.5 py-2">Ano</th>
                          <th className="px-3.5 py-2 text-right">Total Vendido ({details.unit || 'UN'})</th>
                          <th className="px-3.5 py-2 text-right">Média Mensal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 font-medium">
                        {details.salesYoy.map((s: any) => (
                          <tr key={s.year} className="hover:bg-zinc-50/50">
                            <td className="px-3.5 py-2 font-bold text-zinc-800">{s.year}</td>
                            <td className="px-3.5 py-2 text-right font-semibold text-zinc-950">
                              {(Number(s.totalQty) || 0).toLocaleString('pt-BR')}
                            </td>
                            <td className="px-3.5 py-2 text-right text-zinc-500 font-mono">
                              {(Number(s.monthlyAvg) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: FÓRMULA & MATÉRIAS-PRIMAS */}
          {activeTab === 'formula' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-zinc-150 pb-2">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-zinc-600" />
                  <h4 className="font-extrabold text-sm text-zinc-900">Formulação Química & Insumos</h4>
                </div>
              </div>

              {!details.formulation || details.formulation.length === 0 ? (
                <p className="text-xs text-zinc-400 py-3">Nenhuma fórmula cadastrada no ERP para este produto.</p>
              ) : (
                <div className="space-y-4">
                  <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 font-bold text-zinc-600 border-b border-zinc-200 text-[11px]">
                        <tr>
                          <th className="px-3 py-2">Insumo</th>
                          <th className="px-3 py-2 text-right">Qtd / un</th>
                          <th className="px-3 py-2 text-right">Estoque Atual</th>
                          <th className="px-3 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 font-medium">
                        {details.formulation.map((ing: any, idx: number) => {
                          const isOk = Number(ing.currentStock) > 0;
                          return (
                            <tr key={idx} className="hover:bg-zinc-50/50">
                              <td className="px-3 py-2">
                                <div className="font-bold text-zinc-900">{ing.description || ing.code}</div>
                                <div className="font-mono text-[10px] text-zinc-400">{ing.code}</div>
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-zinc-700">
                                {Number(ing.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 5 })} {ing.unit}
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-zinc-900">
                                {Number(ing.currentStock || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} {ing.unit}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isOk ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}>
                                  {isOk ? 'OK' : 'Falta'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: LOTES */}
          {activeTab === 'lotes' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 border-b border-zinc-150 pb-2">
                <ClipboardList className="h-4 w-4 text-zinc-600" />
                <h4 className="font-extrabold text-sm text-zinc-900">Lotes de Produção Recentes</h4>
              </div>
              {!details.lastLots || details.lastLots.length === 0 ? (
                <p className="text-xs text-zinc-400 py-3">Nenhum lote registrado para este produto.</p>
              ) : (
                <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 font-bold text-zinc-600 border-b border-zinc-200 text-[11px]">
                      <tr>
                        <th className="px-3.5 py-2">Lote</th>
                        <th className="px-3.5 py-2">Data</th>
                        <th className="px-3.5 py-2 text-right">Quantidade</th>
                        <th className="px-3.5 py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 font-medium">
                      {details.lastLots.map((lote: any) => (
                        <tr 
                          key={lote.id || lote.loteNumber}
                          className="hover:bg-zinc-50/50 cursor-pointer"
                          onClick={() => onOpenLoteDetails?.(lote.loteNumber)}
                        >
                          <td className="px-3.5 py-2 font-mono font-bold text-zinc-900">{lote.loteNumber}</td>
                          <td className="px-3.5 py-2 text-zinc-600">
                            {new Date(lote.date).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-3.5 py-2 text-right font-semibold text-zinc-950 font-mono">
                            {(Number(lote.quantity) || 0).toLocaleString('pt-BR')}
                          </td>
                          <td className="px-3.5 py-2 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-100 text-zinc-700 border border-zinc-200">
                              {lote.status || 'Finalizado'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: PEDIDOS */}
          {activeTab === 'pedidos' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 border-b border-zinc-150 pb-2">
                <Package className="h-4 w-4 text-zinc-600" />
                <h4 className="font-extrabold text-sm text-zinc-900">Pedidos de Venda em Aberto</h4>
              </div>
              {!pendingOrders?.pending_sales_orders || pendingOrders.pending_sales_orders.length === 0 ? (
                <p className="text-xs text-zinc-400 py-3">Nenhum pedido de venda em aberto para este item.</p>
              ) : (
                <div className="space-y-2">
                  {pendingOrders.pending_sales_orders.map((so: any, idx: number) => (
                    <div key={idx} className="bg-white border border-zinc-200 p-3 rounded-xl shadow-2xs flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-zinc-900">Pedido #{so.n_pedido}</div>
                        <div className="text-[11px] text-zinc-500">{so.c_nome_cli || `Cliente ${so.n_codigo}`}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-zinc-900">{(Number(so.n_qtde) || 0).toLocaleString('pt-BR')} {details.unit || 'UN'}</div>
                        <div className="text-[10px] text-zinc-400">{so.d_pedido ? new Date(so.d_pedido).toLocaleDateString('pt-BR') : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </Drawer>
  );
};
