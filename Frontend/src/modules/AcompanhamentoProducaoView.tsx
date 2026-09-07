import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeft, Search, RefreshCw, Calendar as CalendarIcon, Table, 
  Lock, CheckCircle2, AlertTriangle, Download, ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn, API_BASE, apiFetch } from '../lib/utils';

// Interface do lote vindo do backend
export interface AcompanhamentoLote {
  loteNumber: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  date: string;
  erpStatus: string;
  erpStatusLabel: string;
  customStatus?: string | null;
  category?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
  notes?: string | null;
}

// Categorias e Status Nosso
export const STATUS_CATEGORIES = {
  PESAGEM_PRODUCAO: {
    name: 'Pesagem e Produção',
    statuses: ['Pesagem', 'Produção'],
  },
  EMBALAGEM: {
    name: 'Embalagem',
    statuses: ['Rotulagem', 'Envase', 'Finalizada'],
  },
};

// Cores e Badges para o Status Nosso
export function getCustomStatusStyle(status?: string | null) {
  const s = (status || '').trim().toLowerCase();
  switch (s) {
    case 'pesagem':
      return {
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-semibold',
        dotClass: 'bg-amber-500',
        label: 'Pesagem',
        category: 'Pesagem e Produção',
      };
    case 'produção':
    case 'producao':
      return {
        badgeClass: 'bg-blue-100 text-blue-900 border-blue-300 font-semibold',
        dotClass: 'bg-blue-500',
        label: 'Produção',
        category: 'Pesagem e Produção',
      };
    case 'envase':
      return {
        badgeClass: 'bg-purple-100 text-purple-900 border-purple-300 font-semibold',
        dotClass: 'bg-purple-500',
        label: 'Envase',
        category: 'Embalagem',
      };
    case 'rotulagem':
      return {
        badgeClass: 'bg-cyan-100 text-cyan-900 border-cyan-300 font-semibold',
        dotClass: 'bg-cyan-500',
        label: 'Rotulagem',
        category: 'Embalagem',
      };
    case 'finalizada':
    case 'finalizado':
      return {
        badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-semibold',
        dotClass: 'bg-emerald-500',
        label: 'Finalizada',
        category: 'Embalagem',
      };
    default:
      return {
        badgeClass: 'bg-zinc-100 text-zinc-600 border-zinc-200',
        dotClass: 'bg-zinc-400',
        label: 'Aguardando',
        category: 'Sem Categoria',
      };
  }
}

// Cores e Badges para o Status do ERP
export function getErpStatusBadge(code?: string | null, label?: string | null) {
  const c = (code || '').toUpperCase().trim();
  switch (c) {
    case 'EA':
      return {
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        label: label || 'Estoque Atualizado (EA)',
      };
    case 'CF':
      return {
        badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
        label: label || 'Conferido (CF)',
      };
    case 'PR':
      return {
        badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
        label: label || 'Em Produção (PR)',
      };
    case 'PG':
      return {
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        label: label || 'Em Pesagem (PG)',
      };
    case 'PP':
      return {
        badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        label: label || 'Pré-Produção (PP)',
      };
    case 'EN':
      return {
        badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
        label: label || 'Em Envase (EN)',
      };
    case 'FP':
      return {
        badgeClass: 'bg-green-50 text-green-800 border-green-200',
        label: label || 'Finalizado (FP)',
      };
    case 'CA':
      return {
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
        label: label || 'Cancelado (CA)',
      };
    default:
      return {
        badgeClass: 'bg-zinc-100 text-zinc-700 border-zinc-200',
        label: label || code || 'Sem Status',
      };
  }
}

interface AcompanhamentoProducaoViewProps {
  onBack: () => void;
}

export default function AcompanhamentoProducaoView({ onBack }: AcompanhamentoProducaoViewProps) {
  // Tabs
  const [activeTab, setActiveTab] = useState<'planilha' | 'calendario'>('planilha');

  // Dados
  const [lotes, setLotes] = useState<AcompanhamentoLote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Permissão / Autenticação de Edição
  const [isAuthorized, setIsAuthorized] = useState<boolean>(() => {
    return sessionStorage.getItem('natum_producao_auth') === 'true';
  });
  const [authUserName, setAuthUserName] = useState<string>(() => {
    return sessionStorage.getItem('natum_producao_user') || 'Supervisor';
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [nameInput, setNameInput] = useState(authUserName);
  const [authError, setAuthError] = useState('');

  // Filtros Planilha
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'Pesagem e Produção' | 'Embalagem' | 'SEM_STATUS'>('ALL');
  const [statusNossoFilter, setStatusNossoFilter] = useState<string>('ALL');
  const [erpStatusFilter, setErpStatusFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<'TODOS' | 'ESTE_MES' | 'ULTIMOS_30' | 'ULTIMOS_90'>('ESTE_MES');

  // Ordenação
  const [sortField, setSortField] = useState<'loteNumber' | 'productDescription' | 'quantity' | 'date' | 'erpStatus' | 'customStatus'>('date');
  const [sortAsc, setSortAsc] = useState(false);

  // Paginação
  const [rowsPerPage, setRowsPerPage] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Calendário
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [selectedDayLotes, setSelectedDayLotes] = useState<{ date: string; lotes: AcompanhamentoLote[] } | null>(null);

  // Status saving state
  const [savingStatus, setSavingStatus] = useState<string | null>(null);

  // Toast / feedback message
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Carregar dados da API
  const fetchLotes = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await apiFetch(`${API_BASE}/administrativo/acompanhamento-producao`);
      if (res.ok) {
        const data: AcompanhamentoLote[] = await res.json();
        setLotes(data || []);
      } else {
        showToast('Erro ao carregar lotes de acompanhamento', 'error');
      }
    } catch (e) {
      console.error('Erro ao conectar na API:', e);
      showToast('Falha na comunicação com o servidor local', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLotes();
    (window as any).__current_page__ = 'Administrativo > Acompanhamento de Produção';
  }, [fetchLotes]);

  // Handler de login/permissão
  const handleAuthorize = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pinInput === '1234' || pinInput === 'admin') {
      const user = nameInput.trim() || 'Supervisor';
      setIsAuthorized(true);
      setAuthUserName(user);
      sessionStorage.setItem('natum_producao_auth', 'true');
      sessionStorage.setItem('natum_producao_user', user);
      setShowAuthModal(false);
      setPinInput('');
      setAuthError('');
      showToast(`Permissão de edição concedida para: ${user}`);
    } else {
      setAuthError('PIN incorreto. Use o PIN de supervisor (Padrão: 1234).');
    }
  };

  const handleRevokeAuth = () => {
    setIsAuthorized(false);
    sessionStorage.removeItem('natum_producao_auth');
    showToast('Modo de edição bloqueado.');
  };

  // Atualizar Status Nosso de um lote
  const handleUpdateStatus = async (
    loteNumber: string,
    newStatus: string,
    category?: string,
    notes?: string
  ) => {
    if (!isAuthorized) {
      setShowAuthModal(true);
      return;
    }

    setSavingStatus(loteNumber);
    try {
      const payload = {
        loteNumber,
        customStatus: newStatus,
        category,
        updatedBy: authUserName,
        notes,
      };

      const res = await apiFetch(`${API_BASE}/administrativo/lote-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const result = await res.json();
        setLotes(prev =>
          prev.map(item => {
            if (item.loteNumber === loteNumber) {
              return {
                ...item,
                customStatus: newStatus,
                category: result.category || category,
                updatedBy: authUserName,
                updatedAt: result.updatedAt,
                notes: notes !== undefined ? notes : item.notes,
              };
            }
            return item;
          })
        );

        if (selectedDayLotes) {
          setSelectedDayLotes(prev => {
            if (!prev) return null;
            return {
              ...prev,
              lotes: prev.lotes.map(item => {
                if (item.loteNumber === loteNumber) {
                  return {
                    ...item,
                    customStatus: newStatus,
                    category: result.category || category,
                    updatedBy: authUserName,
                    updatedAt: result.updatedAt,
                    notes: notes !== undefined ? notes : item.notes,
                  };
                }
                return item;
              }),
            };
          });
        }

        showToast(`Lote #${loteNumber} atualizado para "${newStatus}"!`);
      } else {
        showToast('Erro ao salvar novo status no banco de dados', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Falha ao comunicar com o servidor', 'error');
    } finally {
      setSavingStatus(null);
    }
  };

  // Limpar/Remover status customizado
  const handleClearStatus = async (loteNumber: string) => {
    if (!isAuthorized) {
      setShowAuthModal(true);
      return;
    }

    setSavingStatus(loteNumber);
    try {
      const res = await apiFetch(`${API_BASE}/administrativo/lote-status/${loteNumber}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setLotes(prev =>
          prev.map(item => {
            if (item.loteNumber === loteNumber) {
              return {
                ...item,
                customStatus: null,
                category: null,
                updatedBy: null,
                updatedAt: null,
              };
            }
            return item;
          })
        );
        showToast(`Status do lote #${loteNumber} limpo.`);
      }
    } catch (e) {
      console.error(e);
      showToast('Erro ao limpar status', 'error');
    } finally {
      setSavingStatus(null);
    }
  };

  // Filtragem dos lotes
  const filteredLotes = useMemo(() => {
    const now = new Date();

    return lotes.filter(item => {
      const query = searchTerm.toLowerCase().trim();
      if (query) {
        const matchesQuery =
          (item.loteNumber || '').toLowerCase().includes(query) ||
          (item.productCode || '').toLowerCase().includes(query) ||
          (item.productDescription || '').toLowerCase().includes(query) ||
          (item.updatedBy || '').toLowerCase().includes(query);
        if (!matchesQuery) return false;
      }

      if (categoryFilter !== 'ALL') {
        if (categoryFilter === 'SEM_STATUS') {
          if (item.customStatus && item.customStatus.trim() !== '') return false;
        } else {
          const style = getCustomStatusStyle(item.customStatus);
          if (style.category !== categoryFilter) return false;
        }
      }

      if (statusNossoFilter !== 'ALL') {
        if (statusNossoFilter === 'SEM_STATUS') {
          if (item.customStatus && item.customStatus.trim() !== '') return false;
        } else {
          if ((item.customStatus || '').toLowerCase() !== statusNossoFilter.toLowerCase()) return false;
        }
      }

      if (erpStatusFilter !== 'ALL') {
        if ((item.erpStatus || '').toUpperCase() !== erpStatusFilter.toUpperCase()) return false;
      }

      if (dateFilter !== 'TODOS' && item.date) {
        const itemDate = new Date(item.date);
        if (!isNaN(itemDate.getTime())) {
          if (dateFilter === 'ESTE_MES') {
            if (
              itemDate.getFullYear() !== now.getFullYear() ||
              itemDate.getMonth() !== now.getMonth()
            ) {
              return false;
            }
          } else if (dateFilter === 'ULTIMOS_30') {
            const diffDays = (now.getTime() - itemDate.getTime()) / (1000 * 3600 * 24);
            if (diffDays > 30 || diffDays < -1) return false;
          } else if (dateFilter === 'ULTIMOS_90') {
            const diffDays = (now.getTime() - itemDate.getTime()) / (1000 * 3600 * 24);
            if (diffDays > 90 || diffDays < -1) return false;
          }
        }
      }

      return true;
    });
  }, [lotes, searchTerm, categoryFilter, statusNossoFilter, erpStatusFilter, dateFilter]);

  // Ordenação
  const sortedLotes = useMemo(() => {
    return [...filteredLotes].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'quantity') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else if (sortField === 'date') {
        valA = valA ? new Date(valA).getTime() : 0;
        valB = valB ? new Date(valB).getTime() : 0;
      } else {
        valA = (valA || '').toString().toLowerCase();
        valB = (valB || '').toString().toLowerCase();
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [filteredLotes, sortField, sortAsc]);

  // Paginação
  const totalPages = Math.ceil(sortedLotes.length / rowsPerPage) || 1;
  const paginatedLotes = useMemo(() => {
    if (rowsPerPage === -1) return sortedLotes;
    const start = (currentPage - 1) * rowsPerPage;
    return sortedLotes.slice(start, start + rowsPerPage);
  }, [sortedLotes, currentPage, rowsPerPage]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // KPIs
  const stats = useMemo(() => {
    let pesagem = 0;
    let producao = 0;
    let envase = 0;
    let rotulagem = 0;
    let finalizada = 0;
    let aguardando = 0;

    lotes.forEach(l => {
      const st = (l.customStatus || '').toLowerCase();
      if (st === 'pesagem') pesagem++;
      else if (st === 'produção' || st === 'producao') producao++;
      else if (st === 'envase') envase++;
      else if (st === 'rotulagem') rotulagem++;
      else if (st === 'finalizada' || st === 'finalizado') finalizada++;
      else aguardando++;
    });

    return {
      total: lotes.length,
      pesagemProducao: pesagem + producao,
      embalagem: envase + rotulagem + finalizada,
      pesagem,
      producao,
      envase,
      rotulagem,
      finalizada,
      aguardando,
    };
  }, [lotes]);

  // Exportar para Excel (.xlsx)
  const handleExportExcel = () => {
    if (sortedLotes.length === 0) {
      showToast('Não há lotes para exportar', 'error');
      return;
    }

    const dataToExport = sortedLotes.map(item => ({
      'Nº do Lote': item.loteNumber,
      'Código do Produto': item.productCode,
      'Descrição': item.productDescription,
      'Quantidade': item.quantity,
      'Data do Lote': item.date ? item.date.split('T')[0] : '',
      'Status do ERP': item.erpStatus,
      'Status ERP (Descrição)': item.erpStatusLabel,
      'Status Nosso': item.customStatus || 'Aguardando',
      'Categoria': item.category || 'Sem Categoria',
      'Responsável Atualização': item.updatedBy || '',
      'Última Atualização': item.updatedAt || '',
      'Observações': item.notes || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Acompanhamento');

    const fileName = `Acompanhamento_Producao_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    showToast('Planilha exportada com sucesso!');
  };

  const formatDateDisplay = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    try {
      const parts = dateStr.split(' ')[0].split('T')[0].split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const formatQtyDisplay = (val: number) => {
    return Number(val || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  };

  // ================= CALENDÁRIO =================
  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const lotesByDate: { [key: string]: AcompanhamentoLote[] } = {};
    lotes.forEach(l => {
      if (l.date) {
        const dateKey = l.date.split('T')[0].split(' ')[0];
        if (!lotesByDate[dateKey]) lotesByDate[dateKey] = [];
        lotesByDate[dateKey].push(l);
      }
    });

    const days = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ dayNumber: null, dateKey: null, isCurrentMonth: false, lotes: [] });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(d).padStart(2, '0');
      const dateKey = `${year}-${monthStr}-${dayStr}`;
      const dayLotes = lotesByDate[dateKey] || [];
      days.push({
        dayNumber: d,
        dateKey,
        isCurrentMonth: true,
        lotes: dayLotes,
      });
    }

    return days;
  }, [calendarDate, lotes]);

  const changeMonth = (offset: number) => {
    setCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const goToToday = () => {
    setCalendarDate(new Date());
  };

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 flex flex-col justify-between">
      {/* HEADER SUPERIOR */}
      <header className="bg-white border-b border-zinc-200 px-6 py-3 shrink-0 flex items-center justify-between shadow-xs sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="bg-white border border-zinc-200 hover:bg-zinc-100 p-2 rounded-xl text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer shadow-xs"
            title="Voltar ao Administrativo"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-base tracking-tight text-zinc-900">
                Acompanhamento de Produção
              </h1>
              <span className="text-[10px] bg-zinc-900 text-white font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Administrativo
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 font-medium">
              Controle de status de lotes, calendário industrial e integração com ERP
            </p>
          </div>
        </div>

        {/* CONTROLES DO TOPO: TABS + PERMISSÃO + EXPORTAR */}
        <div className="flex items-center gap-3">
          {/* Seletor de Abas */}
          <div className="flex items-center bg-zinc-100 p-1 rounded-xl border border-zinc-200">
            <button
              onClick={() => setActiveTab('planilha')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
                activeTab === 'planilha'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              )}
            >
              <Table className="h-3.5 w-3.5" />
              Status de Lotes (Planilha)
            </button>
            <button
              onClick={() => setActiveTab('calendario')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
                activeTab === 'calendario'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              Calendário
            </button>
          </div>

          <div className="h-6 w-px bg-zinc-200 mx-1" />

          {/* Botão de Permissão / Autenticação */}
          {isAuthorized ? (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-900 px-3 py-1.5 rounded-xl text-xs font-medium">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                Editando como: <strong>{authUserName}</strong>
              </span>
              <button
                onClick={handleRevokeAuth}
                className="text-emerald-700 hover:text-emerald-950 ml-1 underline text-[11px] cursor-pointer"
                title="Bloquear modo de edição"
              >
                Bloquear
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-300 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
              title="Autenticar como supervisor para permitir alterações de status"
            >
              <Lock className="h-3.5 w-3.5 text-zinc-500" />
              Habilitar Edição
            </button>
          )}

          {/* Botão Exportar Excel */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
            title="Baixar planilha Excel (.xlsx)"
          >
            <Download className="h-3.5 w-3.5 text-zinc-500" />
            Excel
          </button>

          {/* Botão Recarregar */}
          <button
            onClick={() => fetchLotes(true)}
            disabled={refreshing || loading}
            className="bg-white hover:bg-zinc-50 border border-zinc-200 p-2 rounded-xl text-zinc-600 hover:text-zinc-900 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Recarregar dados"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </button>
        </div>
      </header>

      {/* TOAST FLUTUANTE */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
          <div
            className={cn(
              'px-4 py-2.5 rounded-xl border text-xs font-bold shadow-lg flex items-center gap-2',
              toastMessage.type === 'success'
                ? 'bg-emerald-950 text-emerald-100 border-emerald-800'
                : 'bg-rose-950 text-rose-100 border-rose-800'
            )}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            )}
            {toastMessage.text}
          </div>
        </div>
      )}

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* CARDS DE RESUMO (KPIS) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Total */}
          <div className="bg-white border border-zinc-200 p-3.5 rounded-2xl shadow-xs">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
              Total de Lotes
            </span>
            <div className="text-xl font-extrabold text-zinc-900 mt-1">
              {stats.total.toLocaleString('pt-BR')}
            </div>
            <span className="text-[10px] text-zinc-500 font-medium">Cadastrados no sistema</span>
          </div>

          {/* Pesagem */}
          <div 
            onClick={() => setStatusNossoFilter(statusNossoFilter === 'Pesagem' ? 'ALL' : 'Pesagem')}
            className={cn(
              "bg-white border p-3.5 rounded-2xl shadow-xs cursor-pointer transition-all hover:border-amber-400",
              statusNossoFilter === 'Pesagem' ? 'border-amber-500 ring-2 ring-amber-100' : 'border-zinc-200'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                Pesagem
              </span>
              <span className="h-2 w-2 rounded-full bg-amber-500" />
            </div>
            <div className="text-xl font-extrabold text-amber-900 mt-1">
              {stats.pesagem}
            </div>
            <span className="text-[10px] text-zinc-500 font-medium">Etapa inicial</span>
          </div>

          {/* Produção */}
          <div 
            onClick={() => setStatusNossoFilter(statusNossoFilter === 'Produção' ? 'ALL' : 'Produção')}
            className={cn(
              "bg-white border p-3.5 rounded-2xl shadow-xs cursor-pointer transition-all hover:border-blue-400",
              statusNossoFilter === 'Produção' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-zinc-200'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                Produção
              </span>
              <span className="h-2 w-2 rounded-full bg-blue-500" />
            </div>
            <div className="text-xl font-extrabold text-blue-900 mt-1">
              {stats.producao}
            </div>
            <span className="text-[10px] text-zinc-500 font-medium">Reator / Mistura</span>
          </div>

          {/* Envase */}
          <div 
            onClick={() => setStatusNossoFilter(statusNossoFilter === 'Envase' ? 'ALL' : 'Envase')}
            className={cn(
              "bg-white border p-3.5 rounded-2xl shadow-xs cursor-pointer transition-all hover:border-purple-400",
              statusNossoFilter === 'Envase' ? 'border-purple-500 ring-2 ring-purple-100' : 'border-zinc-200'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">
                Envase
              </span>
              <span className="h-2 w-2 rounded-full bg-purple-500" />
            </div>
            <div className="text-xl font-extrabold text-purple-900 mt-1">
              {stats.envase}
            </div>
            <span className="text-[10px] text-zinc-500 font-medium">Linha de envase</span>
          </div>

          {/* Rotulagem */}
          <div 
            onClick={() => setStatusNossoFilter(statusNossoFilter === 'Rotulagem' ? 'ALL' : 'Rotulagem')}
            className={cn(
              "bg-white border p-3.5 rounded-2xl shadow-xs cursor-pointer transition-all hover:border-cyan-400",
              statusNossoFilter === 'Rotulagem' ? 'border-cyan-500 ring-2 ring-cyan-100' : 'border-zinc-200'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-cyan-600 uppercase tracking-wider">
                Rotulagem
              </span>
              <span className="h-2 w-2 rounded-full bg-cyan-500" />
            </div>
            <div className="text-xl font-extrabold text-cyan-900 mt-1">
              {stats.rotulagem}
            </div>
            <span className="text-[10px] text-zinc-500 font-medium">Acabamento</span>
          </div>

          {/* Finalizada */}
          <div 
            onClick={() => setStatusNossoFilter(statusNossoFilter === 'Finalizada' ? 'ALL' : 'Finalizada')}
            className={cn(
              "bg-white border p-3.5 rounded-2xl shadow-xs cursor-pointer transition-all hover:border-emerald-400",
              statusNossoFilter === 'Finalizada' ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-zinc-200'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                Finalizada
              </span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <div className="text-xl font-extrabold text-emerald-900 mt-1">
              {stats.finalizada}
            </div>
            <span className="text-[10px] text-zinc-500 font-medium">Concluídas</span>
          </div>
        </div>

        {/* ========================================================= */}
        {/* ABA 1: STATUS DE LOTES (PLANILHA)                         */}
        {/* ========================================================= */}
        {activeTab === 'planilha' && (
          <div className="space-y-4">
            {/* BARRA DE FERRAMENTAS E FILTROS */}
            <div className="bg-white border border-zinc-200 p-4 rounded-2xl shadow-xs space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Campo de Busca */}
                <div className="relative flex-1 max-w-md">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar lote, descrição do produto, responsável..."
                    value={searchTerm}
                    onChange={e => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-9 pr-4 py-2 border border-zinc-200 rounded-xl text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-zinc-50 focus:bg-white transition-all text-zinc-800"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Filtros em Dropdowns */}
                <div className="flex items-center flex-wrap gap-2">
                  {/* Filtro Período */}
                  <select
                    value={dateFilter}
                    onChange={e => {
                      setDateFilter(e.target.value as any);
                      setCurrentPage(1);
                    }}
                    className="text-xs border border-zinc-200 rounded-xl px-3 py-2 bg-white text-zinc-700 font-medium focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer shadow-xs"
                  >
                    <option value="ESTE_MES">Data: Este Mês</option>
                    <option value="ULTIMOS_30">Data: Últimos 30 dias</option>
                    <option value="ULTIMOS_90">Data: Últimos 90 dias</option>
                    <option value="TODOS">Data: Todo Histórico</option>
                  </select>

                  {/* Filtro Categoria Nosso */}
                  <select
                    value={categoryFilter}
                    onChange={e => {
                      setCategoryFilter(e.target.value as any);
                      setCurrentPage(1);
                    }}
                    className="text-xs border border-zinc-200 rounded-xl px-3 py-2 bg-white text-zinc-700 font-medium focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer shadow-xs"
                  >
                    <option value="ALL">Categoria: Todas</option>
                    <option value="Pesagem e Produção">Pesagem e Produção</option>
                    <option value="Embalagem">Embalagem</option>
                    <option value="SEM_STATUS">Sem Categoria (Aguardando)</option>
                  </select>

                  {/* Filtro Status Nosso */}
                  <select
                    value={statusNossoFilter}
                    onChange={e => {
                      setStatusNossoFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="text-xs border border-zinc-200 rounded-xl px-3 py-2 bg-white text-zinc-700 font-medium focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer shadow-xs"
                  >
                    <option value="ALL">Status Nosso: Todos</option>
                    <optgroup label="Pesagem e Produção">
                      <option value="Pesagem">Pesagem</option>
                      <option value="Produção">Produção</option>
                    </optgroup>
                    <optgroup label="Embalagem">
                      <option value="Envase">Envase</option>
                      <option value="Rotulagem">Rotulagem</option>
                      <option value="Finalizada">Finalizada</option>
                    </optgroup>
                    <option value="SEM_STATUS">Aguardando Definição</option>
                  </select>

                  {/* Filtro Status ERP */}
                  <select
                    value={erpStatusFilter}
                    onChange={e => {
                      setErpStatusFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="text-xs border border-zinc-200 rounded-xl px-3 py-2 bg-white text-zinc-700 font-medium focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer shadow-xs"
                  >
                    <option value="ALL">Status ERP: Todos</option>
                    <option value="EA">EA - Estoque Atualizado</option>
                    <option value="CF">CF - Conferido</option>
                    <option value="PR">PR - Em Produção</option>
                    <option value="PG">PG - Em Pesagem</option>
                    <option value="PP">PP - Pré-Produção</option>
                    <option value="EN">EN - Em Envase</option>
                    <option value="FP">FP - Finalizado</option>
                    <option value="CA">CA - Cancelado</option>
                  </select>

                  {/* Reset Filtros */}
                  {(searchTerm || categoryFilter !== 'ALL' || statusNossoFilter !== 'ALL' || erpStatusFilter !== 'ALL' || dateFilter !== 'ESTE_MES') && (
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setCategoryFilter('ALL');
                        setStatusNossoFilter('ALL');
                        setErpStatusFilter('ALL');
                        setDateFilter('ESTE_MES');
                        setCurrentPage(1);
                      }}
                      className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1.5 transition-colors cursor-pointer"
                    >
                      Limpar Filtros
                    </button>
                  )}
                </div>
              </div>

              {/* Informações da Tabela */}
              <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-100">
                <div>
                  Mostrando <strong>{paginatedLotes.length}</strong> de <strong>{sortedLotes.length}</strong> lotes filtrados (Total no banco: {lotes.length})
                </div>
                {!isAuthorized && (
                  <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                    <Lock className="h-3 w-3" />
                    <span>Modo somente leitura ativado. Clique em "Habilitar Edição" para alterar status.</span>
                  </div>
                )}
              </div>
            </div>

            {/* TABELA EM FORMATO DE PLANILHA */}
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-100/80 text-zinc-700 uppercase font-bold text-[10px] tracking-wider sticky top-0 z-20 border-b border-zinc-200 backdrop-blur-xs">
                    <tr>
                      {/* Coluna 1: Número do Lote */}
                      <th
                        onClick={() => toggleSort('loteNumber')}
                        className="p-3 border-r border-zinc-200 cursor-pointer hover:bg-zinc-200/60 transition-colors select-none w-32"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span>Nº do Lote</span>
                          {sortField === 'loteNumber' && (
                            <span className="text-zinc-900 font-extrabold">{sortAsc ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>

                      {/* Coluna 2: Descrição */}
                      <th
                        onClick={() => toggleSort('productDescription')}
                        className="p-3 border-r border-zinc-200 cursor-pointer hover:bg-zinc-200/60 transition-colors select-none"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span>Descrição do Produto</span>
                          {sortField === 'productDescription' && (
                            <span className="text-zinc-900 font-extrabold">{sortAsc ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>

                      {/* Coluna 3: Quantidade */}
                      <th
                        onClick={() => toggleSort('quantity')}
                        className="p-3 border-r border-zinc-200 cursor-pointer hover:bg-zinc-200/60 transition-colors select-none text-right w-28"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Quantidade</span>
                          {sortField === 'quantity' && (
                            <span className="text-zinc-900 font-extrabold">{sortAsc ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>

                      {/* Coluna 4: Data do Lote */}
                      <th
                        onClick={() => toggleSort('date')}
                        className="p-3 border-r border-zinc-200 cursor-pointer hover:bg-zinc-200/60 transition-colors select-none w-28 text-center"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>Data Lote</span>
                          {sortField === 'date' && (
                            <span className="text-zinc-900 font-extrabold">{sortAsc ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>

                      {/* Coluna 5: Status do ERP */}
                      <th
                        onClick={() => toggleSort('erpStatus')}
                        className="p-3 border-r border-zinc-200 cursor-pointer hover:bg-zinc-200/60 transition-colors select-none w-44"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span>Status do ERP</span>
                          {sortField === 'erpStatus' && (
                            <span className="text-zinc-900 font-extrabold">{sortAsc ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>

                      {/* Coluna 6: Status Nosso */}
                      <th
                        onClick={() => toggleSort('customStatus')}
                        className="p-3 cursor-pointer hover:bg-zinc-200/60 transition-colors select-none w-52 bg-zinc-150/70"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-zinc-900 font-extrabold">Status Nosso (Interno)</span>
                          {sortField === 'customStatus' && (
                            <span className="text-zinc-900 font-extrabold">{sortAsc ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-zinc-200/70 font-mono text-xs">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-zinc-500 font-sans">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-zinc-400 mb-2" />
                          Carregando lotes de produção...
                        </td>
                      </tr>
                    ) : paginatedLotes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-zinc-400 font-sans">
                          Nenhum lote encontrado com os filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      paginatedLotes.map((lote, index) => {
                        const customStyle = getCustomStatusStyle(lote.customStatus);
                        const erpBadge = getErpStatusBadge(lote.erpStatus, lote.erpStatusLabel);
                        const isSaving = savingStatus === lote.loteNumber;

                        return (
                          <tr
                            key={lote.loteNumber + '-' + index}
                            className={cn(
                              'hover:bg-zinc-50/80 transition-colors group',
                              index % 2 === 1 ? 'bg-zinc-50/30' : 'bg-white'
                            )}
                          >
                            {/* 1. Número do Lote */}
                            <td className="p-3 border-r border-zinc-200 font-bold text-zinc-900 whitespace-nowrap">
                              <span 
                                title="Clique para copiar número do lote"
                                onClick={() => {
                                  navigator.clipboard.writeText(lote.loteNumber);
                                  showToast(`Lote #${lote.loteNumber} copiado!`);
                                }}
                                className="cursor-pointer hover:underline text-zinc-900 font-mono tracking-wide"
                              >
                                #{lote.loteNumber}
                              </span>
                            </td>

                            {/* 2. Descrição do Produto */}
                            <td className="p-3 border-r border-zinc-200 font-sans font-medium text-zinc-800">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[10px] text-zinc-500 font-mono bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                                  {lote.productCode}
                                </span>
                                <span className="truncate max-w-md" title={lote.productDescription}>
                                  {lote.productDescription || '(Sem Descrição)'}
                                </span>
                              </div>
                            </td>

                            {/* 3. Quantidade */}
                            <td className="p-3 border-r border-zinc-200 text-right font-bold text-zinc-900 font-mono whitespace-nowrap">
                              {formatQtyDisplay(lote.quantity)}
                              <span className="text-[10px] text-zinc-400 font-normal ml-1">un/kg</span>
                            </td>

                            {/* 4. Data do Lote */}
                            <td className="p-3 border-r border-zinc-200 text-center text-zinc-600 font-mono whitespace-nowrap">
                              {formatDateDisplay(lote.date)}
                            </td>

                            {/* 5. Status do ERP */}
                            <td className="p-3 border-r border-zinc-200 font-sans whitespace-nowrap">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border shadow-2xs',
                                  erpBadge.badgeClass
                                )}
                                title={`Status no ERP: ${lote.erpStatus} - ${lote.erpStatusLabel}`}
                              >
                                {erpBadge.label}
                              </span>
                            </td>

                            {/* 6. Status Nosso (Interativo) */}
                            <td className="p-2.5 font-sans relative bg-zinc-50/40">
                              {isAuthorized ? (
                                <div className="relative">
                                  <select
                                    disabled={isSaving}
                                    value={lote.customStatus || ''}
                                    onChange={e => {
                                      const val = e.target.value;
                                      if (!val) {
                                        handleClearStatus(lote.loteNumber);
                                      } else {
                                        let cat = 'Pesagem e Produção';
                                        if (['Rotulagem', 'Envase', 'Finalizada'].includes(val)) {
                                          cat = 'Embalagem';
                                        }
                                        handleUpdateStatus(lote.loteNumber, val, cat);
                                      }
                                    }}
                                    className={cn(
                                      'w-full text-xs font-semibold px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-900',
                                      customStyle.badgeClass,
                                      isSaving && 'opacity-50 animate-pulse'
                                    )}
                                  >
                                    <option value="">Aguardando Definição</option>
                                    <optgroup label="── Categoria: Pesagem e Produção ──">
                                      <option value="Pesagem">🟡 Pesagem</option>
                                      <option value="Produção">🔵 Produção</option>
                                    </optgroup>
                                    <optgroup label="── Categoria: Embalagem ──">
                                      <option value="Envase">🟣 Envase</option>
                                      <option value="Rotulagem">🔷 Rotulagem</option>
                                      <option value="Finalizada">🟢 Finalizada</option>
                                    </optgroup>
                                  </select>

                                  {/* Rótulo de quem alterou */}
                                  {lote.updatedBy && (
                                    <div className="text-[9px] text-zinc-400 mt-0.5 flex items-center gap-1 font-mono">
                                      <span>Por: {lote.updatedBy}</span>
                                      {lote.updatedAt && (
                                        <span>• {formatDateDisplay(lote.updatedAt)}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div
                                  onClick={() => setShowAuthModal(true)}
                                  className={cn(
                                    'flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-xs cursor-pointer hover:border-zinc-400 transition-all shadow-2xs',
                                    customStyle.badgeClass
                                  )}
                                  title="Clique para autenticar e alterar status"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className={cn('h-2 w-2 rounded-full', customStyle.dotClass)} />
                                    <span>{customStyle.label}</span>
                                  </div>
                                  <Lock className="h-3 w-3 opacity-40 hover:opacity-100" />
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINAÇÃO INFERIOR */}
              <div className="px-4 py-3 bg-zinc-50 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600">
                <div className="flex items-center gap-2">
                  <span>Itens por página:</span>
                  <select
                    value={rowsPerPage}
                    onChange={e => {
                      setRowsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="border border-zinc-200 rounded-lg px-2 py-1 bg-white text-xs font-medium focus:outline-none"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={-1}>Todos</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 font-mono">
                    Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-white cursor-pointer shadow-2xs"
                      title="Página Anterior"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                      disabled={currentPage >= totalPages}
                      className="p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-white cursor-pointer shadow-2xs"
                      title="Próxima Página"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* ABA 2: CALENDÁRIO DE PRODUÇÃO                             */}
        {/* ========================================================= */}
        {activeTab === 'calendario' && (
          <div className="space-y-4">
            {/* BARRA SUPERIOR DO CALENDÁRIO */}
            <div className="bg-white border border-zinc-200 p-4 rounded-2xl shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => changeMonth(-1)}
                  className="bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 p-2 rounded-xl text-zinc-700 cursor-pointer shadow-2xs"
                  title="Mês Anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="text-left">
                  <h2 className="text-lg font-extrabold text-zinc-900 tracking-tight">
                    {monthNames[calendarDate.getMonth()]} de {calendarDate.getFullYear()}
                  </h2>
                  <p className="text-[11px] text-zinc-500 font-medium">
                    Visualização de lotes programados e finalizados no mês
                  </p>
                </div>
                <button
                  onClick={() => changeMonth(1)}
                  className="bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 p-2 rounded-xl text-zinc-700 cursor-pointer shadow-2xs"
                  title="Próximo Mês"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={goToToday}
                  className="bg-white hover:bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-xl text-xs font-bold text-zinc-800 cursor-pointer shadow-2xs"
                >
                  Hoje
                </button>
              </div>
            </div>

            {/* GRADE DO CALENDÁRIO */}
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-xs overflow-hidden">
              {/* Dias da semana */}
              <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-center text-xs font-bold text-zinc-600 py-2.5">
                <div className="text-rose-600">DOM</div>
                <div>SEG</div>
                <div>TER</div>
                <div>QUA</div>
                <div>QUI</div>
                <div>SEX</div>
                <div className="text-zinc-400">SÁB</div>
              </div>

              {/* Dias do mês */}
              <div className="grid grid-cols-7 divide-x divide-y divide-zinc-200">
                {calendarDays.map((cell, idx) => {
                  const isToday =
                    cell.isCurrentMonth &&
                    cell.dayNumber === new Date().getDate() &&
                    calendarDate.getMonth() === new Date().getMonth() &&
                    calendarDate.getFullYear() === new Date().getFullYear();

                  const lotesCount = cell.lotes.length;

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        if (cell.dateKey && lotesCount > 0) {
                          setSelectedDayLotes({ date: cell.dateKey, lotes: cell.lotes });
                        }
                      }}
                      className={cn(
                        'min-h-[110px] p-2 flex flex-col justify-between transition-all select-none',
                        !cell.isCurrentMonth ? 'bg-zinc-50/50 opacity-40' : 'bg-white',
                        lotesCount > 0 ? 'hover:bg-zinc-50 cursor-pointer' : '',
                        isToday ? 'ring-2 ring-zinc-950 ring-inset' : ''
                      )}
                    >
                      {/* Cabeçalho do dia */}
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            'text-xs font-mono font-bold px-1.5 py-0.5 rounded-md',
                            isToday ? 'bg-zinc-900 text-white' : 'text-zinc-700'
                          )}
                        >
                          {cell.dayNumber || ''}
                        </span>

                        {lotesCount > 0 && (
                          <span className="text-[10px] font-bold bg-zinc-100 text-zinc-700 px-1.5 py-0.5 rounded-full border border-zinc-200">
                            {lotesCount} {lotesCount === 1 ? 'lote' : 'lotes'}
                          </span>
                        )}
                      </div>

                      {/* Lista de chips de lotes do dia */}
                      <div className="mt-1 space-y-1 flex-1 overflow-y-auto max-h-[70px]">
                        {cell.lotes.slice(0, 3).map((lot, lIdx) => {
                          const customStyle = getCustomStatusStyle(lot.customStatus);
                          return (
                            <div
                              key={lIdx}
                              className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded border truncate font-sans font-medium flex items-center justify-between gap-1 shadow-2xs',
                                customStyle.badgeClass
                              )}
                              title={`Lote #${lot.loteNumber} - ${lot.productDescription} (${formatQtyDisplay(lot.quantity)} un) - Status: ${customStyle.label}`}
                            >
                              <span className="font-bold font-mono">#{lot.loteNumber}</span>
                              <span className="truncate max-w-[90px]">{lot.productDescription}</span>
                            </div>
                          );
                        })}
                        {cell.lotes.length > 3 && (
                          <div className="text-[9px] text-zinc-500 font-bold text-center">
                            +{cell.lotes.length - 3} mais...
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* DRAWER LATERAL: DETALHES DO DIA SELECIONADO NO CALENDÁRIO */}
      {selectedDayLotes && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-xl h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="space-y-4">
              {/* Header Drawer */}
              <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
                <div>
                  <h3 className="font-extrabold text-base text-zinc-900 flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-zinc-500" />
                    Lotes de {formatDateDisplay(selectedDayLotes.date)}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Total de {selectedDayLotes.lotes.length} lote(s) programados para esta data
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDayLotes(null)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Lista de lotes do dia */}
              <div className="space-y-3">
                {selectedDayLotes.lotes.map((item, idx) => {
                  const customStyle = getCustomStatusStyle(item.customStatus);
                  const erpBadge = getErpStatusBadge(item.erpStatus, item.erpStatusLabel);

                  return (
                    <div
                      key={idx}
                      className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/50 hover:bg-zinc-50 transition-colors space-y-3 shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-extrabold text-sm text-zinc-900">
                          Lote #{item.loteNumber}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded border',
                            erpBadge.badgeClass
                          )}
                        >
                          ERP: {item.erpStatus} ({item.erpStatusLabel})
                        </span>
                      </div>

                      <div>
                        <div className="text-xs font-bold text-zinc-900">{item.productDescription}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">
                          Código: {item.productCode} • Quantidade: {formatQtyDisplay(item.quantity)} un/kg
                        </div>
                      </div>

                      {/* Status Nosso com controle */}
                      <div className="pt-2 border-t border-zinc-200/60 flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-600">Status Nosso:</span>

                        {isAuthorized ? (
                          <select
                            value={item.customStatus || ''}
                            onChange={e => {
                              const val = e.target.value;
                              let cat = 'Pesagem e Produção';
                              if (['Rotulagem', 'Envase', 'Finalizada'].includes(val)) {
                                cat = 'Embalagem';
                              }
                              handleUpdateStatus(item.loteNumber, val, cat);
                            }}
                            className={cn(
                              'text-xs font-bold px-3 py-1.5 rounded-xl border focus:outline-none cursor-pointer',
                              customStyle.badgeClass
                            )}
                          >
                            <option value="">Aguardando Definição</option>
                            <optgroup label="Pesagem e Produção">
                              <option value="Pesagem">Pesagem</option>
                              <option value="Produção">Produção</option>
                            </optgroup>
                            <optgroup label="Embalagem">
                              <option value="Envase">Envase</option>
                              <option value="Rotulagem">Rotulagem</option>
                              <option value="Finalizada">Finalizada</option>
                            </optgroup>
                          </select>
                        ) : (
                          <div
                            onClick={() => setShowAuthModal(true)}
                            className={cn(
                              'text-xs font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1.5 cursor-pointer',
                              customStyle.badgeClass
                            )}
                          >
                            <span>{customStyle.label}</span>
                            <Lock className="h-3 w-3 opacity-60" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-200">
              <button
                onClick={() => setSelectedDayLotes(null)}
                className="w-full bg-zinc-950 text-white font-bold text-xs py-2.5 rounded-xl hover:bg-zinc-800 transition-all cursor-pointer shadow-xs"
              >
                Fechar Painel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE AUTENTICAÇÃO / PERMISSÃO */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-zinc-200 overflow-hidden p-6 space-y-4">
            <div className="text-center space-y-1">
              <div className="bg-zinc-900 text-white p-2.5 rounded-xl w-fit mx-auto shadow-xs">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="font-extrabold text-base text-zinc-900">
                Permissão de Edição
              </h3>
              <p className="text-xs text-zinc-500">
                Identifique-se como supervisor para alterar o status dos lotes.
              </p>
            </div>

            <form onSubmit={handleAuthorize} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-zinc-700 block mb-1">
                  Nome do Responsável
                </label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Ex: Gestor / Rafael / Edson"
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-zinc-50 focus:bg-white text-zinc-800"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 block mb-1">
                  PIN de Supervisor (Padrão: 1234)
                </label>
                <input
                  type="password"
                  value={pinInput}
                  onChange={e => setPinInput(e.target.value)}
                  placeholder="Digite o PIN (ex: 1234)"
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-mono focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-zinc-50 focus:bg-white text-zinc-800"
                  autoFocus
                  required
                />
              </div>

              {authError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {authError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAuthModal(false);
                    setAuthError('');
                  }}
                  className="flex-1 py-2.5 border border-zinc-200 rounded-xl text-xs font-bold hover:bg-zinc-50 text-zinc-700 cursor-pointer shadow-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-zinc-950 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-zinc-800 transition-all cursor-pointer shadow-xs"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="w-full text-center py-4 text-xs text-zinc-400 border-t border-zinc-200/50 bg-white/50">
        &copy; {new Date().getFullYear()} Nátum Bio Cosméticos • Módulo Administrativo
      </footer>
    </div>
  );
}
