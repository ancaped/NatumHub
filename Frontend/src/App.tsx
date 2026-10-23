import React, { useState, useEffect } from 'react';
import LoginView from './modules/geral/acesso/LoginView';
import SetupSupervisorView from './modules/geral/acesso/SetupSupervisorView';
import SetupConnectionView from './modules/geral/acesso/SetupConnectionView';
import RestartRequiredView from './modules/geral/acesso/RestartRequiredView';
import DashboardView from './modules/geral/dashboard/DashboardView';
import ConfiguracoesView from './modules/geral/configuracoes/ConfiguracoesView';
import DesenvolvimentoView from './modules/geral/desenvolvimento/DesenvolvimentoView';
import AppShell from './modules/geral/components/layout/AppShell';

import ProducaoView from './modules/producao/gerenciamento/ProducaoView';
import PlanejamentoProducaoView from './modules/producao/planejamento/PlanejamentoProducaoView';
import ProducaoLotesView from './modules/producao/lotes/ProducaoLotesView';
import { ProcView } from './modules/producao/proc/ProcView';
import MontagemKitsView from './modules/producao/montagem_kits/MontagemKitsView';
import MicrobiologiaView from './modules/producao/microbiologia/MicrobiologiaView';
import FiscoQuimicaView from './modules/producao/fisco_quimica/FiscoQuimicaView';
import ComprasView from './modules/compras/planejamento/ComprasView';
import ComprasOnlineView from './modules/compras/compras_online/ComprasOnlineView';
import EstoqueView from './modules/estoque/estoque_geral/EstoqueView';
import EquipamentosView from './modules/estoque/equipamentos/EquipamentosView';
import AlmoxEstoqueView from './modules/estoque/almoxarifado/AlmoxEstoqueView';
import AlmoxManutencoesView from './modules/estoque/manutencoes/AlmoxManutencoesView';
import OrdensManuaisView from './modules/estoque/ordens_manuais/OrdensManuaisView';
import PedidosView from './modules/compras/controle_pedidos/PedidosView';
import NotasFiscaisView from './modules/compras/notas_fiscais/NotasFiscaisView';
import ActiveProductsView from './modules/administrativo/linha_produtos/ActiveProductsView';
import RelatoriosView from './modules/administrativo/relatorios/RelatoriosView';
import ProdutosAtivosRelatoriosView from './modules/administrativo/produtos_ativos_relatorios/ProdutosAtivosRelatoriosView';
import FuncionariosView from './modules/administrativo/funcionarios/FuncionariosView';
import AcompanhamentoProducaoView from './modules/administrativo/acompanhamento_producao/AcompanhamentoProducaoView';
import VendasView from './modules/vendas/vendas_geral/VendasView';
import VendasOnlineView from './modules/vendas/vendas_online/VendasOnlineView';
import ControleQualidadeView from './modules/qualidade/controle/ControleQualidadeView';
import QualidadePopsView from './modules/qualidade/pops/QualidadePopsView';
import QualidadeTreinamentosView from './modules/qualidade/treinamentos/QualidadeTreinamentosView';
import QualidadeTemperaturaView from './modules/qualidade/temperatura/QualidadeTemperaturaView';
import QualidadeLimpezaView from './modules/qualidade/limpeza/QualidadeLimpezaView';
import QualidadeRecebimentoMpView from './modules/qualidade/recebimento_mp/QualidadeRecebimentoMpView';
import QualidadeDocumentacaoView from './modules/qualidade/documentacao/QualidadeDocumentacaoView';
import DevolucoesView from './modules/qualidade/devolucoes/DevolucoesView';
import AvariasView from './modules/qualidade/avarias/AvariasView';
import AdministrativoView from './modules/administrativo/AdministrativoView';
import ExpedicaoView from './modules/expedicao/ExpedicaoView';
import FinanceiroView from './modules/financeiro/FinanceiroView';
import EtiquetasView from './modules/ferramentas/etiquetas/EtiquetasView';
import EditorEtiquetasView from './modules/ferramentas/editor/EditorEtiquetasView';
import ImpressorasView from './modules/ferramentas/impressoras/ImpressorasView';
import BalancaView from './modules/ferramentas/balanca/BalancaView';
import { ErrorBoundary } from './modules/geral/components/ErrorBoundary';
import { FeedbackWidget } from './modules/geral/components/FeedbackWidget';
import { syncCurrentPageForView } from './modules/geral/lib/viewLabels';
import { 
  Boxes, ShoppingCart, Activity, FlaskConical, ArrowRight, ArrowLeft,
  Settings, Database, Loader2, Globe,
  FileText, ClipboardList, CheckCircle2, Palette, Tag, Layers, TrendingUp, Warehouse,
  Truck, ClipboardCheck, BookOpen, GraduationCap, Thermometer, Sparkles, PackageCheck, FolderOpen, PackageX, AlertTriangle,
} from 'lucide-react';
import { APP_NAME } from './modules/geral/lib/utils';
import { localAuth } from './modules/geral/lib/api';
import { clearAuthSession, getAuthUser, validateSession, fetchSetupStatus, type AuthUser } from './modules/geral/lib/auth';
import { canAccessView } from './modules/geral/lib/modules/permissions';
import { apiJson, getSettings, setSettings } from './modules/geral/lib/http';
import { cleanupPrintIframes } from './modules/geral/lib/printCleanup';

import {
  isConnectionSetupCompleted,
  syncConfigFromTauri,
  waitForServerHealth,
  resetConnectionSetupForWizard,
  getApiOrigin,
  ensureBrowserClientConfig,
} from './modules/geral/lib/connectionConfig';

type HubView = 'hub' | 'producao_hub' | 'planejamento_producao' | 'producao' | 'producao_bases' | 'producao_lotes' | 'producao_proc' | 'montagem_kits' | 'microbiologia' | 'fisco_quimica' | 'compras_hub' | 'compras_online' | 'compras_pedidos' | 'compras_notas' | 'hub_settings' | 'hub_supervisor' | 'hub_feedbacks' | 'mapa_arquitetura' | 'desenvolvimento' | 'estoque_hub' | 'almoxarifado_hub' | 'estoque_insumos' | 'estoque_produtos' | 'estoque_materia_prima' | 'estoque_embalagens' | 'estoque_coloracao' | 'estoque_apoio' | 'estoque_ordens_manuais' | 'estoque_itens' | 'estoque_almoxarifado' | 'estoque_supermercado' | 'estoque_pecas' | 'estoque_equipamentos' | 'estoque_manutencoes' | 'compras_materia_prima' | 'compras_embalagens' | 'compras_coloracao' | 'compras_apoio' | 'compras_quotations' | 'compras_simulation' | 'vendas_hub' | 'vendas' | 'vendas_online' | 'qualidade_hub' | 'controle_qualidade' | 'qualidade_devolucoes' | 'qualidade_avarias' | 'qualidade_pops' | 'qualidade_treinamentos' | 'qualidade_temperatura' | 'qualidade_limpeza' | 'qualidade_recebimento_mp' | 'qualidade_documentacao' | 'administrativo' | 'admin_linha_produtos' | 'admin_produtos_ativos_relatorios' | 'admin_funcionarios' | 'admin_acompanhamento_producao' | 'expedicao_hub' | 'expedicao_ecommerce' | 'expedicao' | 'linha_produtos' | 'estoque_ativos' | 'financeiro' | 'ferramentas_hub' | 'ferramentas_etiquetas' | 'ferramentas_editor' | 'ferramentas_impressoras' | 'ferramentas_balanca' | 'producao_rotina' | 'estoque_movimentacoes' | 'admin_relatorios' | 'saude_estoque';

const getInitialView = (): HubView => {
  if (typeof window !== 'undefined') {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const modParam = searchParams.get('module') || searchParams.get('view') || searchParams.get('mod');
      if (modParam) {
        return modParam as HubView;
      }
      if (window.location.hash) {
        const hashVal = window.location.hash.replace(/^#\/?/, '');
        if (hashVal) {
          return hashVal as HubView;
        }
      }
    } catch (_) {}
  }
  return 'hub';
};

export default function App() {
  const [view, setView] = useState<HubView>(getInitialView);
  // Telas filhas recebem a navegação como string (chaves vindas do registry).
  const setViewByKey = (v: string) => setView(v as HubView);
  const [currentUser, setCurrentUser] = useState<any>(() => getAuthUser());
  const [authReady, setAuthReady] = useState(false);
  const [needsSupervisorSetup, setNeedsSupervisorSetup] = useState(false);
  const [needsConnectionSetup, setNeedsConnectionSetup] = useState(false);
  const [connectionWizardReason, setConnectionWizardReason] = useState<string | null>(null);
  const [needsAppRestart, setNeedsAppRestart] = useState(false);
  const [restartMessage, setRestartMessage] = useState('');
  const [setupChecked, setSetupChecked] = useState(false);
  const [almoxStats, setAlmoxStats] = useState<any>(null);
  const [manutEquipId, setManutEquipId] = useState<string | null>(null);
  const [manutTicket, setManutTicket] = useState(0);
  const [equipFocusId, setEquipFocusId] = useState<string | null>(null);
  const [equipTicket, setEquipTicket] = useState(0);

  useEffect(() => {
    syncCurrentPageForView(view);
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        if (view === 'hub') {
          url.searchParams.delete('module');
          url.searchParams.delete('view');
          url.searchParams.delete('mod');
          window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
        } else {
          url.searchParams.set('module', view);
          window.history.replaceState({}, '', url.pathname + '?' + url.searchParams.toString());
        }
      } catch (_) {}
    }
    if (view === 'almoxarifado_hub') {
      apiJson('/almox/dashboard/stats')
        .then(setAlmoxStats)
        .catch((err) => console.error('Erro ao carregar estatísticas do almoxarifado:', err));
    }
  }, [view]);

  useEffect(() => {
    const handlePopState = () => {
      const initial = getInitialView();
      setView(initial);
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);
  
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // SQL Server — defaults vazios; valores reais vêm de settings (nunca hardcode no FE)
  const [sqlHost, setSqlHost] = useState('');
  const [sqlPort, setSqlPort] = useState('1433');
  const [sqlUser, setSqlUser] = useState('');
  const [sqlPassword, setSqlPassword] = useState('');
  const [sqlDatabase, setSqlDatabase] = useState('');
  const [savingSql, setSavingSql] = useState(false);
  const [syncingSql, setSyncingSql] = useState(false);

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

  useEffect(() => {
    if (!authReady) return;
    if (!currentUser) return;
    if (view === 'hub') return;
    if (!canAccessView(currentUser as AuthUser, view)) {
      setView('hub');
    }
  }, [view, currentUser, authReady]);

  // Firefox: iframe de impressão órfão → crash React "can't access property body"
  useEffect(() => {
    cleanupPrintIframes();
  }, [view]);

  const finishSupervisorSetup = async () => {
    setNeedsSupervisorSetup(false);
    setCurrentUser(getAuthUser());
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
        ensureBrowserClientConfig();
        await syncConfigFromTauri();
        ensureBrowserClientConfig();
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

  const handleLogout = async () => {
    await localAuth.signOut();
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
          setView={setViewByKey}
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

    if (view === 'planejamento_producao') {
      return (
        <ErrorBoundary onReset={() => setView('hub')} fallbackTitle="Erro no módulo de Planejamento de Produção">
          <PlanejamentoProducaoView onBackToHub={() => setView('hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'producao') {
      return (
        <ErrorBoundary onReset={() => setView('producao_hub')} fallbackTitle="Erro no módulo de Produção">
          <ProducaoView onBackToHub={() => setView('producao_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'producao_rotina') {
      return (
        <ErrorBoundary onReset={() => setView('producao_hub')} fallbackTitle="Erro no módulo de Produção">
          <ProducaoView onBackToHub={() => setView('producao_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'producao_lotes') {
      return (
        <ErrorBoundary onReset={() => setView('producao_hub')} fallbackTitle="Erro no módulo de Produção">
          <ProducaoView onBackToHub={() => setView('producao_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'montagem_kits') {
      return (
        <ErrorBoundary onReset={() => setView('producao_hub')} fallbackTitle="Erro no módulo de Kits">
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

    if (view === 'producao_proc') {
      return (
        <ErrorBoundary onReset={() => setView('producao_hub')} fallbackTitle="Erro no módulo de Processos de Fabricação (PROC)">
          <ProcView onNavigate={(v) => setView(v as HubView)} />
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

    if (view === 'compras_simulation') {
      return (
        <ErrorBoundary onReset={() => setView('compras_hub')} fallbackTitle="Erro no módulo de Simulação">
          <ComprasView mode="simulation" onBackToHub={() => setView('compras_hub')} />
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
                    <p className="text-sm text-zinc-500 mt-1">Consulta de saldo, reserva das ordens e pedidos a chegar.</p>
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
                    <p className="text-sm text-zinc-500 mt-1">Consulta de saldo, reserva e pedidos de compra em aberto.</p>
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
                    <p className="text-sm text-zinc-500 mt-1">Consulta de saldo, produção e pedidos de venda em aberto.</p>
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
                    <p className="text-sm text-zinc-500 mt-1">Consulta de saldo, produção e pedidos de venda em aberto.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Material de Apoio <ArrowRight className="h-4 w-4" />
                </div>
              </button>
              )}

              {allow('estoque_produtos') && (
              <button 
                onClick={() => setView('estoque_produtos')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Boxes className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Produtos Acabados</h3>
                    <p className="text-sm text-zinc-500 mt-1">Consulta de saldo, produção e pedidos de venda em aberto.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Produtos Acabados <ArrowRight className="h-4 w-4" />
                </div>
              </button>
              )}

              {allow('estoque_ordens_manuais') && (
              <button 
                onClick={() => setView('estoque_ordens_manuais')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Ordens Manuais</h3>
                    <p className="text-sm text-zinc-500 mt-1">Entrada e saída manual de insumos — impressão física e impacto na Prev. Futura até lançar no ERP.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Ordens Manuais <ArrowRight className="h-4 w-4" />
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
      const allowStock =
        allow('estoque_itens') ||
        allow('estoque_almoxarifado') ||
        allow('estoque_supermercado') ||
        allow('estoque_pecas') ||
        allow('estoque_movimentacoes');
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
                  Estoque, equipamentos, manutenções e compras
                </p>
              </div>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900">Módulos do Almoxarifado</h2>
              <p className="text-sm text-zinc-500">Selecione a área operacional.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 w-full max-w-5xl">
              {allowStock && (
                <button onClick={() => setView('estoque_almoxarifado')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Warehouse className="h-6 w-6" /></div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900">Estoque</h3>
                      <p className="text-sm text-zinc-500 mt-1">Supermercado, escritório, limpeza, peças e demais consumíveis.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Abrir <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
              {allow('estoque_equipamentos') && (
                <button onClick={() => { setEquipFocusId(null); setView('estoque_equipamentos'); }} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Database className="h-6 w-6" /></div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900">Equipamentos</h3>
                      <p className="text-sm text-zinc-500 mt-1">Máquinas, computadores e demais equipamentos.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Abrir <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
              {allow('estoque_manutencoes') && (
                <button onClick={() => { setManutEquipId(null); setView('estoque_manutencoes'); }} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><ClipboardList className="h-6 w-6" /></div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900">Manutenções</h3>
                      <p className="text-sm text-zinc-500 mt-1">Registro do que foi feito e agenda programada.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Abrir <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
            </div>
            {!allowStock &&
              !allow('estoque_equipamentos') &&
              !allow('estoque_manutencoes') && (
                <p className="text-sm text-zinc-400 text-center py-8">Sem permissão para submódulos.</p>
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

    if (view === 'estoque_equipamentos') {
      return (
        <ErrorBoundary onReset={() => setView('almoxarifado_hub')} fallbackTitle="Erro no parque de equipamentos">
          <EquipamentosView
            onBackToHub={() => {
              setEquipFocusId(null);
              setView('almoxarifado_hub');
            }}
            initialEquipmentId={equipFocusId}
            focusTicket={equipTicket}
            onOpenMaintenance={(id) => {
              setManutEquipId(id);
              setManutTicket((n) => n + 1);
              setView('estoque_manutencoes');
            }}
          />
        </ErrorBoundary>
      );
    }

    if (view === 'estoque_manutencoes') {
      return (
        <ErrorBoundary onReset={() => setView('almoxarifado_hub')} fallbackTitle="Erro em manutenções">
          <AlmoxManutencoesView
            onBackToHub={() => {
              setManutEquipId(null);
              setView('almoxarifado_hub');
            }}
            initialEquipmentId={manutEquipId}
            focusTicket={manutTicket}
            onOpenEquipment={(id) => {
              setEquipFocusId(id);
              setEquipTicket((n) => n + 1);
              setView('estoque_equipamentos');
            }}
          />
        </ErrorBoundary>
      );
    }

    if (
      view === 'estoque_itens' ||
      view === 'estoque_almoxarifado' ||
      view === 'estoque_supermercado' ||
      view === 'estoque_pecas' ||
      view === 'estoque_movimentacoes'
    ) {
      const family =
        view === 'estoque_supermercado'
          ? 'supermercado'
          : view === 'estoque_pecas'
            ? 'pecas'
            : view === 'estoque_movimentacoes'
              ? 'movimentos'
              : '';
      return (
        <ErrorBoundary onReset={() => setView('almoxarifado_hub')} fallbackTitle="Erro no Almoxarifado">
          <AlmoxEstoqueView
            initialFamily={family}
            onBackToHub={() => setView('almoxarifado_hub')}
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

    if (view === 'estoque_ordens_manuais') {
      return (
        <ErrorBoundary onReset={() => setView('estoque_hub')} fallbackTitle="Erro em Ordens Manuais">
          <OrdensManuaisView onBackToHub={() => setView('estoque_hub')} />
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

    if (view === 'admin_relatorios' || view === 'admin_produtos_ativos_relatorios' || view === 'saude_estoque') {
      return (
        <ErrorBoundary onReset={() => setView('administrativo')} fallbackTitle="Erro no módulo de Relatórios">
          <RelatoriosView
            onBackToHub={() => setView('administrativo')}
            setView={setViewByKey}
            initialTab={view === 'admin_produtos_ativos_relatorios' ? 'produtos_ativos' : 'saude_estoque'}
          />
        </ErrorBoundary>
      );
    }

    if (view === 'admin_funcionarios') {
      return (
        <ErrorBoundary onReset={() => setView('administrativo')} fallbackTitle="Erro no módulo de Funcionários">
          <FuncionariosView onBackToHub={() => setView('administrativo')} />
        </ErrorBoundary>
      );
    }

    if (view === 'admin_acompanhamento_producao') {
      return (
        <ErrorBoundary onReset={() => setView('administrativo')} fallbackTitle="Erro no módulo de Acompanhamento de Produção">
          <AcompanhamentoProducaoView onBack={() => setView('administrativo')} />
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
        <ErrorBoundary onReset={() => setView('qualidade_hub')} fallbackTitle="Erro no módulo de Controle de Qualidade">
          <ControleQualidadeView onBackToHub={() => setView('qualidade_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'qualidade_devolucoes') {
      return (
        <ErrorBoundary onReset={() => setView('qualidade_hub')} fallbackTitle="Erro no módulo Devoluções">
          <DevolucoesView onBackToHub={() => setView('qualidade_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'qualidade_avarias') {
      return (
        <ErrorBoundary onReset={() => setView('qualidade_hub')} fallbackTitle="Erro no módulo Avarias">
          <AvariasView onBackToHub={() => setView('qualidade_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'qualidade_pops') {
      return (
        <ErrorBoundary onReset={() => setView('qualidade_hub')} fallbackTitle="Erro no módulo POPs">
          <QualidadePopsView onBackToHub={() => setView('qualidade_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'qualidade_treinamentos') {
      return (
        <ErrorBoundary onReset={() => setView('qualidade_hub')} fallbackTitle="Erro no módulo Treinamentos">
          <QualidadeTreinamentosView onBackToHub={() => setView('qualidade_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'qualidade_temperatura') {
      return (
        <ErrorBoundary onReset={() => setView('qualidade_hub')} fallbackTitle="Erro no módulo Temperatura">
          <QualidadeTemperaturaView onBackToHub={() => setView('qualidade_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'qualidade_limpeza') {
      return (
        <ErrorBoundary onReset={() => setView('qualidade_hub')} fallbackTitle="Erro no módulo Limpeza">
          <QualidadeLimpezaView onBackToHub={() => setView('qualidade_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'qualidade_recebimento_mp') {
      return (
        <ErrorBoundary onReset={() => setView('qualidade_hub')} fallbackTitle="Erro no módulo Recebimento MP">
          <QualidadeRecebimentoMpView
            onBackToHub={() => setView('qualidade_hub')}
            currentUserName={currentUser?.name || currentUser?.username}
          />
        </ErrorBoundary>
      );
    }

    if (view === 'qualidade_documentacao') {
      return (
        <ErrorBoundary onReset={() => setView('qualidade_hub')} fallbackTitle="Erro no módulo Documentação">
          <QualidadeDocumentacaoView onBackToHub={() => setView('qualidade_hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'qualidade_hub') {
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
                <h1 className="font-bold text-lg tracking-tight">Qualidade Hub</h1>
                <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">BPF, POPs e rastreabilidade auditável</p>
              </div>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900">Módulos de Qualidade</h2>
              <p className="text-sm text-zinc-500">Selecione a área de controle e conformidade.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4 w-full max-w-5xl">
              {allow('controle_qualidade') && (
                <button onClick={() => setView('controle_qualidade')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><ClipboardCheck className="h-6 w-6" /></div>
                    <div><h3 className="text-xl font-bold text-zinc-900">Controle de Qualidade</h3><p className="text-sm text-zinc-500 mt-1">Visão geral, laudos e rastreabilidade de lotes.</p></div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
              {allow('qualidade_devolucoes') && (
                <button onClick={() => setView('qualidade_devolucoes')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><PackageX className="h-6 w-6" /></div>
                    <div><h3 className="text-xl font-bold text-zinc-900">Devoluções</h3><p className="text-sm text-zinc-500 mt-1">Recepção, conferência CQ e relançamento no ERP.</p></div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
              {allow('qualidade_avarias') && (
                <button onClick={() => setView('qualidade_avarias')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><AlertTriangle className="h-6 w-6" /></div>
                    <div><h3 className="text-xl font-bold text-zinc-900">Avarias</h3><p className="text-sm text-zinc-500 mt-1">Itens fora do fluxo, foto do lote e destino do CQ.</p></div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
              {allow('qualidade_pops') && (
                <button onClick={() => setView('qualidade_pops')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><BookOpen className="h-6 w-6" /></div>
                    <div><h3 className="text-xl font-bold text-zinc-900">POPs</h3><p className="text-sm text-zinc-500 mt-1">Procedimentos operacionais padrão versionados.</p></div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
              {allow('qualidade_treinamentos') && (
                <button onClick={() => setView('qualidade_treinamentos')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><GraduationCap className="h-6 w-6" /></div>
                    <div><h3 className="text-xl font-bold text-zinc-900">Treinamentos</h3><p className="text-sm text-zinc-500 mt-1">Capacitação e reciclagem BPF.</p></div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
              {allow('qualidade_temperatura') && (
                <button onClick={() => setView('qualidade_temperatura')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Thermometer className="h-6 w-6" /></div>
                    <div><h3 className="text-xl font-bold text-zinc-900">Temperatura</h3><p className="text-sm text-zinc-500 mt-1">Monitoramento de áreas críticas.</p></div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
              {allow('qualidade_limpeza') && (
                <button onClick={() => setView('qualidade_limpeza')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Sparkles className="h-6 w-6" /></div>
                    <div><h3 className="text-xl font-bold text-zinc-900">Limpeza</h3><p className="text-sm text-zinc-500 mt-1">Higienização de áreas e equipamentos.</p></div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
              {allow('qualidade_recebimento_mp') && (
                <button onClick={() => setView('qualidade_recebimento_mp')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><PackageCheck className="h-6 w-6" /></div>
                    <div><h3 className="text-xl font-bold text-zinc-900">Recebimento MP</h3><p className="text-sm text-zinc-500 mt-1">Inspeção de matérias-primas na entrada.</p></div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
              {allow('qualidade_documentacao') && (
                <button onClick={() => setView('qualidade_documentacao')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><FolderOpen className="h-6 w-6" /></div>
                    <div><h3 className="text-xl font-bold text-zinc-900">Documentação</h3><p className="text-sm text-zinc-500 mt-1">Documentos da empresa, validade e pagamentos.</p></div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
            </div>
          </main>
        </div>
      );
    }

    if (view === 'administrativo') {
      return (
        <ErrorBoundary onReset={() => setView('hub')} fallbackTitle="Erro no módulo Administrativo">
          <AdministrativoView onBackToHub={() => setView('hub')} setView={setViewByKey} />
        </ErrorBoundary>
      );
    }

    if (view === 'expedicao_hub') {
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
                <h1 className="font-bold text-lg tracking-tight">Expedição Hub</h1>
                <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Separação, conferência e despacho</p>
              </div>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900">Módulos de Expedição</h2>
              <p className="text-sm text-zinc-500">Selecione o fluxo de expedição.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 w-full max-w-3xl">
              {allow('expedicao_ecommerce') && (
                <button onClick={() => setView('expedicao_ecommerce')} className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full">
                  <div className="space-y-4">
                    <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Globe className="h-6 w-6" /></div>
                    <div><h3 className="text-xl font-bold text-zinc-900">E-commerce</h3><p className="text-sm text-zinc-500 mt-1">Pedidos online, cadastros, separação e envio.</p></div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar E-commerce <ArrowRight className="h-4 w-4" /></div>
                </button>
              )}
            </div>
          </main>
        </div>
      );
    }

    if (view === 'expedicao_ecommerce' || view === 'expedicao') {
      return (
        <ErrorBoundary onReset={() => setView('expedicao_hub')} fallbackTitle="Erro no módulo de Expedição E-commerce">
          <ExpedicaoView onBackToHub={() => setView('expedicao_hub')} />
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

    if (view === 'ferramentas_etiquetas') {
      return (
        <ErrorBoundary onReset={() => setView('hub')} fallbackTitle="Erro no módulo de Etiquetas">
          <EtiquetasView
            onBackToHub={() => setView('hub')}
            onNavigateToEditor={(tpl) => {
              if (tpl) (window as any).__initial_editor_template__ = tpl;
              setView('ferramentas_editor');
            }}
          />
        </ErrorBoundary>
      );
    }

    if (view === 'ferramentas_editor') {
      const initTpl = (window as any).__initial_editor_template__;
      return (
        <ErrorBoundary onReset={() => setView('ferramentas_etiquetas')} fallbackTitle="Erro no Editor de Etiquetas">
          <EditorEtiquetasView
            onBackToHub={() => setView('ferramentas_etiquetas')}
            initialTemplate={initTpl}
          />
        </ErrorBoundary>
      );
    }

    if (view === 'ferramentas_impressoras') {
      return (
        <ErrorBoundary onReset={() => setView('hub')} fallbackTitle="Erro na Central de Impressoras">
          <ImpressorasView onBackToHub={() => setView('hub')} />
        </ErrorBoundary>
      );
    }

    if (view === 'ferramentas_balanca') {
      return (
        <ErrorBoundary onReset={() => setView('hub')} fallbackTitle="Erro na Carga da Balança">
          <BalancaView onBackToHub={() => setView('hub')} />
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
          setView={setViewByKey}
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
          setView={setViewByKey}
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

    if (view === 'desenvolvimento' || view === 'mapa_arquitetura' || view === 'hub_feedbacks') {
      return (
        <ErrorBoundary onReset={() => setView('hub')} fallbackTitle="Erro em Desenvolvimento">
          <DesenvolvimentoView
            currentUser={currentUser}
            onBackToHub={() => setView('hub')}
            onNavigateToView={(v) => setView(v as any)}
          />
        </ErrorBoundary>
      );
    }

    return (
      <DashboardView
        view={view}
        setView={setViewByKey}
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
            setView={setViewByKey}
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
      <FeedbackWidget
        currentView={view}
        visible={!!currentUser}
        currentUser={currentUser}
        setView={setViewByKey}
      />
    </div>
  );
}
