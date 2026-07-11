import React, { useState, useEffect } from 'react';
import LoginView from './modules/geral/acesso/LoginView';
import SetupSupervisorView from './modules/geral/acesso/SetupSupervisorView';
import DashboardView from './modules/geral/dashboard/DashboardView';
import ConfiguracoesView from './modules/geral/configuracoes/ConfiguracoesView';
import FeedbacksAdminView from './modules/geral/feedbacks/FeedbacksAdminView';
import Header from './modules/geral/components/layout/Header';

import ProducaoView from './modules/producao/gerenciamento/ProducaoView';
import MontagemKitsView from './modules/producao/montagem_kits/MontagemKitsView';
import MicrobiologiaView from './modules/producao/microbiologia/MicrobiologiaView';
import FiscoQuimicaView from './modules/producao/fisco_quimica/FiscoQuimicaView';
import ComprasView from './modules/compras/planejamento/ComprasView';
import ComprasOnlineView from './modules/compras/compras_online/ComprasOnlineView';
import EstoqueView from './modules/estoque/estoque_geral/EstoqueView';
import PedidosView from './modules/compras/controle_pedidos/PedidosView';
import NotasFiscaisView from './modules/compras/notas_fiscais/NotasFiscaisView';
import ActiveProductsView from './modules/estoque/linha_produtos/ActiveProductsView';
import VendasView from './modules/vendas/vendas_geral/VendasView';
import FinanceiroView from './modules/financeiro/FinanceiroView';
import { ErrorBoundary } from './modules/geral/components/ErrorBoundary';
import { FeedbackWidget } from './modules/geral/components/FeedbackWidget';
import { syncCurrentPageForView } from './modules/geral/lib/viewLabels';
import { 
  Boxes, ShoppingCart, Activity, FlaskConical, ArrowRight, ArrowLeft,
  Settings, Database, RefreshCw, Upload, Download, Loader2, Check, X, Globe,
  FileText, ClipboardList, CheckCircle2, Palette, Tag, Layers, TrendingUp
} from 'lucide-react';
import { APP_NAME } from './modules/geral/lib/utils';
import { api, localAuth } from './modules/geral/lib/api';
import { clearAuthSession, getAuthUser, validateSession, fetchSetupStatus, canSeeFeedbacks, type AuthUser } from './modules/geral/lib/auth';
import { canAccessView } from './modules/geral/lib/modules/permissions';
import { apiFetch, apiJson, getSetting, getSettings, setSetting, setSettings } from './modules/geral/lib/http';
import { 
  initializeFirebase, 
  isFirebaseInitialized, 
  loginWithGoogle, 
  logoutFirebase, 
  uploadBackupFile 
} from './modules/geral/acesso/firebase';
import { getRedirectResult } from 'firebase/auth';

import { runUpdateCheckFlow } from './modules/geral/lib/updateChannel';
import { isPrincipalPc } from './modules/geral/lib/connectionConfig';

type HubView = 'hub' | 'producao_hub' | 'producao' | 'montagem_kits' | 'microbiologia' | 'fisco_quimica' | 'compras_hub' | 'compras' | 'compras_online' | 'compras_pedidos' | 'compras_notas' | 'hub_settings' | 'hub_supervisor' | 'hub_feedbacks' | 'estoque_hub' | 'estoque_insumos' | 'estoque_produtos' | 'compras_materia_prima' | 'compras_embalagens' | 'compras_coloracao' | 'compras_apoio' | 'compras_quotations' | 'vendas' | 'linha_produtos' | 'estoque_ativos' | 'financeiro';

export default function App() {
  const [view, setView] = useState<HubView>('hub');
  const [currentUser, setCurrentUser] = useState<any>(() => getAuthUser());
  const [authReady, setAuthReady] = useState(false);
  const [needsSupervisorSetup, setNeedsSupervisorSetup] = useState(false);
  const [setupChecked, setSetupChecked] = useState(false);

  useEffect(() => {
    syncCurrentPageForView(view);
  }, [view]);
  
  // Firebase states
  const [firebaseConfigStr, setFirebaseConfigStr] = useState('');
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [firebaseInitialized, setFirebaseInitialized] = useState(false);
  const [syncingFirebase, setSyncingFirebase] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [firebaseLastSync, setFirebaseLastSync] = useState('Nunca sincronizado');
  const [savingGoogle, setSavingGoogle] = useState(false);
  const [backingUpManual, setBackingUpManual] = useState(false);
  const [restoringManual, setRestoringManual] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // SQL Server — defaults vazios; valores reais vêm de settings (nunca hardcode no FE)
  const [sqlHost, setSqlHost] = useState('');
  const [sqlPort, setSqlPort] = useState('1433');
  const [sqlUser, setSqlUser] = useState('');
  const [sqlPassword, setSqlPassword] = useState('');
  const [sqlDatabase, setSqlDatabase] = useState('');
  const [savingSql, setSavingSql] = useState(false);
  const [syncingSql, setSyncingSql] = useState(false);

  const fetchFirebaseConfig = async () => {
    try {
      let customConfig = undefined;
      try {
        const cfg = await getSetting('firebase_config');
        if (cfg) {
          setFirebaseConfigStr(cfg);
          try {
            customConfig = JSON.parse(cfg);
          } catch (jsonErr) {
            console.error("Erro ao fazer parse da configuração do Firebase:", jsonErr);
          }
        }
      } catch (e) {
        console.error("Erro ao buscar firebase_config do backend:", e);
      }

      try {
        const { auth } = await initializeFirebase(customConfig);
        setFirebaseInitialized(true);
        
        // Process redirect results if reloaded after redirect login (only sets firebaseUser)
        try {
          const redirectResult = await getRedirectResult(auth);
          if (redirectResult && redirectResult.user) {
            console.log("Login via redirect bem-sucedido:", redirectResult.user.email);
            setFirebaseUser(redirectResult.user);
            setMessage({ text: `Conectado com sucesso como: ${redirectResult.user.email}`, type: 'success' });
            setTimeout(() => setMessage(null), 5000);
          }
        } catch (err: any) {
          console.error("Error in getRedirectResult:", err);
          if (err.code === 'auth/unauthorized-domain') {
            setMessage({ 
              text: `Erro: O domínio '${window.location.hostname}' não está autorizado no Console do Firebase. Adicione este domínio em Authentication -> Settings -> Authorized Domains.`, 
              type: 'error' 
            });
            setTimeout(() => setMessage(null), 8000);
          }
        }

        // Listen to auth changes (only manages firebaseUser for backup operations)
        auth.onAuthStateChanged((user: any) => {
          setFirebaseUser(user);
        });
      } catch (err) {
        console.warn("Firebase não inicializado com a chave fornecida:", err);
        setFirebaseInitialized(false);
      }
      
      const lastSync = await getSetting('firebase_last_sync');
      if (lastSync) {
        setFirebaseLastSync(lastSync);
      }
    } catch (e) {
      console.error("Erro ao carregar configurações do Firebase:", e);
    }
  };

  const fetchSqlConfig = async () => {
    try {
      const vals = await getSettings([
        'sql_host', 'sql_port', 'sql_user', 'sql_password', 'sql_database',
      ]);
      if (vals.sql_host) setSqlHost(vals.sql_host);
      if (vals.sql_port) setSqlPort(vals.sql_port);
      if (vals.sql_user) setSqlUser(vals.sql_user);
      if (vals.sql_password) setSqlPassword(vals.sql_password);
      if (vals.sql_database) setSqlDatabase(vals.sql_database);
    } catch (e) {
      console.error("Error fetching SQL config:", e);
    }
  };

  const handleSaveSqlConfig = async () => {
    setSavingSql(true);
    try {
      await setSettings({
        sql_host: sqlHost,
        sql_port: sqlPort,
        sql_user: sqlUser,
        sql_password: sqlPassword,
        sql_database: sqlDatabase,
      });
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
      const data = await apiJson<{ message?: string; error?: string }>('/import/sync', { method: 'POST' });
      setMessage({ text: data.message || "Sincronização realizada com sucesso!", type: 'success' });
    } catch (e: any) {
      console.error(e);
      setMessage({ text: e?.message || "Erro ao sincronizar com o banco de dados", type: 'error' });
    } finally {
      setSyncingSql(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const checkUpdates = async (user: AuthUser | null) => {
    if (!user) return;
    try {
      await runUpdateCheckFlow(user);
    } catch (e) {
      console.error('Erro ao verificar atualizações:', e);
    }
  };

  useEffect(() => {
    if (!authReady) return;
    if (!currentUser) return;
    if (view === 'hub') return;
    if (!canAccessView(currentUser as AuthUser, view)) {
      setView('hub');
    }
  }, [view, currentUser, authReady]);

  useEffect(() => {
    import('./modules/geral/lib/connectionConfig').then(({ syncConfigFromTauri, isPrincipalPc: isPrincipal }) => {
      syncConfigFromTauri()
        .then(() => {
          if (isPrincipal()) {
            fetchFirebaseConfig();
            fetchSqlConfig();
          }
        })
        .catch(() => {
          if (isPrincipalPc()) {
            fetchFirebaseConfig();
            fetchSqlConfig();
          }
        });
    });
    fetchSetupStatus()
      .then(async (setup) => {
        setNeedsSupervisorSetup(setup.needsSupervisorSetup);
        if (setup.needsSupervisorSetup) {
          clearAuthSession();
          setCurrentUser(null);
          return null;
        }
        return validateSession();
      })
      .then((user) => {
        if (user) {
          setCurrentUser(user);
          checkUpdates(user);
        }
      })
      .catch(() => {
        setNeedsSupervisorSetup(true);
        clearAuthSession();
        setCurrentUser(null);
      })
      .finally(() => {
        setSetupChecked(true);
        setAuthReady(true);
      });

    const onExpired = () => setCurrentUser(null);
    window.addEventListener('natum:auth-expired', onExpired);
    return () => window.removeEventListener('natum:auth-expired', onExpired);
  }, []);

  const handleSaveFirebaseConfig = async () => {
    setSavingGoogle(true);
    try {
      // Validate JSON
      JSON.parse(firebaseConfigStr);
      
      await setSetting('firebase_config', firebaseConfigStr);
      setMessage({ text: "Configuração do Firebase salva com sucesso!", type: 'success' });
      await fetchFirebaseConfig();
    } catch (e) {
      console.error(e);
      setMessage({ text: "Configuração inválida. Certifique-se de que é um JSON válido.", type: 'error' });
    } finally {
      setSavingGoogle(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleFirebaseLogin = () => {
    // Show a helpful message in the UI while waiting for the browser OAuth
    setMessage({ 
      text: "Por favor, realize o login na janela do navegador que foi aberta. Este aplicativo será conectado automaticamente.", 
      type: 'success' 
    });

    loginWithGoogle()
      .then((user) => {
        setFirebaseUser(user);
        setMessage({ text: `Conectado com sucesso como: ${user.email}`, type: 'success' });
      })
      .catch((e: any) => {
        console.error(e);
        if (e.code === 'auth/unauthorized-domain') {
          setMessage({ 
            text: `Erro: O domínio '${window.location.hostname}' (ou protocolo) não está autorizado no Console do seu projeto Firebase. Adicione-o em Authentication -> Settings -> Authorized Domains nas configurações do Firebase.`, 
            type: 'error' 
          });
        } else {
          setMessage({ text: `Erro no login com Google: ${e.message}`, type: 'error' });
        }
      })
      .finally(() => {
        setTimeout(() => setMessage(null), 8000);
      });
  };

  const handleFirebaseLogout = async () => {
    try {
      if (isFirebaseInitialized()) {
        try {
          await logoutFirebase();
        } catch (e) {}
      }
      setFirebaseUser(null);
      setMessage({ text: "Desconectado do Google com sucesso.", type: 'success' });
    } catch (e: any) {
      console.error(e);
      setMessage({ text: "Erro ao desconectar.", type: 'error' });
    }
  };

  const handleLogout = async () => {
    await localAuth.signOut();
  };


  const handleFirebaseSync = async () => {
    if (!firebaseUser) {
      setMessage({ text: "Faça login com o Google primeiro.", type: 'error' });
      setTimeout(() => setMessage(null), 4000);
      return;
    }
    setSyncingFirebase(true);
    setUploadProgress(0);
    try {
      setMessage({ text: "Comprimindo banco de dados...", type: 'success' });
      // 1. Get compressed backup from backend Rust
      const data = await api.getCompressedBackup();
      
      setMessage({ text: "Enviando para o Firebase Cloud Storage...", type: 'success' });
      // 2. Upload to Firebase Storage
      const fileName = `natum_backup_${new Date().toISOString().split('T')[0]}.db.gz`;
      await uploadBackupFile(firebaseUser.uid, new Uint8Array(data), fileName, (progress) => {
        setUploadProgress(progress);
      });
      
      const now = new Date().toLocaleString();
      // 3. Save last sync timestamp
      await setSetting('firebase_last_sync', now);
      setFirebaseLastSync(now);
      setMessage({ text: "Backup realizado com sucesso no Firebase!", type: 'success' });
    } catch (e: any) {
      console.error(e);
      setMessage({ text: `Erro na sincronização: ${e.message || e}`, type: 'error' });
    } finally {
      setSyncingFirebase(false);
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
    if (!authReady || !setupChecked) {
      return (
        <div className="flex-1 flex items-center justify-center bg-zinc-50">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      );
    }

    if (needsSupervisorSetup) {
      return (
        <SetupSupervisorView
          onComplete={() => {
            setNeedsSupervisorSetup(false);
            setCurrentUser(getAuthUser());
          }}
        />
      );
    }

    if (!currentUser && view !== 'hub_settings') {
      return (
        <LoginView
          message={message}
          setView={setView}
          fetchSqlConfig={fetchSqlConfig}
          appName={APP_NAME}
          onLoginSuccess={() => {
            setCurrentUser(getAuthUser());
          }}
        />
      );
    }

    if (view === 'producao') {
      return (
        <ErrorBoundary onReset={() => setView('producao_hub')} fallbackTitle="Erro no módulo de Produção">
          <ProducaoView onBackToHub={() => setView('producao_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'montagem_kits') {
      return (
        <ErrorBoundary onReset={() => setView('producao_hub')} fallbackTitle="Erro no módulo de Montagem de Kits">
          <MontagemKitsView onBackToHub={() => setView('producao_hub')} />
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
          <ComprasView mode="all" onBackToHub={() => setView('compras_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'compras_materia_prima') {
      return (
        <ErrorBoundary onReset={() => setView('compras_hub')} fallbackTitle="Erro no módulo de Matéria-Prima">
          <ComprasView mode="materia_prima" onBackToHub={() => setView('compras_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'compras_embalagens') {
      return (
        <ErrorBoundary onReset={() => setView('compras_hub')} fallbackTitle="Erro no módulo de Embalagens">
          <ComprasView mode="embalagens" onBackToHub={() => setView('compras_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'compras_coloracao') {
      return (
        <ErrorBoundary onReset={() => setView('compras_hub')} fallbackTitle="Erro no módulo de Coloração">
          <ComprasView mode="coloracao" onBackToHub={() => setView('compras_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'compras_apoio') {
      return (
        <ErrorBoundary onReset={() => setView('compras_hub')} fallbackTitle="Erro no módulo de Material de Apoio">
          <ComprasView mode="apoio" onBackToHub={() => setView('compras_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'compras_quotations') {
      return (
        <ErrorBoundary onReset={() => setView('compras_hub')} fallbackTitle="Erro no módulo de Cotações">
          <ComprasView mode="quotations" onBackToHub={() => setView('compras_hub')} />
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

    if (view === 'compras_pedidos') {
      return (
        <ErrorBoundary onReset={() => setView('compras_hub')} fallbackTitle="Erro no módulo de Pedidos de Compra">
          <PedidosView onBackToHub={() => setView('compras_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'compras_notas') {
      return (
        <ErrorBoundary onReset={() => setView('compras_hub')} fallbackTitle="Erro no módulo de Notas Fiscais">
          <NotasFiscaisView onBackToHub={() => setView('compras_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'estoque_hub') {
      return (
        <div className="flex-1 flex flex-col justify-between overflow-y-auto bg-zinc-50 font-sans text-zinc-900">
          <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-6xl w-full mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-3 self-start mb-4">
              <button 
                onClick={() => setView('hub')}
                className="bg-white border border-zinc-200 hover:bg-zinc-150 p-2 rounded-xl text-zinc-650 hover:text-zinc-900 transition-all cursor-pointer shadow-sm"
                title="Voltar ao Início"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h1 className="font-bold text-lg tracking-tight">Estoque Hub</h1>
                <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Sub-módulos e inventários de produtos e insumos</p>
              </div>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900">Módulos de Estoque</h2>
              <p className="text-sm text-zinc-500">Selecione o inventário específico para consulta e movimentações.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 w-full max-w-5xl">
              {/* Insumos */}
              <button 
                onClick={() => setView('estoque_insumos')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Boxes className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Insumos</h3>
                    <p className="text-sm text-zinc-500 mt-1">Níveis de estoque de matérias-primas químicas, essências, embalagens e materiais de consumo com histórico de movimentações.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Insumos <ArrowRight className="h-4 w-4" />
                </div>
              </button>

              {/* Produtos */}
              <button 
                onClick={() => setView('estoque_produtos')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Boxes className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Produtos</h3>
                    <p className="text-sm text-zinc-500 mt-1">Catálogo de produtos, fórmulas de fabricação, estoque atual, previsões de demanda e histórico de lotes.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Produtos <ArrowRight className="h-4 w-4" />
                </div>
              </button>

              {/* Linha de Produtos */}
              <button 
                onClick={() => setView('estoque_ativos')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Linha de Produtos</h3>
                    <p className="text-sm text-zinc-500 mt-1">Defina quais produtos vão ser de quais linhas, quais vão ficar ativos/em lançamento e ajuste overrides de estoque.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Linhas <ArrowRight className="h-4 w-4" />
                </div>
              </button>
            </div>
          </main>

          <footer className="w-full text-center py-6 text-xs text-zinc-400 border-t border-zinc-200/50 bg-white/50">
            &copy; {new Date().getFullYear()} Nátum Bio Cosméticos. Todos os direitos reservados.
          </footer>
        </div>
      );
    }

    if (view === 'estoque_insumos') {
      return (
        <ErrorBoundary onReset={() => setView('estoque_hub')} fallbackTitle="Erro no módulo de Estoque de Insumos">
          <EstoqueView mode="insumos" onBackToHub={() => setView('estoque_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'estoque_produtos') {
      return (
        <ErrorBoundary onReset={() => setView('estoque_hub')} fallbackTitle="Erro no módulo de Estoque de Produtos">
          <EstoqueView mode="produtos" onBackToHub={() => setView('estoque_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'estoque_ativos') {
      return (
        <ErrorBoundary onReset={() => setView('estoque_hub')} fallbackTitle="Erro no módulo de Linha de Produtos">
          <ActiveProductsView onBackToHub={() => setView('estoque_hub')} standalone={true} />
        </ErrorBoundary>
      );
    }

    if (view === 'vendas') {
      return (
        <ErrorBoundary onReset={() => setView('hub')} fallbackTitle="Erro no módulo de Vendas">
          <VendasView onBackToHub={() => setView('hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'financeiro') {
      return (
        <ErrorBoundary onReset={() => setView('hub')} fallbackTitle="Erro no módulo Financeiro">
          <FinanceiroView onBackToHub={() => setView('hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'linha_produtos') {
      return (
        <ErrorBoundary onReset={() => setView('hub')} fallbackTitle="Erro no módulo de Linha de Produtos">
          <ActiveProductsView onBackToHub={() => setView('hub')} standalone={true} />
        </ErrorBoundary>
      );
    }

    if (view === 'hub_settings') {
      return (
        <ConfiguracoesView
          variant="general"
          currentUser={currentUser}
          setView={setView}
          message={message}
          setMessage={setMessage}
          firebaseUser={firebaseUser}
          firebaseInitialized={firebaseInitialized}
          handleFirebaseLogin={handleFirebaseLogin}
          handleFirebaseLogout={handleFirebaseLogout}
          handleFirebaseSync={handleFirebaseSync}
          syncingFirebase={syncingFirebase}
          uploadProgress={uploadProgress}
          firebaseLastSync={firebaseLastSync}
          handleManualBackup={handleManualBackup}
          backingUpManual={backingUpManual}
          handleManualRestore={handleManualRestore}
          restoringManual={restoringManual}
          sqlHost={sqlHost}
          setSqlHost={setSqlHost}
          sqlPort={sqlPort}
          setSqlPort={setSqlPort}
          sqlUser={sqlUser}
          setSqlUser={setSqlUser}
          sqlPassword={sqlPassword}
          setSqlPassword={setSqlPassword}
          sqlDatabase={sqlDatabase}
          setSqlDatabase={setSqlDatabase}
          handleSaveSqlConfig={handleSaveSqlConfig}
          savingSql={savingSql}
          handleSyncSqlDatabase={handleSyncSqlDatabase}
          syncingSql={syncingSql}
        />
      );
    }

    if (view === 'hub_supervisor') {
      return (
        <ConfiguracoesView
          variant="supervisor"
          currentUser={currentUser}
          setView={setView}
          message={message}
          setMessage={setMessage}
          firebaseUser={firebaseUser}
          firebaseInitialized={firebaseInitialized}
          handleFirebaseLogin={handleFirebaseLogin}
          handleFirebaseLogout={handleFirebaseLogout}
          handleFirebaseSync={handleFirebaseSync}
          syncingFirebase={syncingFirebase}
          uploadProgress={uploadProgress}
          firebaseLastSync={firebaseLastSync}
          handleManualBackup={handleManualBackup}
          backingUpManual={backingUpManual}
          handleManualRestore={handleManualRestore}
          restoringManual={restoringManual}
          sqlHost={sqlHost}
          setSqlHost={setSqlHost}
          sqlPort={sqlPort}
          setSqlPort={setSqlPort}
          sqlUser={sqlUser}
          setSqlUser={setSqlUser}
          sqlPassword={sqlPassword}
          setSqlPassword={setSqlPassword}
          sqlDatabase={sqlDatabase}
          setSqlDatabase={setSqlDatabase}
          handleSaveSqlConfig={handleSaveSqlConfig}
          savingSql={savingSql}
          handleSyncSqlDatabase={handleSyncSqlDatabase}
          syncingSql={syncingSql}
        />
      );
    }

    if (view === 'hub_feedbacks') {
      return (
        <ErrorBoundary onReset={() => setView('hub')} fallbackTitle="Erro na Gestão de Feedbacks">
          <FeedbacksAdminView currentUser={currentUser} setView={setView} />
        </ErrorBoundary>
      );
    }

    return (
      <DashboardView
        view={view}
        setView={setView}
        currentUser={currentUser}
        handleLogout={handleLogout}
        fetchSqlConfig={fetchSqlConfig}
        appName={APP_NAME}
      />
    );
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-50 font-sans text-zinc-900">
      {currentUser && (
        <Header
          view={view}
          setView={setView}
          currentUser={currentUser}
          onLogout={handleLogout}
          fetchSqlConfig={fetchSqlConfig}
        />
      )}
      <div className="flex-1 flex flex-col overflow-hidden relative min-h-0 w-full">
        {renderContent()}
      </div>
      <FeedbackWidget currentView={view} visible={canSeeFeedbacks(currentUser)} />
    </div>
  );
}
