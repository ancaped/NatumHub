import React, { useCallback, useEffect, useState } from 'react';

import { Download, Loader2, RefreshCw, CloudDownload, KeyRound } from 'lucide-react';

import {

  fetchReleasesStatus,

  saveGithubReleaseConfig,

  syncUpdaterManifests,

  isSupervisor,

  type AuthUser,

  type ChannelManifestInfo,

  type ReleasesStatus,

} from '../lib/auth';

import {

  runUpdateCheckFlow,

  checkUpdateForUser,

  isUpdaterEnabled,

  getBuildInfo,

  type BuildChannel,

  type BuildInfo,

} from '../lib/updateChannel';



interface CanaisAtualizacaoPanelProps {

  currentUser: AuthUser | null;

  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;

}



function channelLabel(ch: string): string {

  return ch === 'dev' ? 'Desenvolvedor' : 'Principal';

}



function ManifestRow({ info }: { info: ChannelManifestInfo }) {

  return (

    <div className="flex flex-col gap-0.5 text-[11px] text-zinc-600 border border-zinc-100 rounded-lg px-3 py-2 bg-white">

      <div className="flex items-center justify-between gap-2">

        <span className="font-bold text-zinc-800">{channelLabel(info.channel)}</span>

        <span className="text-[10px] uppercase font-bold text-zinc-400">

          {info.availableOnServer ? 'no servidor' : info.source || '—'}

        </span>

      </div>

      <span>

        Versão: <strong className="text-zinc-800">{info.version || '—'}</strong>

      </span>

      {info.url ? (

        <span className="truncate text-[10px] text-zinc-400" title={info.url}>

          {info.url}

        </span>

      ) : null}

    </div>

  );

}



export default function CanaisAtualizacaoPanel({

  currentUser,

  setMessage,

}: CanaisAtualizacaoPanelProps) {

  const [checking, setChecking] = useState(false);

  const [syncing, setSyncing] = useState(false);

  const [loadingStatus, setLoadingStatus] = useState(false);

  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);

  const [releaseStatus, setReleaseStatus] = useState<ReleasesStatus | null>(null);

  const [selectedChannel, setSelectedChannel] = useState<BuildChannel>('stable');

  const [githubToken, setGithubToken] = useState('');

  const [supervisorPassword, setSupervisorPassword] = useState('');

  const [syncTag, setSyncTag] = useState('');



  const supervisor = isSupervisor(currentUser);



  const loadReleaseStatus = useCallback(async () => {

    if (!supervisor) return;

    setLoadingStatus(true);

    try {

      const st = await fetchReleasesStatus();

      setReleaseStatus(st);

    } catch (e) {

      console.warn('fetchReleasesStatus:', e);

    } finally {

      setLoadingStatus(false);

    }

  }, [supervisor]);



  useEffect(() => {

    getBuildInfo().then((info) => {

      setBuildInfo(info);

      if (info?.channel === 'dev' && supervisor) {

        setSelectedChannel('dev');

      }

    });

  }, [supervisor]);



  useEffect(() => {

    void loadReleaseStatus();

  }, [loadReleaseStatus]);



  if (!currentUser) return null;



  const channel: BuildChannel = supervisor ? selectedChannel : 'stable';



  const handleCheck = async () => {

    setChecking(true);

    try {

      const result = await runUpdateCheckFlow(currentUser, channel);

      if (result === 'none') {

        const info = await checkUpdateForUser(currentUser, channel);

        setMessage({

          text: `Você está na versão mais recente do canal ${channelLabel(channel)}${info ? ` (${info.currentVersion})` : ''}.`,

          type: 'success',

        });

      } else if (result === 'skipped') {

        setMessage({ text: 'Atualização disponível, mas instalação cancelada.', type: 'success' });

      } else if (result === 'installed') {

        setMessage({ text: 'Atualização instalada. Reiniciando...', type: 'success' });

      } else {

        setMessage({

          text: 'Não foi possível verificar atualizações. Confira conexão ou manifests no servidor.',

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



  const handleSaveGithubToken = async () => {

    if (!supervisorPassword.trim()) {

      setMessage({ text: 'Informe sua senha de supervisor.', type: 'error' });

      return;

    }

    if (!githubToken.trim() && !releaseStatus?.githubConfigured) {

      setMessage({ text: 'Informe o token GitHub (PAT com scope repo).', type: 'error' });

      return;

    }

    try {

      await saveGithubReleaseConfig({

        githubToken: githubToken.trim(),

        githubRepo: releaseStatus?.githubRepo,

        githubBranch: releaseStatus?.githubBranch,

        supervisorPassword,

      });

      setMessage({ text: 'Token GitHub salvo.', type: 'success' });

      setGithubToken('');

      setSupervisorPassword('');

      await loadReleaseStatus();

    } catch (e: unknown) {

      setMessage({

        text: e instanceof Error ? e.message : 'Erro ao salvar token GitHub',

        type: 'error',

      });

    } finally {

      setTimeout(() => setMessage(null), 5000);

    }

  };



  const handleSyncManifests = async () => {

    if (!supervisorPassword.trim()) {

      setMessage({ text: 'Informe sua senha de supervisor para sincronizar.', type: 'error' });

      return;

    }

    if (!releaseStatus?.githubConfigured) {

      setMessage({ text: 'Configure o token GitHub antes de sincronizar.', type: 'error' });

      return;

    }

    setSyncing(true);

    try {

      const res = await syncUpdaterManifests({

        supervisorPassword,

        versionTag: syncTag.trim() || undefined,

      });

      setMessage({ text: res.message, type: 'success' });

      setSupervisorPassword('');

      await loadReleaseStatus();

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



  const stableManifest = releaseStatus?.manifests.find((m) => m.channel === 'stable');

  const devManifest = releaseStatus?.manifests.find((m) => m.channel === 'dev');



  return (

    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4">

      <div className="flex items-center gap-3 border-b border-zinc-150 pb-4">

        <div className="p-2 bg-sky-50 text-sky-600 rounded-xl">

          <RefreshCw className="h-5 w-5" />

        </div>

        <div>

          <h3 className="font-black text-sm tracking-tight">Atualizações</h3>

          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">

            Principal (stable) · Desenvolvedor (dev)

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



      {supervisor && (

        <>

          <div className="space-y-2">

            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">

              Manifests no servidor (LAN)

            </p>

            {loadingStatus ? (

              <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">

                <Loader2 className="h-3.5 w-3.5 animate-spin" />

                Carregando...

              </div>

            ) : (

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">

                {stableManifest ? <ManifestRow info={stableManifest} /> : null}

                {devManifest ? <ManifestRow info={devManifest} /> : null}

              </div>

            )}

          </div>



          {!releaseStatus?.githubConfigured && (

            <div className="space-y-2 border border-amber-100 bg-amber-50/50 rounded-xl p-3">

              <p className="text-[11px] text-amber-900 font-semibold flex items-center gap-1.5">

                <KeyRound className="h-3.5 w-3.5" />

                Token GitHub necessário para sincronizar manifests

              </p>

              <input

                type="password"

                placeholder="PAT GitHub (repo)"

                value={githubToken}

                onChange={(e) => setGithubToken(e.target.value)}

                className="w-full text-xs border border-zinc-300 rounded-lg px-3 py-2 bg-white"

              />

              <input

                type="password"

                placeholder="Senha supervisor"

                value={supervisorPassword}

                onChange={(e) => setSupervisorPassword(e.target.value)}

                className="w-full text-xs border border-zinc-300 rounded-lg px-3 py-2 bg-white"

              />

              <button

                type="button"

                onClick={handleSaveGithubToken}

                className="text-xs font-bold bg-zinc-900 text-white px-3 py-2 rounded-lg hover:bg-zinc-800 cursor-pointer"

              >

                Salvar token

              </button>

            </div>

          )}



          <div className="space-y-2 border border-zinc-100 rounded-xl p-3 bg-zinc-50/50">

            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">

              Sincronizar do GitHub → PC master

            </p>

            <input

              type="text"

              placeholder="Tag opcional (ex. v0.0.12) — vazio = última release"

              value={syncTag}

              onChange={(e) => setSyncTag(e.target.value)}

              className="w-full text-xs border border-zinc-300 rounded-lg px-3 py-2 bg-white"

            />

            <input

              type="password"

              placeholder="Senha supervisor"

              value={supervisorPassword}

              onChange={(e) => setSupervisorPassword(e.target.value)}

              className="w-full text-xs border border-zinc-300 rounded-lg px-3 py-2 bg-white"

            />

            <button

              type="button"

              onClick={handleSyncManifests}

              disabled={syncing || !releaseStatus?.githubConfigured}

              className="flex items-center gap-2 text-xs font-bold bg-white border border-zinc-300 px-3 py-2 rounded-lg hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"

            >

              {syncing ? (

                <Loader2 className="h-3.5 w-3.5 animate-spin" />

              ) : (

                <CloudDownload className="h-3.5 w-3.5" />

              )}

              Sincronizar manifests (Principal + Dev)

            </button>

          </div>

        </>

      )}



      {supervisor && (

        <div className="space-y-2">

          <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">

            Canal para verificar / instalar

          </p>

          <div className="grid grid-cols-2 gap-2">

            <button

              type="button"

              onClick={() => setSelectedChannel('stable')}

              className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer ${

                selectedChannel === 'stable'

                  ? 'bg-zinc-900 text-white border-zinc-900'

                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'

              }`}

            >

              Principal

            </button>

            <button

              type="button"

              onClick={() => setSelectedChannel('dev')}

              className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer ${

                selectedChannel === 'dev'

                  ? 'bg-violet-700 text-white border-violet-700'

                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'

              }`}

            >

              Desenvolvedor

            </button>

          </div>

          <p className="text-[11px] text-zinc-500">

            Somente o supervisor pode instalar a build de desenvolvimento.

          </p>

        </div>

      )}



      {!supervisor && (

        <p className="text-[11px] text-zinc-500">

          Operadores recebem apenas a versão Principal (estável).

        </p>

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

          Verificar atualização ({channel === 'dev' ? 'Dev' : 'Principal'})

        </button>

      )}

    </div>

  );

}


