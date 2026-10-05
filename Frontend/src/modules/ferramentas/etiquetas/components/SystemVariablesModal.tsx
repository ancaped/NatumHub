import React, { useState, useMemo } from 'react';
import {
  Database,
  Search,
  X,
  Plus,
  Trash2,
  Copy,
  Check,
  Tag,
  Package,
  Factory,
  Box,
  Building2,
  Calendar,
  Sparkles,
  Barcode,
  Type,
  HelpCircle,
} from 'lucide-react';
import {
  getAllSystemVariables,
  saveCustomVariable,
  deleteCustomVariable,
  type SystemVariable,
} from '../lib/systemVariables';

interface SystemVariablesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertAsText: (variable: SystemVariable) => void;
  onInsertAsBarcode: (variable: SystemVariable) => void;
  onInsertIntoActiveElement?: (token: string) => void;
  hasActiveElement?: boolean;
}

export default function SystemVariablesModal({
  isOpen,
  onClose,
  onInsertAsText,
  onInsertAsBarcode,
  onInsertIntoActiveElement,
  hasActiveElement,
}: SystemVariablesModalProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // New Custom Variable Form State
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newToken, setNewToken] = useState('');
  const [newSample, setNewSample] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // Variables list
  const [allVariables, setAllVariables] = useState<SystemVariable[]>(() => getAllSystemVariables());

  const reloadVariables = () => {
    setAllVariables(getAllSystemVariables());
  };

  const categories = [
    { id: 'all', label: 'Todos os Dados', icon: Database },
    { id: 'produto', label: 'Cadastro de Produtos', icon: Package },
    { id: 'lote', label: 'Lotes & Produção', icon: Factory },
    { id: 'volume', label: 'Logística & Caixas', icon: Box },
    { id: 'empresa', label: 'Empresa Fabricante', icon: Building2 },
    { id: 'geral', label: 'Datas & Operador', icon: Calendar },
    { id: 'personalizado', label: 'Campos Criados por Você', icon: Sparkles },
  ];

  const filteredVariables = useMemo(() => {
    return allVariables.filter((v) => {
      const matchSearch =
        v.label.toLowerCase().includes(search.toLowerCase()) ||
        v.token.toLowerCase().includes(search.toLowerCase()) ||
        v.description.toLowerCase().includes(search.toLowerCase()) ||
        v.sample.toLowerCase().includes(search.toLowerCase());

      const matchCategory = activeCategory === 'all' || v.category === activeCategory;

      return matchSearch && matchCategory;
    });
  }, [allVariables, search, activeCategory]);

  if (!isOpen) return null;

  const handleCopy = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleSaveCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim() || !newToken.trim()) return;

    saveCustomVariable({
      label: newLabel,
      token: newToken,
      sample: newSample || 'Valor de Teste',
      description: newDescription || 'Campo personalizado criado pelo usuário',
    });

    setNewLabel('');
    setNewToken('');
    setNewSample('');
    setNewDescription('');
    setIsCreatingCustom(false);
    reloadVariables();
    setActiveCategory('personalizado');
  };

  const handleDeleteCustom = (token: string) => {
    if (!confirm(`Remover a variável ${token}?`)) return;
    deleteCustomVariable(token);
    reloadVariables();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col font-sans">
        {/* Modal Header */}
        <div className="p-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-900 tracking-tight">
                Biblioteca de Dados e Variáveis do Nexus
              </h2>
              <p className="text-xs text-zinc-500">
                Selecione qualquer dado do banco ou crie seus próprios campos para alimentar suas etiquetas térmicas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search & Top Action */}
        <div className="p-4 border-b border-zinc-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="relative w-full sm:w-96">
            <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              placeholder="Buscar dado (ex: validade, lote, dun-14, cnpj, peso, cliente)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-900"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsCreatingCustom(!isCreatingCustom)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs ${
              isCreatingCustom
                ? 'bg-zinc-200 text-zinc-800'
                : 'bg-zinc-900 hover:bg-zinc-800 text-white'
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isCreatingCustom ? 'Voltar para Lista' : 'Criar Campo Personalizado'}</span>
          </button>
        </div>

        {/* Modal Body: Categories (Left) + Variables Grid (Right) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Categories Sidebar */}
          <div className="w-56 border-r border-zinc-100 bg-zinc-50/50 p-3 space-y-1 overflow-y-auto shrink-0 select-none">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-3 block mb-1">
              Categorias de Dados
            </span>
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isSelected = activeCategory === cat.id;
              const count = allVariables.filter(
                (v) => cat.id === 'all' || v.category === cat.id
              ).length;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setIsCreatingCustom(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-900 text-white shadow-xs'
                      : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-3.5 w-3.5 ${isSelected ? 'text-white' : 'text-zinc-500'}`} />
                    <span className="truncate">{cat.label}</span>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      isSelected ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-200/80 text-zinc-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-5 overflow-y-auto bg-zinc-50/30">
            {isCreatingCustom ? (
              /* CREATE CUSTOM VARIABLE FORM */
              <div className="max-w-lg mx-auto bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-zinc-100">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900">Novo Campo Personalizado</h3>
                    <p className="text-xs text-zinc-500">
                      Crie um dado dinâmico para usar em suas etiquetas
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSaveCustom} className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-zinc-800 block mb-1">Nome Amigável do Campo:</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Inspetor de Qualidade, Temperatura de Estufa, pH"
                      value={newLabel}
                      onChange={(e) => {
                        setNewLabel(e.target.value);
                        if (!newToken) {
                          // Auto generate token
                          const slug = e.target.value
                            .toLowerCase()
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .replace(/[^a-z0-9]/g, '_');
                          setNewToken(`{${slug}}`);
                        }
                      }}
                      className="w-full p-2.5 border border-zinc-300 rounded-xl bg-zinc-50 font-bold focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-zinc-800 block mb-1">Tag / Código da Variável:</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: {inspetor_qualidade}"
                      value={newToken}
                      onChange={(e) => setNewToken(e.target.value)}
                      className="w-full p-2.5 border border-zinc-300 rounded-xl font-mono text-zinc-800 bg-zinc-50"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-zinc-800 block mb-1">Valor de Exemplo / Teste:</label>
                    <input
                      type="text"
                      placeholder="Ex: APROVADO CQ - CRQ 0412"
                      value={newSample}
                      onChange={(e) => setNewSample(e.target.value)}
                      className="w-full p-2.5 border border-zinc-300 rounded-xl bg-zinc-50"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-zinc-800 block mb-1">Descrição / Instrução:</label>
                    <textarea
                      rows={2}
                      placeholder="Para que serve este campo..."
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      className="w-full p-2 border border-zinc-300 rounded-xl bg-zinc-50"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCreatingCustom(false)}
                      className="px-4 py-2 text-zinc-600 hover:text-zinc-900 rounded-xl cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl cursor-pointer shadow-xs"
                    >
                      Salvar Variável
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* VARIABLES LIST TABLE */
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-500 font-mono">
                  <span>{filteredVariables.length} campos disponíveis</span>
                  {hasActiveElement && (
                    <span className="text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                      Elemento selecionado no Canvas ativo
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {filteredVariables.map((v) => {
                    const isCopied = copiedToken === v.token;

                    return (
                      <div
                        key={v.token}
                        className="bg-white p-3.5 rounded-2xl border border-zinc-200/80 shadow-2xs hover:border-zinc-300 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                      >
                        {/* Info & Sample */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-zinc-900">{v.label}</span>
                            <span className="font-mono text-[11px] font-black text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded">
                              {v.token}
                            </span>
                            {v.isCustom && (
                              <span className="text-[9px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded">
                                Personalizado
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-0.5">{v.description}</p>
                          <div className="text-[11px] font-mono text-zinc-600 mt-1 bg-zinc-50 px-2 py-0.5 rounded border border-zinc-100 inline-block">
                            Exemplo real: <strong className="text-zinc-900">{v.sample}</strong>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                          {/* Inject into selected element */}
                          {hasActiveElement && onInsertIntoActiveElement && (
                            <button
                              type="button"
                              onClick={() => {
                                onInsertIntoActiveElement(v.token);
                                onClose();
                              }}
                              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                              title="Inserir no elemento selecionado atualmente no Canvas"
                            >
                              <Check className="h-3 w-3" />
                              <span>Inserir no Item</span>
                            </button>
                          )}

                          {/* Add as new text */}
                          <button
                            type="button"
                            onClick={() => {
                              onInsertAsText(v);
                              onClose();
                            }}
                            className="flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 text-white px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                            title="Criar novo elemento de texto na etiqueta com este dado"
                          >
                            <Type className="h-3 w-3" />
                            <span>+ Texto</span>
                          </button>

                          {/* Add as barcode if supported */}
                          {(v.recommendedType === 'barcode' || v.category === 'produto' || v.category === 'lote') && (
                            <button
                              type="button"
                              onClick={() => {
                                onInsertAsBarcode(v);
                                onClose();
                              }}
                              className="flex items-center gap-1 bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                              title="Criar código de barras vinculado a este dado"
                            >
                              <Barcode className="h-3 w-3" />
                              <span>+ Barras</span>
                            </button>
                          )}

                          {/* Copy Token */}
                          <button
                            type="button"
                            onClick={() => handleCopy(v.token)}
                            className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                              isCopied
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : 'bg-white text-zinc-600 hover:text-zinc-900 border-zinc-200 hover:bg-zinc-50'
                            }`}
                            title="Copiar tag {var}"
                          >
                            {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>

                          {/* Delete custom */}
                          {v.isCustom && (
                            <button
                              type="button"
                              onClick={() => handleDeleteCustom(v.token)}
                              className="p-1.5 bg-white hover:bg-red-50 text-zinc-400 hover:text-red-600 border border-zinc-200 rounded-xl cursor-pointer"
                              title="Remover campo"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
