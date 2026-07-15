import React, { useState, useEffect } from 'react';
import LoginView from './modules/geral/acesso/LoginView';
import SetupSupervisorView from './modules/geral/acesso/SetupSupervisorView';
import SetupConnectionView from './modules/geral/acesso/SetupConnectionView';
import RestartRequiredView from './modules/geral/acesso/RestartRequiredView';
import DashboardView from './modules/geral/dashboard/DashboardView';
import ConfiguracoesView from './modules/geral/configuracoes/ConfiguracoesView';
import FeedbacksAdminView from './modules/geral/feedbacks/FeedbacksAdminView';
import AppShell from './modules/geral/components/layout/AppShell';

import ProducaoView from './modules/producao/gerenciamento/ProducaoView';
import ProducaoBasesView from './modules/producao/bases/ProducaoBasesView';
import ProducaoLotesView from './modules/producao/lotes/ProducaoLotesView';
import MontagemKitsView from './modules/producao/montagem_kits/MontagemKitsView';
import MicrobiologiaView from './modules/producao/microbiologia/MicrobiologiaView';
import FiscoQuimicaView from './modules/producao/fisco_quimica/FiscoQuimicaView';
import ComprasView from './modules/compras/planejamento/ComprasView';
import ComprasOnlineView from './modules/compras/compras_online/ComprasOnlineView';
import EstoqueView from './modules/estoque/estoque_geral/EstoqueView';
import EstoqueOpsView from './modules/estoque/ops/EstoqueOpsView';
import PedidosView from './modules/compras/controle_pedidos/PedidosView';
import NotasFiscaisView from './modules/compras/notas_fiscais/NotasFiscaisView';
import ComprasAlmoxarifadoView from './modules/compras/almoxarifado/ComprasAlmoxarifadoView';
import ActiveProductsView from './modules/administrativo/linha_produtos/ActiveProductsView';
import VendasView from './modules/vendas/vendas_geral/VendasView';
import VendasOnlineView from './modules/vendas/vendas_online/VendasOnlineView';
import ControleQualidadeView from './modules/qualidade/controle/ControleQualidadeView';
import AdministrativoView from './modules/administrativo/AdministrativoView';
import ExpedicaoView from './modules/expedicao/ExpedicaoView';
import FinanceiroView from './modules/financeiro/FinanceiroView';
import { ErrorBoundary } from './modules/geral/components/ErrorBoundary';
import { FeedbackWidget } from './modules/geral/components/FeedbackWidget';
import { syncCurrentPageForView } from './modules/geral/lib/viewLabels';
import { 
  Boxes, ShoppingCart, Activity, FlaskConical, ArrowRight, ArrowLeft,
  Settings, Database, RefreshCw, Upload, Download, Loader2, Check, X, Globe,
  FileText, ClipboardList, CheckCircle2, Palette, Tag, Layers, TrendingUp, Warehouse, AlertTriangle
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
import {
  isConnectionSetupCompleted,
  syncConfigFromTauri,
  waitForServerHealth,
  resetConnectionSetupForWizard,
  getApiOrigin,
} from './modules/geral/lib/connectionConfig';

type HubView = 'hub' | 'producao_hub' | 'producao' | 'producao_bases' | 'producao_lotes' | 'montagem_kits' | 'microbiologia' | 'fisco_quimica' | 'compras_hub' | 'compras_online' | 'compras_pedidos' | 'compras_notas' | 'compras_almoxarifado' | 'hub_settings' | 'hub_supervisor' | 'hub_feedbacks' | 'estoque_hub' | 'almoxarifado_hub' | 'estoque_insumos' | 'estoque_produtos' | 'estoque_materia_prima' | 'estoque_embalagens' | 'estoque_coloracao' | 'estoque_apoio' | 'estoque_divergencias' | 'estoque_itens' | 'estoque_almoxarifado' | 'estoque_supermercado' | 'estoque_pecas' | 'estoque_equipamentos' | 'estoque_manutencoes' | 'compras_materia_prima' | 'compras_embalagens' | 'compras_coloracao' | 'compras_apoio' | 'compras_quotations' | 'compras_simulation' | 'vendas_hub' | 'vendas' | 'vendas_online' | 'controle_qualidade' | 'administrativo' | 'admin_linha_produtos' | 'expedicao' | 'linha_produtos' | 'estoque_ativos' | 'financeiro';

export default function App() {
  const [view, setView] = useState<HubView>('hub');
  const [currentUser, setCurrentUser] = useState<any>(() => getAuthUser());
  const [authReady, setAuthReady] = useState(false);
  const [needsSupervisorSetup, setNeedsSupervisorSetup] = useState(false);
  const [needsConnectionSetup, setNeedsConnectionSetup] = useState(false);
  const [connectionWizardReason, setConnectionWizardReason] = useState<string | null>(null);
  const [needsAppRestart, setNeedsAppRestart] = useState(false);
  const [restartMessage, setRestartMessage] = useState('');
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

  const handleSyncSqlDatabase = async (mode: 'incremental' | 'full' = 'incremental') => {
    setSyncingSql(true);
    setMessage({
      text:
        mode === 'full'
          ? 'Sync completo iniciado… histórico completo pode levar vários minutos. Não feche o app.'
          : 'Sincronização ERP iniciada… aguarde.',
      type: 'success',
    });
    try {
      const qs = mode === 'full' ? '?mode=full' : '?mode=incremental';
      const data = await apiJson<{ message?: string; error?: string }>(`/import/sync${qs}`, {
        method: 'POST',
      });
      setMessage({ text: data.message || 'Sincronização realizada com sucesso!', type: 'success' });
    } catch (e: any) {
      console.error(e);
      const status = e?.status;
      const raw = e?.message || 'Erro ao sincronizar com o banco de dados';
      const text =
        status === 409 || String(raw).includes('já em andamento')
          ? 'Já existe um sync ERP em andamento. Aguarde terminar (histórico completo demora) ou use “Liberar lock” se travou.'
          : raw;
      setMessage({ text, type: 'error' });
    } finally {
      setSyncingSql(false);
      setTimeout(() => setMessage(null), 10000);
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

  const finishSupervisorSetup = async () => {
    setNeedsSupervisorSetup(false);
    setCurrentUser(getAuthUser());
    fetchFirebaseConfig();
    fetchSqlConfig();
  };

  const openConnectionWizard = (reason?: string) => {
    resetConnectionSetupForWizard();
    setConnectionWizardReason(reason ?? null);
    setNeedsConnectionSetup(true);
    setNeedsSupervisorSetup(false);
  };

  const afterConnectionSetup = async () => {
    setNeedsConnectionSetup(false);
    setConnectionWizardReason(null);

    const online = await waitForServerHealth(25000);
    if (!online) {
      openConnectionWizard(
        'API local não respondeu na porta 3001. Reinicie o aplicativo e tente novamente.'
      );
      return;
    }
    try {
      const setup = await fetchSetupStatus();
      setNeedsSupervisorSetup(setup.needsSupervisorSetup);
      if (setup.needsSupervisorSetup) {
        clearAuthSession();
        setCurrentUser(null);
      }
    } catch {
      setNeedsSupervisorSetup(true);
      clearAuthSession();
      setCurrentUser(null);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function initAuth() {
      try {
        await syncConfigFromTauri();
        const { repairDevConnectionIfNeeded } = await import('./modules/geral/lib/connectionConfig');
        if (await repairDevConnectionIfNeeded()) {
          if (!cancelled) {
            setNeedsAppRestart(true);
            setRestartMessage(
              'A configuração foi ajustada para servidor local de desenvolvimento. Reinicie o aplicativo para o banco e a API subirem neste PC.'
            );
            setSetupChecked(true);
            setAuthReady(true);
          }
          return;
        }
      } catch {
        /* localStorage */
      }

      if (cancelled) return;

      if (!isConnectionSetupCompleted()) {
        setNeedsConnectionSetup(true);
        setNeedsSupervisorSetup(false);
        setSetupChecked(true);
        setAuthReady(true);
        return;
      }

      fetchFirebaseConfig();
      fetchSqlConfig();
      const online = await waitForServerHealth(25000);
      if (cancelled) return;
      if (!online) {
        openConnectionWizard(
          'API local ainda não respondeu. Reinicie o aplicativo e tente novamente.'
        );
        setSetupChecked(true);
        setAuthReady(true);
        return;
      }
      let needsSetup = false;
      try {
        const setup = await fetchSetupStatus();
        needsSetup = setup.needsSupervisorSetup;
      } catch {
        needsSetup = true;
      }
      if (cancelled) return;
      if (needsSetup) {
        clearAuthSession();
        setCurrentUser(null);
        setNeedsSupervisorSetup(true);
      } else {
        setNeedsSupervisorSetup(false);
        try {
          const user = await validateSession();
          if (user) {
            setCurrentUser(user);
            checkUpdates(user);
          }
        } catch {
          clearAuthSession();
          setCurrentUser(null);
        }
      }
      setSetupChecked(true);
      setAuthReady(true);
    }

    initAuth();

    const onExpired = () => setCurrentUser(null);
    window.addEventListener('natum:auth-expired', onExpired);
    return () => {
      cancelled = true;
      window.removeEventListener('natum:auth-expired', onExpired);
    };
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
      setMessage({ text: "Gerando resumo do ERP...", type: 'success' });
      const summary = await api.exportErpSummary();
      const jsonBytes = new TextEncoder().encode(JSON.stringify(summary, null, 2));
      const compressed = await new Response(
        new Blob([jsonBytes]).stream().pipeThrough(new CompressionStream('gzip'))
      ).arrayBuffer();

      setMessage({ text: "Enviando para o Firebase Cloud Storage...", type: 'success' });
      const fileName = `natum_erp_summary_${new Date().toISOString().split('T')[0]}.json.gz`;
      await uploadBackupFile(firebaseUser.uid, new Uint8Array(compressed), fileName, (progress) => {
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
      const summary = await api.exportErpSummary();
      const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `natum_erp_summary_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ text: "Resumo ERP exportado com sucesso!", type: 'success' });
    } catch (e) {
      console.error(e);
      setMessage({ text: "Erro ao gerar exportação", type: 'error' });
    } finally {
      setBackingUpManual(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleManualRestore = async () => {
    alert(
      'Restauração de arquivo .db não está mais disponível.\n\n' +
      'Os dados ficam no PostgreSQL do PC Principal. Use o painel de backup Postgres nas configurações, ' +
      'ou "Reset operacional" (supervisor) para limpar dados transacionais.'
    );
  };

  const renderContent = () => {
    const allow = (v: string) => canAccessView(currentUser as AuthUser | null, v);

    if (!authReady || !setupChecked) {
      return (
        <div className="flex-1 flex items-center justify-center bg-zinc-50">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      );
    }

    if (needsAppRestart) {
      return <RestartRequiredView message={restartMessage} />;
    }

    if (needsConnectionSetup) {
      return (
        <SetupConnectionView reason={connectionWizardReason} onComplete={() => afterConnectionSetup()} />
      );
    }

    if (needsSupervisorSetup) {
      return <SetupSupervisorView onComplete={() => finishSupervisorSetup()} />;
    }

    if (!currentUser && view !== 'hub_settings') {
      return (
        <LoginView
          message={message}
          setView={setView}
          fetchSqlConfig={fetchSqlConfig}
          appName={APP_NAME}
          onReconfigureConnection={() =>
            openConnectionWizard('Reconfigure o nome deste dispositivo se necessário.')
          }
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

    if (view === 'producao_bases') {
      return (
        <ErrorBoundary onReset={() => setView('producao_hub')} fallbackTitle="Erro no módulo de Gestão de Bases">
          <ProducaoBasesView onBackToHub={() => setView('producao_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'producao_lotes') {
      return (
        <ErrorBoundary onReset={() => setView('producao_hub')} fallbackTitle="Erro no módulo de Lotes de Produção">
          <ProducaoLotesView onBackToHub={() => setView('producao_hub')} />
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

    if (view === 'compras_simulation') {
      return (
        <ErrorBoundary onReset={() => setView('compras_hub')} fallbackTitle="Erro no módulo de Simulação">
          <ComprasView mode="simulation" onBackToHub={() => setView('compras_hub')} />
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

    if (view === 'compras_almoxarifado') {
      return (
        <ErrorBoundary onReset={() => setView('compras_hub')} fallbackTitle="Erro no módulo Compras Almoxarifado">
          <ComprasAlmoxarifadoView onBackToHub={() => setView('compras_hub')} />
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 w-full max-w-5xl">
              {allow('estoque_materia_prima') && (
              <button 
                onClick={() => setView('estoque_materia_prima')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Database className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Matéria-Prima</h3>
                    <p className="text-sm text-zinc-500 mt-1">Insumos químicos e matérias-primas — saldo, movimentações e contagens.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Matéria-Prima <ArrowRight className="h-4 w-4" />
                </div>
              </button>
              )}

              {allow('estoque_embalagens') && (
              <button 
                onClick={() => setView('estoque_embalagens')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Layers className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Embalagens</h3>
                    <p className="text-sm text-zinc-500 mt-1">Frascos, rótulos e tampas — consulta de estoque e histórico.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Embalagens <ArrowRight className="h-4 w-4" />
                </div>
              </button>
              )}

              {allow('estoque_coloracao') && (
              <button 
                onClick={() => setView('estoque_coloracao')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Palette className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Coloração</h3>
                    <p className="text-sm text-zinc-500 mt-1">Produtos de coloração — estoque, lotes e movimentações.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Coloração <ArrowRight className="h-4 w-4" />
                </div>
              </button>
              )}

              {allow('estoque_apoio') && (
              <button 
                onClick={() => setView('estoque_apoio')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Tag className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Material de Apoio</h3>
                    <p className="text-sm text-zinc-500 mt-1">Materiais de apoio — saldo e rastreabilidade de movimentações.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Material de Apoio <ArrowRight className="h-4 w-4" />
                </div>
              </button>
              )}

              {(allow('estoque_materia_prima') || allow('estoque_embalagens') || allow('estoque_insumos')) && (
              <button 
                onClick={() => setView('estoque_divergencias')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Divergências</h3>
                    <p className="text-sm text-zinc-500 mt-1">Auditoria de insumos — Hub × ERP, NFs, baixas de OP e acertos.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Divergências <ArrowRight className="h-4 w-4" />
                </div>
              </button>
              )}
            </div>
          </main>

          <footer className="w-full text-center py-6 text-xs text-zinc-400 border-t border-zinc-200/50 bg-white/50">
            &copy; {new Date().getFullYear()} Nátum Bio Cosméticos. Todos os direitos reservados.
          </footer>
        </div>
      );
    }

    if (view === 'almoxarifado_hub') {
      const openOps = () =>
        setView(
          allow('estoque_itens')
            ? 'estoque_itens'
            : allow('estoque_almoxarifado')
              ? 'estoque_almoxarifado'
              : allow('estoque_supermercado')
                ? 'estoque_supermercado'
                : allow('estoque_pecas')
                  ? 'estoque_pecas'
                  : allow('estoque_equipamentos')
                    ? 'estoque_equipamentos'
                    : 'estoque_manutencoes'
        );
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
                <h1 className="font-bold text-lg tracking-tight">Almoxarifado</h1>
                <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
                  Consumíveis, supermercado, peças e manutenções
                </p>
              </div>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900">Módulos do Almoxarifado</h2>
              <p className="text-sm text-zinc-500">Selecione a área operacional.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4 w-full max-w-5xl">
              {allow('estoque_itens') && (
                <button onClick={() => setView('estoque_itens')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Boxes className="h-6 w-6" /></div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900">Itens</h3>
                      <p className="text-sm text-zinc-500 mt-1">Catálogo unificado dos itens monitorados.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Abrir <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
              {allow('estoque_almoxarifado') && (
                <button onClick={() => setView('estoque_almoxarifado')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Warehouse className="h-6 w-6" /></div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900">Almoxarifado</h3>
                      <p className="text-sm text-zinc-500 mt-1">Bobinas, stretch, caixas — vínculo com ERP.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Abrir <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
              {allow('estoque_supermercado') && (
                <button onClick={() => setView('estoque_supermercado')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Warehouse className="h-6 w-6" /></div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900">Supermercado</h3>
                      <p className="text-sm text-zinc-500 mt-1">Famílias locais, comprovantes e média por unidade padrão.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Abrir <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
              {allow('estoque_pecas') && (
                <button onClick={() => setView('estoque_pecas')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Settings className="h-6 w-6" /></div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900">Peças</h3>
                      <p className="text-sm text-zinc-500 mt-1">Reposição com vida útil e próxima troca.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Abrir <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
              {allow('estoque_equipamentos') && (
                <button onClick={() => setView('estoque_equipamentos')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Database className="h-6 w-6" /></div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900">Equipamentos</h3>
                      <p className="text-sm text-zinc-500 mt-1">Parque de máquinas e vínculos com peças.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Abrir <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
              {allow('estoque_manutencoes') && (
                <button onClick={() => setView('estoque_manutencoes')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><ClipboardList className="h-6 w-6" /></div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900">Manutenções</h3>
                      <p className="text-sm text-zinc-500 mt-1">Ordens preventivas, corretivas e preditivas.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Abrir <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
              {!allow('estoque_itens') &&
                !allow('estoque_almoxarifado') &&
                !allow('estoque_supermercado') &&
                !allow('estoque_pecas') &&
                !allow('estoque_equipamentos') &&
                !allow('estoque_manutencoes') && (
                  <p className="text-sm text-zinc-400 col-span-full text-center py-8">Sem permissão para submódulos.</p>
                )}
            </div>
            {(allow('estoque_itens') ||
              allow('estoque_almoxarifado') ||
              allow('estoque_supermercado') ||
              allow('estoque_pecas') ||
              allow('estoque_equipamentos') ||
              allow('estoque_manutencoes')) && (
              <button
                type="button"
                onClick={openOps}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 underline"
              >
                Abrir painel unificado (sidebar)
              </button>
            )}
          </main>
          <footer className="w-full text-center py-6 text-xs text-zinc-400 border-t border-zinc-200/50 bg-white/50">
            &copy; {new Date().getFullYear()} Nátum Bio Cosméticos. Todos os direitos reservados.
          </footer>
        </div>
      );
    }

    if (view === 'estoque_materia_prima') {
      return (
        <ErrorBoundary onReset={() => setView('estoque_hub')} fallbackTitle="Erro no Estoque de Matéria-Prima">
          <EstoqueView mode="materia_prima" onBackToHub={() => setView('estoque_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'estoque_embalagens') {
      return (
        <ErrorBoundary onReset={() => setView('estoque_hub')} fallbackTitle="Erro no Estoque de Embalagens">
          <EstoqueView mode="embalagens" onBackToHub={() => setView('estoque_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'estoque_coloracao') {
      return (
        <ErrorBoundary onReset={() => setView('estoque_hub')} fallbackTitle="Erro no Estoque de Coloração">
          <EstoqueView mode="coloracao" onBackToHub={() => setView('estoque_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'estoque_apoio') {
      return (
        <ErrorBoundary onReset={() => setView('estoque_hub')} fallbackTitle="Erro no Estoque de Material de Apoio">
          <EstoqueView mode="apoio" onBackToHub={() => setView('estoque_hub')} />
        </ErrorBoundary>
      );
    }

    if (
      view === 'estoque_itens' ||
      view === 'estoque_almoxarifado' ||
      view === 'estoque_supermercado' ||
      view === 'estoque_pecas' ||
      view === 'estoque_equipamentos' ||
      view === 'estoque_manutencoes'
    ) {
      const opsMode =
        view === 'estoque_itens'
          ? 'itens'
          : view === 'estoque_almoxarifado'
            ? 'almoxarifado'
            : view === 'estoque_supermercado'
              ? 'supermercado'
              : view === 'estoque_pecas'
                ? 'pecas'
                : view === 'estoque_equipamentos'
                  ? 'equipamentos'
                  : 'manutencoes';
      return (
        <ErrorBoundary onReset={() => setView('almoxarifado_hub')} fallbackTitle="Erro no Almoxarifado">
          <EstoqueOpsView
            mode={opsMode}
            onBackToHub={() => setView('almoxarifado_hub')}
            setView={(v) => setView(v as HubView)}
          />
        </ErrorBoundary>
      );
    }

    if (view === 'estoque_divergencias') {
      return (
        <ErrorBoundary onReset={() => setView('estoque_hub')} fallbackTitle="Erro no módulo de Divergências de Estoque">
          <EstoqueView
            mode="insumos"
            initialInsumosSubTab="contagens"
            onBackToHub={() => setView('estoque_hub')}
          />
        </ErrorBoundary>
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

    if (view === 'admin_linha_produtos' || view === 'estoque_ativos') {
      return (
        <ErrorBoundary onReset={() => setView('administrativo')} fallbackTitle="Erro no módulo de Linha de Produtos">
          <ActiveProductsView onBackToHub={() => setView('administrativo')} standalone={true} />
        </ErrorBoundary>
      );
    }

    if (view === 'vendas') {
      return (
        <ErrorBoundary onReset={() => setView('vendas_hub')} fallbackTitle="Erro no módulo de Vendas">
          <VendasView onBackToHub={() => setView('hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'vendas_online') {
      return (
        <ErrorBoundary onReset={() => setView('vendas_hub')} fallbackTitle="Erro no módulo de Vendas Online">
          <VendasOnlineView onBackToHub={() => setView('hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'controle_qualidade') {
      return (
        <ErrorBoundary onReset={() => setView('hub')} fallbackTitle="Erro no módulo de Controle de Qualidade">
          <ControleQualidadeView onBackToHub={() => setView('hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'administrativo') {
      return (
        <ErrorBoundary onReset={() => setView('hub')} fallbackTitle="Erro no módulo Administrativo">
          <AdministrativoView onBackToHub={() => setView('hub')} setView={setView} />
        </ErrorBoundary>
      );
    }

    if (view === 'expedicao') {
      return (
        <ErrorBoundary onReset={() => setView('hub')} fallbackTitle="Erro no módulo de Expedição">
          <ExpedicaoView onBackToHub={() => setView('hub')} />
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
          <ActiveProductsView onBackToHub={() => setView('administrativo')} standalone={true} />
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

  const showAppShell =
    Boolean(currentUser) &&
    authReady &&
    setupChecked &&
    !needsAppRestart &&
    !needsConnectionSetup &&
    !(needsSupervisorSetup);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-50 font-sans text-zinc-900">
      <div className="flex-1 flex flex-col overflow-hidden relative min-h-0 w-full">
        {showAppShell ? (
          <AppShell
            view={view}
            setView={setView}
            currentUser={currentUser}
            onLogout={handleLogout}
            fetchSqlConfig={fetchSqlConfig}
          >
            {renderContent()}
          </AppShell>
        ) : (
          renderContent()
        )}
      </div>
      <FeedbackWidget currentView={view} visible={canSeeFeedbacks(currentUser)} />
    </div>
  );
}
