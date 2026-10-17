import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet, BarChart3, ArrowLeft, RefreshCw, Loader2,
  TrendingUp, Package, Layers
} from 'lucide-react';
import AppLayout, { SidebarItem } from '../../geral/components/layout/AppLayout';
import { StockHealthTab } from '../../producao/gerenciamento/components/StockHealthTab';
import ProdutosAtivosRelatoriosView from '../produtos_ativos_relatorios/ProdutosAtivosRelatoriosView';
import { apiFetch } from '../../geral/lib/http';

interface RelatoriosViewProps {
  onBackToHub?: () => void;
  setView?: (view: string) => void;
  initialTab?: 'saude_estoque' | 'produtos_ativos';
}

export default function RelatoriosView({
  onBackToHub,
  setView,
  initialTab = 'saude_estoque',
}: RelatoriosViewProps) {
  const [activeTab, setActiveTab] = useState<'saude_estoque' | 'produtos_ativos'>(initialTab);

  // Estados de dados para a Saúde do Estoque
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [coloracoes, setColoracoes] = useState<any[]>([]);
  const [kits, setKits] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [loadingHealth, setLoadingHealth] = useState(false);

  const fetchHealthData = useCallback(async () => {
    setLoadingHealth(true);
    try {
      // 1. Carregar produtos calculados da produção
      const resProducts = await apiFetch('/products?limit=9999&show_hidden=true');
      if (resProducts.ok) {
        const data = await resProducts.json();
        setAllProducts(data.items || []);
      }

      // 2. Carregar kits
      const resKits = await apiFetch('/kits?limit=9999&show_hidden=true');
      if (resKits.ok) {
        const data = await resKits.json();
        setKits(data.items || []);
      }

      // 3. Carregar colorações
      const resColor = await apiFetch('/products?status=coloracao&limit=9999&show_hidden=true');
      if (resColor.ok) {
        const data = await resColor.json();
        setColoracoes(data.items || []);
      }

      // 4. Carregar configs de linhas
      const resConfigs = await apiFetch('/configs');
      if (resConfigs.ok) {
        const data = await resConfigs.json();
        setConfigs(data || []);
      }
    } catch (e) {
      console.error('Erro ao carregar dados de saúde do estoque:', e);
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'saude_estoque' && allProducts.length === 0) {
      fetchHealthData();
    }
  }, [activeTab, allProducts.length, fetchHealthData]);

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
          <StockHealthTab
            allProducts={allProducts}
            coloracoes={coloracoes}
            kits={kits}
            configs={configs}
            loading={loadingHealth}
            onRefresh={fetchHealthData}
            onShowDetails={() => {}}
          />
        </div>
      )}

      {activeTab === 'produtos_ativos' && (
        <div className="p-6">
          <ProdutosAtivosRelatoriosView onBackToHub={onBackToHub || (() => setView?.('hub'))} />
        </div>
      )}
    </AppLayout>
  );
}
