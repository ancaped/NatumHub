import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  Layers,
  AlertTriangle,
  Users,
  ShoppingBag,
} from 'lucide-react';
import { apiFetch } from '../../geral/lib/http';
import { cn } from '../../geral/lib/utils';
import { useGlobalNavActive } from '../../geral/components/layout/NavShellContext';
import type { VendasTab } from './lib/types';
import { PedidosTab } from './components/PedidosTab';
import { FaltasTab } from './components/FaltasTab';
import { ClientesTab } from './components/ClientesTab';
import { ProdutosTab } from './components/ProdutosTab';
import { OrderDetailsDrawer } from './components/OrderDetailsDrawer';
import { ProductSalesDrawer } from './components/ProductSalesDrawer';

interface VendasViewProps {
  onBackToHub: () => void;
}

const NAV: { id: VendasTab; label: string; icon: typeof Layers }[] = [
  { id: 'pedidos', label: 'Pedidos', icon: Layers },
  { id: 'faltas', label: 'Faltas', icon: AlertTriangle },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'produtos', label: 'Produtos', icon: ShoppingBag },
];

const TITLES: Record<VendasTab, string> = {
  pedidos: 'Pedidos de venda',
  faltas: 'Faltas de produto',
  clientes: 'Clientes',
  produtos: 'Consulta de produtos',
};

export default function VendasView({ onBackToHub }: VendasViewProps) {
  React.useEffect(() => {
    (window as any).__current_page__ = 'Módulo de Vendas';
  }, []);

  const globalNav = useGlobalNavActive();
  const [activeTab, setActiveTab] = useState<VendasTab>('pedidos');
  const [daysLimit, setDaysLimit] = useState(90);
  const [refreshToken, setRefreshToken] = useState(0);

  const [orderDrawer, setOrderDrawer] = useState<{
    nPedido: number;
    dPedido: string;
  } | null>(null);
  const [productCode, setProductCode] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await apiFetch(`/settings/sales_faltas_days_limit`);
        if (res.ok) {
          const data = await res.json();
          if (data?.value != null && data.value !== '') {
            setDaysLimit(Number(data.value));
          }
        }
      } catch (e) {
        console.error('Erro ao carregar limite de dias de vendas:', e);
      }
    };
    loadSettings();
  }, []);

  const handleDaysLimitChange = async (val: number) => {
    setDaysLimit(val);
    try {
      await apiFetch(`/settings/sales_faltas_days_limit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: String(val) }),
      });
    } catch (e) {
      console.error('Erro ao salvar limite de dias de vendas:', e);
    }
  };

  const openOrder = (nPedido: number, dPedido: string) => {
    setOrderDrawer({ nPedido, dPedido });
  };

  const openProduct = (code: string) => {
    setProductCode(code);
  };

  return (
    <div className="flex flex-1 h-full bg-zinc-50 font-sans text-zinc-900 overflow-hidden">
      <div className="w-64 bg-white border-r border-zinc-200 flex flex-col shrink-0">
        {!globalNav && (
          <div className="p-2 border-b border-zinc-100">
            <button
              type="button"
              onClick={onBackToHub}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-5 w-5 text-zinc-400" />
              Voltar ao Hub
            </button>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer',
                activeTab === id
                  ? 'bg-zinc-100 text-zinc-900 font-bold'
                  : 'text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900',
              )}
            >
              <Icon
                className={cn(
                  'h-5 w-5 shrink-0',
                  activeTab === id ? 'text-zinc-900' : 'text-zinc-400',
                )}
              />
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden relative bg-zinc-50/50">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-8 shrink-0 shadow-sm">
          <h2 className="text-xl font-bold text-zinc-800">{TITLES[activeTab]}</h2>
          <button
            type="button"
            onClick={() => setRefreshToken((n) => n + 1)}
            className="p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold border border-zinc-200 shadow-sm cursor-pointer bg-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 text-left">
          {activeTab === 'pedidos' && (
            <PedidosTab
              daysLimit={daysLimit}
              onDaysLimitChange={handleDaysLimitChange}
              onOpenOrder={openOrder}
              refreshToken={refreshToken}
            />
          )}
          {activeTab === 'faltas' && (
            <FaltasTab
              daysLimit={daysLimit}
              onDaysLimitChange={handleDaysLimitChange}
              onOpenProduct={openProduct}
              onOpenOrder={openOrder}
              refreshToken={refreshToken}
            />
          )}
          {activeTab === 'clientes' && (
            <ClientesTab
              daysLimit={daysLimit}
              onDaysLimitChange={handleDaysLimitChange}
              onOpenOrder={openOrder}
              refreshToken={refreshToken}
            />
          )}
          {activeTab === 'produtos' && (
            <ProdutosTab onOpenProduct={openProduct} refreshToken={refreshToken} />
          )}
        </main>
      </div>

      <OrderDetailsDrawer
        open={!!orderDrawer}
        nPedido={orderDrawer?.nPedido ?? null}
        dPedido={orderDrawer?.dPedido ?? null}
        onClose={() => setOrderDrawer(null)}
        onOpenProduct={(code) => {
          setOrderDrawer(null);
          openProduct(code);
        }}
      />

      <ProductSalesDrawer
        open={!!productCode}
        productCode={productCode}
        onClose={() => setProductCode(null)}
        onOpenOrder={(n, d) => {
          setProductCode(null);
          openOrder(n, d);
        }}
      />
    </div>
  );
}
