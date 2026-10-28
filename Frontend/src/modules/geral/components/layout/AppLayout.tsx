import React, { useState, useEffect } from 'react';
import { ArrowLeft, Menu, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useGlobalNavActive, useNavShell } from './NavShellContext';

export interface SidebarItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  badgeTone?: 'amber';
  iconOnly?: boolean;
}

function badgeClass(isActive: boolean, tone?: 'amber'): string {
  if (tone === 'amber') return 'bg-amber-400 text-zinc-950 border-amber-300';
  return isActive
    ? 'bg-zinc-800 text-white border-zinc-700'
    : 'bg-zinc-100 text-zinc-900 border-zinc-200';
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
  /** Tela de trabalho em tela cheia, sem o respiro das páginas comuns. */
  studio?: boolean;
}

function SidebarNav({
  items,
  activeTab,
  onTabChange,
  onItemClick,
  collapsed = false,
}: {
  items: SidebarItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  onItemClick?: () => void;
  collapsed?: boolean;
}) {
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onTabChange(item.id);
              onItemClick?.();
            }}
            className={cn(
              'group relative w-full flex items-center rounded-xl text-sm font-semibold transition-all duration-200 border cursor-pointer select-none',
              collapsed ? 'justify-center p-2.5 h-10 w-10 mx-auto' : 'gap-3 px-3 py-2.5',
              isActive
                ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                : 'text-zinc-650 border-transparent hover:bg-zinc-100 hover:text-zinc-900'
            )}
          >
            <Icon className={cn('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-800')} />
            
            {/* Animated label wrapper avoiding layout jumps */}
            <div
              className={cn(
                'flex items-center justify-between flex-1 min-w-0 overflow-hidden transition-all duration-200 ease-out whitespace-nowrap',
                collapsed ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[200px] opacity-100'
              )}
            >
              <span className="truncate">{item.label}</span>
              {item.badge !== undefined && item.badge !== 0 && (
                <span
                  className={cn(
                    'ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0',
                    badgeClass(isActive, item.badgeTone)
                  )}
                >
                  {item.badge}
                </span>
              )}
            </div>

            {/* Smooth Floating Tooltip in collapsed mode */}
            {collapsed && (
              <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1.5 bg-zinc-900 text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 whitespace-nowrap border border-zinc-800">
                {item.label}
                {item.badge !== undefined && item.badge !== 0 && (
                  <span className={cn(
                    'ml-1.5 px-1.5 py-0.2 text-[10px] font-mono rounded',
                    item.badgeTone === 'amber' ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-800 text-zinc-300'
                  )}>
                    {item.badge}
                  </span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
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
  collapsible = true,
  studio = false,
}: AppLayoutProps) {
  const globalNav = useGlobalNavActive();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { sidebarCollapsed: isCollapsed, toggleSidebar, setHasSidebar } = useNavShell();

  useEffect(() => {
    setHasSidebar(true);
    return () => setHasSidebar(false);
  }, [setHasSidebar]);

  const hasMobileTabs = sidebarItems.length > 1;

  return (
    <div className="flex flex-col md:flex-row flex-1 h-full bg-zinc-50 font-sans overflow-hidden text-zinc-900">
      <aside className={cn(
        "no-print hidden md:flex bg-white border-r border-zinc-200 flex-col shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] overflow-visible relative z-20 -mt-px",
        isCollapsed ? "w-16" : "w-64"
      )}>
        {/* Top Header of Sidebar */}
        <div className={cn(
          "px-3 pt-3 pb-1.5 flex items-center shrink-0 bg-white select-none transition-all duration-200",
          isCollapsed ? "justify-center" : "justify-between"
        )}>
          {isCollapsed ? (
            <button
              type="button"
              onClick={toggleSidebar}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-all cursor-pointer group"
              title="Expandir menu lateral (Ctrl+B)"
              aria-label="Expandir menu lateral"
            >
              <PanelLeftOpen className="h-4 w-4 transition-transform group-hover:scale-110" />
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2 min-w-0 pr-1">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest truncate pl-0.5">
                  {moduleTitle}
                </span>
              </div>
              {collapsible && (
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-all cursor-pointer group shrink-0"
                  title="Ocultar menu lateral (Ctrl+B)"
                  aria-label="Ocultar menu lateral"
                >
                  <PanelLeftClose className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
                </button>
              )}
            </>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-visible p-2">
          <SidebarNav items={sidebarItems} activeTab={activeTab} onTabChange={onTabChange} collapsed={isCollapsed} />
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
        <main className={cn(
          'flex-1 bg-zinc-50/50',
          studio ? 'overflow-hidden p-0 flex flex-col' : 'overflow-y-auto p-3 sm:p-4 lg:p-6'
        )}>
          {!hasMobileTabs && (
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
          )}
          {hasMobileTabs && !globalNav && (
            <div className="no-print md:hidden mb-3">
              <button
                onClick={onBackToHub}
                className="flex items-center gap-1 px-2.5 py-1.5 border border-zinc-200 rounded-lg text-xs font-bold text-zinc-650 hover:bg-zinc-50 cursor-pointer bg-white"
              >
                <ArrowLeft className="h-4 w-4" /> Hub
              </button>
            </div>
          )}

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
                          'text-[10px] font-black px-1.5 py-0.2 rounded-full border',
                          badgeClass(isActive, item.badgeTone)
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

          {headerActions && studio && (
            <div className="no-print flex items-center justify-end gap-2 px-3 py-2 bg-white border-b border-zinc-200 shrink-0 overflow-x-auto">
              {headerActions}
            </div>
          )}
          {headerActions && !studio && (
            <div className="no-print hidden md:flex justify-end mb-4 gap-2">
              {headerActions}
            </div>
          )}

          {studio ? <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div> : children}
        </main>
      </div>
    </div>
  );
}
