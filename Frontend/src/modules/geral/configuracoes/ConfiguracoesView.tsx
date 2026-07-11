import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, RefreshCw, Upload, Download, Loader2, Check, X, Database, Globe, Clock, Plus, Trash2
} from 'lucide-react';

import ConexaoServidorPanel from './ConexaoServidorPanel';
import OperadoresPanel from './OperadoresPanel';
import DispositivosPanel from './DispositivosPanel';
import CanaisAtualizacaoPanel from './CanaisAtualizacaoPanel';
import OperadoresCanaisPanel from './OperadoresCanaisPanel';
import ReleasesPanel from './ReleasesPanel';
import { isClientMode, isPrincipalPc } from '../lib/connectionConfig';
import { apiJson } from '../lib/http';
import { isSupervisor, type AuthUser } from '../lib/auth';

interface ConfiguracoesViewProps {
  currentUser: AuthUser | null;
  setView: (view: any) => void;
  message: { text: string; type: 'success' | 'error' } | null;
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
  /** general = operadores; supervisor = painel master completo */
  variant?: 'general' | 'supervisor';
  
  // Google / Firebase Sync State & Actions
  firebaseUser: any;
  firebaseInitialized: boolean;
  handleFirebaseLogin: () => void;
  handleFirebaseLogout: () => void;
  handleFirebaseSync: () => void;
  syncingFirebase: boolean;
  uploadProgress: number;
  firebaseLastSync: string;
  handleManualBackup: () => void;
  backingUpManual: boolean;
  handleManualRestore: () => void;
  restoringManual: boolean;

  // SQL Server State & Actions
  sqlHost: string;
  setSqlHost: (val: string) => void;
  sqlPort: string;
  setSqlPort: (val: string) => void;
  sqlUser: string;
  setSqlUser: (val: string) => void;
  sqlPassword: string;
  setSqlPassword: (val: string) => void;
  sqlDatabase: string;
  setSqlDatabase: (val: string) => void;
  handleSaveSqlConfig: () => void;
  savingSql: boolean;
  handleSyncSqlDatabase: () => void;
  syncingSql: boolean;
}

interface ErpSyncSchedule {
  ativo: boolean;
  horarios: string[];
  ultima_execucao?: string | null;
  proxima_execucao?: string | null;
}

export default function ConfiguracoesView({
  currentUser,
  setView,
  message,
  setMessage,
  firebaseUser,
  firebaseInitialized,
  handleFirebaseLogin,
  handleFirebaseLogout,
  handleFirebaseSync,
  syncingFirebase,
  uploadProgress,
  firebaseLastSync,
  handleManualBackup,
  backingUpManual,
  handleManualRestore,
  restoringManual,
  sqlHost,
  setSqlHost,
  sqlPort,
  setSqlPort,
  sqlUser,
  setSqlUser,
  sqlPassword,
  setSqlPassword,
  sqlDatabase,
  setSqlDatabase,
  handleSaveSqlConfig,
  savingSql,
  handleSyncSqlDatabase,
  syncingSql,
  variant = 'general',
}: ConfiguracoesViewProps) {
  const isPrincipal = isPrincipalPc();
  const clientMode = isClientMode();
  const supervisorMode = variant === 'supervisor';
  const canEditInfra = supervisorMode && isSupervisor(currentUser);

  const [erpSchedule, setErpSchedule] = useState<ErpSyncSchedule>({
    ativo: true,
    horarios: ['06:00', '12:00', '18:00', '22:00'],
  });
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const fetchErpSchedule = async () => {
    if (!isPrincipal || clientMode) return;
    setLoadingSchedule(true);
    try {
      const data = await apiJson<ErpSyncSchedule>('/import/erp-sync-schedule');
      setErpSchedule({
        ativo: data.ativo ?? true,
        horarios: data.horarios?.length ? data.horarios : ['06:00', '12:00', '18:00', '22:00'],
        ultima_execucao: data.ultima_execucao,
        proxima_execucao: data.proxima_execucao,
      });
    } catch (e) {
      console.error('Erro ao carregar agenda de sync ERP:', e);
    } finally {
      setLoadingSchedule(false);
    }
  };

  useEffect(() => {
    fetchErpSchedule();
  }, [isPrincipal, clientMode]);

  const handleSaveErpSchedule = async () => {
    setSavingSchedule(true);
    try {
      const payload = {
        ativo: erpSchedule.ativo,
        horarios: erpSchedule.horarios.filter(Boolean),
      };
      const data = await apiJson<{ proxima_execucao?: string }>('/import/erp-sync-schedule', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setErpSchedule((prev) => ({
        ...prev,
        proxima_execucao: data.proxima_execucao ?? prev.proxima_execucao,
      }));
      setMessage({ text: 'Horários de sync automático salvos!', type: 'success' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar horários';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setSavingSchedule(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const updateHorario = (index: number, value: string) => {
    setErpSchedule((prev) => {
      const horarios = [...prev.horarios];
      horarios[index] = value;
      return { ...prev, horarios };
    });
  };

  const addHorario = () => {
    setErpSchedule((prev) => ({
      ...prev,
      horarios: [...prev.horarios, '08:00'],
    }));
  };

  const removeHorario = (index: number) => {
    setErpSchedule((prev) => ({
      ...prev,
      horarios: prev.horarios.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="flex-1 flex flex-col justify-between overflow-y-auto bg-zinc-50 font-sans text-zinc-900">
      {/* Main Container */}
      <main className="flex-1 p-8 max-w-4xl w-full mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3 no-print">
          <button
            onClick={() => setView(supervisorMode ? 'hub' : 'hub')}
            className="bg-white border border-zinc-200 hover:bg-zinc-100 px-4 py-2 rounded-xl text-xs font-bold text-zinc-650 hover:text-zinc-900 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-98"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao Início
          </button>
        </div>
        {supervisorMode && (
          <div className="bg-violet-50 border border-violet-100 rounded-2xl px-5 py-4">
            <h2 className="font-black text-sm text-violet-900">Painel Supervisor</h2>
            <p className="text-xs text-violet-800/90 mt-1">
              Infraestrutura, dispositivos e canais de atualização — exclusivo da conta master.
            </p>
          </div>
        )}
        {message && (
          <div className={`p-4 rounded-xl border text-sm font-bold flex items-center justify-between shadow-sm ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            <span className="flex items-center gap-2">
              {message.type === 'success' ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-rose-600" />}
              {message.text}
            </span>
          </div>
        )}

        <ConexaoServidorPanel
          isAdmin={canEditInfra}
          message={message}
          setMessage={setMessage}
        />

        {!supervisorMode && isSupervisor(currentUser) && (
          <OperadoresPanel currentUser={currentUser} setMessage={setMessage} includeUpdateChannel={false} />
        )}

        {supervisorMode && canEditInfra && (
          <>
            <CanaisAtualizacaoPanel currentUser={currentUser} setMessage={setMessage} />
            <ReleasesPanel currentUser={currentUser} setMessage={setMessage} />
            <OperadoresCanaisPanel currentUser={currentUser} setMessage={setMessage} />
            <DispositivosPanel currentUser={currentUser} setMessage={setMessage} />
          </>
        )}

        {supervisorMode && !canEditInfra && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            Faça login como supervisor para editar operadores, dispositivos e infraestrutura.
          </p>
        )}

        {(!supervisorMode || canEditInfra) && clientMode && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4 text-sm text-indigo-900">
            <p className="font-bold mb-1">Configurações do servidor</p>
            <p className="text-xs text-indigo-800/90 leading-relaxed">
              Sync ERP, credenciais SQL, backup na nuvem e horários automáticos ficam disponíveis
              <strong> apenas no PC Principal</strong>. Este terminal usa os dados já sincronizados pelo servidor.
            </p>
          </div>
        )}

        {canEditInfra && isPrincipal && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Sincronização Google Cloud / Firebase */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-150 pb-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-sm tracking-tight">Sincronização Google Cloud</h3>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Backup Automático do SQLite</p>
                <p className="text-[10px] text-zinc-400 mt-1">Somente no PC principal. Login Google é independente do login de operador.</p>
              </div>
            </div>

            <div className="space-y-4">
              {firebaseInitialized ? (
                firebaseUser ? (
                  <div className="space-y-4 text-left">
                    <div className="flex items-center gap-3 bg-zinc-50 border border-zinc-200 rounded-xl p-3.5">
                      <img src={firebaseUser.photoURL || "/placeholder-avatar.png"} alt={firebaseUser.displayName} className="h-10 w-10 rounded-full border border-zinc-250 shadow-sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-zinc-900 truncate">{firebaseUser.displayName}</p>
                        <p className="text-xs text-zinc-500 truncate">{firebaseUser.email}</p>
                      </div>
                      <button 
                        onClick={handleFirebaseLogout}
                        className="bg-white text-zinc-650 hover:text-zinc-900 text-xs font-bold border border-zinc-250 px-3 py-1.5 rounded-lg hover:bg-zinc-50 shadow-sm cursor-pointer"
                      >
                        Sair
                      </button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold text-zinc-500">
                        <span>Status do Backup</span>
                        <span className="text-zinc-800 font-mono">Conectado (Firebase Cloud)</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold text-zinc-500">
                        <span>Último Upload do Banco</span>
                        <span className="text-zinc-800 font-mono">{firebaseLastSync || "Nunca sincronizado"}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 pt-2">
                      <button
                        onClick={handleFirebaseSync}
                        disabled={syncingFirebase}
                        className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                      >
                        {syncingFirebase ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {uploadProgress > 0 ? `Subindo (${uploadProgress}%)` : "Sincronizando..."}
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4" />
                            Sincronizar Banco Agora
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 text-left">
                    <p className="text-xs text-zinc-500">
                      Faça o login com o Google para habilitar o upload automático criptografado e seguro do banco de dados na nuvem.
                    </p>
                    <button
                      onClick={handleFirebaseLogin}
                      className="w-full flex items-center justify-center gap-3 py-2.5 border border-zinc-300 rounded-xl text-xs font-bold hover:bg-zinc-50 transition-all cursor-pointer bg-white text-zinc-850 shadow-sm"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                      Conectar Conta Google
                    </button>
                  </div>
                )
              ) : (
                <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-500 text-left">
                  <p className="font-semibold text-zinc-700 mb-1">Firebase não iniciado</p>
                  As chaves e credenciais do Firebase Storage devem ser devidamente cadastradas em <code>src/lib/firebase.ts</code> para permitir a sincronização em nuvem.
                </div>
              )}

              <div className="border-t border-zinc-200/60 my-4 pt-4 text-left space-y-4">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Ações de Banco de Dados Local</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleManualBackup}
                    disabled={backingUpManual}
                    className="flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200 border border-zinc-250 py-2 rounded-xl text-xs font-bold text-zinc-800 disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {backingUpManual ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      <>
                        <Upload className="h-3 w-3" />
                        Backup Local
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleManualRestore}
                    disabled={restoringManual}
                    className="flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200 border border-zinc-250 py-2 rounded-xl text-xs font-bold text-zinc-800 disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {restoringManual ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Subindo...
                      </>
                    ) : (
                      <>
                        <Download className="h-3 w-3" />
                        Restaurar Backup
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Integração ERP NATUM (SQL Server) — sync centralizado no master */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-150 pb-4">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-sm tracking-tight">Sincronização ERP (SQL Server)</h3>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                  Importação centralizada — PC principal
                </p>
              </div>
            </div>

            <div className="text-xs text-zinc-600 bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2.5 space-y-1">
              <p className="font-bold text-zinc-800">O que a sincronização importa (completo):</p>
              <p>Produtos, insumos, fornecedores, notas fiscais de compra, movimentações, fórmulas, pedidos de compra e pedidos de venda do ERP NATUM.</p>
              <p className="text-zinc-500">Os PCs secundários leem o mesmo <code className="text-[10px]">data.db</code> deste servidor após o sync.</p>
            </div>

            <div className="space-y-3.5 text-left">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">IP / Host do SQL Server</label>
                  <input
                    type="text"
                    value={sqlHost}
                    onChange={(e) => setSqlHost(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800"
                    placeholder="127.0.0.1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Porta</label>
                  <input
                    type="text"
                    value={sqlPort}
                    onChange={(e) => setSqlPort(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800"
                    placeholder="1433"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Usuário SQL</label>
                  <input
                    type="text"
                    value={sqlUser}
                    onChange={(e) => setSqlUser(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Senha SQL</label>
                  <input
                    type="password"
                    value={sqlPassword}
                    onChange={(e) => setSqlPassword(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Nome do Banco de Dados</label>
                <input
                  type="text"
                  value={sqlDatabase}
                  onChange={(e) => setSqlDatabase(e.target.value)}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800"
                  placeholder="ERP_NATUM"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveSqlConfig}
                  disabled={savingSql}
                  className="flex-1 bg-zinc-950 text-white hover:bg-zinc-800 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {savingSql ? "Salvando..." : "Salvar Configuração SQL"}
                </button>

                <button
                  onClick={handleSyncSqlDatabase}
                  disabled={syncingSql}
                  className="bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  {syncingSql ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sincronizando...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Sincronizar ERP
                    </>
                  )}
                </button>
              </div>

              <div className="border-t border-zinc-200/60 pt-4 mt-2 space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-indigo-600" />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                      Sync automático (horários diários)
                    </span>
                  </div>

                  <label className="flex items-center gap-2 text-xs font-bold text-zinc-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={erpSchedule.ativo}
                      onChange={(e) => setErpSchedule((prev) => ({ ...prev, ativo: e.target.checked }))}
                      className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Ativar importação automática do ERP nestes horários
                  </label>

                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    O PC principal verifica a cada minuto. Nos horários abaixo, dispara a mesma sincronização do botão manual (com backup pré-sync).
                  </p>

                  {loadingSchedule ? (
                    <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Carregando horários...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {erpSchedule.horarios.map((horario, index) => (
                        <div key={`${index}-${horario}`} className="flex items-center gap-2">
                          <input
                            type="time"
                            value={horario}
                            onChange={(e) => updateHorario(index, e.target.value)}
                            disabled={!erpSchedule.ativo}
                            className="flex-1 border border-zinc-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-white text-zinc-800 disabled:opacity-50"
                          />
                          <button
                            type="button"
                            onClick={() => removeHorario(index)}
                            disabled={erpSchedule.horarios.length <= 1}
                            className="p-2 rounded-lg border border-zinc-200 text-zinc-500 hover:text-rose-600 hover:border-rose-200 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Remover horário"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={addHorario}
                        className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 py-1"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar horário
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
                    <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-2.5 py-2">
                      <span className="font-bold text-zinc-600 block mb-0.5">Última sync automática</span>
                      <span className="font-mono text-zinc-800">{erpSchedule.ultima_execucao || '—'}</span>
                    </div>
                    <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-2.5 py-2">
                      <span className="font-bold text-zinc-600 block mb-0.5">Próxima execução</span>
                      <span className="font-mono text-zinc-800">
                        {erpSchedule.ativo ? (erpSchedule.proxima_execucao || '—') : 'Desativado'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveErpSchedule}
                    disabled={savingSchedule || loadingSchedule}
                    className="w-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {savingSchedule ? 'Salvando horários...' : 'Salvar horários automáticos'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="w-full text-center py-6 text-xs text-zinc-400 border-t border-zinc-200/50 bg-white/50">
        &copy; {new Date().getFullYear()} Nátum Bio Cosméticos. Todos os direitos reservados.
      </footer>
    </div>
  );
}
