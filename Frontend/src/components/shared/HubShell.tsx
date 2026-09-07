import React, { type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { HUB_BACK_BUTTON } from './hub';
import { cn } from '../../lib/utils';

export interface HubShellProps {
  title: string;
  subtitle: string;
  onBack: () => void;
  backLabel?: string;
  headerRight?: ReactNode;
  heading?: string;
  headingDescription?: string;
  children: ReactNode;
  /** Hub grids are vertically centered; settings-style pages are not. */
  centered?: boolean;
  mainClassName?: string;
}

export function HubShell({
  title,
  subtitle,
  onBack,
  backLabel = 'Voltar ao Início',
  headerRight,
  heading,
  headingDescription,
  children,
  centered = true,
  mainClassName,
}: HubShellProps) {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 flex flex-col justify-between">
      <header className="bg-white border-b border-zinc-200 px-8 py-4 shrink-0 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className={HUB_BACK_BUTTON}
            title={backLabel}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="font-bold text-lg tracking-tight">{title}</h1>
            <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{subtitle}</p>
          </div>
        </div>
        {headerRight}
      </header>

      <main
        className={cn(
          'flex-1 flex flex-col p-6 max-w-6xl w-full mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300',
          centered && 'items-center justify-center',
          mainClassName
        )}
      >
        {(heading || headingDescription) && (
          <div className="text-center space-y-2">
            {heading && (
              <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900">{heading}</h2>
            )}
            {headingDescription && (
              <p className="text-sm text-zinc-500">{headingDescription}</p>
            )}
          </div>
        )}
        {children}
      </main>

      <footer className="w-full text-center py-6 text-xs text-zinc-400 border-t border-zinc-200/50 bg-white/50">
        &copy; {new Date().getFullYear()} Nátum Bio Cosméticos. Todos os direitos reservados.
      </footer>
    </div>
  );
}
