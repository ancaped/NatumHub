import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../../geral/lib/api';
import { DemandResult } from '../../../geral/lib/types';
import { Trash2, Printer, Search, Plus, FileText, RefreshCw, X, Package, Edit2, Check, ClipboardList, AlertCircle } from 'lucide-react';
import { cn } from '../../../geral/lib/utils';

interface ManualRequest {
  id: string;
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  observation: string;
  createdAt: string;
  isNewItem: boolean;
}

export function SolicitationTab({ active = true }: { active?: boolean }) {
  const [requests, setRequests] = useState<ManualRequest[]>([]);
  const [demands, setDemands] = useState<DemandResult[]>([]);
  const [loadingDemands, setLoadingDemands] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [isNewItem, setIsNewItem] = useState(false);
  const [formItemCode, setFormItemCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formUnit, setFormUnit] = useState('UN');
  const [formQuantity, setFormQuantity] = useState<number>(1);
  const [formObservation, setFormObservation] = useState('');
  const [autocompleteSearch, setAutocompleteSearch] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  // Editing states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingQuantity, setEditingQuantity] = useState<number>(0);
  const [editingObservation, setEditingObservation] = useState('');

  // Load manual requests from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('natum_hub_manual_requests');
    if (stored) {
      try {
        setRequests(JSON.parse(stored));
      } catch (e) {
        console.error("Error parsing manual requests:", e);
      }
    }
  }, []);

  // Load demands for autocomplete when tab becomes active
  useEffect(() => {
    if (!active) return;
    loadDemands();
  }, [active]);

  // Save manual requests
  const saveRequests = (newRequests: ManualRequest[]) => {
    setRequests(newRequests);
    localStorage.setItem('natum_hub_manual_requests', JSON.stringify(newRequests));
  };

  // Load demands for autocomplete
  const loadDemands = async () => {
    setLoadingDemands(true);
    try {
      const results = await api.getDemands(undefined, 90);
      setDemands(results);
    } catch (e) {
      console.error("Error loading demands for autocomplete:", e);
    } finally {
      setLoadingDemands(false);
    }
  };

  // Autocomplete items search
  const filteredAutocompleteItems = useMemo(() => {
    if (!autocompleteSearch.trim()) return [];
    const q = autocompleteSearch.toLowerCase();
    return demands.filter(
      d =>
        (d.itemCode || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q)
    ).slice(0, 10);
  }, [demands, autocompleteSearch]);

  const handleSelectAutocompleteItem = (item: DemandResult) => {
    setFormItemCode(item.itemCode);
    setFormDescription(item.description);
    setFormUnit(item.unit || 'UN');
    setAutocompleteSearch('');
    setShowAutocomplete(false);
  };

  const handleAddRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formItemCode.trim() || !formDescription.trim() || formQuantity <= 0) {
      alert("Por favor, preencha código, descrição e quantidade válida.");
      return;
    }

    const newRequest: ManualRequest = {
      id: Math.random().toString(36).substr(2, 9),
      itemCode: formItemCode.trim().toUpperCase(),
      description: formDescription.trim(),
      unit: formUnit.trim().toUpperCase(),
      quantity: formQuantity,
      observation: formObservation.trim(),
      createdAt: new Date().toLocaleDateString('pt-BR'),
      isNewItem,
    };

    const updated = [newRequest, ...requests];
    saveRequests(updated);

    // Reset Form
    setFormItemCode('');
    setFormDescription('');
    setFormUnit('UN');
    setFormQuantity(1);
    setFormObservation('');
    setIsNewItem(false);
    setShowAddForm(false);
  };

  const handleRemoveRequest = (id: string) => {
    if (confirm("Deseja realmente remover esta solicitação de compra?")) {
      const updated = requests.filter(r => r.id !== id);
      saveRequests(updated);
    }
  };

  const handleStartEdit = (req: ManualRequest) => {
    setEditingId(req.id);
    setEditingQuantity(req.quantity);
    setEditingObservation(req.observation);
  };

  const handleSaveEdit = (id: string) => {
    if (editingQuantity <= 0) {
      alert("Por favor, insira uma quantidade maior que zero.");
      return;
    }
    const updated = requests.map(r => {
      if (r.id === id) {
        return {
          ...r,
          quantity: editingQuantity,
          observation: editingObservation,
        };
      }
      return r;
    });
    saveRequests(updated);
    setEditingId(null);
  };

  const handleClearAll = () => {
    if (confirm("Tem certeza de que deseja limpar TODAS as solicitações manuais? Esta ação não pode ser desfeita.")) {
      saveRequests([]);
    }
  };

  // Filter requests displayed in list
  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return requests;
    const q = searchQuery.toLowerCase();
    return requests.filter(
      r =>
        r.itemCode.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.observation.toLowerCase().includes(q)
    );
  }, [requests, searchQuery]);

  // Report printing function (using hidden iframe to bypass popup blocking)
  const handlePrintReport = () => {
    if (requests.length === 0) return;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    const today = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const rowsHtml = requests
      .map(
        r => `
      <tr>
        <td style="font-family: monospace; font-weight: bold;">${r.itemCode}</td>
        <td>
          <div style="font-weight: bold; color: #1f2937;">${r.description}</div>
          ${r.isNewItem ? '<span style="font-size: 8px; color: #3b82f6; font-weight: bold; border: 1px solid #bfdbfe; background-color: #eff6ff; padding: 1px 3px; border-radius: 3px; display: inline-block; margin-top: 2px;">Novo Item</span>' : ''}
        </td>
        <td style="text-align: center; text-transform: uppercase;">${r.unit}</td>
        <td style="text-align: right; font-weight: bold; color: #111827; font-size: 11px;">${r.quantity.toLocaleString('pt-BR')}</td>
        <td style="color: #4b5563; font-style: italic; font-size: 10px;">${r.observation || '-'}</td>
        <td style="text-align: center; color: #6b7280; font-size: 10px;">${r.createdAt}</td>
      </tr>
    `
      )
      .join('');

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Solicitações Manuais de Compra</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          body {
            font-family: 'Inter', sans-serif;
            margin: 40px;
            color: #1f2937;
            font-size: 10px;
            line-height: 1.4;
          }
          header {
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .header-title {
            font-size: 18px;
            font-weight: 700;
            color: #111827;
            margin: 0 0 5px 0;
            text-transform: uppercase;
            letter-spacing: -0.5px;
          }
          .header-meta {
            display: flex;
            justify-content: space-between;
            color: #4b5563;
            font-size: 9px;
          }
          .meta-group {
            display: flex;
            gap: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          th {
            background-color: #f3f4f6;
            color: #374151;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 8px;
            padding: 8px 10px;
            border-bottom: 2px solid #d1d5db;
          }
          td {
            padding: 8px 10px;
            border-bottom: 1px solid #e5e7eb;
            vertical-align: middle;
          }
          .signatures {
            margin-top: 60px;
            display: flex;
            justify-content: space-between;
            page-break-inside: avoid;
          }
          .signature-box {
            width: 45%;
            text-align: center;
          }
          .signature-line {
            border-top: 1px solid #9ca3af;
            margin-top: 35px;
            margin-bottom: 5px;
          }
          .signature-title {
            font-size: 9px;
            color: #6b7280;
            font-weight: 600;
            text-transform: uppercase;
          }
          footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            justify-content: space-between;
            font-size: 8px;
            color: #9ca3af;
            border-top: 1px solid #f3f4f6;
            padding-top: 5px;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        <header>
          <h1 class="header-title">Solicitações de Compra Manuais</h1>
          <div class="header-meta">
            <div>Gerado em: <strong>${today}</strong></div>
            <div class="meta-group">
              <div>Total de Itens: <strong>${requests.length}</strong></div>
              <div>Origem: <strong>Nexus Compras</strong></div>
            </div>
          </div>
        </header>

        <table>
          <thead>
            <tr>
              <th style="width: 80px; text-align: left;">Código</th>
              <th style="text-align: left;">Descrição</th>
              <th style="width: 60px; text-align: center;">Unidade</th>
              <th style="width: 80px; text-align: right;">Qtd Solicitada</th>
              <th style="text-align: left;">Observação</th>
              <th style="width: 80px; text-align: center;">Data Solicit.</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="signatures">
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-title">Solicitante</div>
          </div>
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-title">Aprovação / Direção</div>
          </div>
        </div>

        <footer>
          <div>Nexus — Sistema de Gestão Unificado</div>
          <div>Relatório de Solicitações Manuais</div>
        </footer>
      </body>
      </html>
    `;

    doc.open();
    doc.write(printHtml);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-12.25rem)]">
      {/* Top Header Card */}
      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div className="text-left">
          <h3 className="font-extrabold text-zinc-900 text-lg flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-zinc-700" />
            Solicitações de Compra (Inserção Manual)
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Adicione manualmente produtos que precisam ser comprados (devido a erros de estoque, primeira compra, etc.).
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => handleClearAll()}
            disabled={requests.length === 0}
            className="text-xs border border-zinc-200 text-zinc-650 px-3.5 py-2 rounded-lg font-bold hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Limpar Solicitações
          </button>
          <button
            onClick={handlePrintReport}
            disabled={requests.length === 0}
            className="text-xs bg-zinc-900 text-white px-3.5 py-2 rounded-lg font-bold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir Solicitações ({requests.length})
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="text-xs bg-emerald-600 text-white px-3.5 py-2 rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova Solicitação
          </button>
        </div>
      </div>

      {/* Main Table Panel */}
      <div className="flex-1 flex gap-4 overflow-hidden relative">
        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col w-full">
          {/* Search bar */}
          <div className="px-4 py-2.5 border-b border-zinc-200 bg-zinc-50 flex items-center shrink-0">
            <div className="flex items-center gap-2 bg-white border border-zinc-300 rounded-lg px-3 py-1.5 w-full max-w-md">
              <Search className="h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar solicitações..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="text-xs bg-transparent border-none focus:outline-none w-full text-zinc-800"
              />
            </div>
          </div>

          {/* Table content */}
          <div className="flex-1 overflow-y-auto">
            {filteredRequests.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-12 text-zinc-400 gap-2">
                <ClipboardList className="h-10 w-10 text-zinc-300" />
                <span className="font-bold text-sm">Nenhuma solicitação encontrada</span>
                <p className="text-xs text-zinc-500 max-w-sm text-center mt-1">
                  Clique no botão "Nova Solicitação" para registrar manualmente um produto que necessita de compra.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-6 py-4">Código</th>
                    <th className="px-6 py-4">Descrição</th>
                    <th className="px-6 py-4 text-center">Unidade</th>
                    <th className="px-6 py-4 text-right">Qtd Solicitada</th>
                    <th className="px-6 py-4">Observação / Justificativa</th>
                    <th className="px-6 py-4 text-center">Data</th>
                    <th className="px-6 py-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-150">
                  {filteredRequests.map(req => {
                    const isEditing = editingId === req.id;
                    return (
                      <tr key={req.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-zinc-900">{req.itemCode}</td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-zinc-800">{req.description}</div>
                          {req.isNewItem && (
                            <span className="inline-flex items-center px-1.5 py-0.2 mt-0.5 rounded text-[8px] font-bold bg-blue-50 text-blue-600 border border-blue-200">
                              Novo Item
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center font-semibold text-zinc-600 uppercase">{req.unit}</td>
                        <td className="px-6 py-4 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editingQuantity}
                              onChange={e => setEditingQuantity(Number(e.target.value))}
                              className="w-20 text-xs border border-zinc-300 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-zinc-900"
                              min={1}
                            />
                          ) : (
                            <span className="font-extrabold text-zinc-900">{req.quantity.toLocaleString('pt-BR')}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 max-w-xs truncate">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingObservation}
                              onChange={e => setEditingObservation(e.target.value)}
                              className="w-full text-xs border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                            />
                          ) : (
                            <span className="text-zinc-600 italic font-medium" title={req.observation}>
                              {req.observation || <span className="text-zinc-350">—</span>}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center text-zinc-500 font-medium">{req.createdAt}</td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => handleSaveEdit(req.id)}
                                  className="p-1 hover:bg-emerald-50 text-emerald-600 rounded cursor-pointer transition-colors"
                                  title="Salvar alterações"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="p-1 hover:bg-rose-50 text-rose-600 rounded cursor-pointer transition-colors"
                                  title="Cancelar"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleStartEdit(req)}
                                  className="p-1 hover:bg-zinc-100 text-zinc-600 rounded cursor-pointer transition-colors"
                                  title="Editar quantidade / observação"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleRemoveRequest(req.id)}
                                  className="p-1 hover:bg-rose-50 text-rose-600 rounded cursor-pointer transition-colors"
                                  title="Excluir solicitação"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Modal Nova Solicitação */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 cursor-pointer" onClick={() => setShowAddForm(false)} />

          <form
            onSubmit={handleAddRequest}
            className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 z-10 border border-zinc-200 text-left"
          >
            <div className="px-6 py-5 border-b border-zinc-200 bg-zinc-50/50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-zinc-700" />
                <h3 className="font-extrabold text-zinc-900 text-base">Nova Solicitação de Compra</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="p-1.5 hover:bg-zinc-150 rounded-lg text-zinc-400 hover:text-zinc-700 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Opção item não cadastrado */}
              <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-150 p-3.5 rounded-xl">
                <input
                  type="checkbox"
                  id="chk-new-item"
                  checked={isNewItem}
                  onChange={e => {
                    setIsNewItem(e.target.checked);
                    setFormItemCode('');
                    setFormDescription('');
                    setFormUnit('UN');
                    setAutocompleteSearch('');
                  }}
                  className="rounded text-zinc-900 focus:ring-zinc-900 h-4 w-4 cursor-pointer"
                />
                <label htmlFor="chk-new-item" className="text-xs font-bold text-zinc-800 cursor-pointer">
                  Este produto não está cadastrado no sistema (Primeira compra / Novo item)
                </label>
              </div>

              {/* Autocomplete Input (if not new item) */}
              {!isNewItem ? (
                <div className="space-y-1.5 relative">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Pesquisar Produto Cadastrado</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Pesquisar por código ou descrição..."
                      value={autocompleteSearch}
                      onChange={e => {
                        setAutocompleteSearch(e.target.value);
                        setShowAutocomplete(true);
                      }}
                      onFocus={() => setShowAutocomplete(true)}
                      className="w-full border border-zinc-300 rounded-xl pl-9 pr-4 py-2 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white text-zinc-800"
                    />
                  </div>
                  {showAutocomplete && autocompleteSearch.trim() && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-xl shadow-xl z-55 max-h-56 overflow-y-auto divide-y divide-zinc-100">
                      {filteredAutocompleteItems.length === 0 ? (
                        <div className="p-3 text-center text-xs text-zinc-400">Nenhum produto cadastrado encontrado.</div>
                      ) : (
                        filteredAutocompleteItems.map(item => (
                          <div
                            key={item.itemCode}
                            onClick={() => handleSelectAutocompleteItem(item)}
                            className="p-2.5 flex flex-col text-left hover:bg-zinc-50 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-zinc-650 text-[10px] bg-zinc-100 px-1.5 py-0.2 rounded">
                                {item.itemCode}
                              </span>
                              <span className="text-xs font-bold text-zinc-800 truncate">{item.description}</span>
                            </div>
                            <span className="text-[9px] text-zinc-400 mt-0.5">Estoque Atual: {item.currentStock} {item.unit}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Form Fields */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1 space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Código Insumo</label>
                  <input
                    type="text"
                    required
                    disabled={!isNewItem}
                    value={formItemCode}
                    onChange={e => setFormItemCode(e.target.value)}
                    placeholder="Código (ex: MP001)"
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-500 font-mono font-bold"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Descrição do Item</label>
                  <input
                    type="text"
                    required
                    disabled={!isNewItem}
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    placeholder="Nome descritivo da matéria-prima/embalagem"
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-500 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Unidade</label>
                  <input
                    type="text"
                    required
                    disabled={!isNewItem}
                    value={formUnit}
                    onChange={e => setFormUnit(e.target.value)}
                    placeholder="ex: KG, UN, L"
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-500 uppercase font-semibold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Quantidade Solicitada</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formQuantity}
                    onChange={e => setFormQuantity(Number(e.target.value))}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none text-zinc-900 font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Observações / Justificativa</label>
                <textarea
                  value={formObservation}
                  onChange={e => setFormObservation(e.target.value)}
                  placeholder="Justifique a necessidade de compra (ex: Erro no estoque físico, lote de testes, nova linha piloto, etc.)"
                  rows={3}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none text-zinc-800"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50/50 flex justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 border border-zinc-200 text-zinc-650 hover:bg-zinc-50 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold shadow-md transition-all cursor-pointer"
              >
                Salvar Solicitação
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
