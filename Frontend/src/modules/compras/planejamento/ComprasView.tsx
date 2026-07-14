import React, { useState, useEffect } from 'react';
import { DemandTable } from './components/DemandTable';
import { InsumosDetalhesTab } from './components/InsumosDetalhesTab';
import { QuotationManager } from './components/QuotationManager';
import { SupplierManager } from './components/SupplierManager';
import { ReportDashboard } from './components/ReportDashboard';
import { SettingsPanel } from './components/SettingsPanel';
import ItemRegistry from './components/ItemRegistry';
import { ProdutosCompraTab } from './components/ProdutosCompraTab';
import { PrintListTab } from './components/PrintListTab';
import { SolicitationTab } from './components/SolicitationTab';
import { SimulationTab } from './components/SimulationTab';
import { Package, ShoppingCart, Users, BarChart3, Settings, Database, Boxes, ArrowLeft, Palette, Tag, Layers, Printer, ClipboardList, EyeOff, Calculator } from 'lucide-react';
import { cn } from '../../geral/lib/utils';
import { api } from '../../geral/lib/api';
import { Category } from '../../geral/lib/types';
import AppLayout from '../../geral/components/layout/AppLayout';
import { COMPRAS_MODE_VIEW, syncCurrentPageForView } from '../../geral/lib/viewLabels';

interface ComprasViewProps {
  onBackToHub: () => void;
  mode?: 'all' | 'materia_prima' | 'embalagens' | 'coloracao' | 'apoio' | 'quotations';
}

export default function ComprasView({ onBackToHub, mode = 'all' }: ComprasViewProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [pinnedSubs, setPinnedSubs] = useState<string[]>([]);

  const loadPinnedAndCategories = () => {
    api.getCategories().then(setCategories).catch(console.error);
    const stored = localStorage.getItem('natum_hub_pinned_subcategories');
    if (stored) {
      try {
        setPinnedSubs(JSON.parse(stored));
      } catch (e) {
        console.error(e);
      }
    } else {
      setPinnedSubs([]);
    }
  };

  useEffect(() => {
    loadPinnedAndCategories();
    window.addEventListener('storage', loadPinnedAndCategories);
    return () => window.removeEventListener('storage', loadPinnedAndCategories);
  }, []);

  // Dynamically resolve nav items and initial active tab based on mode
  const navItems = React.useMemo(() => {
    const getSubcategoryNavItems = (parentCatId: string | null) => {
      return categories
        .filter(c => pinnedSubs.includes(c.id) && (parentCatId === null || c.parentId === parentCatId))
        .map(c => ({
          id: `sub_${c.id}`,
          label: c.name,
          icon: Tag,
        }));
    };

    switch (mode) {
      case 'materia_prima':
        return [
          { id: 'materia_prima', label: 'Matéria-Prima', icon: Boxes },
          ...getSubcategoryNavItems('cat_mp'),
          { id: 'solicitation', label: 'Solicitação', icon: ClipboardList },
          { id: 'ignored_items', label: 'Itens Suspensos', icon: EyeOff },
          { id: 'suppliers', label: 'Fornecedores', icon: Users },
          { id: 'reports', label: 'Relatórios', icon: BarChart3 },
          { id: 'print_list', label: 'Lista', icon: Printer },
          { id: 'settings', label: 'Configurações', icon: Settings, iconOnly: true },
        ];
      case 'embalagens':
        return [
          { id: 'embalagens', label: 'Embalagens', icon: Layers },
          ...getSubcategoryNavItems('cat_emb'),
          { id: 'solicitation', label: 'Solicitação', icon: ClipboardList },
          { id: 'ignored_items', label: 'Itens Suspensos', icon: EyeOff },
          { id: 'suppliers', label: 'Fornecedores', icon: Users },
          { id: 'reports', label: 'Relatórios', icon: BarChart3 },
          { id: 'print_list', label: 'Lista', icon: Printer },
          { id: 'settings', label: 'Configurações', icon: Settings, iconOnly: true },
        ];
      case 'coloracao':
        return [
          { id: 'coloracao', label: 'Coloração', icon: Palette },
          ...getSubcategoryNavItems('cat_coloracao'),
          { id: 'solicitation', label: 'Solicitação', icon: ClipboardList },
          { id: 'ignored_items', label: 'Itens Suspensos', icon: EyeOff },
          { id: 'suppliers', label: 'Fornecedores', icon: Users },
          { id: 'reports', label: 'Relatórios', icon: BarChart3 },
          { id: 'print_list', label: 'Lista', icon: Printer },
          { id: 'settings', label: 'Configurações', icon: Settings, iconOnly: true },
        ];
      case 'apoio':
        return [
          { id: 'apoio', label: 'Material de Apoio', icon: Tag },
          ...getSubcategoryNavItems('cat_apoio'),
          { id: 'solicitation', label: 'Solicitação', icon: ClipboardList },
          { id: 'ignored_items', label: 'Itens Suspensos', icon: EyeOff },
          { id: 'suppliers', label: 'Fornecedores', icon: Users },
          { id: 'reports', label: 'Relatórios', icon: BarChart3 },
          { id: 'print_list', label: 'Lista', icon: Printer },
          { id: 'settings', label: 'Configurações', icon: Settings, iconOnly: true },
        ];
      case 'quotations':
        return [
          { id: 'quotations', label: 'Cotações', icon: ShoppingCart },
          { id: 'solicitation', label: 'Solicitação', icon: ClipboardList },
          { id: 'suppliers', label: 'Fornecedores', icon: Users },
          { id: 'reports', label: 'Relatórios', icon: BarChart3 },
        ];
      case 'simulation':
        return [
          { id: 'sim_products', label: 'Produtos a Simular', icon: ClipboardList },
          { id: 'sim_requirements', label: 'Insumos Mapeados', icon: Boxes },
        ];
      default:
        return [
          { id: 'demands', label: 'Demandas', icon: Package },
          { id: 'materia_prima', label: 'Matéria-Prima', icon: Boxes },
          { id: 'embalagens', label: 'Embalagens', icon: Layers },
          { id: 'coloracao', label: 'Coloração', icon: Palette },
          { id: 'apoio', label: 'Material de Apoio', icon: Tag },
          { id: 'quotations', label: 'Cotações', icon: ShoppingCart },
          ...getSubcategoryNavItems(null),
          { id: 'solicitation', label: 'Solicitação', icon: ClipboardList },
          { id: 'registry', label: 'Cadastro', icon: Database },
          { id: 'suppliers', label: 'Fornecedores', icon: Users },
          { id: 'reports', label: 'Relatórios', icon: BarChart3 },
          { id: 'print_list', label: 'Lista', icon: Printer },
          { id: 'settings', label: 'Configurações', icon: Settings, iconOnly: true },
        ];
    }
  }, [mode, categories, pinnedSubs]);

  const initialTab = React.useMemo(() => {
    if (mode === 'materia_prima') return 'materia_prima';
    if (mode === 'embalagens') return 'embalagens';
    if (mode === 'coloracao') return 'coloracao';
    if (mode === 'apoio') return 'apoio';
    if (mode === 'quotations') return 'quotations';
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
      case 'quotations': return 'Cotações';
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
            <DemandTable active={activeTab === 'demands'} mode={mode === 'materia_prima' ? 'materia_prima' : mode === 'embalagens' ? 'embalagens' : 'all'} />
          </div>
        )}

        {mode === 'simulation' && (
          <SimulationTab active={true} activeTab={activeTab} />
        )}
        
        {navItems.some(i => i.id === 'print_list') && (
          <div className={activeTab !== 'print_list' ? 'hidden' : ''}>
            <PrintListTab active={activeTab === 'print_list'} mode={mode} />
          </div>
        )}

        {navItems.some(i => i.id === 'solicitation') && (
          <div className={activeTab !== 'solicitation' ? 'hidden' : ''}>
            <SolicitationTab active={activeTab === 'solicitation'} />
          </div>
        )}

        {navItems.some(i => i.id === 'materia_prima') && (
          <div className={activeTab !== 'materia_prima' ? 'hidden' : ''}>
            {mode === 'materia_prima' ? (
              <DemandTable active={activeTab === 'materia_prima'} mode="materia_prima" />
            ) : (
              <InsumosDetalhesTab active={activeTab === 'materia_prima'} parentCategoryFilter="cat_mp" />
            )}
          </div>
        )}

        {navItems.some(i => i.id === 'embalagens') && (
          <div className={activeTab !== 'embalagens' ? 'hidden' : ''}>
            {mode === 'embalagens' ? (
              <DemandTable active={activeTab === 'embalagens'} mode="embalagens" />
            ) : (
              <InsumosDetalhesTab active={activeTab === 'embalagens'} parentCategoryFilter="cat_emb" />
            )}
          </div>
        )}

        {navItems.some(i => i.id === 'coloracao') && (
          <div className={activeTab !== 'coloracao' ? 'hidden' : ''}>
            <ProdutosCompraTab active={activeTab === 'coloracao'} statusFilter="coloracao" title="Coloração" />
          </div>
        )}

        {navItems.some(i => i.id === 'apoio') && (
          <div className={activeTab !== 'apoio' ? 'hidden' : ''}>
            <ProdutosCompraTab active={activeTab === 'apoio'} statusFilter="apoio" title="Material de Apoio" />
          </div>
        )}

        {navItems.some(i => i.id === 'quotations') && (
          <div className={activeTab !== 'quotations' ? 'hidden' : ''}>
            <QuotationManager active={activeTab === 'quotations'} />
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
                />
              </div>
            );
          }
          
          return (
            <div key={`sub_${c.id}`} className={activeTab !== `sub_${c.id}` ? 'hidden' : ''}>
              <DemandTable 
                active={activeTab === `sub_${c.id}`}
                mode={c.parentId === 'cat_emb' ? 'embalagens' : c.parentId === 'cat_mp' ? 'materia_prima' : 'all'} 
                initialCategoryFilter={c.id} 
              />
            </div>
          );
        })}
      </div>
    </AppLayout>
  );
}
