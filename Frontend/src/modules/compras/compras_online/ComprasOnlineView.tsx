import React from 'react';
import { OnlineOrdersManager } from './components/OnlineOrdersManager';
import { ArrowLeft, Globe } from 'lucide-react';
import { useGlobalNavActive } from '../../geral/components/layout/NavShellContext';

interface ComprasOnlineViewProps {
  onBackToHub: () => void;
}

export default function ComprasOnlineView({ onBackToHub }: ComprasOnlineViewProps) {
  const globalNav = useGlobalNavActive();

  React.useEffect(() => {
    (window as any).__current_page__ = "Compras Online";
  }, []);

  return (
    <div className="flex flex-1 h-full bg-zinc-50 font-sans text-zinc-900 overflow-hidden">
      {!globalNav && (
      <div className="w-64 bg-white border-r border-zinc-200 flex flex-col shrink-0">
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
      )}

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <OnlineOrdersManager />
        </main>
      </div>
    </div>
  );
}
