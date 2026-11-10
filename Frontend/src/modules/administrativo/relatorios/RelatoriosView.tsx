import React, { useState } from 'react';
import {
  FileSpreadsheet, BarChart3, ArrowLeft, RefreshCw, Loader2,
  TrendingUp, Package, Layers
} from 'lucide-react';
import AppLayout, { SidebarItem } from '../../geral/components/layout/AppLayout';
import { StockHealthTab } from '../../producao/gerenciamento/components/StockHealthTab';
import ProdutosAtivosRelatoriosView from '../produtos_ativos_relatorios/ProdutosAtivosRelatoriosView';
import FaltasInsumosLinhaTab from './FaltasInsumosLinhaTab';

interface RelatoriosViewProps {
  onBackToHub?: () => void;
  setView?: (view: string) => void;
  initialTab?: 'saude_estoque' | 'produtos_ativos' | 'faltas_linha';
}

export default function RelatoriosView({
  onBackToHub,
  setView,
  initialTab = 'saude_estoque',
}: RelatoriosViewProps) {
  const [activeTab, setActiveTab] = useState<'saude_estoque' | 'produtos_ativos' | 'faltas_linha'>(initialTab);

  const sidebarItems: SidebarItem[] = [
    {
      id: 'saude_estoque',
      label: 'Saúde do Estoque',
      icon: BarChart3,
    },
    {
      id: 'produtos_ativos',
      label: 'Produtos Ativos & Performance',
      icon: FileSpreadsheet,
    },
    {
      id: 'faltas_linha',
      label: 'Faltas de Insumos por Linha',
      icon: Package,
    },
  ];

  return (
    <AppLayout
      moduleTitle="Relatórios"
      moduleSubtitle="Saúde de estoque, cobertura, curvas e catálogo de produtos"
      onBackToHub={onBackToHub || (() => setView?.('hub'))}
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as any)}
    >
      {activeTab === 'saude_estoque' && (
        <div className="p-6">
          <StockHealthTab setView={setView} />
        </div>
      )}

      {activeTab === 'produtos_ativos' && (
        <div className="p-6">
          <ProdutosAtivosRelatoriosView onBackToHub={onBackToHub || (() => setView?.('hub'))} />
        </div>
      )}

      {activeTab === 'faltas_linha' && <FaltasInsumosLinhaTab />}
    </AppLayout>
  );
}
