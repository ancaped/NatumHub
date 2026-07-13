import React, { useState } from 'react';
import { ArrowLeft, Menu, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useGlobalNavActive } from './NavShellContext';

export interface SidebarItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
}

interface AppLayoutProps {
  moduleTitle: string;
  moduleSubtitle?: string;
  onBackToHub: () => void;
  sidebarItems: SidebarItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  currentUser?: { displayName?: string; photoURL?: string } | null;
}

function SidebarNav({
  items,
  activeTab,
  onTabChange,
  onItemClick,
}: {
  items: SidebarItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  onItemClick?: () => void;
}) {
  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => {
              onTabChange(item.id);
              onItemClick?.();
            }}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all border cursor-pointer',
              isActive
                ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                : 'text-zinc-650 border-transparent hover:bg-zinc-50 hover:text-zinc-900'
            )}
          >
            <Icon className={cn('h-4.5 w-4.5 shrink-0', isActive ? 'text-white' : 'text-zinc-400')} />
            <span className="truncate">{item.label}</span>
            {item.badge !== undefined && item.badge !== 0 && (
              <span
                className={cn(
                  'ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border',
                  isActive
                    ? 'bg-zinc-800 text-white border-zinc-700'
                    : 'bg-zinc-100 text-zinc-900 border-zinc-200'
                )}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

export default function AppLayout({
  moduleTitle,
  onBackToHub,
  sidebarItems,
  activeTab,
  onTabChange,
  children,
  headerActions,
}: AppLayoutProps) {
  const globalNav = useGlobalNavActive();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex flex-col md:flex-row flex-1 h-full bg-zinc-50 font-sans overflow-hidden text-zinc-900">
      <aside className="no-print hidden md:flex w-64 bg-white border-r border-zinc-200 flex-col shrink-0">
        {!globalNav && (
          <div className="p-4 border-b border-zinc-100 shrink-0">
            <button
              onClick={onBackToHub}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 border border-zinc-200/60 hover:border-zinc-250 active:scale-98 transition-all cursor-pointer shadow-sm bg-white"
            >
              <ArrowLeft className="h-4 w-4 text-zinc-400" />
              Voltar ao Hub
            </button>
          </div>
        )}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <SidebarNav items={sidebarItems} activeTab={activeTab} onTabChange={onTabChange} />
        </nav>
      </aside>

      {mobileMenuOpen && (
        <div className="no-print md:hidden fixed inset-0 top-14 bg-black/35 backdrop-blur-xs z-30 animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setMobileMenuOpen(false)} />
          <nav className="relative bg-white border-b border-zinc-200 p-4 space-y-1 max-h-[80vh] overflow-y-auto shadow-2xl animate-in slide-in-from-top duration-250">
            <div className="flex justify-between items-center pb-2 mb-2 border-b border-zinc-100">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{moduleTitle}</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-500 cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <SidebarNav
              items={sidebarItems}
              activeTab={activeTab}
              onTabChange={onTabChange}
              onItemClick={() => setMobileMenuOpen(false)}
            />
          </nav>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-zinc-50/50">
          <div className="no-print flex md:hidden items-center justify-between mb-4 bg-white border border-zinc-200 p-2.5 rounded-xl shadow-sm shrink-0">
            {!globalNav && (
              <button
                onClick={onBackToHub}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 rounded-lg text-xs font-bold text-zinc-650 hover:bg-zinc-50 cursor-pointer bg-white"
              >
                <ArrowLeft className="h-4 w-4" /> Voltar
              </button>
            )}
            <div className={cn('flex items-center gap-2', globalNav && 'ml-auto w-full justify-end')}>
              {headerActions}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                <Menu className="h-4 w-4" /> Menu
              </button>
            </div>
          </div>

          {headerActions && (
            <div className="no-print hidden md:flex justify-end mb-4 gap-2">
              {headerActions}
            </div>
          )}

          {children}
        </main>
      </div>
    </div>
  );
}
