import React from 'react';
import { OnlineOrdersManager } from '../components/compras/OnlineOrdersManager';
import { ArrowLeft, Globe } from 'lucide-react';
import { cn } from '../lib/utils';

interface ComprasOnlineViewProps {
  onBackToHub: () => void;
}

export default function ComprasOnlineView({ onBackToHub }: ComprasOnlineViewProps) {
  React.useEffect(() => {
    (window as any).__current_page__ = "Compras Online";
  }, []);

  return (
    <div className="flex h-screen bg-zinc-50 font-sans text-zinc-900 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-zinc-200 flex flex-col shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-zinc-200 shrink-0">
          <h1 className="font-bold text-base tracking-tight text-zinc-800 uppercase">Compras Online</h1>
        </div>
        
        {/* Voltar ao Hub Button */}
        <div className="p-2 border-b border-zinc-100">
          <button
            onClick={onBackToHub}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5 text-zinc-400" />
            Voltar ao Menu
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <button
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-bold bg-zinc-150 text-zinc-900 bg-zinc-100"
          >
            <Globe className="h-5 w-5 shrink-0 text-zinc-900" />
            Compras Online
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center px-8 shrink-0">
          <h2 className="text-xl font-semibold">Acompanhamento de Compras Online</h2>
        </header>
        <main className="flex-1 overflow-y-auto p-2 lg:p-4 bg-zinc-50/50">
          <div className="w-full max-w-none">
            <OnlineOrdersManager />
          </div>
        </main>
      </div>
    </div>
  );
}
