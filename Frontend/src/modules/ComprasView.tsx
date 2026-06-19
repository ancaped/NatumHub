import React, { useState, useEffect } from 'react';
import { DemandTable } from '../components/compras/DemandTable';
import { InsumosDetalhesTab } from '../components/compras/InsumosDetalhesTab';
import { QuotationManager } from '../components/compras/QuotationManager';
import { SupplierManager } from '../components/compras/SupplierManager';
import { ReportDashboard } from '../components/compras/ReportDashboard';
import { SettingsPanel } from '../components/compras/SettingsPanel';
import ItemRegistry from '../components/compras/ItemRegistry';
import { ProdutosCompraTab } from '../components/compras/ProdutosCompraTab';
import { Package, ShoppingCart, Users, BarChart3, Settings, Database, Boxes, ArrowLeft, Palette, Tag, Layers } from 'lucide-react';
import { cn } from '../lib/utils';

interface ComprasViewProps {
  onBackToHub: () => void;
  mode?: 'all' | 'materia_prima' | 'embalagens' | 'coloracao' | 'apoio' | 'quotations';
}

export default function ComprasView({ onBackToHub, mode = 'all' }: ComprasViewProps) {
  // Dynamically resolve nav items and initial active tab based on mode
  const navItems = React.useMemo(() => {
    switch (mode) {
      case 'materia_prima':
        return [
          { id: 'materia_prima', label: 'Matéria-Prima', icon: Boxes },
          { id: 'registry', label: 'Cadastro', icon: Database },
          { id: 'suppliers', label: 'Fornecedores', icon: Users },
          { id: 'reports', label: 'Relatórios', icon: BarChart3 },
          { id: 'settings', label: 'Configurações', icon: Settings },
        ];
      case 'embalagens':
        return [
          { id: 'demands', label: 'Demandas', icon: Package },
          { id: 'embalagens', label: 'Embalagens', icon: Layers },
          { id: 'registry', label: 'Cadastro', icon: Database },
          { id: 'suppliers', label: 'Fornecedores', icon: Users },
          { id: 'reports', label: 'Relatórios', icon: BarChart3 },
          { id: 'settings', label: 'Configurações', icon: Settings },
        ];
      case 'coloracao':
        return [
          { id: 'coloracao', label: 'Coloração', icon: Palette },
          { id: 'registry', label: 'Cadastro', icon: Database },
          { id: 'suppliers', label: 'Fornecedores', icon: Users },
          { id: 'reports', label: 'Relatórios', icon: BarChart3 },
          { id: 'settings', label: 'Configurações', icon: Settings },
        ];
      case 'apoio':
        return [
          { id: 'apoio', label: 'Material de Apoio', icon: Tag },
          { id: 'registry', label: 'Cadastro', icon: Database },
          { id: 'suppliers', label: 'Fornecedores', icon: Users },
          { id: 'reports', label: 'Relatórios', icon: BarChart3 },
          { id: 'settings', label: 'Configurações', icon: Settings },
        ];
      case 'quotations':
        return [
          { id: 'quotations', label: 'Cotações', icon: ShoppingCart },
          { id: 'suppliers', label: 'Fornecedores', icon: Users },
          { id: 'reports', label: 'Relatórios', icon: BarChart3 },
        ];
      default:
        return [
          { id: 'demands', label: 'Demandas', icon: Package },
          { id: 'materia_prima', label: 'Matéria-Prima', icon: Boxes },
          { id: 'embalagens', label: 'Embalagens', icon: Layers },
          { id: 'coloracao', label: 'Coloração', icon: Palette },
          { id: 'apoio', label: 'Material de Apoio', icon: Tag },
          { id: 'quotations', label: 'Cotações', icon: ShoppingCart },
          { id: 'registry', label: 'Cadastro', icon: Database },
          { id: 'suppliers', label: 'Fornecedores', icon: Users },
          { id: 'reports', label: 'Relatórios', icon: BarChart3 },
          { id: 'settings', label: 'Configurações', icon: Settings },
        ];
    }
  }, [mode]);

  const initialTab = React.useMemo(() => {
    if (mode === 'materia_prima') return 'materia_prima';
    if (mode === 'coloracao') return 'coloracao';
    if (mode === 'apoio') return 'apoio';
    if (mode === 'quotations') return 'quotations';
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
      default: return 'Insumos & MP';
    }
  }, [mode]);

  React.useEffect(() => {
    const item = navItems.find(i => i.id === activeTab);
    if (item) {
      (window as any).__current_page__ = item.label;
    }
  }, [activeTab, navItems]);

  return (
    <div className="flex h-screen bg-zinc-50 font-sans text-zinc-900 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-zinc-200 flex flex-col shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-zinc-200 shrink-0">
          <h1 className="font-bold text-base tracking-tight text-zinc-800 uppercase">{headerTitle}</h1>
        </div>
        
        {/* Voltar ao Hub Button */}
        <div className="p-2 border-b border-zinc-100">
          <button
            onClick={onBackToHub}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5 text-zinc-400" />
            Voltar ao Hub
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                activeTab === item.id 
                  ? "bg-zinc-100 text-zinc-900" 
                  : "text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900"
              )}
            >
              <item.icon className={cn("h-5 w-5 shrink-0", activeTab === item.id ? "text-zinc-900" : "text-zinc-400")} />
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center px-8 shrink-0">
          <h2 className="text-xl font-semibold text-zinc-800">{navItems.find(i => i.id === activeTab)?.label}</h2>
        </header>
        <main className="flex-1 overflow-y-auto p-2 lg:p-4 bg-zinc-50/50">
          <div className="w-full max-w-none">
            {activeTab === 'demands' && <DemandTable mode={mode === 'materia_prima' ? 'materia_prima' : mode === 'embalagens' ? 'embalagens' : 'all'} />}
            {activeTab === 'materia_prima' && (
              mode === 'materia_prima' ? (
                <DemandTable mode="materia_prima" />
              ) : (
                <InsumosDetalhesTab parentCategoryFilter="cat_mp" />
              )
            )}
            {activeTab === 'embalagens' && <InsumosDetalhesTab parentCategoryFilter="cat_emb" />}
            {activeTab === 'coloracao' && <ProdutosCompraTab statusFilter="coloracao" title="Coloração" />}
            {activeTab === 'apoio' && <ProdutosCompraTab statusFilter="apoio" title="Material de Apoio" />}
            {activeTab === 'quotations' && <QuotationManager />}
            {activeTab === 'registry' && <ItemRegistry mode={mode === 'materia_prima' ? 'materia_prima' : mode === 'embalagens' ? 'embalagens' : 'all'} />}
            {activeTab === 'suppliers' && <SupplierManager mode={mode} />}
            {activeTab === 'reports' && <ReportDashboard mode={mode} />}
            {activeTab === 'settings' && <SettingsPanel mode={mode} />}
          </div>
        </main>
      </div>
    </div>
  );
}

