import React from 'react';
import NexusLogo from '../components/NexusLogo';

interface RestartRequiredViewProps {
  message: string;
}

export default function RestartRequiredView({ message }: RestartRequiredViewProps) {
  return (
    <div className="h-full w-full flex items-center justify-center bg-zinc-50 p-6">
      <div className="max-w-md w-full bg-white border border-zinc-200 rounded-2xl p-8 text-center space-y-4 shadow-sm flex flex-col items-center">
        <NexusLogo variant="badge" size="lg" />
        <div className="space-y-1">
          <h1 className="text-xl font-black text-zinc-900 uppercase">Reinicie o Nexus</h1>
          <p className="text-sm text-zinc-600 leading-relaxed">{message}</p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full bg-zinc-900 text-white font-bold py-3 rounded-xl hover:bg-zinc-800 cursor-pointer transition-colors shadow-sm"
        >
          Reiniciar agora
        </button>
        <p className="text-[11px] text-zinc-400">
          Feche e abra de novo se o servidor local não subir.
        </p>
      </div>
    </div>
  );
}
