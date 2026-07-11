import React from 'react';
import { RefreshCw } from 'lucide-react';

interface RestartRequiredViewProps {
  message: string;
}

export default function RestartRequiredView({ message }: RestartRequiredViewProps) {
  return (
    <div className="h-full w-full flex items-center justify-center bg-zinc-50 p-6">
      <div className="max-w-md w-full bg-white border border-zinc-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
        <RefreshCw className="h-10 w-10 text-indigo-600 mx-auto" />
        <h1 className="text-lg font-bold text-zinc-900">Reinicie o NatumHub</h1>
        <p className="text-sm text-zinc-600 leading-relaxed">{message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full bg-zinc-900 text-white font-bold py-3 rounded-xl hover:bg-zinc-800 cursor-pointer"
        >
          Reiniciar agora
        </button>
        <p className="text-[11px] text-zinc-400">
          Feche e abra de novo com <code className="text-[10px]">tauri dev</code> se o servidor local não subir.
        </p>
      </div>
    </div>
  );
}
