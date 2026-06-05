import React, { useState } from 'react';
import { DemandTable } from '../components/compras/DemandTable';
import { QuotationManager } from '../components/compras/QuotationManager';
import { SupplierManager } from '../components/compras/SupplierManager';
import { ReportDashboard } from '../components/compras/ReportDashboard';
import { SettingsPanel } from '../components/compras/SettingsPanel';
import ItemRegistry from '../components/compras/ItemRegistry';
import { Package, ShoppingCart, Users, BarChart3, Settings, Database, Boxes, ArrowLeft } from 'lucide-react';
import { cn } from '../lib/utils';

interface ComprasViewProps {
  onBackToHub: () => void;
}

export default function ComprasView({ onBackToHub }: ComprasViewProps) {
  const [activeTab, setActiveTab] = useState('demands');

  const navItems = [
    { id: 'demands', label: 'Demandas', icon: Package },
    { id: 'quotations', label: 'Cotações', icon: ShoppingCart },
    { id: 'registry', label: 'Cadastro', icon: Boxes },
    { id: 'suppliers', label: 'Fornecedores', icon: Users },
    { id: 'reports', label: 'Relatórios', icon: BarChart3 },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  React.useEffect(() => {
    const item = navItems.find(i => i.id === activeTab);
    if (item) {
      (window as any).__current_page__ = item.label;
    }
  }, [activeTab]);

  return (
    <div className="flex h-screen bg-zinc-50 font-sans text-zinc-900 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-zinc-200 flex flex-col shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-zinc-200 shrink-0">
          <h1 className="font-bold text-base tracking-tight text-zinc-800 uppercase">Insumos & MP</h1>
        </div>
        
        {/* Voltar ao Hub Button */}
        <div className="p-2 border-b border-zinc-100">
          <button
            onClick={onBackToHub}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
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
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                activeTab === item.id 
                  ? "bg-zinc-100 text-zinc-900" 
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
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
          <h2 className="text-xl font-semibold">{navItems.find(i => i.id === activeTab)?.label}</h2>
        </header>
        <main className="flex-1 overflow-y-auto p-2 lg:p-4">
          <div className="w-full max-w-none">
            {activeTab === 'demands' && <DemandTable />}
            {activeTab === 'quotations' && <QuotationManager />}
            {activeTab === 'registry' && <ItemRegistry />}
            {activeTab === 'suppliers' && <SupplierManager />}
            {activeTab === 'reports' && <ReportDashboard />}
            {activeTab === 'settings' && <SettingsPanel />}
          </div>
        </main>
      </div>
    </div>
  );
}

