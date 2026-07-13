import React from 'react';
import { ArrowLeft, Construction } from 'lucide-react';
import { useGlobalNavActive } from './layout/NavShellContext';

interface ModulePlaceholderViewProps {
  title: string;
  subtitle?: string;
  description: string;
  onBackToHub: () => void;
}

export default function ModulePlaceholderView({
  title,
  subtitle = 'Em desenvolvimento',
  description,
  onBackToHub,
}: ModulePlaceholderViewProps) {
  const globalNav = useGlobalNavActive();

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-zinc-50 font-sans text-zinc-900">
      <div className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          {!globalNav && (
            <button
              onClick={onBackToHub}
              className="bg-white border border-zinc-200 hover:bg-zinc-100 p-2 rounded-xl text-zinc-650 hover:text-zinc-900 transition-all cursor-pointer shadow-sm"
              title="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h1 className="font-bold text-lg tracking-tight">{title}</h1>
            <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{subtitle}</p>
          </div>
        </div>
      </div>

      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-lg w-full bg-white border border-zinc-200 rounded-2xl shadow-sm p-10 text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center">
            <Construction className="h-7 w-7 text-zinc-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-zinc-900">Módulo em construção</h2>
            <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
          </div>
          <p className="text-xs text-zinc-400">
            Este espaço já está registrado no hub. A implementação funcional será feita em etapas.
          </p>
        </div>
      </main>
    </div>
  );
}
