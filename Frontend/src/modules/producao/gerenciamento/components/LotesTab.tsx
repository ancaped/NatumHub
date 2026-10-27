import React, { useState, useMemo } from 'react';
import { 
  RefreshCw, ChevronLeft, ChevronRight, 
  User, CheckCircle2, FileSearch, ArrowUpRight
} from 'lucide-react';
import { cn } from '../../../../modules/geral/lib/utils';
import { ReportHeader, ReportTabs, FilterBar, StatusBadge, TabelaPainel, BotaoAcao, type VarianteBadge } from '../../../geral/components/ui/ReportKit';
import { rotuloLote } from '../../../administrativo/acompanhamento_producao/lib/rotuloLote';

const getStatusVariante = (status: string): VarianteBadge => {
  switch ((status || '').toUpperCase()) {
    case 'EA':
    case 'FP':
      return 'saudavel';
    case 'CF':
      return 'abundante';
    case 'PG':
    case 'PP':
    case 'PR':
    case 'EN':
      return 'ordem';
    case 'CA':
      return 'critico';
    default:
      return 'descontinuado';
  }
};

const getStatusLabel = (status: string) => {
  switch ((status || '').toUpperCase()) {
    case 'EA': return 'Estoque Atualizado';
    case 'PG': return 'Em Pesagem';
    case 'PP': return 'Pré-Produção';
    case 'PR': return 'Em Produção';
    case 'EN': return 'Em Envase';
    case 'CF': return 'Conferido';
    case 'CA': return 'Cancelado';
    case 'FP': return 'Finalizado';
    default: return status || '—';
  }
};

interface LotesTabProps {
  lotes: any[];
  onRefresh?: () => void;
  loading?: boolean;
  onOpenDetails?: (loteNumber: string) => void;
  selectedStatus?: string;
  setSelectedStatus?: (status: string) => void;
  viewMode?: 'table' | 'calendar';
  onViewModeChange?: (mode: 'table' | 'calendar') => void;
}

export function LotesTab({
  lotes,
  onRefresh,
  loading,
  onOpenDetails,
  selectedStatus = 'ALL',
  setSelectedStatus,
}: LotesTabProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [ocultarResolvidos, setOcultarResolvidos] = useState(false);
  const limitPerPage = 15;

  const filteredLotes = useMemo(() => {
    return lotes.filter(l => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q || (
        (l.loteNumber || '').toLowerCase().includes(q) ||
        (l.productCode || '').toLowerCase().includes(q) ||
        (l.productDescription || '').toLowerCase().includes(q) ||
        (l.fabricatedBy || '').toLowerCase().includes(q)
      );
      
      let matchesStatus = false;
      if (selectedStatus === 'ALL') {
        matchesStatus = true;
      } else if (selectedStatus === 'ERR_YIELD') {
        matchesStatus = l.yieldError === true;
      } else if (selectedStatus === 'ERR_PESAGEM') {
        matchesStatus = l.pesagemError === true;
      } else if (selectedStatus === 'ERR_ENVASE') {
        matchesStatus = l.envaseError === true;
      } else if (selectedStatus === 'ERR_CONFERENCIA') {
        matchesStatus = l.conferenciaError === true;
      } else if (selectedStatus === 'ERR_ANY_ERROR') {
        matchesStatus = l.yieldError === true || l.pesagemError === true || l.envaseError === true || l.conferenciaError === true;
      } else if (selectedStatus === 'RESOLVED') {
        matchesStatus = l.isResolved === true;
      } else {
        matchesStatus = l.status === selectedStatus;
      }

      let matchesResolution = true;
      if (ocultarResolvidos && l.isResolved) {
        matchesResolution = false;
      }

      return matchesSearch && matchesStatus && matchesResolution;
    });
  }, [lotes, search, selectedStatus, ocultarResolvidos]);

  // Contagens para filtros rápidos
  const filterCounts = useMemo(() => {
    let comErros = 0;
    let justificados = 0;
    let ea = 0;
    lotes.forEach(l => {
      if (l.isResolved) justificados++;
      if (l.yieldError || l.pesagemError || l.envaseError || l.conferenciaError) comErros++;
      if (l.status === 'EA') ea++;
    });
    return {
      total: lotes.length,
      comErros,
      justificados,
      ea
    };
  }, [lotes]);

  // Pagination
  const totalItems = filteredLotes.length;
  const totalPages = Math.ceil(totalItems / limitPerPage) || 1;
  const paginatedLotes = useMemo(() => {
    const start = (page - 1) * limitPerPage;
    return filteredLotes.slice(start, start + limitPerPage);
  }, [filteredLotes, page]);

  const handleStatusFilterChange = (status: string) => {
    setSelectedStatus?.(status);
    setPage(1);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <ReportHeader
        titulo="Histórico & Fechamento de Lotes"
        subtitulo={`${filterCounts.total} lotes. Auditoria de fórmulas, desvios, rendimento e justificativa.`}
        acoes={onRefresh && (
          <BotaoAcao onClick={onRefresh} disabled={loading} title="Atualizar lotes">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Atualizar
          </BotaoAcao>
        )}
      />

      <ReportTabs
        ativa={selectedStatus}
        onChange={handleStatusFilterChange}
        abas={[
          { id: 'ALL', label: 'Todos', contagem: filterCounts.total },
          { id: 'ERR_ANY_ERROR', label: 'Com Desvios', contagem: filterCounts.comErros },
          { id: 'RESOLVED', label: 'Justificados', contagem: filterCounts.justificados },
          { id: 'EA', label: 'Estoque Atualizado', contagem: filterCounts.ea },
        ]}
      />

      <FilterBar
        busca={search}
        onBusca={(v) => { setSearch(v); setPage(1); }}
        placeholder="Buscar por lote, código, descrição ou operador..."
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={ocultarResolvidos}
            onChange={(e) => { setOcultarResolvidos(e.target.checked); setPage(1); }}
          />
          Ocultar justificados
        </label>
      </FilterBar>

      {loading ? (
        <div className="panel-card py-16 text-center text-zinc-400 flex flex-col items-center justify-center gap-2 text-xs">
          <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
          <span className="font-semibold text-zinc-600">Carregando lotes...</span>
        </div>
      ) : filteredLotes.length === 0 ? (
        <div className="panel-card py-16 text-center text-zinc-400 flex flex-col items-center justify-center gap-2 text-xs">
          <FileSearch className="h-10 w-10 text-zinc-300 stroke-[1.5]" />
          <p className="font-bold text-zinc-700 text-sm">Nenhum lote encontrado</p>
          <p className="text-xs text-zinc-400 max-w-sm">
            {search ? `Nenhum lote corresponde à busca "${search}".` : 'Ajuste os filtros acima para ver os lotes.'}
          </p>
        </div>
      ) : (
        <TabelaPainel>
          <thead>
            <tr>
              <th>Lote</th>
              <th>Data</th>
              <th>Código</th>
              <th>Produto</th>
              <th style={{ textAlign: 'right' }}>Quantidade</th>
              <th style={{ textAlign: 'center' }}>Status ERP</th>
              <th style={{ textAlign: 'center' }}>Desvios</th>
              <th>Operador</th>
              <th style={{ textAlign: 'center' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {paginatedLotes.map((l) => {
              const dateObj = new Date((l.date || '').replace(' ', 'T'));
              const formattedDate = isNaN(dateObj.getTime()) ? l.date : dateObj.toLocaleDateString('pt-BR');
              const hasErrors = l.yieldError || l.pesagemError || l.envaseError || l.conferenciaError;

              return (
                <tr
                  key={l.id || l.loteNumber}
                  onClick={() => onOpenDetails?.(l.loteNumber)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="font-mono font-bold">{rotuloLote(l.loteNumber)}</td>
                  <td>{formattedDate}</td>
                  <td className="font-mono">{l.productCode}</td>
                  <td className="font-semibold">{l.productDescription || 'Item não sincronizado'}</td>
                  <td className="font-mono font-bold" style={{ textAlign: 'right' }}>
                    {Number(l.quantity || 0).toLocaleString('pt-BR')} kg
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <StatusBadge variante={getStatusVariante(l.status)}>{getStatusLabel(l.status)}</StatusBadge>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      {l.isResolved ? (
                        <StatusBadge variante="saudavel">
                          <CheckCircle2 className="h-3 w-3" /> Justificados
                        </StatusBadge>
                      ) : hasErrors ? (
                        <>
                          {l.pesagemError && (
                            <StatusBadge variante="critico" title="Desvio no peso/insumos de pesagem">Pesagem</StatusBadge>
                          )}
                          {l.yieldError && (
                            <StatusBadge variante="ordem" title="Saída de insumos fora de 10% do esperado pela fórmula">Rendimento</StatusBadge>
                          )}
                          {l.envaseError && (
                            <StatusBadge variante="critico" title="Desvio no envase">Envase</StatusBadge>
                          )}
                          {l.conferenciaError && (
                            <StatusBadge variante="critico" title="Erro na conferência">Conferência</StatusBadge>
                          )}
                        </>
                      ) : (
                        <StatusBadge variante="descontinuado">Conforme</StatusBadge>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate max-w-[140px]" title={l.fabricatedBy || 'Não informado'}>
                        {l.fabricatedBy || '—'}
                      </span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {/* o clique sobe para a linha, que abre a análise */}
                    <BotaoAcao title="Abrir a análise deste lote">
                      Analisar <ArrowUpRight className="h-3 w-3" />
                    </BotaoAcao>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TabelaPainel>
      )}

      {filteredLotes.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600">
          <span>
            {(page - 1) * limitPerPage + 1} a {Math.min(page * limitPerPage, totalItems)} de {totalItems} lotes
          </span>
          <div className="flex items-center gap-1.5">
            <BotaoAcao title="Página anterior" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </BotaoAcao>
            <span className="px-2.5 py-1 font-mono font-bold text-zinc-800 text-xs">
              {page} / {totalPages}
            </span>
            <BotaoAcao title="Próxima página" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
              <ChevronRight className="h-4 w-4" />
            </BotaoAcao>
          </div>
        </div>
      )}
    </div>
  );
}
