import React, { useEffect, useState } from 'react';
import { Filter, Layers, Settings, Trash2 } from 'lucide-react';
import { apiFetch } from '../../geral/lib/http';
import { api } from '../../geral/lib/api';
import { cn, randomId } from '../../geral/lib/utils';
import { Category, PRODUCT_LINE_STATUSES, PRODUCT_ROUTING_CATEGORIES } from '../../geral/lib/types';
import { DIAS_COMERCIAIS_PADRAO, LIMITE_POR_PAGINA_PADRAO, STATUS_IGNORADOS_PADRAO } from '../../geral/lib/regrasProduto';
import type { PreviaAcao } from '../../producao/gerenciamento/components/PreviaAcaoDrawer';

interface Props {
  /** Só o status é usado (conta quantos produtos mudam ao ignorar um status). */
  products: { status_produto: string | null }[];
  categories: Category[];
  setCategories: (cats: Category[]) => void;
  pedirPrevia: (previa: PreviaAcao) => void;
  avisar: (mensagem: string, tipo?: 'sucesso' | 'erro' | 'info') => void;
  /** Recarrega os dados da tela depois de salvar os parâmetros globais. */
  onSettingsSaved: () => Promise<void> | void;
}

/** Aba Configurações da Linha de Produtos: parâmetros globais, status ignorados e subcategorias. */
export default function ConfiguracoesTab({ products, categories, setCategories, pedirPrevia, avisar, onSettingsSaved }: Props) {
  const [configNewCatName, setConfigNewCatName] = useState('');
  const [configNewCatParent, setConfigNewCatParent] = useState('');
  const [configIgnoredStatuses, setConfigIgnoredStatuses] = useState<string[]>([]);
  const [globalDiasComerciais, setGlobalDiasComerciais] = useState(String(DIAS_COMERCIAIS_PADRAO));
  const [globalLimitPerPage, setGlobalLimitPerPage] = useState(String(LIMITE_POR_PAGINA_PADRAO));
  const [globalLancamentoMeta, setGlobalLancamentoMeta] = useState('6');
  const [globalSettingsSaving, setGlobalSettingsSaving] = useState(false);
  const [configSubTab, setConfigSubTab] = useState<'parametros' | 'status' | 'categorias'>('parametros');

  // Valores atuais dos parâmetros e dos status ignorados, lidos ao abrir a aba.
  useEffect(() => {
    let cancelado = false;
    const ler = async (chave: string): Promise<string | null> => {
      try {
        const res = await apiFetch(`/settings/${chave}`);
        if (!res.ok) return null;
        const d = await res.json();
        return d && typeof d.value === 'string' && d.value ? d.value : null;
      } catch {
        return null;
      }
    };
    (async () => {
      const [dias, limite, meta, ignorados] = await Promise.all([
        ler('dias_comerciais'),
        ler('limit_per_page'),
        ler('lancamento_meta_meses_global'),
        ler('ignored_product_statuses'),
      ]);
      if (cancelado) return;
      if (dias) setGlobalDiasComerciais(dias);
      if (limite) setGlobalLimitPerPage(limite);
      if (meta) setGlobalLancamentoMeta(meta);
      let lista = [...STATUS_IGNORADOS_PADRAO];
      if (ignorados) {
        try {
          lista = JSON.parse(ignorados);
        } catch (e) {
          console.error('Erro ao fazer parse dos status suspensos:', e);
        }
      }
      setConfigIgnoredStatuses(lista);
    })();
    return () => { cancelado = true; };
  }, []);

  const handleSaveGlobalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalSettingsSaving(true);
    try {
      const responses = await Promise.all([
        apiFetch(`/settings/dias_comerciais`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: globalDiasComerciais })
        }),
        apiFetch(`/settings/limit_per_page`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: globalLimitPerPage })
        }),
        apiFetch(`/settings/lancamento_meta_meses_global`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: globalLancamentoMeta })
        })
      ]);
      if (responses.every(r => r.ok)) {
        avisar("Configurações globais salvas com sucesso!", 'sucesso');
        await onSettingsSaved();
      } else {
        avisar("Erro ao salvar algumas configurações.", 'erro');
      }
    } catch (e) {
      console.error(e);
      avisar("Erro de conexão ao salvar.", 'erro');
    } finally {
      setGlobalSettingsSaving(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configNewCatName.trim()) return;

    try {
      const newCat: Category = {
        id: randomId(),
        name: configNewCatName.trim(),
        parentId: configNewCatParent || null,
      };
      await api.saveCategory(newCat);
      setConfigNewCatName('');
      setConfigNewCatParent('');
      const catsData = await api.getCategories();
      setCategories(catsData || []);
    } catch (e) {
      console.error(e);
      avisar("Erro ao salvar categoria", 'erro');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    pedirPrevia({
      titulo: 'Excluir categoria',
      linhas: [{ titulo: categories.find(c => c.id === id)?.name || id, detalhe: 'será excluída' }],
      confirmarRotulo: 'Excluir',
      pedirMotivo: true,
      executar: async (motivo) => {
        try {
          await api.deleteCategory(id, motivo ?? '');
        } catch (e) {
          console.error(e);
          throw new Error('Erro ao excluir categoria');
        }
        const catsData = await api.getCategories();
        setCategories(catsData || []);
      },
    });
  };

  // Status ignorado vale para todas as telas que consideram produto ativo: mostra quantos produtos mudam e só grava no OK.
  const handleToggleIgnoredStatus = (status: string) => {
    const isIgnored = configIgnoredStatuses.includes(status);
    const updated = isIgnored
      ? configIgnoredStatuses.filter(s => s !== status)
      : [...configIgnoredStatuses, status];
    const rotulo = PRODUCT_LINE_STATUSES.find(st => st.value === status)?.label || status;
    const n = products.filter(p => (p.status_produto || 'ativo') === status).length;
    pedirPrevia({
      titulo: isIgnored ? `Voltar a considerar "${rotulo}"` : `Ignorar "${rotulo}" no planejamento`,
      linhas: [
        {
          titulo: rotulo,
          detalhe: `${n} produto(s) afetado(s)`,
        },
      ],
      avisos: [
        isIgnored
          ? 'Os produtos com esse status passam a entrar nas demandas e nas estimativas de dias de estoque.'
          : 'Os produtos com esse status deixam de entrar nas demandas e nas estimativas de dias de estoque.',
        'Ajuste global: vale para todas as telas que consideram produto ativo.',
      ],
      confirmarRotulo: isIgnored ? 'Voltar a considerar' : 'Ignorar status',
      executar: async () => {
        const res = await apiFetch(`/settings/ignored_product_statuses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: JSON.stringify(updated) }),
        });
        if (!res.ok) throw new Error('Não foi possível salvar os status ignorados.');
        setConfigIgnoredStatuses(updated);
        avisar('Status ignorados atualizados.', 'sucesso');
      },
    });
  };

  return (
            <div className="flex-1 flex flex-col space-y-4">
              {/* Secondary Sub-Tabs Nav */}
              <div className="flex gap-1.5 p-1 bg-zinc-100/80 border border-zinc-200 rounded-2xl shrink-0 w-fit">
                <button
                  onClick={() => setConfigSubTab('parametros')}
                  className={cn(
                    "px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 focus:outline-none",
                    configSubTab === 'parametros'
                      ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
                      : "text-zinc-500 hover:text-zinc-800"
                  )}
                >
                  <Settings className="w-3.5 h-3.5" />
                  Parâmetros
                </button>
                <button
                  onClick={() => setConfigSubTab('status')}
                  className={cn(
                    "px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 focus:outline-none",
                    configSubTab === 'status'
                      ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
                      : "text-zinc-500 hover:text-zinc-800"
                  )}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Status
                </button>
                <button
                  onClick={() => setConfigSubTab('categorias')}
                  className={cn(
                    "px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 focus:outline-none",
                    configSubTab === 'categorias'
                      ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
                      : "text-zinc-500 hover:text-zinc-800"
                  )}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Categorias
                </button>
              </div>

              {/* Sub-Tab Contents */}
              <div className="flex-1 overflow-y-auto pr-1">
                {configSubTab === 'parametros' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                    <div className="md:col-span-1 bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-4">
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100 pb-2">
                        Parâmetros Globais
                      </h3>
                      <form onSubmit={handleSaveGlobalSettings} className="space-y-3.5 text-left">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Dias Comerciais por Mês</label>
                          <input
                            type="number"
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold text-zinc-800"
                            min={1}
                            max={31}
                            value={globalDiasComerciais}
                            onChange={(e) => setGlobalDiasComerciais(e.target.value)}
                            required
                          />
                          <span className="text-[10px] text-zinc-450 block leading-tight">
                            Converte meses ideais e prazos em dias na tabela.
                          </span>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Itens por Página</label>
                          <input
                            type="number"
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold text-zinc-800"
                            min={10}
                            max={1000}
                            value={globalLimitPerPage}
                            onChange={(e) => setGlobalLimitPerPage(e.target.value)}
                            required
                          />
                          <span className="text-[10px] text-zinc-450 block leading-tight">
                            Paginação padrão de estoque e produção.
                          </span>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Meta de Giro (Lançamentos)</label>
                          <input
                            type="number"
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold text-zinc-800"
                            min={1}
                            max={36}
                            value={globalLancamentoMeta}
                            onChange={(e) => setGlobalLancamentoMeta(e.target.value)}
                            required
                          />
                          <span className="text-[10px] text-zinc-450 block leading-tight">
                            Meses padrão até graduar Lançamento → Ativo.
                          </span>
                        </div>

                        <button
                          type="submit"
                          disabled={globalSettingsSaving}
                          className="w-full bg-zinc-900 hover:bg-zinc-850 disabled:bg-zinc-300 text-white text-xs font-bold py-2 rounded-xl shadow-sm transition-all cursor-pointer flex justify-center items-center"
                        >
                          {globalSettingsSaving ? 'Salvando...' : 'Salvar Parâmetros'}
                        </button>
                      </form>
                    </div>

                    <div className="md:col-span-2 bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-4">
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100 pb-2">
                        Regras de negócio
                      </h3>
                      
                      <div className="space-y-4 text-xs text-zinc-650 leading-relaxed text-left">
                        <div>
                          <h4 className="font-bold text-zinc-800 mb-1.5">Status do produto (ciclo de vida)</h4>
                          <ul className="space-y-1 text-zinc-500 text-[11px]">
                            {PRODUCT_LINE_STATUSES.map(st => (
                              <li key={st.value}><strong className="text-zinc-700">{st.label}:</strong> {st.description}.</li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-bold text-zinc-800 mb-1.5">Tipo e roteamento</h4>
                          <ul className="space-y-1 text-zinc-500 text-[11px]">
                            <li><strong className="text-zinc-700">Base:</strong> tipo de produto próprio (fórmula interna); pode estar ativa ou inativa e em várias linhas; roteada para Gestão de Bases em Produção.</li>
                            <li><strong className="text-zinc-700">MP / Embalagem:</strong> painel geral de Compras.</li>
                            {PRODUCT_ROUTING_CATEGORIES.filter(c => c.id !== 'cat_base').map(c => (
                              <li key={c.id}><strong className="text-zinc-700">{c.label}:</strong> {c.description}.</li>
                            ))}
                          </ul>
                        </div>

                        <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-3">
                          <p className="text-[11px] text-zinc-600 leading-relaxed">
                            <strong className="text-zinc-800">Fim de linha:</strong> embalagens exclusivas suspendem na hora; MPs seguem enquanto houver saldo de embalagem, para escoar o acabado.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {configSubTab === 'status' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                    <div className="md:col-span-1 bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-4">
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100 pb-2">
                        Status ignorados no planejamento
                      </h3>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Ciclo de vida desconsiderado na demanda. Categorias de roteamento ficam na aba Categorias.
                      </p>
                      
                      <div className="space-y-1.5 pt-1">
                        {PRODUCT_LINE_STATUSES.map(st => (
                          <label key={st.value} className="flex items-start gap-3 p-2.5 hover:bg-zinc-50 rounded-xl transition-colors cursor-pointer border border-zinc-100">
                            <input
                              type="checkbox"
                              checked={configIgnoredStatuses.includes(st.value)}
                              onChange={() => handleToggleIgnoredStatus(st.value)}
                              className="mt-0.5 rounded border-zinc-350 text-zinc-900 focus:ring-zinc-900 h-4 w-4"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-zinc-800">{st.label}</div>
                              <span className="text-[10px] text-zinc-400 font-medium leading-snug block">{st.description}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="md:col-span-2 bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-3 text-xs text-zinc-600 leading-relaxed text-left">
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Como funciona</h4>
                      <p>
                        Status <strong>ignorado</strong> sai das planilhas de demanda e estimativas de dias de estoque — evita alertas falsos para itens fora de catálogo ou terceirizados.
                      </p>
                      <p>
                        <strong>Saindo de Linha</strong> mantém comportamento dinâmico para MPs mesmo se marcado, visando consumir embalagens remanescentes.
                      </p>
                    </div>
                  </div>
                )}

                {configSubTab === 'categorias' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                    <div className="md:col-span-3 bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-[11px] text-zinc-600">
                      <strong className="text-zinc-800">Categorias ≠ Status.</strong> Status = ciclo de vida. Categorias = roteamento (Compras / Estoque / Produção).
                    </div>
                    <div className="md:col-span-1 bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-4">
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100 pb-2">
                        Nova Subcategoria
                      </h3>
                      
                      <form onSubmit={handleAddCategory} className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Nome</label>
                          <input
                            type="text"
                            placeholder="Ex: Tonalizantes, Fragrâncias..."
                            value={configNewCatName}
                            onChange={(e) => setConfigNewCatName(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-medium"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Categoria Pai</label>
                          <select
                            value={configNewCatParent}
                            onChange={(e) => setConfigNewCatParent(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-medium"
                            required
                          >
                            <option value="">Selecione...</option>
                            <option value="cat_mp">Matéria Prima</option>
                            <option value="cat_emb">Embalagem</option>
                            <option value="cat_mat">Materiais</option>
                            <option value="cat_coloracao">Coloração</option>
                            <option value="cat_apoio">Material de Apoio</option>
                            <option value="cat_base">Base de Produção</option>
                          </select>
                        </div>
                        <button
                          type="submit"
                          className="w-full bg-zinc-900 hover:bg-zinc-850 text-white text-xs font-bold py-2 rounded-xl shadow-sm transition-all cursor-pointer"
                        >
                          Adicionar Subcategoria
                        </button>
                      </form>
                    </div>

                    <div className="md:col-span-2 bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-4">
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100 pb-2">
                        Subcategorias cadastradas
                      </h3>
                      
                      <div className="overflow-y-auto max-h-[350px] border border-zinc-100 rounded-xl divide-y divide-zinc-50">
                        {categories.filter(c => c.parentId !== null).length === 0 ? (
                          <div className="p-4 text-center text-zinc-400 text-xs italic">
                            Nenhuma subcategoria personalizada cadastrada.
                          </div>
                        ) : (
                          categories.filter(c => c.parentId !== null).map(cat => {
                            const parentName = categories.find(p => p.id === cat.parentId)?.name || cat.parentId;
                            return (
                              <div key={cat.id} className="flex justify-between items-center p-3 text-xs hover:bg-zinc-50 transition-colors">
                                <div>
                                  <div className="font-bold text-zinc-800">{cat.name}</div>
                                  <div className="text-[10px] text-zinc-400 uppercase font-semibold tracking-wider">Pai: {parentName}</div>
                                </div>
                                <button
                                  onClick={() => handleDeleteCategory(cat.id)}
                                  className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                  title="Excluir subcategoria"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
  );
}
