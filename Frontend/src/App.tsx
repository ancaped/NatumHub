import React, { useState, useEffect } from 'react';
import ProducaoView from './modules/ProducaoView';
import MicrobiologiaView from './modules/MicrobiologiaView';
import FiscoQuimicaView from './modules/FiscoQuimicaView';
import ComprasView from './modules/ComprasView';
import ComprasOnlineView from './modules/ComprasOnlineView';
import EstoqueView from './modules/EstoqueView';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { FeedbackWidget } from './components/shared/FeedbackWidget';
import { 
  Boxes, ShoppingCart, Activity, FlaskConical, ArrowRight, ArrowLeft,
  Settings, Database, RefreshCw, Upload, Download, Loader2, Check, X, Globe
} from 'lucide-react';
import { APP_NAME } from './lib/utils';
import { api } from './lib/api';

type HubView = 'hub' | 'producao_hub' | 'producao' | 'microbiologia' | 'fisco_quimica' | 'compras_hub' | 'compras' | 'compras_online' | 'hub_settings' | 'estoque';

export default function App() {
  const [view, setView] = useState<HubView>('hub');
  
  // Google status states
  const [googleStatus, setGoogleStatus] = useState({ 
    configured: false, 
    authenticated: false, 
    client_id: '', 
    last_sync: 'Nunca sincronizado' 
  });
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const [savingGoogle, setSavingGoogle] = useState(false);
  const [backingUpManual, setBackingUpManual] = useState(false);
  const [restoringManual, setRestoringManual] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // SQL Server states
  const [sqlHost, setSqlHost] = useState('192.168.101.249');
  const [sqlPort, setSqlPort] = useState('1433');
  const [sqlUser, setSqlUser] = useState('sa');
  const [sqlPassword, setSqlPassword] = useState('byteonDS2015');
  const [sqlDatabase, setSqlDatabase] = useState('NATUM');
  const [savingSql, setSavingSql] = useState(false);
  const [syncingSql, setSyncingSql] = useState(false);

  const fetchGoogleStatus = async () => {
    try {
      const res = await fetch('http://127.0.0.1:3001/api/google/status');
      if (res.ok) {
        const data = await res.json();
        setGoogleStatus(data);
        if (data.client_id) setClientId(data.client_id);
      }
    } catch (e) {
      console.error("Error fetching Google status:", e);
    }
  };

  const fetchSqlConfig = async () => {
    try {
      const keys = ['sql_host', 'sql_port', 'sql_user', 'sql_password', 'sql_database'];
      const vals = await Promise.all(
        keys.map(async (key) => {
          const res = await fetch(`http://127.0.0.1:3001/api/settings/${key}`);
          if (res.ok) {
            const data = await res.json();
            return data.value;
          }
          return null;
        })
      );
      if (vals[0]) setSqlHost(vals[0]);
      if (vals[1]) setSqlPort(vals[1]);
      if (vals[2]) setSqlUser(vals[2]);
      if (vals[3]) setSqlPassword(vals[3]);
      if (vals[4]) setSqlDatabase(vals[4]);
    } catch (e) {
      console.error("Error fetching SQL config:", e);
    }
  };

  const handleSaveSqlConfig = async () => {
    setSavingSql(true);
    try {
      const configs = [
        { key: 'sql_host', value: sqlHost },
        { key: 'sql_port', value: sqlPort },
        { key: 'sql_user', value: sqlUser },
        { key: 'sql_password', value: sqlPassword },
        { key: 'sql_database', value: sqlDatabase },
      ];
      await Promise.all(
        configs.map(async (cfg) => {
          await fetch(`http://127.0.0.1:3001/api/settings/${cfg.key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: cfg.value }),
          });
        })
      );
      setMessage({ text: "Configurações de conexão salvas!", type: 'success' });
    } catch (e) {
      console.error(e);
      setMessage({ text: "Erro ao salvar conexões SQL Server", type: 'error' });
    } finally {
      setSavingSql(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleSyncSqlDatabase = async () => {
    setSyncingSql(true);
    try {
      const res = await fetch('http://127.0.0.1:3001/api/import/sync', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ text: data.message || "Sincronização realizada com sucesso!", type: 'success' });
      } else {
        setMessage({ text: data.error || "Erro ao sincronizar com o banco de dados NATUM", type: 'error' });
      }
    } catch (e) {
      console.error(e);
      setMessage({ text: "Erro ao conectar com a API de sincronização", type: 'error' });
    } finally {
      setSyncingSql(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  useEffect(() => {
    fetchGoogleStatus();
    fetchSqlConfig();
  }, []);

  const handleSaveGoogleConfig = async () => {
    setSavingGoogle(true);
    try {
      const res = await fetch('http://127.0.0.1:3001/api/google/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ text: data.message || "Credenciais salvas com sucesso!", type: 'success' });
        fetchGoogleStatus();
      } else {
        setMessage({ text: data.error || "Erro ao salvar credenciais", type: 'error' });
      }
    } catch (e) {
      console.error(e);
      setMessage({ text: "Falha de conexão com a API", type: 'error' });
    } finally {
      setSavingGoogle(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const res = await fetch('http://127.0.0.1:3001/api/google/auth-url');
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, '_blank');
        setMessage({ text: "Link de login aberto no navegador", type: 'success' });
      } else {
        setMessage({ text: data.error || "Configure o Client ID antes de fazer login", type: 'error' });
      }
    } catch (e) {
      console.error(e);
      setMessage({ text: "Erro ao requisitar link de autenticação", type: 'error' });
    } finally {
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleGoogleSync = async () => {
    setSyncingGoogle(true);
    try {
      const res = await fetch('http://127.0.0.1:3001/api/google/sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMessage({ text: data.message || "Backup realizado com sucesso!", type: 'success' });
        fetchGoogleStatus();
      } else {
        setMessage({ text: data.error || "Falha na sincronização. Verifique o login.", type: 'error' });
      }
    } catch (e) {
      console.error(e);
      setMessage({ text: "Erro ao tentar sincronizar com o Google Drive", type: 'error' });
    } finally {
      setSyncingGoogle(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleManualBackup = async () => {
    setBackingUpManual(true);
    try {
      const data = await api.getBackup();
      const blob = new Blob([new Uint8Array(data)], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `natum_backup_${new Date().toISOString().split('T')[0]}.db`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ text: "Backup exportado com sucesso!", type: 'success' });
    } catch (e) {
      console.error(e);
      setMessage({ text: "Erro ao gerar backup manual", type: 'error' });
    } finally {
      setBackingUpManual(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleManualRestore = async () => {
    if (!confirm('ATENÇÃO: Restaurar um backup vai SUBSTITUIR todos os dados atuais (Insumos, Lotes, Microbiologia, etc.). Continuar?')) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.db';
    input.onchange = async (e: any) => {
      setRestoringManual(true);
      const file = e.target.files[0];
      if (!file) {
        setRestoringManual(false);
        return;
      }
      const buf = await file.arrayBuffer();
      const data = Array.from(new Uint8Array(buf));
      try {
        await api.restoreBackup(data);
        setMessage({ text: "Backup restaurado com sucesso!", type: 'success' });
        alert('Backup restaurado com sucesso! O aplicativo precisa ser reiniciado para carregar os novos dados.');
        window.location.reload();
      } catch (err) {
        console.error(err);
        setMessage({ text: "Erro ao restaurar backup", type: 'error' });
      } finally {
        setRestoringManual(false);
        setTimeout(() => setMessage(null), 4000);
      }
    };
    input.click();
  };

  const renderContent = () => {
    if (view === 'producao') {
      return (
        <ErrorBoundary onReset={() => setView('producao_hub')} fallbackTitle="Erro no módulo de Produção">
          <ProducaoView onBackToHub={() => setView('producao_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'microbiologia') {
      return (
        <ErrorBoundary onReset={() => setView('producao_hub')} fallbackTitle="Erro no módulo de Microbiologia">
          <MicrobiologiaView onBackToHub={() => setView('producao_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'fisco_quimica') {
      return (
        <ErrorBoundary onReset={() => setView('producao_hub')} fallbackTitle="Erro no módulo de Análise Físico-Química">
          <FiscoQuimicaView onBackToHub={() => setView('producao_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'compras') {
      return (
        <ErrorBoundary onReset={() => setView('compras_hub')} fallbackTitle="Erro no módulo de Compras">
          <ComprasView onBackToHub={() => setView('compras_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'compras_online') {
      return (
        <ErrorBoundary onReset={() => setView('compras_hub')} fallbackTitle="Erro no módulo de Compras Online">
          <ComprasOnlineView onBackToHub={() => setView('compras_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'estoque') {
      return (
        <ErrorBoundary onReset={() => setView('hub')} fallbackTitle="Erro no módulo de Estoque">
          <EstoqueView onBackToHub={() => setView('hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'hub_settings') {
      return (
        <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 flex flex-col justify-between">
          {/* Top Header */}
          <header className="bg-white border-b border-zinc-200 px-8 py-4 shrink-0 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3 text-left">
              <button 
                onClick={() => setView('hub')}
                className="bg-zinc-100 hover:bg-zinc-200 p-2 rounded-xl text-zinc-650 hover:text-zinc-900 transition-colors border border-zinc-200 cursor-pointer shadow-sm"
                title="Voltar ao Hub"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h1 className="font-bold text-lg tracking-tight">Configurações Gerais</h1>
                <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Configuração central de backups do ecossistema</p>
              </div>
            </div>
            <div className="text-xs text-zinc-500 font-mono">
              Natum v0.002 alpha
            </div>
          </header>

          {/* Main Container */}
          <main className="flex-1 p-6 max-w-4xl w-full mx-auto space-y-6 flex flex-col justify-center">
            {message && (
              <div className={`p-4 rounded-xl border text-sm font-bold flex items-center justify-between shadow-sm transition-all duration-300 ${
                message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}>
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${message.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  {message.text}
                </div>
                <button onClick={() => setMessage(null)} className="text-zinc-400 hover:text-zinc-650 transition-colors cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Card 1: Google Drive Cloud Backup */}
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col justify-between min-h-[420px]">
                <div>
                  <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50 text-left">
                    <h3 className="font-bold text-zinc-800 flex items-center gap-2 text-base">
                      <RefreshCw className="h-5 w-5 text-zinc-500" />
                      Backup Google Drive Cloud
                    </h3>
                    <p className="text-xs text-zinc-500 font-medium">Configuração unificada de sincronização na nuvem</p>
                  </div>
                  <div className="p-6 space-y-4 text-left">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-600 block">OAuth Client ID</label>
                      <input 
                        type="text" 
                        className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white text-zinc-850" 
                        placeholder="Insira o Client ID do console GCP"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-600 block">OAuth Client Secret</label>
                      <input 
                        type="password" 
                        className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white text-zinc-850" 
                        placeholder="Insira o Client Secret"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                      />
                    </div>

                    <button 
                      onClick={handleSaveGoogleConfig} 
                      disabled={savingGoogle}
                      className="text-xs bg-zinc-950 text-white px-4 py-2.5 rounded-lg font-bold hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                    >
                      {savingGoogle ? 'Salvando...' : 'Salvar Credenciais'}
                    </button>
                  </div>
                </div>

                <div className="p-6 bg-zinc-50 border-t border-zinc-200">
                  <div className="flex items-center justify-between text-xs text-zinc-600 mb-4">
                    <span>Status de Login:</span>
                    <strong className={googleStatus.authenticated ? "text-emerald-600 font-bold" : "text-zinc-500 font-bold"}>
                      {googleStatus.authenticated ? '✓ Autenticado' : '✗ Desconectado'}
                    </strong>
                  </div>
                  
                  {googleStatus.configured ? (
                    <div className="flex gap-3">
                      <button 
                        onClick={handleGoogleLogin} 
                        className="flex-1 text-center py-2.5 border border-zinc-300 rounded-xl text-xs font-bold hover:bg-white transition-all cursor-pointer bg-white text-zinc-805 shadow-sm text-zinc-800"
                      >
                        Fazer Login Google
                      </button>
                      {googleStatus.authenticated && (
                        <button 
                          onClick={handleGoogleSync} 
                          disabled={syncingGoogle} 
                          className="flex-1 bg-zinc-950 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all"
                        >
                          <RefreshCw size={12} className={syncingGoogle ? 'animate-spin' : ''} />
                          {syncingGoogle ? 'Sincronizando...' : 'Fazer Backup Agora'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-zinc-400 italic text-left">Insira e salve as credenciais OAuth para ativar o login.</p>
                  )}
                  
                  {googleStatus.authenticated && (
                    <p className="text-[10px] text-zinc-500 mt-3 text-left">
                      Última sincronização na nuvem: <strong>{googleStatus.last_sync}</strong>
                    </p>
                  )}
                </div>
              </div>

              {/* Card 2: Manual Backup & Restore */}
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col justify-between min-h-[420px]">
                <div>
                  <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50 text-left">
                    <h3 className="font-bold text-zinc-800 flex items-center gap-2 text-base">
                      <Database className="h-5 w-5 text-zinc-500" />
                      Backup Físico Manual
                    </h3>
                    <p className="text-xs text-zinc-500 font-medium">Exportação e importação de arquivo de dados SQLite (.db)</p>
                  </div>
                  <div className="p-6 space-y-4 text-left leading-relaxed">
                    <p className="text-sm text-zinc-650">
                      O banco de dados SQLite (`data.db`) centraliza todas as informações dos módulos do aplicativo:
                    </p>
                    <ul className="text-xs text-zinc-500 list-disc pl-5 space-y-1 font-medium">
                      <li>Estoque de Produtos, Overrides e Histórico de Produção</li>
                      <li>Insumos de Compras, Demandas, Cotações e Notas Fiscais</li>
                      <li>Produtos de Microbiologia, Sequenciamento e Laudos Emitidos</li>
                    </ul>
                    <p className="text-xs text-zinc-500 mt-2">
                      Fazer o backup regularmente garante a segurança física dos seus dados locais.
                    </p>
                  </div>
                </div>

                <div className="p-6 bg-zinc-50 border-t border-zinc-200 flex flex-col gap-3">
                  <button 
                    onClick={handleManualBackup}
                    disabled={backingUpManual}
                    className="w-full flex items-center justify-center gap-2 py-3 border border-zinc-300 rounded-xl text-xs font-bold hover:bg-white transition-colors cursor-pointer bg-white text-zinc-800 shadow-sm"
                  >
                    <Download className="h-4 w-4 text-zinc-500" /> Exportar Banco de Dados (.db)
                  </button>
                  <button 
                    onClick={handleManualRestore}
                    disabled={restoringManual}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-zinc-950 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 disabled:opacity-50 transition-all cursor-pointer shadow-md"
                  >
                    <Upload className="h-4 w-4" /> Restaurar Backup Físico
                  </button>
                </div>
              </div>

              {/* Card 3: SQL Server Sync & Config */}
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col justify-between min-h-[420px]">
                <div>
                  <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50 text-left">
                    <h3 className="font-bold text-zinc-800 flex items-center gap-2 text-base">
                      <Database className="h-5 w-5 text-zinc-500" />
                      Banco de Dados SQL Server
                    </h3>
                    <p className="text-xs text-zinc-500 font-medium">Conectividade e Sincronização com o ERP Local</p>
                  </div>
                  
                  <div className="p-6 space-y-3 text-left">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2 space-y-1">
                        <label className="text-xs font-semibold text-zinc-655 text-zinc-600 block">Host / IP Servidor</label>
                        <input 
                          type="text" 
                          className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white text-zinc-850" 
                          placeholder="Ex: 192.168.101.249"
                          value={sqlHost}
                          onChange={(e) => setSqlHost(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-600 block">Porta</label>
                        <input 
                          type="text" 
                          className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white text-zinc-850" 
                          placeholder="Ex: 1433"
                          value={sqlPort}
                          onChange={(e) => setSqlPort(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-600 block">Usuário</label>
                        <input 
                          type="text" 
                          className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white text-zinc-850" 
                          placeholder="Ex: sa"
                          value={sqlUser}
                          onChange={(e) => setSqlUser(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-600 block">Senha</label>
                        <input 
                          type="password" 
                          className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white text-zinc-850" 
                          placeholder="Senha SQL Server"
                          value={sqlPassword}
                          onChange={(e) => setSqlPassword(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-600 block">Nome do Banco (Database)</label>
                      <input 
                        type="text" 
                        className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white text-zinc-850" 
                        placeholder="Ex: NATUM"
                        value={sqlDatabase}
                        onChange={(e) => setSqlDatabase(e.target.value)}
                      />
                    </div>

                    <button 
                      onClick={handleSaveSqlConfig} 
                      disabled={savingSql}
                      className="text-xs bg-zinc-950 text-white px-4 py-2.5 rounded-lg font-bold hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                    >
                      {savingSql ? 'Salvando...' : 'Salvar Conexão'}
                    </button>
                  </div>
                </div>

                <div className="p-6 bg-zinc-50 border-t border-zinc-200">
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={handleSyncSqlDatabase} 
                      disabled={syncingSql} 
                      className="w-full bg-zinc-950 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all"
                    >
                      <RefreshCw size={14} className={syncingSql ? 'animate-spin' : ''} />
                      {syncingSql ? 'Sincronizando...' : 'Sincronizar SQL Server Agora'}
                    </button>
                    <p className="text-[9px] text-zinc-400 text-center mt-1">
                      Esta ação baixa produtos, insumos, movimentações e receitas diretamente do ERP local para o buffer SQLite do aplicativo.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </main>

          {/* Footer Info */}
          <footer className="w-full text-center py-6 text-xs text-zinc-400 border-t border-zinc-200/50 bg-white/50">
            &copy; {new Date().getFullYear()} Nátum Bio Cosméticos. Todos os direitos reservados.
          </footer>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 flex flex-col justify-between">
        {/* Top Header */}
        <header className="bg-white border-b border-zinc-200 px-8 py-4 shrink-0 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-zinc-900 text-white p-2 rounded-lg shadow-sm">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">{APP_NAME}</h1>
              <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Painel Integrado de Gestão</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs text-zinc-500 font-mono">
              Natum v0.002 alpha
            </div>
            <button 
              onClick={() => { fetchSqlConfig(); setView('hub_settings'); }}
              className="bg-zinc-100 hover:bg-zinc-200 p-2 rounded-lg text-zinc-650 hover:text-zinc-900 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold border border-zinc-200 shadow-sm"
              title="Configurações Gerais"
            >
              <Settings className="h-4 w-4 text-zinc-500" />
              Configurações
            </button>
          </div>
        </header>

        {/* Main Container */}
        <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-6xl w-full mx-auto">
          {view === 'hub' ? (
            <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900">Selecione o Módulo</h2>
                <p className="text-sm text-zinc-500">Escolha a área do ecossistema Natum que deseja acessar.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                {/* Card Estoque */}
                <button 
                  onClick={() => setView('estoque')}
                  className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full"
                >
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                      <Boxes className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900">Estoque</h3>
                      <p className="text-sm text-zinc-500 mt-1">Níveis de insumos, matérias-primas, produtos acabados, formulações e histórico de movimentações.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                    Entrar no Módulo <ArrowRight className="h-4 w-4" />
                  </div>
                </button>

                {/* Card Produção */}
                <button 
                  onClick={() => setView('producao_hub')}
                  className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full"
                >
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                      <Activity className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900">Produção</h3>
                      <p className="text-sm text-zinc-500 mt-1">Gestão de estoques, alertas de segurança e controle microbiológico de lotes.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                    Entrar no Módulo <ArrowRight className="h-4 w-4" />
                  </div>
                </button>

                {/* Card Compras */}
                <button 
                  onClick={() => setView('compras_hub')}
                  className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full"
                >
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                      <ShoppingCart className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900">Compras</h3>
                      <p className="text-sm text-zinc-500 mt-1">Planejamento de demandas, cotações de fornecedores e controle de notas fiscais.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                    Entrar no Módulo <ArrowRight className="h-4 w-4" />
                  </div>
                </button>
              </div>
            </div>
          ) : view === 'producao_hub' ? (
            <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center gap-4 text-left">
                <button 
                  onClick={() => setView('hub')}
                  className="bg-white border border-zinc-200 hover:bg-zinc-100 p-2 rounded-xl text-zinc-650 hover:text-zinc-900 transition-colors cursor-pointer"
                  title="Voltar ao Início"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900">Módulo de Produção</h2>
                  <p className="text-xs text-zinc-500">Selecione a ferramenta de produção desejada.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                {/* Gerenciamento de Produção */}
                <button 
                  onClick={() => setView('producao')}
                  className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full"
                >
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                      <Boxes className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-zinc-900">Gerenciamento de Produção</h3>
                      <p className="text-xs text-zinc-500 mt-1">Visualize níveis de produto acabado, defina overrides de segurança e lance ordens de fabricação.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                    Acessar Produção <ArrowRight className="h-3 w-3" />
                  </div>
                </button>

                {/* Análise Físico-Química */}
                <button 
                  onClick={() => setView('fisco_quimica')}
                  className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full"
                >
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                      <Activity className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-zinc-900">Análise Físico-Química</h3>
                      <p className="text-xs text-zinc-500 mt-1">Controle de qualidade físico-químico. Registre análises de pH, viscosidade e densidade, e calcule correções em lote.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                    Acessar Laboratório <ArrowRight className="h-3 w-3" />
                  </div>
                </button>

                {/* Análise Microbiológica */}
                <button 
                  onClick={() => setView('microbiologia')}
                  className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full"
                >
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                      <FlaskConical className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-zinc-900">Análise Microbiológica</h3>
                      <p className="text-xs text-zinc-500 mt-1">Controle de qualidade laboratorial. Registre análises, emita laudos microbiológicos e gerencie o histórico de lotes.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                    Acessar Laboratório <ArrowRight className="h-3 w-3" />
                  </div>
                </button>
              </div>
            </div>
          ) : view === 'compras_hub' ? (
            <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center gap-4 text-left">
                <button 
                  onClick={() => setView('hub')}
                  className="bg-white border border-zinc-200 hover:bg-zinc-100 p-2 rounded-xl text-zinc-650 hover:text-zinc-900 transition-colors cursor-pointer"
                  title="Voltar ao Início"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900">Módulo de Compras</h2>
                  <p className="text-xs text-zinc-500">Selecione a ferramenta de compras desejada.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Gestão de Insumos & Matérias-Primas */}
                <button 
                  onClick={() => setView('compras')}
                  className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full"
                >
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                      <Boxes className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-zinc-900">Insumos & Matéria-Prima</h3>
                      <p className="text-xs text-zinc-500 mt-1">Planeje o estoque de matérias-primas e embalagens, calcule demandas automáticas, gerencie fornecedores e cotações.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                    Acessar Insumos <ArrowRight className="h-3 w-3" />
                  </div>
                </button>

                {/* Compras Online */}
                <button 
                  onClick={() => setView('compras_online')}
                  className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full"
                >
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                      <Globe className="h-5 w-5 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-zinc-900">Compras Online</h3>
                      <p className="text-xs text-zinc-500 mt-1">Rastreie e registre pedidos feitos na internet (etiquetas, suprimentos, etc.), controle o status do trânsito e salve comprovantes.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                    Acessar Rastreamento <ArrowRight className="h-3 w-3" />
                  </div>
                </button>
              </div>
            </div>
          ) : null}
        </main>

        {/* Footer Info */}
        <footer className="w-full text-center py-6 text-xs text-zinc-400 border-t border-zinc-200/50 bg-white/50">
          &copy; {new Date().getFullYear()} Nátum Bio Cosméticos. Todos os direitos reservados.
        </footer>
      </div>
    );
  };

  return (
    <>
      {renderContent()}
      <FeedbackWidget currentView={view} />
    </>
  );
}
