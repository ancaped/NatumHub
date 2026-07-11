import React, { useCallback, useEffect, useState } from 'react';
import { Rocket, Loader2, Save, Lock, RefreshCw, Github, ExternalLink, Download } from 'lucide-react';
import {
  fetchReleasesStatus,
  fetchGithubReleaseConfig,
  saveGithubReleaseConfig,
  promoteRelease,
  syncUpdaterManifests,
  isSupervisor,
  type AuthUser,
  type ReleasesStatus,
} from '../lib/auth';

interface ReleasesPanelProps {
  currentUser: AuthUser | null;
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}

export default function ReleasesPanel({ currentUser, setMessage }: ReleasesPanelProps) {
  const [status, setStatus] = useState<ReleasesStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [githubToken, setGithubToken] = useState('');
  const [githubRepo, setGithubRepo] = useState('ancaped/NatumHub');
  const [githubBranch, setGithubBranch] = useState('main');

  const [versionTag, setVersionTag] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [supervisorPassword, setSupervisorPassword] = useState('');
  const [supervisorPasswordConfirm, setSupervisorPasswordConfirm] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [st, cfg] = await Promise.all([fetchReleasesStatus(), fetchGithubReleaseConfig()]);
      setStatus(st);
      setGithubRepo(cfg.githubRepo);
      setGithubBranch(cfg.githubBranch);
    } catch (e: unknown) {
      setMessage({
        text: e instanceof Error ? e.message : 'Erro ao carregar releases',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [setMessage]);

  useEffect(() => {
    if (isSupervisor(currentUser)) load();
  }, [load, currentUser]);

  if (!isSupervisor(currentUser)) return null;

  const validateSupervisorAuth = () => {
    if (!supervisorPassword.trim()) {
      setMessage({ text: 'Informe sua senha de supervisor.', type: 'error' });
      return false;
    }
    if (supervisorPassword !== supervisorPasswordConfirm) {
      setMessage({ text: 'Confirmação da senha do supervisor não confere.', type: 'error' });
      return false;
    }
    return true;
  };

  const handleSaveGithubConfig = async () => {
    if (!validateSupervisorAuth()) return;
    if (!githubToken.trim() && !status?.githubConfigured) {
      setMessage({ text: 'Informe o token GitHub (PAT com scope workflow).', type: 'error' });
      return;
    }
    setSavingConfig(true);
    try {
      await saveGithubReleaseConfig({
        githubToken: githubToken.trim(),
        githubRepo: githubRepo.trim(),
        githubBranch: githubBranch.trim(),
        supervisorPassword,
      });
      setMessage({ text: 'Configuração GitHub salva.', type: 'success' });
      setGithubToken('');
      setSupervisorPassword('');
      setSupervisorPasswordConfirm('');
      await load();
    } catch (e: unknown) {
      setMessage({
        text: e instanceof Error ? e.message : 'Erro ao salvar configuração GitHub',
        type: 'error',
      });
    } finally {
      setSavingConfig(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handlePromote = async () => {
    if (!validateSupervisorAuth()) return;
    const tag = versionTag.trim();
    if (!tag.startsWith('v')) {
      setMessage({ text: 'Tag deve começar com v (ex. v0.0.12).', type: 'error' });
      return;
    }
    if (!status?.githubConfigured) {
      setMessage({ text: 'Configure o token GitHub antes de publicar.', type: 'error' });
      return;
    }

    setPromoting(true);
    try {
      const res = await promoteRelease({
        versionTag: tag,
        releaseNotes: releaseNotes.trim() || undefined,
        supervisorPassword,
      });
      setMessage({ text: res.message, type: 'success' });
      setSupervisorPassword('');
      setSupervisorPasswordConfirm('');
      setVersionTag('');
      setReleaseNotes('');
      await load();
    } catch (e: unknown) {
      setMessage({
        text: e instanceof Error ? e.message : 'Erro ao disparar release',
        type: 'error',
      });
    } finally {
      setPromoting(false);
      setTimeout(() => setMessage(null), 6000);
    }
  };

  const handleSyncManifests = async () => {
    if (!validateSupervisorAuth()) return;
    if (!status?.githubConfigured) {
      setMessage({ text: 'Configure o token GitHub antes de sincronizar.', type: 'error' });
      return;
    }

    setSyncing(true);
    try {
      const res = await syncUpdaterManifests({
        supervisorPassword,
        versionTag: versionTag.trim() || undefined,
      });
      setMessage({ text: res.message, type: 'success' });
      setSupervisorPassword('');
      setSupervisorPasswordConfirm('');
      await load();
    } catch (e: unknown) {
      setMessage({
        text: e instanceof Error ? e.message : 'Erro ao sincronizar manifests',
        type: 'error',
      });
    } finally {
      setSyncing(false);
      setTimeout(() => setMessage(null), 6000);
    }
  };

  const stableManifest = status?.manifests.find((m) => m.channel === 'stable');

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-150 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-50 text-violet-600 rounded-xl">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-sm tracking-tight">Releases & CI</h3>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              Publicar versão Estável
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="p-2 rounded-lg border border-zinc-200 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          title="Atualizar status"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !status ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500 py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando manifests...
        </div>
      ) : (
        <>
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
            <span className="text-[9px] font-bold text-zinc-400 uppercase">Estável</span>
            <p className="text-sm font-extrabold text-zinc-900 mt-1 font-mono">
              {stableManifest?.version ?? '—'}
            </p>
            {stableManifest?.availableOnServer ? (
              <p className="text-[9px] text-emerald-700 font-bold mt-1">No servidor</p>
            ) : stableManifest?.source === 'github' ? (
              <p className="text-[9px] text-amber-700 font-bold mt-1">Só GitHub</p>
            ) : null}
            {stableManifest?.pubDate && (
              <p className="text-[10px] text-zinc-500 mt-1 truncate" title={stableManifest.pubDate}>
                {stableManifest.pubDate}
              </p>
            )}
          </div>

          <div className="text-[10px] text-zinc-500 bg-zinc-50 border border-zinc-100 rounded-xl p-3 space-y-1">
            <p>
              Terminais na LAN buscam atualizações em{' '}
              <code>/api/hub/updater-manifest/stable</code> no PC Principal.
              Após cada release, sincronize os manifests para o servidor.
            </p>
            <p>
              Repo: <strong>{status?.githubRepo}</strong> · branch CI:{' '}
              <strong>{status?.githubBranch}</strong> · token:{' '}
              {status?.githubConfigured ? (
                <span className="text-emerald-700 font-bold">configurado</span>
              ) : (
                <span className="text-amber-700 font-bold">pendente</span>
              )}
            </p>
          </div>

          <div className="border-t border-zinc-100 pt-5 space-y-4">
            <div className="flex items-center gap-2">
              <Github className="h-4 w-4 text-zinc-600" />
              <span className="text-xs font-bold text-zinc-700">Token GitHub (PAT)</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Crie um Personal Access Token com permissão <strong>workflow</strong> para disparar o
              workflow <code>release.yml</code> via API.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  Token (não exibido depois)
                </label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder={status?.githubConfigured ? '•••••••• (deixe vazio para manter)' : 'ghp_...'}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  Repositório (owner/repo)
                </label>
                <input
                  type="text"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  Branch do checkout CI
                </label>
                <input
                  type="text"
                  value={githubBranch}
                  onChange={(e) => setGithubBranch(e.target.value)}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-5 space-y-4">
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-violet-600" />
              <span className="text-xs font-bold text-zinc-700">Publicar nova versão Estável</span>
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                Tag da release
              </label>
              <input
                type="text"
                value={versionTag}
                onChange={(e) => setVersionTag(e.target.value)}
                placeholder="v0.0.12"
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-mono focus:ring-1 focus:ring-violet-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                Notas (opcional)
              </label>
              <textarea
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                rows={2}
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none resize-y"
                placeholder="Correções e melhorias desta versão..."
              />
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <Lock className="h-4 w-4" />
              Senha do supervisor
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                type="password"
                value={supervisorPassword}
                onChange={(e) => setSupervisorPassword(e.target.value)}
                placeholder="Senha"
                className="border border-amber-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-amber-400 focus:outline-none bg-white"
              />
              <input
                type="password"
                value={supervisorPasswordConfirm}
                onChange={(e) => setSupervisorPasswordConfirm(e.target.value)}
                placeholder="Confirmar senha"
                className="border border-amber-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-amber-400 focus:outline-none bg-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSaveGithubConfig}
              disabled={savingConfig}
              className="flex items-center gap-2 bg-zinc-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-zinc-700 disabled:opacity-50 cursor-pointer"
            >
              {savingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar token GitHub
            </button>
            <button
              type="button"
              onClick={handleSyncManifests}
              disabled={syncing}
              className="flex items-center gap-2 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Sincronizar manifests no servidor
            </button>
            <button
              type="button"
              onClick={handlePromote}
              disabled={promoting}
              className="flex items-center gap-2 bg-violet-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
            >
              {promoting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Disparar build no GitHub
            </button>
            <a
              href={`https://github.com/${status?.githubRepo ?? 'ancaped/NatumHub'}/actions/workflows/release.yml`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold text-violet-700 hover:text-violet-900 px-3 py-2.5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver Actions
            </a>
          </div>
        </>
      )}
    </div>
  );
}
