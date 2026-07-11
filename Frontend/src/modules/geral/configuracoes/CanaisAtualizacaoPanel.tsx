import React, { useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import type { AuthUser } from '../lib/auth';
import {
  runUpdateCheckFlow,
  checkUpdateForUser,
  isUpdaterEnabled,
  getBuildInfo,
  type BuildInfo,
} from '../lib/updateChannel';

interface CanaisAtualizacaoPanelProps {
  currentUser: AuthUser | null;
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}

export default function CanaisAtualizacaoPanel({
  currentUser,
  setMessage,
}: CanaisAtualizacaoPanelProps) {
  const [checking, setChecking] = useState(false);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);

  useEffect(() => {
    getBuildInfo().then(setBuildInfo);
  }, []);

  if (!currentUser) return null;

  const handleCheck = async () => {
    setChecking(true);
    try {
      const result = await runUpdateCheckFlow(currentUser);
      if (result === 'none') {
        const info = await checkUpdateForUser(currentUser);
        setMessage({
          text: `Você está na versão mais recente${info ? ` (${info.currentVersion})` : ''}.`,
          type: 'success',
        });
      } else if (result === 'skipped') {
        setMessage({ text: 'Atualização disponível, mas instalação cancelada.', type: 'success' });
      } else if (result === 'installed') {
        setMessage({ text: 'Atualização instalada. Reiniciando...', type: 'success' });
      } else {
        setMessage({
          text: 'Não foi possível verificar atualizações. Confira conexão ou manifests no GitHub.',
          type: 'error',
        });
      }
    } catch (e: unknown) {
      setMessage({
        text: e instanceof Error ? e.message : 'Erro ao verificar atualizações',
        type: 'error',
      });
    } finally {
      setChecking(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3 border-b border-zinc-150 pb-4">
        <div className="p-2 bg-sky-50 text-sky-600 rounded-xl">
          <RefreshCw className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-black text-sm tracking-tight">Atualizações</h3>
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
            Versão Estável
          </p>
        </div>
      </div>

      {buildInfo && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800">
          <span className="font-bold">{buildInfo.productName}</span>
          <span className="text-zinc-500"> · v{buildInfo.version}</span>
          {buildInfo.channel === 'dev' && (
            <span className="ml-2 text-[10px] font-bold uppercase text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">
              Dev
            </span>
          )}
        </div>
      )}

      {!isUpdaterEnabled() && (
        <p className="text-xs text-violet-700 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
          Modo desenvolvimento — updater desativado. Use <code className="text-[10px]">git pull</code> para atualizar o código.
        </p>
      )}

      {isUpdaterEnabled() && (
        <button
          type="button"
          onClick={handleCheck}
          disabled={checking}
          className="flex items-center gap-2 bg-zinc-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Verificar atualização
        </button>
      )}
    </div>
  );
}
