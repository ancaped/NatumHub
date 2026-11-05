import React, { useState, useEffect } from 'react';
import { DemandTable } from './components/DemandTable';
import { InsumosDetalhesTab } from './components/InsumosDetalhesTab';
import { SupplierManager } from './components/SupplierManager';
import { ReportDashboard } from './components/ReportDashboard';
import { SettingsPanel } from './components/SettingsPanel';
import ItemRegistry from './components/ItemRegistry';
import { ProdutosCompraTab } from './components/ProdutosCompraTab';
import { PrintListTab } from './components/PrintListTab';
import { ListasAcompanhamentoTab } from './components/ListasAcompanhamentoTab';
import { SimulationTab } from './components/SimulationTab';
import { OrganizacaoCompras } from './components/OrganizacaoCompras';
import { Package, Users, BarChart3, Settings, Database, Boxes, ArrowLeft, Palette, Tag, Layers, Printer, ClipboardList, EyeOff, Calculator, ClipboardCheck, ListChecks } from 'lucide-react';
import { cn } from '../../geral/lib/utils';
import { api } from '../../geral/lib/api';
import { Category } from '../../geral/lib/types';
import AppLayout from '../../geral/components/layout/AppLayout';
import { COMPRAS_MODE_VIEW, syncCurrentPageForView } from '../../geral/lib/viewLabels';
import { getAuthUser, isSupervisor } from '../../geral/lib/auth';
import { useListaCompra } from './useListaCompra';

interface ComprasViewProps {
  onBackToHub: () => void;
  mode?: 'all' | 'materia_prima' | 'embalagens' | 'coloracao' | 'apoio' | 'simulation';
}

export default function ComprasView({ onBackToHub, mode = 'all' }: ComprasViewProps) {
  const canConfig = isSupervisor(getAuthUser());
  const [categories, setCategories] = useState<Category[]>([]);
  const [pinnedSubs, setPinnedSubs] = useState<string[]>([]);
  const totalLista = useListaCompra(mode).codigos.length;
  const [loteDestaque, setLoteDestaque] = useState<string | null>(null);
  const [propostasPendentes, setPropostasPendentes] = useState(0);
  const carregarPropostas = () => {
    api.getPropostasSubcategoria('pendente').then((l) => setPropostasPendentes(l.length)).catch(() => setPropostasPendentes(0));
  };
  useEffect(carregarPropostas, [mode]);

  const loadPinnedAndCategories = async () => {
    try {
      const [cats, ids] = await Promise.all([
        api.getCategories(),
        api.getPinnedSubcategories().catch(() => [] as string[])
      ]);
      setCategories(cats);
      setPinnedSubs(ids);
    } catch (e) {
      console.error('Erro ao carregar categorias/fixados:', e);
    }
  };

  useEffect(() => {
    loadPinnedAndCategories();
    const handleConfigUpdate = () => loadPinnedAndCategories();
    window.addEventListener('storage', handleConfigUpdate);
    window.addEventListener('compras_config_updated', handleConfigUpdate);
    return () => {
      window.removeEventListener('storage', handleConfigUpdate);
      window.removeEventListener('compras_config_updated', handleConfigUpdate);
    };
  }, [mode]);

  // Dynamically resolve nav items and initial active tab based on mode
  const navItems = React.useMemo(() => {
    const getSubcategoryNavItems = (parentCatId: string | null) => {
      return categories
        .filter(c => {
          if (!pinnedSubs.includes(c.id)) return false;
          if (parentCatId === null) return c.parentId !== null;
          if (parentCatId === 'cat_emb') return c.parentId === 'cat_emb' || c.parentId === 'cat_mat';
          return c.parentId === parentCatId;
        })
        .map(c => ({
          id: `sub_${c.id}`,
          label: c.name,
          icon: Tag,
          grupo: 'Itens',
        }));
    };

    const settingsItem = canConfig
      ? [{ id: 'settings', label: 'Configurações', icon: Settings, iconOnly: true }]
      : [];

    let items;
    switch (mode) {
      case 'materia_prima':
        items = [
          { id: 'materia_prima', label: 'Matéria-Prima', icon: Boxes, grupo: 'Itens' },
          ...getSubcategoryNavItems('cat_mp'),
          { id: 'print_list', label: 'Lista de Compra', icon: Printer, badge: totalLista, grupo: 'Compra' },
          { id: 'listas_acompanhamento', label: 'Solicitações', icon: ClipboardCheck, grupo: 'Compra' },
          { id: 'ignored_items', label: 'Itens Suspensos', icon: EyeOff, grupo: 'Gestão' },
          { id: 'suppliers', label: 'Fornecedores', icon: Users, grupo: 'Gestão' },
          { id: 'reports', label: 'Relatórios', icon: BarChart3, grupo: 'Gestão' },
          { id: 'organizacao', label: 'Organização', icon: ListChecks, grupo: 'Gestão', badge: propostasPendentes > 0 ? propostasPendentes : undefined, badgeTone: 'amber' as const },
          ...settingsItem,
        ];
        break;
      case 'embalagens':
        items = [
          { id: 'embalagens', label: 'Embalagens', icon: Layers, grupo: 'Itens' },
          ...getSubcategoryNavItems('cat_emb'),
          { id: 'print_list', label: 'Lista de Compra', icon: Printer, badge: totalLista, grupo: 'Compra' },
          { id: 'listas_acompanhamento', label: 'Solicitações', icon: ClipboardCheck, grupo: 'Compra' },
          { id: 'ignored_items', label: 'Itens Suspensos', icon: EyeOff, grupo: 'Gestão' },
          { id: 'suppliers', label: 'Fornecedores', icon: Users, grupo: 'Gestão' },
          { id: 'reports', label: 'Relatórios', icon: BarChart3, grupo: 'Gestão' },
          { id: 'organizacao', label: 'Organização', icon: ListChecks, grupo: 'Gestão', badge: propostasPendentes > 0 ? propostasPendentes : undefined, badgeTone: 'amber' as const },
          ...settingsItem,
        ];
        break;
      case 'coloracao':
        items = [
          { id: 'coloracao', label: 'Coloração', icon: Palette, grupo: 'Itens' },
          ...getSubcategoryNavItems('cat_coloracao'),
          { id: 'print_list', label: 'Lista de Compra', icon: Printer, badge: totalLista, grupo: 'Compra' },
          { id: 'listas_acompanhamento', label: 'Solicitações', icon: ClipboardCheck, grupo: 'Compra' },
          { id: 'ignored_items', label: 'Itens Suspensos', icon: EyeOff, grupo: 'Gestão' },
          { id: 'suppliers', label: 'Fornecedores', icon: Users, grupo: 'Gestão' },
          { id: 'reports', label: 'Relatórios', icon: BarChart3, grupo: 'Gestão' },
          { id: 'organizacao', label: 'Organização', icon: ListChecks, grupo: 'Gestão', badge: propostasPendentes > 0 ? propostasPendentes : undefined, badgeTone: 'amber' as const },
          ...settingsItem,
        ];
        break;
      case 'apoio':
        items = [
          { id: 'apoio', label: 'Material de Apoio', icon: Tag, grupo: 'Itens' },
          ...getSubcategoryNavItems('cat_apoio'),
          { id: 'print_list', label: 'Lista de Compra', icon: Printer, badge: totalLista, grupo: 'Compra' },
          { id: 'listas_acompanhamento', label: 'Solicitações', icon: ClipboardCheck, grupo: 'Compra' },
          { id: 'ignored_items', label: 'Itens Suspensos', icon: EyeOff, grupo: 'Gestão' },
          { id: 'suppliers', label: 'Fornecedores', icon: Users, grupo: 'Gestão' },
          { id: 'reports', label: 'Relatórios', icon: BarChart3, grupo: 'Gestão' },
          { id: 'organizacao', label: 'Organização', icon: ListChecks, grupo: 'Gestão', badge: propostasPendentes > 0 ? propostasPendentes : undefined, badgeTone: 'amber' as const },
          ...settingsItem,
        ];
        break;
      case 'simulation':
        items = [
          { id: 'sim_products', label: 'Produtos a Simular', icon: ClipboardList },
          { id: 'sim_auto', label: 'Simulação Automática', icon: Calculator },
          { id: 'sim_requirements', label: 'Insumos Mapeados', icon: Boxes },
        ];
        break;
      default:
        items = [
          { id: 'demands', label: 'Demandas', icon: Package },
          { id: 'materia_prima', label: 'Matéria-Prima', icon: Boxes },
          { id: 'embalagens', label: 'Embalagens', icon: Layers },
          { id: 'coloracao', label: 'Coloração', icon: Palette },
          { id: 'apoio', label: 'Material de Apoio', icon: Tag },
          ...getSubcategoryNavItems(null),
          { id: 'registry', label: 'Cadastro', icon: Database },
          { id: 'suppliers', label: 'Fornecedores', icon: Users },
          { id: 'reports', label: 'Relatórios', icon: BarChart3 },
          { id: 'print_list', label: 'Lista de Compra', icon: Printer, badge: totalLista },
          { id: 'listas_acompanhamento', label: 'Solicitações', icon: ClipboardCheck },
          ...settingsItem,
        ];
        break;
    }
    return items;
  }, [mode, categories, pinnedSubs, canConfig, totalLista, propostasPendentes]);

  const initialTab = React.useMemo(() => {
    if (mode === 'materia_prima') return 'materia_prima';
    if (mode === 'embalagens') return 'embalagens';
    if (mode === 'coloracao') return 'coloracao';
    if (mode === 'apoio') return 'apoio';
    if (mode === 'simulation') return 'sim_products';
    return 'demands';
  }, [mode]);

  const [activeTab, setActiveTab] = useState(initialTab);

  // Sync active tab if mode changes
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const headerTitle = React.useMemo(() => {
    switch (mode) {
      case 'materia_prima': return 'Matéria-Prima';
      case 'embalagens': return 'Embalagens';
      case 'coloracao': return 'Coloração';
      case 'apoio': return 'Material de Apoio';
      case 'simulation': return 'Simulador';
      default: return 'Insumos & MP';
    }
  }, [mode]);

  React.useEffect(() => {
    const item = navItems.find(i => i.id === activeTab);
    const viewId = COMPRAS_MODE_VIEW[mode] || 'compras_materia_prima';
    syncCurrentPageForView(viewId, item?.label);
  }, [activeTab, navItems, mode]);

  return (
    <AppLayout
      moduleTitle={headerTitle}
      moduleSubtitle="Planejamento de Compras"
      onBackToHub={onBackToHub}
      sidebarItems={navItems}
      activeTab={activeTab}
      onTabChange={(id: any) => setActiveTab(id)}
    >
      <div className="w-full max-w-none">
        {navItems.some(i => i.id === 'demands') && (
          <div className={activeTab !== 'demands' ? 'hidden' : ''}>
            <DemandTable active={activeTab === 'demands'} mode={mode === 'materia_prima' ? 'materia_prima' : mode === 'embalagens' ? 'embalagens' : 'all'} moduloLista={mode} />
          </div>
        )}

        {mode === 'simulation' && (
          <SimulationTab active={true} activeTab={activeTab} />
        )}
        
        {navItems.some(i => i.id === 'print_list') && (
          <div className={activeTab !== 'print_list' ? 'hidden' : ''}>
            <PrintListTab
              active={activeTab === 'print_list'}
              mode={mode}
              onLoteGerado={(id) => { setLoteDestaque(id); setActiveTab('listas_acompanhamento'); }}
            />
          </div>
        )}

        {navItems.some(i => i.id === 'listas_acompanhamento') && (
          <div className={activeTab !== 'listas_acompanhamento' ? 'hidden' : ''}>
            <ListasAcompanhamentoTab active={activeTab === 'listas_acompanhamento'} mode={mode} destaqueLoteId={loteDestaque} />
          </div>
        )}


        {navItems.some(i => i.id === 'materia_prima') && (
          <div className={activeTab !== 'materia_prima' ? 'hidden' : ''}>
            {mode === 'materia_prima' ? (
              <DemandTable active={activeTab === 'materia_prima'} mode="materia_prima" moduloLista={mode} />
            ) : (
              <InsumosDetalhesTab active={activeTab === 'materia_prima'} parentCategoryFilter="cat_mp" />
            )}
          </div>
        )}

        {navItems.some(i => i.id === 'embalagens') && (
          <div className={activeTab !== 'embalagens' ? 'hidden' : ''}>
            {mode === 'embalagens' ? (
              <DemandTable active={activeTab === 'embalagens'} mode="embalagens" moduloLista={mode} />
            ) : (
              <InsumosDetalhesTab active={activeTab === 'embalagens'} parentCategoryFilter="cat_emb" />
            )}
          </div>
        )}

        {navItems.some(i => i.id === 'coloracao') && (
          <div className={activeTab !== 'coloracao' ? 'hidden' : ''}>
            <ProdutosCompraTab active={activeTab === 'coloracao'} statusFilter="coloracao" title="Coloração" moduloLista={mode} />
          </div>
        )}

        {navItems.some(i => i.id === 'apoio') && (
          <div className={activeTab !== 'apoio' ? 'hidden' : ''}>
            <ProdutosCompraTab active={activeTab === 'apoio'} statusFilter="apoio" title="Material de Apoio" moduloLista={mode} />
          </div>
        )}

        {navItems.some(i => i.id === 'registry') && (
          <div className={activeTab !== 'registry' ? 'hidden' : ''}>
            <ItemRegistry active={activeTab === 'registry'} mode={mode} />
          </div>
        )}

        {navItems.some(i => i.id === 'ignored_items') && (
          <div className={activeTab !== 'ignored_items' ? 'hidden' : ''}>
            <ItemRegistry active={activeTab === 'ignored_items'} mode={mode} showIgnoredOnly={true} />
          </div>
        )}

        {navItems.some(i => i.id === 'suppliers') && (
          <div className={activeTab !== 'suppliers' ? 'hidden' : ''}>
            <SupplierManager active={activeTab === 'suppliers'} mode={mode} />
          </div>
        )}

        {navItems.some(i => i.id === 'organizacao') && (
          <div className={activeTab !== 'organizacao' ? 'hidden' : ''}>
            <OrganizacaoCompras active={activeTab === 'organizacao'} mode={mode} onMudou={carregarPropostas} />
          </div>
        )}
        {navItems.some(i => i.id === 'reports') && (
          <div className={activeTab !== 'reports' ? 'hidden' : ''}>
            <ReportDashboard active={activeTab === 'reports'} mode={mode} />
          </div>
        )}

        {navItems.some(i => i.id === 'settings') && (
          <div className={activeTab !== 'settings' ? 'hidden' : ''}>
            <SettingsPanel active={activeTab === 'settings'} mode={mode} />
          </div>
        )}

        {categories.filter(c => pinnedSubs.includes(c.id)).map(c => {
          const isColoracao = c.parentId === 'cat_coloracao';
          const isApoio = c.parentId === 'cat_apoio';
          
          if (isColoracao || isApoio) {
            return (
              <div key={`sub_${c.id}`} className={activeTab !== `sub_${c.id}` ? 'hidden' : ''}>
                <ProdutosCompraTab 
                  active={activeTab === `sub_${c.id}`}
                  statusFilter={isColoracao ? 'coloracao' : 'apoio'}
                  title={c.name}
                  initialCategoryFilter={c.id}
                  moduloLista={mode}
                />
              </div>
            );
          }
          
          return (
            <div key={`sub_${c.id}`} className={activeTab !== `sub_${c.id}` ? 'hidden' : ''}>
              <DemandTable 
                active={activeTab === `sub_${c.id}`}
                mode={(c.parentId === 'cat_emb' || c.parentId === 'cat_mat') ? 'embalagens' : c.parentId === 'cat_mp' ? 'materia_prima' : 'all'} 
                initialCategoryFilter={c.id} 
                moduloLista={mode}
              />
            </div>
          );
        })}
      </div>
    </AppLayout>
  );
}
