import React, { useState, useEffect, useCallback } from 'react';
import {
  Database, RefreshCw, Loader2, Check, AlertCircle, Clock, ShieldAlert,
  Boxes, Sparkles, Layers, Truck, Users, FlaskConical, FileText, CheckCircle2,
  Calendar, ArrowRight, ExternalLink
} from 'lucide-react';
import { apiJson, apiFetch, getSetting, setSetting } from '../lib/http';
import { cn } from '../lib/utils';

export interface ImportacoesServidorPanelProps {
  sqlHost: string;
  setSqlHost: (v: string) => void;
  sqlPort: string;
  setSqlPort: (v: string) => void;
  sqlUser: string;
  setSqlUser: (v: string) => void;
  sqlPassword: string;
  setSqlPassword: (v: string) => void;
  sqlDatabase: string;
  setSqlDatabase: (v: string) => void;
  handleSaveSqlConfig: () => void;
  savingSql: boolean;
  handleSyncSqlDatabase: (mode?: 'incremental' | 'full') => void;
  syncingSql: boolean;
  message: { text: string; type: 'success' | 'error' } | null;
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}

interface ImportRecord {
  id: number;
  tipo: string;
  nome_arquivo: string;
  importado_em: string;
  registros: number;
  status: string;
  mensagem: string | null;
}

interface SyncLockStatus {
  running?: boolean;
  ageSeconds?: number;
  status?: string | null;
}

interface EntityDoc {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  script: string;
  description: string;
  fields: string[];
  purpose: string;
}

const ENTITIES_MAPPING: EntityDoc[] = [
  {
    id: 'insumos',
    name: 'Insumos & Almoxarifado',
    icon: Boxes,
    script: 'D1-estoque-insumos.sql',
    description: 'Matérias-primas químicas, fragrâncias, essências e embalagens primárias/secundárias.',
    fields: ['Código Insumo', 'Descrição', 'Saldo Físico', 'Custo Médio', 'Unidade (KG/UN)', 'Localização'],
    purpose: 'Alimenta o Simulador de Compras MRP, ordens de pesagem e conferência de lote.',
  },
  {
    id: 'produtos',
    name: 'Produtos Acabados',
    icon: Layers,
    script: 'D7-vendas.sql',
    description: 'Catálogo de SKUs cosméticos da Nátum, categorias de produtos e códigos de barras.',
    fields: ['Código Produto', 'Nome Comercial', 'Linha / Subfamília', 'Volume / Peso', 'EAN'],
    purpose: 'Base para o painel de produção, sugestões de fabricação e inventário expedido.',
  },
  {
    id: 'formulas',
    name: 'Fórmulas & Bateladas',
    icon: FlaskConical,
    script: 'D4-formulas.sql',
    description: 'Composições das fórmulas cosméticas (% de cada insumo) e sequência de reatores.',
    fields: ['Código Produto', 'Código Insumo', 'Percentual Batelada (%)', 'Ordem de Adição'],
    purpose: 'Cálculo de explosão de materiais MRP e cálculo de graduação de reatores.',
  },
  {
    id: 'fornecedores',
    name: 'Fornecedores & Compras',
    icon: Truck,
    script: 'D3-fornecedores.sql / D6-compras.sql',
    description: 'Cadastro de fornecedores homologados, notas de compra e pedidos de insumo em aberto.',
    fields: ['CNPJ / Razão Social', 'Nota Fiscal', 'Data Pedido', 'Previsão Entrega', 'Qtd Comprada'],
    purpose: 'Permite ao MRP abater pedidos em trânsito antes de gerar sugestão de compra.',
  },
  {
    id: 'vendas',
    name: 'Clientes, Vendas & Pedidos',
    icon: Users,
    script: 'D2-clientes.sql / D7-vendas.sql',
    description: 'Carteira de distribuidores, pedidos de venda faturados e pedidos pendentes na fábrica.',
    fields: ['Cliente', 'Nº Pedido Venda', 'Data Emissão', 'Itens Solicitados', 'Status Faturamento'],
    purpose: 'Calcula o consumo médio diário para prever dias de estoque restante (burn rate).',
  },
  {
    id: 'movimentacoes',
    name: 'Movimentações de Estoque',
    icon: RefreshCw,
    script: 'D5-movimentacoes.sql',
    description: 'Histórico completo de entradas por NF, saídas por produção e ajustes manuais.',
    fields: ['Data Movimento', 'Tipo (E/S)', 'Quantidade', 'Documento', 'Saldo Resultante'],
    purpose: 'Rastreabilidade total e auditoria de divergência entre Nexus e ERP.',
  },
];

export default function ImportacoesServidorPanel({
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
  setMessage,
}: ImportacoesServidorPanelProps) {
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [syncLock, setSyncLock] = useState<SyncLockStatus | null>(null);
  const [releasingLock, setReleasingLock] = useState(false);

  // Janelas configuráveis
  const [historyFloor, setHistoryFloor] = useState<string>('2024-01-01');
  const [savingFloor, setSavingFloor] = useState(false);
  const [salesDays, setSalesDays] = useState<number>(90);
  const [savingSalesDays, setSavingSalesDays] = useState(false);

  // Carrega histórico de importações
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const records = await apiJson<ImportRecord[]>('/import/history');
      if (Array.isArray(records)) {
        setHistory(records);
      }
    } catch {
      // Ignora erro se rota não responder
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Monitora lock de sync
  useEffect(() => {
    let cancelled = false;
    const fetchLock = async () => {
      try {
        const lock = await apiJson<SyncLockStatus>('/import/sync-lock');
        if (!cancelled && lock) {
          setSyncLock(lock);
        }
      } catch {
        /* ignore */
      }
    };

    void fetchLock();
    void loadHistory();

    // Carrega settings iniciais
    (async () => {
      try {
        const [floor, days] = await Promise.all([
          getSetting('erp_sync_history_floor'),
          getSetting('sales_faltas_days_limit'),
        ]);
        if (!cancelled) {
          if (floor) setHistoryFloor(floor);
          if (days) setSalesDays(Number(days) || 90);
        }
      } catch {
        /* ignore */
      }
    })();

    const interval = setInterval(fetchLock, 6000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loadHistory]);

  const handleSaveFloor = async () => {
    setSavingFloor(true);
    try {
      await setSetting('erp_sync_history_floor', historyFloor);
      setMessage({
        text: historyFloor === 'all'
          ? 'Janela de sync: histórico completo selecionado.'
          : `Janela de sync definida para dados desde ${historyFloor}.`,
        type: 'success',
      });
    } catch (e: unknown) {
      setMessage({ text: e instanceof Error ? e.message : 'Erro ao salvar janela', type: 'error' });
    } finally {
      setSavingFloor(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleSaveSalesDays = async () => {
    setSavingSalesDays(true);
    try {
      await setSetting('sales_faltas_days_limit', String(salesDays));
      setMessage({
        text: salesDays > 0 ? `Janela de pedidos: últimos ${salesDays} dias.` : 'Janela de pedidos: todo o histórico.',
        type: 'success',
      });
    } catch (e: unknown) {
      setMessage({ text: e instanceof Error ? e.message : 'Erro ao salvar janela de vendas', type: 'error' });
    } finally {
      setSavingSalesDays(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleReleaseLock = async () => {
    if (!confirm('Liberar o lock só se o sync travou de verdade. Deseja forçar a liberação?')) return;
    setReleasingLock(true);
    try {
      await apiJson('/import/sync-lock/release', { method: 'POST' });
      setMessage({ text: 'Lock liberado com sucesso. Sincronização pronta para novo disparo.', type: 'success' });
      setSyncLock({ running: false, ageSeconds: 0, status: null });
    } catch (e: unknown) {
      setMessage({ text: e instanceof Error ? e.message : 'Erro ao liberar lock', type: 'error' });
    } finally {
      setReleasingLock(false);
      setTimeout(() => setMessage(null), 4500);
    }
  };

  return (
    <div className="space-y-6">
      {/* Card 1: Status de Sincronização & Controles Rápidos */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-zinc-100 text-zinc-900 rounded-xl border border-zinc-200">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-black text-sm tracking-tight text-zinc-900">
                Sincronização com o Servidor Original (SQL Server NATUM)
              </h3>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                Integração Direta ERP → PostgreSQL do Nexus
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSyncSqlDatabase('incremental')}
              disabled={syncingSql || (syncLock?.running ?? false)}
              className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border border-zinc-200 rounded-xl text-xs font-bold transition-all shadow-2xs disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              title="Importa apenas os registros alterados desde a última sincronização"
            >
              {syncingSql ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span>Sync Incremental (Delta)</span>
            </button>

            <button
              type="button"
              onClick={() => handleSyncSqlDatabase('full')}
              disabled={syncingSql || (syncLock?.running ?? false)}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-all shadow-2xs disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              title="Reprocessa todo o período configurado na janela histórica"
            >
              {syncingSql ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span>Sync Completo</span>
            </button>
          </div>
        </div>

        {/* Lock ativo em andamento */}
        {(syncingSql || syncLock?.running) && (
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 flex items-start justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <Loader2 className="h-5 w-5 text-amber-700 animate-spin shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-extrabold text-amber-950">
                  Sincronização de dados em andamento
                  {typeof syncLock?.ageSeconds === 'number' && syncLock.ageSeconds > 0
                    ? ` (em execução há ${Math.floor(syncLock.ageSeconds / 60)}m ${syncLock.ageSeconds % 60}s)`
                    : ''}
                </p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Os dados de estoque, produtos, faturamento e pedidos de compra estão sendo reconciliados com o SQL Server original.
                </p>
              </div>
            </div>

            {syncLock?.running && !syncingSql && (
              <button
                type="button"
                onClick={handleReleaseLock}
                disabled={releasingLock}
                className="text-xs font-bold text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg shrink-0 cursor-pointer disabled:opacity-50"
              >
                {releasingLock ? 'Liberando...' : 'Liberar Lock'}
              </button>
            )}
          </div>
        )}

        {/* Credenciais e Parâmetros da Conexão */}
        <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-800">Parâmetros de Conexão com o Servidor Original</span>
            <span className="text-[10px] font-mono font-semibold text-zinc-500">TDS 7.3 · SQL Server Natum</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-left">
            <div className="sm:col-span-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                IP / Host Servidor PC Qualidade
              </label>
              <input
                type="text"
                value={sqlHost}
                onChange={(e) => setSqlHost(e.target.value)}
                placeholder="100.120.161.52 ou 127.0.0.1"
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                Porta
              </label>
              <input
                type="text"
                value={sqlPort}
                onChange={(e) => setSqlPort(e.target.value)}
                placeholder="1433"
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                Database
              </label>
              <input
                type="text"
                value={sqlDatabase}
                onChange={(e) => setSqlDatabase(e.target.value)}
                placeholder="NATUM"
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono font-bold"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                Usuário SQL
              </label>
              <input
                type="text"
                value={sqlUser}
                onChange={(e) => setSqlUser(e.target.value)}
                placeholder="sa"
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                Senha
              </label>
              <input
                type="password"
                value={sqlPassword}
                onChange={(e) => setSqlPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>

            <div className="sm:col-span-2 flex items-end">
              <button
                type="button"
                onClick={handleSaveSqlConfig}
                disabled={savingSql}
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {savingSql ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Salvar Credenciais do Servidor
              </button>
            </div>
          </div>
        </div>

        {/* Janelas Temporais de Dados */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-800">Janela de Pedidos de Venda</label>
              <span className="text-[10px] text-zinc-400 font-bold uppercase">Produção & MRP</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-snug">
              Limita os pedidos em aberto para não inflar o cálculo de estoque com pedidos esquecidos de anos anteriores.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <select
                value={salesDays}
                onChange={(e) => setSalesDays(Number(e.target.value))}
                className="flex-1 border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white text-zinc-800 font-semibold focus:outline-none focus:ring-1 focus:ring-zinc-900"
              >
                <option value={30}>Últimos 30 dias</option>
                <option value={60}>Últimos 60 dias</option>
                <option value={90}>Últimos 90 dias (Recomendado)</option>
                <option value={180}>Últimos 180 dias</option>
                <option value={365}>Últimos 365 dias (1 ano)</option>
                <option value={0}>Sem limite (todo o histórico)</option>
              </select>
              <button
                type="button"
                onClick={handleSaveSalesDays}
                disabled={savingSalesDays}
                className="px-3.5 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 transition-colors"
              >
                {savingSalesDays ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-800">Janela Histórica do Sync Completo</label>
              <span className="text-[10px] text-zinc-400 font-bold uppercase">Reprocessamento</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-snug">
              Define a data de corte inicial para reprocessar movimentações, NFs e pedidos durante o sync completo.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <select
                value={historyFloor}
                onChange={(e) => setHistoryFloor(e.target.value)}
                className="flex-1 border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white text-zinc-800 font-semibold focus:outline-none focus:ring-1 focus:ring-zinc-900"
              >
                <option value="2024-01-01">Desde 01/01/2024 (Rápido e atual)</option>
                <option value="2020-01-01">Desde 01/01/2020 (Médio)</option>
                <option value="2015-01-01">Desde 01/01/2015</option>
                <option value="all">Histórico Completo (Todo o ERP)</option>
              </select>
              <button
                type="button"
                onClick={handleSaveFloor}
                disabled={savingFloor}
                className="px-3.5 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 transition-colors"
              >
                {savingFloor ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Catálogo de Entidades Importadas (Documentação Visual) */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="border-b border-zinc-200 pb-3">
          <h3 className="font-black text-sm tracking-tight text-zinc-900">
            Catálogo de Entidades Importadas do Servidor Original
          </h3>
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
            Documentação técnica das tabelas e scripts de migração do ERP
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {ENTITIES_MAPPING.map((ent) => {
            const Icon = ent.icon;
            return (
              <div
                key={ent.id}
                className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 hover:bg-white hover:border-zinc-300 transition-all space-y-2.5 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-zinc-900 text-white">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-extrabold text-zinc-900">{ent.name}</span>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-zinc-500 bg-zinc-200/70 px-2 py-0.5 rounded-md">
                    {ent.script}
                  </span>
                </div>

                <p className="text-[11px] text-zinc-600 leading-relaxed">{ent.description}</p>

                <div className="space-y-1 pt-1 border-t border-zinc-100">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block">
                    Campos Importados:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {ent.fields.map((f, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-semibold text-zinc-700 bg-white border border-zinc-200 px-2 py-0.5 rounded-md"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] text-zinc-700 font-medium bg-zinc-100 p-2 rounded-lg leading-snug border border-zinc-200">
                  🎯 <strong>Uso:</strong> {ent.purpose}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Card 3: Histórico de Importações Realizadas */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-zinc-500" />
            <h3 className="font-black text-sm tracking-tight text-zinc-900">
              Histórico de Importações e Sincronizações
            </h3>
          </div>

          <button
            type="button"
            onClick={loadHistory}
            disabled={loadingHistory}
            className="text-xs font-bold text-zinc-600 hover:text-zinc-900 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 cursor-pointer disabled:opacity-50"
          >
            {loadingHistory ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            <span>Atualizar Histórico</span>
          </button>
        </div>

        {loadingHistory && history.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-zinc-400 gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs font-semibold">Carregando histórico de importações...</span>
          </div>
        ) : history.length === 0 ? (
          <div className="py-8 text-center text-zinc-400 text-xs">
            Nenhuma importação registrada até o momento no banco local.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-400 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Data / Hora</th>
                  <th className="py-2.5 px-3">Tipo / Origem</th>
                  <th className="py-2.5 px-3">Arquivo / Rota</th>
                  <th className="py-2.5 px-3 text-right">Registros</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Mensagem / Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {history.map((row) => {
                  const isSuccess = row.status === 'success';
                  const isWarn = row.status === 'warning';
                  const dateStr = row.importado_em
                    ? new Date(row.importado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                    : '—';

                  return (
                    <tr key={row.id} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-zinc-600 font-bold whitespace-nowrap">
                        {dateStr}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-zinc-800 capitalize">
                        {row.tipo}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-500 max-w-[200px] truncate" title={row.nome_arquivo}>
                        {row.nome_arquivo}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-900">
                        {row.registros?.toLocaleString('pt-BR') ?? '0'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide',
                            isSuccess
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : isWarn
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          )}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-zinc-600 text-[11px] max-w-sm truncate" title={row.mensagem || ''}>
                        {row.mensagem || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
