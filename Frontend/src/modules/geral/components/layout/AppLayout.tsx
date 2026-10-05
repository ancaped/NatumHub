import React, { useState } from 'react';
import { ArrowLeft, Menu, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useGlobalNavActive } from './NavShellContext';

export interface SidebarItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  iconOnly?: boolean;
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
  collapsible?: boolean;
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
            title={item.iconOnly ? item.label : undefined}
            className={cn(
              'w-full flex items-center gap-3 rounded-xl text-sm font-semibold transition-all border cursor-pointer',
              item.iconOnly ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5',
              isActive
                ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                : 'text-zinc-650 border-transparent hover:bg-zinc-50 hover:text-zinc-900'
            )}
          >
            <Icon className={cn('h-4.5 w-4.5 shrink-0', isActive ? 'text-white' : 'text-zinc-400')} />
            {!item.iconOnly && <span className="truncate">{item.label}</span>}
            {!item.iconOnly && item.badge !== undefined && item.badge !== 0 && (
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
  moduleSubtitle,
  onBackToHub,
  sidebarItems,
  activeTab,
  onTabChange,
  children,
  headerActions,
  collapsible = true,
}: AppLayoutProps) {
  const globalNav = useGlobalNavActive();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('nexus_sidebar_collapsed') === 'true';
  });

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('nexus_sidebar_collapsed', String(next));
      return next;
    });
  };

  return (
    <div className="flex flex-col md:flex-row flex-1 h-full bg-zinc-50 font-sans overflow-hidden text-zinc-900">
      <aside className={cn(
        "no-print hidden md:flex bg-white border-r border-zinc-200 flex-col shrink-0 transition-all duration-200",
        isCollapsed ? "w-0 border-r-0 overflow-hidden" : "w-64"
      )}>
        <div className="p-3 border-b border-zinc-100 flex items-center justify-between shrink-0">
          {!globalNav ? (
            <button
              onClick={onBackToHub}
              className="flex-1 flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 border border-zinc-200/60 hover:border-zinc-300 transition-all cursor-pointer shadow-xs bg-white truncate"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              <span className="truncate">Voltar ao Hub</span>
            </button>
          ) : (
            <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider truncate px-1">{moduleTitle}</span>
          )}
          {collapsible && (
            <button
              onClick={toggleCollapse}
              className="p-1.5 ml-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer shrink-0"
              title="Ocultar menu lateral"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <SidebarNav items={sidebarItems} activeTab={activeTab} onTabChange={onTabChange} />
        </nav>
      </aside>

      {mobileMenuOpen && (
        <div className="no-print md:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex flex-col justify-start animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setMobileMenuOpen(false)} />
          <nav className="relative bg-white border-b border-zinc-200 p-4 space-y-2 max-h-[85vh] overflow-y-auto shadow-2xl animate-in slide-in-from-top duration-200">
            <div className="flex justify-between items-center pb-2 mb-2 border-b border-zinc-100">
              <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">{moduleTitle}</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-500 cursor-pointer"
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
        {/* Desktop Collapsed Bar Header */}
        {collapsible && isCollapsed && (
          <div className="no-print hidden md:flex items-center justify-between px-4 py-2.5 bg-white border-b border-zinc-200 shrink-0">
            <div className="flex items-center gap-2.5">
              <button
                onClick={toggleCollapse}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg text-xs font-bold transition-all cursor-pointer border border-zinc-200 shadow-2xs"
                title="Expandir menu lateral"
              >
                <PanelLeftOpen className="h-3.5 w-3.5 text-zinc-600" />
                <span>Mostrar Menu</span>
              </button>
              <div className="h-4 w-px bg-zinc-200" />
              <span className="text-xs font-extrabold text-zinc-900">{moduleTitle}</span>
              {moduleSubtitle && <span className="text-xs text-zinc-400">• {moduleSubtitle}</span>}
            </div>
            {headerActions && (
              <div className="flex items-center gap-2">
                {headerActions}
              </div>
            )}
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 bg-zinc-50/50">
          {/* Top Mobile Bar */}
          <div className="no-print flex md:hidden items-center justify-between mb-3 bg-white border border-zinc-200 p-2.5 rounded-xl shadow-sm shrink-0">
            {!globalNav && (
              <button
                onClick={onBackToHub}
                className="flex items-center gap-1 px-2.5 py-1.5 border border-zinc-200 rounded-lg text-xs font-bold text-zinc-650 hover:bg-zinc-50 cursor-pointer bg-white shrink-0"
              >
                <ArrowLeft className="h-4 w-4" /> Hub
              </button>
            )}
            <div className={cn('flex items-center gap-1.5', globalNav && 'ml-auto w-full justify-end')}>
              {headerActions}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 text-white rounded-lg text-xs font-bold cursor-pointer shrink-0"
              >
                <Menu className="h-4 w-4" /> Menu
              </button>
            </div>
          </div>

          {/* Mobile Horizontal Tabs - Fast 1-touch navigation */}
          {sidebarItems && sidebarItems.length > 1 && (
            <div className="no-print md:hidden flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-2 mb-3 -mx-1 px-1 touch-pan-x">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={cn(
                      'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer select-none',
                      isActive
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                    )}
                  >
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-white' : 'text-zinc-500')} />
                    <span>{item.label}</span>
                    {item.badge !== undefined && item.badge !== 0 && (
                      <span
                        className={cn(
                          'text-[10px] font-black px-1.5 py-0.2 rounded-full',
                          isActive ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-800'
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

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
