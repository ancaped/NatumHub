import React, { useEffect, useState } from 'react';
import {
  RefreshCw,
  Layers,
  AlertTriangle,
  Users,
  ShoppingBag,
} from 'lucide-react';
import { apiFetch } from '../../geral/lib/http';
import AppLayout, { type SidebarItem } from '../../geral/components/layout/AppLayout';
import { BotaoAcao, ReportHeader } from '../../geral/components/ui/ReportKit';
import { useAviso } from '../../geral/components/ui/Aviso';
import { usePreviaServidor } from '../../producao/lib/usePreviaServidor';
import type { VendasTab } from './lib/types';
import { JANELAS_DIAS } from './lib/salesStatusUi';
import { PedidosTab } from './components/PedidosTab';
import { FaltasTab } from './components/FaltasTab';
import { ClientesTab } from './components/ClientesTab';
import { ProdutosTab } from './components/ProdutosTab';
import { OrderDetailsDrawer } from './components/OrderDetailsDrawer';
import { ProductSalesDrawer } from './components/ProductSalesDrawer';

interface VendasViewProps {
  onBackToHub: () => void;
  /** Abre a Demanda de Produção (`producao`) ou a Central de Kits (`montagem_kits`) já buscando o código. */
  onAbrirProducao?: (codigo: string, destino: 'producao' | 'montagem_kits') => void;
}

const NAV: SidebarItem[] = [
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

export default function VendasView({ onBackToHub, onAbrirProducao }: VendasViewProps) {
  React.useEffect(() => {
    (window as any).__current_page__ = 'Módulo de Vendas';
  }, []);

  const [activeTab, setActiveTab] = useState<VendasTab>('pedidos');
  const [daysLimit, setDaysLimit] = useState(90);
  const [refreshToken, setRefreshToken] = useState(0);
  const { avisar, aviso } = useAviso();
  const { pedir: pedirPrevia, elemento: elementoPrevia } = usePreviaServidor(avisar);

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

  const rotuloJanela = (dias: unknown) =>
    JANELAS_DIAS.find((j) => j.valor === String(dias))?.rotulo ?? `${dias} dias`;

  // A janela é gravada pelo servidor (2 passos, auditada); a tela só muda depois do OK.
  const handleDaysLimitChange = (val: number) => {
    void pedirPrevia({
      url: '/vendas/janela-faltas',
      init: {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dias: val }),
      },
      titulo: 'Alterar janela de pedidos',
      confirmarRotulo: 'Alterar janela',
      linhas: (d) => [
        {
          titulo: 'Janela dos pedidos considerados',
          detalhe: `${rotuloJanela(d?.resultado?.antes ?? d?.antes)} → ${rotuloJanela(d?.resultado?.depois ?? d?.depois ?? val)}`,
        },
      ],
      erroPadrao: 'Não foi possível alterar a janela.',
      aoConcluir: () => setDaysLimit(val),
    });
  };

  const openOrder = (nPedido: number, dPedido: string) => {
    setOrderDrawer({ nPedido, dPedido });
  };

  const openProduct = (code: string) => {
    setProductCode(code);
  };

  return (
    <AppLayout
      moduleTitle="Vendas"
      onBackToHub={onBackToHub}
      sidebarItems={NAV}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as VendasTab)}
    >
      <div className="text-left">
        <ReportHeader
          titulo={TITLES[activeTab]}
          acoes={
            <BotaoAcao onClick={() => setRefreshToken((n) => n + 1)}>
              <RefreshCw size={13} /> Atualizar
            </BotaoAcao>
          }
        />
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
            onAbrirProducao={onAbrirProducao}
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
      {elementoPrevia}
      {aviso}
    </AppLayout>
  );
}
