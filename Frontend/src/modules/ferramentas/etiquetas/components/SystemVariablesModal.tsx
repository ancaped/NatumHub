import React, { useState, useMemo } from 'react';
import {
  Database,
  Search,
  Plus,
  Trash2,
  Copy,
  Check,
  Package,
  Factory,
  Box,
  Building2,
  Calendar,
  Sparkles,
  Barcode,
  Type,
} from 'lucide-react';
import {
  getAllSystemVariables,
  saveCustomVariable,
  deleteCustomVariable,
  type SystemVariable,
} from '../lib/systemVariables';
import Drawer from '../../../geral/components/ui/Drawer';

interface SystemVariablesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertAsText: (variable: SystemVariable) => void;
  onInsertAsBarcode: (variable: SystemVariable) => void;
  onInsertIntoActiveElement?: (token: string) => void;
  hasActiveElement?: boolean;
}

const BTN_SECUNDARIO =
  'inline-flex items-center gap-1.5 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 rounded-lg text-xs h-8 px-2.5 cursor-pointer transition-colors';
const BTN_PRIMARIO =
  'inline-flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs h-8 px-2.5 cursor-pointer transition-colors';
const INPUT = 'w-full h-8 px-2.5 border border-zinc-200 rounded-lg text-xs bg-white focus:outline-none focus:border-zinc-900';

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
    <Drawer
      onClose={onClose}
      title="Biblioteca de Dados e Variáveis do Nexus"
      subtitle="Selecione qualquer dado do banco ou crie seus próprios campos para as etiquetas"
      size="lg"
      tabs={categories.map((cat) => ({
        id: cat.id,
        label: cat.label,
        icon: cat.icon,
        badge: allVariables.filter((v) => cat.id === 'all' || v.category === cat.id).length,
      }))}
      activeTab={activeCategory}
      onTabChange={(id) => {
        setActiveCategory(id);
        setIsCreatingCustom(false);
      }}
    >
      <div className="space-y-3 -mt-2">
        {/* Busca e ação principal */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              placeholder="Buscar dado (ex: validade, lote, dun-14, cnpj, peso, cliente)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 border border-zinc-200 rounded-lg text-xs bg-white focus:outline-none focus:border-zinc-900"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsCreatingCustom(!isCreatingCustom)}
            className={isCreatingCustom ? BTN_SECUNDARIO : BTN_PRIMARIO}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isCreatingCustom ? 'Voltar para Lista' : 'Criar Campo Personalizado'}</span>
          </button>
        </div>

        {isCreatingCustom ? (
          /* Formulário de nova variável */
          <div className="border border-zinc-200 rounded-lg p-4 space-y-3">
            <div>
              <h3 className="text-xs font-semibold text-zinc-900">Novo Campo Personalizado</h3>
              <p className="text-xs text-zinc-500">Crie um dado dinâmico para usar em suas etiquetas</p>
            </div>

            <form onSubmit={handleSaveCustom} className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-zinc-700 block mb-1">Nome Amigável do Campo:</label>
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
                        .replace(/[̀-ͯ]/g, '')
                        .replace(/[^a-z0-9]/g, '_');
                      setNewToken(`{${slug}}`);
                    }
                  }}
                  className={INPUT}
                />
              </div>

              <div>
                <label className="font-medium text-zinc-700 block mb-1">Tag / Código da Variável:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: {inspetor_qualidade}"
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  className={`${INPUT} font-mono`}
                />
              </div>

              <div>
                <label className="font-medium text-zinc-700 block mb-1">Valor de Exemplo / Teste:</label>
                <input
                  type="text"
                  placeholder="Ex: APROVADO CQ - CRQ 0412"
                  value={newSample}
                  onChange={(e) => setNewSample(e.target.value)}
                  className={INPUT}
                />
              </div>

              <div>
                <label className="font-medium text-zinc-700 block mb-1">Descrição / Instrução:</label>
                <textarea
                  rows={2}
                  placeholder="Para que serve este campo..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full p-2 border border-zinc-200 rounded-lg text-xs bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => setIsCreatingCustom(false)} className={BTN_SECUNDARIO}>
                  Cancelar
                </button>
                <button type="submit" className={BTN_PRIMARIO}>
                  Salvar Variável
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Lista de variáveis */
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>{filteredVariables.length} campos disponíveis</span>
              {hasActiveElement && (
                <span className="text-zinc-700 font-medium bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                  Elemento selecionado no Canvas ativo
                </span>
              )}
            </div>

            <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden">
              {filteredVariables.map((v) => {
                const isCopied = copiedToken === v.token;

                return (
                  <div
                    key={v.token}
                    className="px-3 py-2.5 hover:bg-zinc-50 transition-colors flex flex-col gap-2"
                  >
                    {/* Info e exemplo */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs text-zinc-900">{v.label}</span>
                        <span className="font-mono text-[11px] text-zinc-700 bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded">
                          {v.token}
                        </span>
                        {v.isCustom && (
                          <span className="text-[10px] font-medium text-zinc-600 bg-white border border-zinc-200 px-1.5 py-0.5 rounded">
                            Personalizado
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{v.description}</p>
                      <div className="text-[11px] font-mono text-zinc-500 mt-1">
                        Exemplo real: <strong className="text-zinc-900">{v.sample}</strong>
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Inserir no elemento selecionado */}
                      {hasActiveElement && onInsertIntoActiveElement && (
                        <button
                          type="button"
                          onClick={() => {
                            onInsertIntoActiveElement(v.token);
                            onClose();
                          }}
                          className={BTN_PRIMARIO}
                          title="Inserir no elemento selecionado atualmente no Canvas"
                        >
                          <Check className="h-3 w-3" />
                          <span>Inserir no Item</span>
                        </button>
                      )}

                      {/* Novo texto */}
                      <button
                        type="button"
                        onClick={() => {
                          onInsertAsText(v);
                          onClose();
                        }}
                        className={hasActiveElement && onInsertIntoActiveElement ? BTN_SECUNDARIO : BTN_PRIMARIO}
                        title="Criar novo elemento de texto na etiqueta com este dado"
                      >
                        <Type className="h-3 w-3" />
                        <span>+ Texto</span>
                      </button>

                      {/* Código de barras, se suportado */}
                      {(v.recommendedType === 'barcode' || v.category === 'produto' || v.category === 'lote') && (
                        <button
                          type="button"
                          onClick={() => {
                            onInsertAsBarcode(v);
                            onClose();
                          }}
                          className={BTN_SECUNDARIO}
                          title="Criar código de barras vinculado a este dado"
                        >
                          <Barcode className="h-3 w-3" />
                          <span>+ Barras</span>
                        </button>
                      )}

                      {/* Copiar token */}
                      <button
                        type="button"
                        onClick={() => handleCopy(v.token)}
                        className={BTN_SECUNDARIO}
                        title="Copiar tag {var}"
                      >
                        {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {isCopied && <span>Copiado</span>}
                      </button>

                      {/* Excluir personalizado */}
                      {v.isCustom && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCustom(v.token)}
                          className={BTN_SECUNDARIO}
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
    </Drawer>
  );
}
