import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../../geral/lib/api';
import { Supplier, Invoice, PricePoint } from '../../../geral/lib/types';
import {
  Users,
  Plus,
  Search,
  ArrowLeft,
  Phone,
  Mail,
  FileText,
  X,
  ArrowUp,
  ArrowDown,
  Link as LinkIcon,
  Unlink,
  Building2,
  CheckSquare,
  Square,
  Tag,
  Layers,
  Globe,
  Filter
} from 'lucide-react';
import { randomId } from '../../../geral/lib/utils';
import { getAuthUser, isSupervisor } from '../../../geral/lib/auth';

interface SupplierManagerProps {
  mode?: string;
  active?: boolean;
}

export function SupplierManager({ mode = 'all', active = false }: { mode?: string; active?: boolean }) {
  const canConfig = isSupervisor(getAuthUser());
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [allSuppliersGlobal, setAllSuppliersGlobal] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ invoices: Invoice[]; pricePoints: PricePoint[] } | null>(null);
  const [sortKey, setSortKey] = useState<'name' | 'email'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewFilter, setViewFilter] = useState<'all' | 'unified_only' | 'unlinked_only'>('all');
  const [scope, setScope] = useState<'module' | 'global'>('module');

  // Modal Unir Fornecedores
  const [showUnifyModal, setShowUnifyModal] = useState(false);
  const [unifyMainId, setUnifyMainId] = useState<string>('');
  const [unifyChildIds, setUnifyChildIds] = useState<Set<string>>(new Set());
  const [unifySearch, setUnifySearch] = useState('');
  const [unifying, setUnifying] = useState(false);

  // Modal de vincular rápido dentro do detalhe
  const [showQuickLinkModal, setShowQuickLinkModal] = useState(false);
  const [quickLinkSearch, setQuickLinkSearch] = useState('');
  const [quickLinkSelected, setQuickLinkSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (active) {
      loadSuppliers();
    }
  }, [mode, active]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const [moduleData, globalData] = await Promise.all([
        mode !== 'all' ? api.getSuppliers(mode) : api.getSuppliers('all'),
        api.getSuppliers('all')
      ]);
      setSuppliers(moduleData);
      setAllSuppliersGlobal(globalData);
    } catch (e) {
      console.error('Erro ao carregar fornecedores:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      await api.saveSupplier(editing);
      setEditing(null);
      await loadSuppliers();
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar fornecedor');
    }
  };

  const openDetail = async (id: string) => {
    setDetailId(id);
    try {
      const data = await api.getSupplierHistory(id);
      setHistory(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnify = async () => {
    if (!unifyMainId || unifyChildIds.size === 0) {
      alert('Selecione o fornecedor principal e ao menos um fornecedor para vincular.');
      return;
    }
    setUnifying(true);
    try {
      await api.unifySuppliers(unifyMainId, Array.from(unifyChildIds));
      setShowUnifyModal(false);
      setUnifyMainId('');
      setUnifyChildIds(new Set());
      setUnifySearch('');
      await loadSuppliers();
      alert('Fornecedores unidos com sucesso!');
    } catch (e) {
      console.error(e);
      alert('Erro ao unir fornecedores.');
    } finally {
      setUnifying(false);
    }
  };

  const handleUnlink = async (supplierId: string, supplierName?: string) => {
    if (!confirm(`Deseja desvincular o fornecedor "${supplierName || supplierId}" do grupo?`)) {
      return;
    }
    try {
      await api.unlinkSupplier(supplierId);
      await loadSuppliers();
      if (detailId) {
        openDetail(detailId);
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao desvincular fornecedor.');
    }
  };

  const handleQuickLinkSubmit = async () => {
    if (!detailId || quickLinkSelected.size === 0) return;
    try {
      await api.unifySuppliers(detailId, Array.from(quickLinkSelected));
      setShowQuickLinkModal(false);
      setQuickLinkSelected(new Set());
      setQuickLinkSearch('');
      await loadSuppliers();
      openDetail(detailId);
    } catch (e) {
      console.error(e);
      alert('Erro ao vincular fornecedores.');
    }
  };

  const currentList = scope === 'global' || mode === 'all' ? allSuppliersGlobal : suppliers;

  // Filtragem de fornecedores na lista principal
  const filtered = currentList.filter(s => {
    const matchSearch =
      (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.contact || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.cnpj || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.linkedSuppliers || []).some(
        c =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.cnpj || '').toLowerCase().includes(search.toLowerCase())
      );

    if (!matchSearch) return false;

    if (viewFilter === 'unified_only') {
      return (s.linkedCount && s.linkedCount > 0) || !s.parentId;
    }
    if (viewFilter === 'unlinked_only') {
      return !s.parentId && (!s.linkedCount || s.linkedCount === 0);
    }
    return true;
  });

  const sortedSuppliers = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey] || '';
      const bVal = b[sortKey] || '';
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [filtered, sortKey, sortDir]);

  const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  const formatDate = (d: string) => {
    if (!d) return '-';
    try {
      return new Intl.DateTimeFormat('pt-BR').format(new Date(d));
    } catch {
      return d;
    }
  };

  const getModuleName = (m: string) => {
    if (m === 'embalagens') return 'Embalagens';
    if (m === 'materia_prima') return 'Matéria-Prima';
    if (m === 'coloracao') return 'Colorações';
    if (m === 'apoio') return 'Material de Apoio';
    return 'Geral';
  };

  // Candidatos para a modal de unificação
  const unifyCandidates = useMemo(() => {
    const term = unifySearch.toLowerCase();
    return allSuppliersGlobal.filter(
      s =>
        s.id !== unifyMainId &&
        ((s.name || '').toLowerCase().includes(term) ||
          (s.cnpj || '').toLowerCase().includes(term) ||
          (s.contact || '').toLowerCase().includes(term))
    );
  }, [allSuppliersGlobal, unifyMainId, unifySearch]);

  // Candidatos para vincular rápido dentro do detalhe
  const quickLinkCandidates = useMemo(() => {
    const term = quickLinkSearch.toLowerCase();
    const currentDetail = allSuppliersGlobal.find(s => s.id === detailId);
    const existingChildIds = new Set((currentDetail?.linkedSuppliers || []).map(c => c.id));
    return allSuppliersGlobal.filter(
      s =>
        s.id !== detailId &&
        !existingChildIds.has(s.id) &&
        ((s.name || '').toLowerCase().includes(term) ||
          (s.cnpj || '').toLowerCase().includes(term))
    );
  }, [allSuppliersGlobal, detailId, quickLinkSearch]);

  // === DETAIL VIEW ===
  if (detailId) {
    const supplier = allSuppliersGlobal.find(s => s.id === detailId) || suppliers.find(s => s.id === detailId);
    if (!supplier) return null;

    const isChild = Boolean(supplier.parentId);
    const hasLinked = Boolean(supplier.linkedSuppliers && supplier.linkedSuppliers.length > 0);

    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <button
          onClick={() => {
            setDetailId(null);
            setHistory(null);
          }}
          className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para lista
        </button>

        {/* Card do Fornecedor Principal */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-zinc-900">{supplier.name}</h2>
                {supplier.cnpj && (
                  <span className="text-xs font-mono bg-zinc-100 text-zinc-700 px-2.5 py-1 rounded-md border border-zinc-200 flex items-center gap-1 font-semibold">
                    <Tag className="h-3 w-3 text-zinc-500" />
                    CNPJ: {supplier.cnpj}
                  </span>
                )}
                {hasLinked && (
                  <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md border border-blue-200 flex items-center gap-1">
                    <Layers className="h-3 w-3 text-blue-600" />
                    Grupo Unificado ({supplier.linkedSuppliers!.length} CNPJs vinculados)
                  </span>
                )}
                {isChild && (
                  <span className="text-xs font-bold bg-amber-50 text-amber-800 px-2.5 py-1 rounded-md border border-amber-200 flex items-center gap-1">
                    <LinkIcon className="h-3 w-3 text-amber-600" />
                    Filial vinculada a: {supplier.parentName || 'Fornecedor Principal'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-3 text-sm text-zinc-600 flex-wrap">
                {supplier.contact && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-zinc-400" />
                    {supplier.contact}
                  </span>
                )}
                {supplier.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-zinc-400" />
                    {supplier.email}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isChild && (
                <button
                  onClick={() => handleUnlink(supplier.id, supplier.name)}
                  className="text-xs px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Unlink className="h-3.5 w-3.5" />
                  Desvincular deste Grupo
                </button>
              )}
              {canConfig && (
                <button
                  onClick={() => setEditing(supplier)}
                  className="text-sm px-3.5 py-1.5 border border-zinc-300 rounded-lg hover:bg-zinc-50 cursor-pointer font-medium transition-colors"
                >
                  Editar Dados
                </button>
              )}
            </div>
          </div>

          {supplier.notes && (
            <p className="text-sm text-zinc-600 bg-zinc-50 p-3 rounded-lg border border-zinc-150 mt-3">{supplier.notes}</p>
          )}
        </div>

        {/* Seção: CNPJs e Fornecedores Vinculados (Grupo Unificado) */}
        {!isChild && (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50/80 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-zinc-900 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  CNPJs e Fornecedores Vinculados neste Grupo ({supplier.linkedSuppliers?.length || 0})
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  As compras, notas e regras de subcategoria configuradas para este fornecedor englobam automaticamente todas as filiais e CNPJs abaixo.
                </p>
              </div>
              <button
                onClick={() => {
                  setQuickLinkSelected(new Set());
                  setQuickLinkSearch('');
                  setShowQuickLinkModal(true);
                }}
                className="text-xs bg-zinc-900 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-zinc-800 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Vincular Outro CNPJ / Fornecedor
              </button>
            </div>

            <div className="p-4">
              {supplier.linkedSuppliers && supplier.linkedSuppliers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {supplier.linkedSuppliers.map(child => (
                    <div
                      key={child.id}
                      className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border border-zinc-200 hover:border-zinc-300 transition-all"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-zinc-900 truncate">{child.name}</span>
                          {child.cnpj && (
                            <span className="text-[11px] font-mono bg-white text-zinc-600 px-1.5 py-0.5 rounded border border-zinc-200 shrink-0">
                              CNPJ: {child.cnpj}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 mt-1 flex items-center gap-3">
                          <span>ID ERP: {child.id}</span>
                          {child.contact && <span>Contato: {child.contact}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleUnlink(child.id, child.name)}
                        className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="Desvincular fornecedor"
                      >
                        <Unlink className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-zinc-500 bg-zinc-50/50 rounded-lg border border-dashed border-zinc-200">
                  <Layers className="h-7 w-7 text-zinc-300 mx-auto mb-1.5" />
                  <p className="text-sm font-medium text-zinc-700">Nenhum CNPJ ou filial adicional vinculada.</p>
                  <p className="text-xs text-zinc-400 mt-0.5 max-w-sm mx-auto">
                    Se este fornecedor emitir notas por múltiplos CNPJs ou filiais no ERP, vincule-os aqui para unificar o histórico e as regras de compra.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Invoice History */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2 text-zinc-900">
              <FileText className="h-4 w-4 text-zinc-500" />
              Histórico de Compras & Notas Fiscais ({history?.invoices?.length || 0})
            </h3>
            {hasLinked && (
              <span className="text-xs text-zinc-500">
                Consolidando notas de todos os CNPJs do grupo
              </span>
            )}
          </div>
          <div className="max-h-96 overflow-auto">
            {history?.invoices && history.invoices.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 sticky top-0 border-b border-zinc-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-zinc-600">NF</th>
                    <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Item</th>
                    <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Descrição</th>
                    <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Origem / CNPJ</th>
                    <th className="px-4 py-2.5 text-right font-medium text-zinc-600">Qtd</th>
                    <th className="px-4 py-2.5 text-right font-medium text-zinc-600">Vlr Unit.</th>
                    <th className="px-4 py-2.5 text-right font-medium text-zinc-600">Total</th>
                    <th className="px-4 py-2.5 text-right font-medium text-zinc-600">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {history.invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-zinc-800">{inv.invoiceNumber}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-600">{inv.itemCode}</td>
                      <td className="px-4 py-2.5 truncate max-w-48 text-zinc-800" title={inv.description}>
                        {inv.description}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-zinc-500 max-w-40 truncate" title={`${inv.supplierName} (${inv.supplierCnpj || 'Sem CNPJ'})`}>
                        <span className="block font-medium text-zinc-700 truncate">{inv.supplierName}</span>
                        {inv.supplierCnpj && <span className="font-mono text-[10px] text-zinc-400">{inv.supplierCnpj}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">{inv.quantity.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-600">{formatCurrency(inv.unitPrice)}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-zinc-900">{formatCurrency(inv.totalValue)}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-500 text-xs">{formatDate(inv.invoiceDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-8 text-center text-zinc-500">Nenhuma NF encontrada para este fornecedor.</p>
            )}
          </div>
        </div>

        {/* Modal de vincular rápido dentro do detalhe */}
        {showQuickLinkModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
                <div>
                  <h3 className="font-bold text-lg text-zinc-900">Vincular Fornecedores / CNPJs</h3>
                  <p className="text-xs text-zinc-500">Fornecedor Principal: <strong>{supplier.name}</strong></p>
                </div>
                <button onClick={() => setShowQuickLinkModal(false)}>
                  <X className="h-5 w-5 text-zinc-400 hover:text-zinc-900 cursor-pointer" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="relative">
                  <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Buscar fornecedor por nome ou CNPJ..."
                    value={quickLinkSearch}
                    onChange={e => setQuickLinkSearch(e.target.value)}
                    className="w-full border border-zinc-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                  />
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-zinc-100 border border-zinc-200 rounded-lg">
                  {quickLinkCandidates.map(c => {
                    const isSelected = quickLinkSelected.has(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          const next = new Set(quickLinkSelected);
                          if (isSelected) next.delete(c.id);
                          else next.add(c.id);
                          setQuickLinkSelected(next);
                        }}
                        className={`p-3 flex items-center justify-between cursor-pointer hover:bg-zinc-50 transition-colors ${
                          isSelected ? 'bg-blue-50/60' : ''
                        }`}
                      >
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">{c.name}</p>
                          <div className="text-xs text-zinc-500 flex items-center gap-2 mt-0.5">
                            {c.cnpj && <span className="font-mono">CNPJ: {c.cnpj}</span>}
                            <span>ID: {c.id}</span>
                          </div>
                        </div>
                        <div className="text-zinc-400">
                          {isSelected ? (
                            <CheckSquare className="h-5 w-5 text-blue-600" />
                          ) : (
                            <Square className="h-5 w-5 text-zinc-300" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {quickLinkCandidates.length === 0 && (
                    <p className="p-6 text-center text-xs text-zinc-400">Nenhum fornecedor disponível encontrado.</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50">
                <button
                  onClick={() => setShowQuickLinkModal(false)}
                  className="text-sm px-4 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-100 font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleQuickLinkSubmit}
                  disabled={quickLinkSelected.size === 0}
                  className="text-sm bg-zinc-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-zinc-800 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  Vincular Selecionados ({quickLinkSelected.size})
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // === LIST VIEW ===
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <Search className="h-4 w-4 text-zinc-400 shrink-0" />
          <input
            type="text"
            placeholder="Buscar por fornecedor, CNPJ, contato ou filial..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-sm border-none bg-transparent focus:outline-none placeholder:text-zinc-400"
          />
        </div>

        {/* Toggle Escopo: Módulo vs Global */}
        {mode !== 'all' && (
          <div className="flex items-center gap-1 border-l border-zinc-200 pl-3">
            <button
              onClick={() => setScope('module')}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                scope === 'module' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
              title={`Fornecedores associados a compras de ${getModuleName(mode)}`}
            >
              <Filter className="h-3 w-3" />
              {getModuleName(mode)} ({suppliers.length})
            </button>
            <button
              onClick={() => setScope('global')}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                scope === 'global' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
              title="Todos os fornecedores cadastrados no sistema"
            >
              <Globe className="h-3 w-3" />
              Todos ({allSuppliersGlobal.length})
            </button>
          </div>
        )}

        {/* Filtro de Vínculo */}
        <div className="flex items-center gap-1.5 border-l border-zinc-200 pl-3">
          <button
            onClick={() => setViewFilter('all')}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              viewFilter === 'all' ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Lista ({currentList.length})
          </button>
          <button
            onClick={() => setViewFilter('unified_only')}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${
              viewFilter === 'unified_only' ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <Layers className="h-3 w-3" />
            Unificados / Principais
          </button>
        </div>

        {/* Ordenação */}
        <div className="flex items-center gap-2 border-l border-zinc-200 pl-3">
          <span className="text-xs text-zinc-500 font-semibold uppercase">Ordenar:</span>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as 'name' | 'email')}
            className="text-xs border border-zinc-300 rounded px-2 py-1 bg-white focus:outline-none cursor-pointer"
          >
            <option value="name">Nome</option>
            <option value="email">Email</option>
          </select>
          <button
            onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
            className="p-1 hover:bg-zinc-100 rounded text-zinc-500 cursor-pointer"
            title={sortDir === 'asc' ? 'Crescente' : 'Decrescente'}
          >
            {sortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          </button>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2">
          {canConfig && (
            <button
              onClick={() => {
                setUnifyMainId('');
                setUnifyChildIds(new Set());
                setUnifySearch('');
                setShowUnifyModal(true);
              }}
              className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2 rounded-lg font-bold hover:bg-blue-100 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <LinkIcon className="h-3.5 w-3.5" />
              Unir Fornecedores (CNPJs)
            </button>
          )}

          {canConfig && (
            <button
              onClick={() => setEditing({ id: randomId(), name: '', contact: '', email: '', notes: '', cnpj: '' })}
              className="text-xs bg-zinc-900 text-white px-3.5 py-2 rounded-lg font-medium hover:bg-zinc-800 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <Plus className="h-4 w-4" /> Novo Fornecedor
            </button>
          )}
        </div>
      </div>

      {/* Grid de Fornecedores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedSuppliers.map(s => {
          const hasLinked = Boolean(s.linkedSuppliers && s.linkedSuppliers.length > 0);
          const isChild = Boolean(s.parentId);

          return (
            <div
              key={s.id}
              onClick={() => openDetail(s.id)}
              className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs hover:shadow-md hover:border-zinc-300 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-zinc-900 group-hover:text-blue-600 transition-colors truncate text-sm" title={s.name}>
                    {s.name}
                  </h3>
                  {hasLinked && (
                    <span className="text-[11px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 shrink-0 flex items-center gap-1">
                      <Layers className="h-3 w-3 text-blue-600" />
                      {s.linkedSuppliers!.length} CNPJs
                    </span>
                  )}
                </div>

                {/* CNPJ e Vínculo */}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {s.cnpj && (
                    <span className="text-[11px] font-mono bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded border border-zinc-200 font-medium">
                      CNPJ: {s.cnpj}
                    </span>
                  )}
                  {isChild && (
                    <span className="text-[11px] font-semibold bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200">
                      ↳ Vinculado a {s.parentName || 'Matriz'}
                    </span>
                  )}
                </div>

                {/* Contatos */}
                <div className="mt-3 space-y-1.5 text-xs text-zinc-500">
                  {s.contact && (
                    <p className="flex items-center gap-1.5 truncate">
                      <Phone className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                      {s.contact}
                    </p>
                  )}
                  {s.email && (
                    <p className="flex items-center gap-1.5 truncate">
                      <Mail className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                      {s.email}
                    </p>
                  )}
                  {!s.contact && !s.email && <p className="text-zinc-400 italic">Sem contato cadastrado</p>}
                </div>
              </div>

              {/* Prévia de CNPJs agrupados */}
              {hasLinked && (
                <div className="mt-3 pt-3 border-t border-zinc-100 text-[11px] text-zinc-500">
                  <p className="font-semibold text-zinc-700 mb-1">CNPJs / Filiais agrupadas:</p>
                  <div className="flex flex-wrap gap-1">
                    {s.linkedSuppliers!.slice(0, 2).map(c => (
                      <span key={c.id} className="bg-zinc-50 border border-zinc-200 px-1.5 py-0.5 rounded truncate max-w-[140px]" title={c.name}>
                        {c.name}
                      </span>
                    ))}
                    {s.linkedSuppliers!.length > 2 && (
                      <span className="text-zinc-400 font-medium self-center">
                        +{s.linkedSuppliers!.length - 2} outros
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sortedSuppliers.length === 0 && !loading && (
        <div className="text-center py-16 text-zinc-500 flex flex-col items-center gap-3 bg-white rounded-xl border border-zinc-200 p-8 shadow-xs">
          <Users className="h-12 w-12 text-zinc-300" />
          <div>
            <p className="text-base font-semibold text-zinc-800">Nenhum fornecedor encontrado para esta visualização.</p>
            {scope === 'module' && mode !== 'all' && (
              <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                Não há fornecedores com compras registradas especificamente em {getModuleName(mode)} no momento.
              </p>
            )}
          </div>
          {scope === 'module' && mode !== 'all' && (
            <button
              onClick={() => setScope('global')}
              className="text-xs bg-zinc-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-zinc-800 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <Globe className="h-3.5 w-3.5" />
              Ver todos os {allSuppliersGlobal.length} fornecedores do sistema
            </button>
          )}
        </div>
      )}

      {/* Modal: Unir Fornecedores (Grupo Principal + Filiais) */}
      {showUnifyModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50/70">
              <div>
                <h3 className="font-bold text-lg text-zinc-900 flex items-center gap-2">
                  <LinkIcon className="h-5 w-5 text-blue-600" />
                  Unir Fornecedores / Vincular Múltiplos CNPJs
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Agrupe fornecedores que são a mesma empresa (matriz/filiais) sob um único Fornecedor Principal.
                </p>
              </div>
              <button onClick={() => setShowUnifyModal(false)}>
                <X className="h-5 w-5 text-zinc-400 hover:text-zinc-900 cursor-pointer" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Passo 1: Escolher Fornecedor Principal */}
              <div>
                <label className="text-xs font-bold text-zinc-800 uppercase tracking-wider block mb-1.5">
                  1. Selecione o Fornecedor Principal (Matriz / Nome exibido) *
                </label>
                <select
                  value={unifyMainId}
                  onChange={e => {
                    const nextId = e.target.value;
                    setUnifyMainId(nextId);
                    const nextChildren = new Set(unifyChildIds);
                    nextChildren.delete(nextId);
                    setUnifyChildIds(nextChildren);
                  }}
                  className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                >
                  <option value="">Selecione o fornecedor principal...</option>
                  {allSuppliersGlobal
                    .filter(s => !s.parentId)
                    .map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.cnpj ? `(CNPJ: ${s.cnpj})` : `(ID: ${s.id})`}
                      </option>
                    ))}
                </select>
              </div>

              {/* Passo 2: Selecionar Filiais / Outros CNPJs para vincular */}
              {unifyMainId && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-800 uppercase tracking-wider block">
                      2. Marque os fornecedores / CNPJs a serem unificados nesta matriz
                    </label>
                    <span className="text-xs text-blue-600 font-bold">
                      {unifyChildIds.size} selecionado(s)
                    </span>
                  </div>

                  <div className="relative">
                    <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Filtrar por nome ou CNPJ..."
                      value={unifySearch}
                      onChange={e => setUnifySearch(e.target.value)}
                      className="w-full border border-zinc-300 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                    />
                  </div>

                  <div className="max-h-56 overflow-y-auto divide-y divide-zinc-150 border border-zinc-200 rounded-lg">
                    {unifyCandidates.map(s => {
                      const isChecked = unifyChildIds.has(s.id);
                      return (
                        <div
                          key={s.id}
                          onClick={() => {
                            const next = new Set(unifyChildIds);
                            if (isChecked) next.delete(s.id);
                            else next.add(s.id);
                            setUnifyChildIds(next);
                          }}
                          className={`p-2.5 flex items-center justify-between cursor-pointer hover:bg-zinc-50 transition-colors ${
                            isChecked ? 'bg-blue-50/60' : ''
                          }`}
                        >
                          <div>
                            <p className="text-xs font-bold text-zinc-900">{s.name}</p>
                            <div className="text-[11px] text-zinc-500 flex items-center gap-2 mt-0.5">
                              {s.cnpj && <span className="font-mono">CNPJ: {s.cnpj}</span>}
                              <span>ID: {s.id}</span>
                            </div>
                          </div>
                          <div>
                            {isChecked ? (
                              <CheckSquare className="h-4 w-4 text-blue-600" />
                            ) : (
                              <Square className="h-4 w-4 text-zinc-300" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {unifyCandidates.length === 0 && (
                      <p className="p-6 text-center text-xs text-zinc-400">Nenhum fornecedor correspondente.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50">
              <button
                onClick={() => setShowUnifyModal(false)}
                className="text-sm px-4 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-100 font-medium cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleUnify}
                disabled={!unifyMainId || unifyChildIds.size === 0 || unifying}
                className="text-sm bg-blue-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 cursor-pointer shadow-xs transition-colors"
              >
                {unifying ? 'Unificando...' : `Confirmar e Unir (${unifyChildIds.size} Filiais)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
              <h3 className="font-bold text-lg text-zinc-900">{editing.name ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h3>
              <button onClick={() => setEditing(null)}>
                <X className="h-5 w-5 text-zinc-400 hover:text-zinc-900 cursor-pointer" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-700 mb-1 block">Nome do Fornecedor *</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 mb-1 block">CNPJ / CPF</label>
                <input
                  type="text"
                  value={editing.cnpj || ''}
                  onChange={e => setEditing({ ...editing, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                  className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-zinc-700 mb-1 block">Contato / Telefone</label>
                  <input
                    type="text"
                    value={editing.contact || ''}
                    onChange={e => setEditing({ ...editing, contact: e.target.value })}
                    placeholder="(xx) xxxxx-xxxx"
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-700 mb-1 block">Email</label>
                  <input
                    type="email"
                    value={editing.email || ''}
                    onChange={e => setEditing({ ...editing, email: e.target.value })}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 mb-1 block">Vincular a um Fornecedor Principal (Opcional)</label>
                <select
                  value={editing.parentId || ''}
                  onChange={e => setEditing({ ...editing, parentId: e.target.value || null })}
                  className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                >
                  <option value="">Nenhum (Fornecedor Independente / Matriz)</option>
                  {allSuppliersGlobal
                    .filter(s => s.id !== editing.id && !s.parentId)
                    .map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.cnpj ? `(CNPJ: ${s.cnpj})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 mb-1 block">Observações</label>
                <textarea
                  value={editing.notes || ''}
                  onChange={e => setEditing({ ...editing, notes: e.target.value })}
                  rows={3}
                  className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-900 focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50 rounded-b-xl">
              <button
                onClick={() => setEditing(null)}
                className="text-sm px-4 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-100 font-medium cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!editing.name.trim()}
                className="text-sm bg-zinc-900 text-white px-5 py-2 rounded-lg font-medium hover:bg-zinc-800 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
