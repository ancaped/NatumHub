import React, { useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface DrawerTab {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  show?: boolean;
}

export interface DrawerProps {
  isOpen?: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  headerActions?: React.ReactNode;
  tabs?: DrawerTab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-4xl',
  full: 'max-w-[95vw]',
};

/**
 * Componente canônico de Drawer (Painel Deslizante à Direita).
 * Padroniza todos os menus laterais de detalhes (insumos, lotes, pedidos, módulos, etc.)
 * seguindo o Design System HSL Zinc do Nexus.
 */
export default function Drawer({
  isOpen = true,
  onClose,
  title,
  subtitle,
  badge,
  headerActions,
  tabs,
  activeTab,
  onTabChange,
  size = 'lg',
  loading = false,
  loadingText = 'Carregando detalhes...',
  children,
  footer,
  className,
}: DrawerProps) {
  // Fecha com a tecla Escape e trava scroll do fundo
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const visibleTabs = tabs ? tabs.filter((t) => t.show !== false) : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end no-print">
      {/* Backdrop com blur suave */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200 cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Painel lateral deslizando da direita */}
      <aside
        className={cn(
          'relative w-full h-full bg-white border-l border-zinc-200 shadow-2xl flex flex-col z-10 text-left animate-in slide-in-from-right duration-250 ease-out',
          SIZE_CLASSES[size],
          className
        )}
      >
        {/* Cabeçalho Padronizado */}
        <div className="px-6 py-4.5 border-b border-zinc-200 bg-zinc-50/70 flex justify-between items-start shrink-0 gap-4">
          <div className="min-w-0 flex-1">
            {badge && (
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {typeof badge === 'string' ? (
                  <span className="px-2 py-0.5 bg-zinc-900 text-white rounded text-[9px] font-bold uppercase tracking-wider">
                    {badge}
                  </span>
                ) : (
                  badge
                )}
              </div>
            )}
            <h3 className="font-extrabold text-zinc-900 text-lg leading-tight tracking-tight truncate">
              {title}
            </h3>
            {subtitle && (
              <div className="text-xs text-zinc-500 font-mono mt-0.5 truncate">
                {subtitle}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-zinc-200/60 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
              title="Fechar (Esc)"
              aria-label="Fechar painel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de Sub-abas Opcional */}
        {visibleTabs.length > 0 && (
          <div className="flex items-center border-b border-zinc-200 bg-zinc-50/40 px-4 shrink-0 overflow-x-auto gap-1 py-1 scrollbar-none touch-pan-x">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange?.(tab.id)}
                  className={cn(
                    'shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border select-none',
                    isActive
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                      : 'text-zinc-650 border-transparent hover:bg-zinc-100 hover:text-zinc-900'
                  )}
                >
                  {Icon && <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-white' : 'text-zinc-400')} />}
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge !== 0 && (
                    <span
                      className={cn(
                        'ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full',
                        isActive ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-200 text-zinc-700'
                      )}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Corpo do Painel */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 font-semibold gap-2 p-8">
            <RefreshCw className="h-6 w-6 animate-spin text-zinc-500" />
            <span className="text-xs text-zinc-500">{loadingText}</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 text-zinc-800 space-y-6">
            {children}
          </div>
        )}

        {/* Rodapé Padronizado Opcional */}
        {footer && (
          <div className="px-6 py-3.5 border-t border-zinc-200 bg-zinc-50/80 flex items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>
        )}
      </aside>
    </div>
  );
}
