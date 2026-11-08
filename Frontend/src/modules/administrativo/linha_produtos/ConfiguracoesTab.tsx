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

  const SUBABAS = [
    { id: 'parametros' as const, label: 'Parâmetros', icon: Settings },
    { id: 'status' as const, label: 'Status ignorados', icon: Filter, badge: configIgnoredStatuses.length },
    { id: 'categorias' as const, label: 'Subcategorias', icon: Layers },
  ];
  const campo = 'w-full min-h-[44px] md:min-h-0 px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-sm md:text-xs font-semibold text-zinc-800';
  const rotulo = 'text-[11px] font-bold text-zinc-600 block';
  const dica = 'text-[11px] text-zinc-500 leading-snug block';
  const painel = 'bg-white border border-zinc-200 rounded-2xl shadow-sm p-4 md:p-5';
  const titulo = 'text-xs font-bold text-zinc-500 uppercase tracking-wider';
  const subcategorias = categories.filter(c => c.parentId !== null);

  return (
    <div className="flex-1 flex flex-col gap-4 min-w-0">
      <div className="flex gap-2 overflow-x-auto shrink-0 -mx-1 px-1">
        {SUBABAS.map(a => {
          const Icon = a.icon;
          const ativa = configSubTab === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setConfigSubTab(a.id)}
              className={cn(
                'shrink-0 min-h-[44px] md:min-h-0 px-4 py-2 rounded-full border text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer',
                ativa ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {a.label}
              {a.badge !== undefined && (
                <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', ativa ? 'bg-zinc-700' : 'bg-zinc-100 text-zinc-600')}>{a.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {configSubTab === 'parametros' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
          <form onSubmit={handleSaveGlobalSettings} className={cn(painel, 'lg:col-span-2 space-y-4 text-left')}>
            <h3 className={titulo}>Parâmetros globais</h3>
            <div className="space-y-1.5">
              <label className={rotulo}>Dias comerciais por mês</label>
              <input type="number" className={campo} min={1} max={31} value={globalDiasComerciais} onChange={(e) => setGlobalDiasComerciais(e.target.value)} required />
              <span className={dica}>Converte meses ideais e prazos em dias.</span>
            </div>
            <div className="space-y-1.5">
              <label className={rotulo}>Itens por página</label>
              <input type="number" className={campo} min={10} max={1000} value={globalLimitPerPage} onChange={(e) => setGlobalLimitPerPage(e.target.value)} required />
              <span className={dica}>Paginação padrão de estoque e produção.</span>
            </div>
            <div className="space-y-1.5">
              <label className={rotulo}>Meta de giro dos lançamentos (meses)</label>
              <input type="number" className={campo} min={1} max={36} value={globalLancamentoMeta} onChange={(e) => setGlobalLancamentoMeta(e.target.value)} required />
              <span className={dica}>Meses até graduar de Lançamento para Ativo.</span>
            </div>
            <button
              type="submit"
              disabled={globalSettingsSaving}
              className="w-full min-h-[44px] md:min-h-0 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white text-xs font-bold py-2 rounded-xl shadow-sm transition-colors cursor-pointer"
            >
              {globalSettingsSaving ? 'Salvando...' : 'Salvar parâmetros'}
            </button>
          </form>

          <div className={cn(painel, 'lg:col-span-3 space-y-5 text-left')}>
            <h3 className={titulo}>Regras de negócio</h3>
            <div>
              <h4 className="text-xs font-bold text-zinc-800 mb-2">Status do produto (ciclo de vida)</h4>
              <ul className="divide-y divide-zinc-100 border border-zinc-100 rounded-xl">
                {PRODUCT_LINE_STATUSES.map(st => (
                  <li key={st.value} className="px-3 py-2 text-[11px] text-zinc-500 leading-snug">
                    <strong className="text-zinc-800">{st.label}</strong> · {st.description}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-800 mb-2">Tipo e roteamento</h4>
              <ul className="divide-y divide-zinc-100 border border-zinc-100 rounded-xl">
                <li className="px-3 py-2 text-[11px] text-zinc-500 leading-snug"><strong className="text-zinc-800">Base</strong> · tipo de produto próprio (fórmula interna); pode estar ativa ou inativa e em várias linhas; roteada para Gestão de Bases em Produção.</li>
                <li className="px-3 py-2 text-[11px] text-zinc-500 leading-snug"><strong className="text-zinc-800">MP / Embalagem</strong> · painel geral de Compras.</li>
                {PRODUCT_ROUTING_CATEGORIES.filter(c => c.id !== 'cat_base').map(c => (
                  <li key={c.id} className="px-3 py-2 text-[11px] text-zinc-500 leading-snug"><strong className="text-zinc-800">{c.label}</strong> · {c.description}</li>
                ))}
              </ul>
            </div>
            <p className="text-[11px] text-zinc-600 leading-relaxed bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-3">
              <strong className="text-zinc-800">Fim de linha:</strong> embalagens exclusivas suspendem na hora; MPs seguem enquanto houver saldo de embalagem, para escoar o acabado.
            </p>
          </div>
        </div>
      )}

      {configSubTab === 'status' && (
        <div className={cn(painel, 'space-y-3 text-left')}>
          <div>
            <h3 className={titulo}>Status ignorados no planejamento</h3>
            <p className="text-[11px] text-zinc-500 leading-relaxed mt-1.5">
              Status marcado sai das planilhas de demanda e das estimativas de dias de estoque (evita alertas falsos de itens fora de catálogo ou terceirizados). Saindo de Linha continua dinâmico para MPs, para consumir as embalagens que sobram. Cada mudança mostra a prévia antes de gravar.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {PRODUCT_LINE_STATUSES.map(st => {
              const ignorado = configIgnoredStatuses.includes(st.value);
              return (
                <label
                  key={st.value}
                  className={cn(
                    'flex items-start gap-3 px-3.5 py-3 min-h-[44px] rounded-xl border cursor-pointer transition-colors',
                    ignorado ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200 hover:bg-zinc-50'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={ignorado}
                    onChange={() => handleToggleIgnoredStatus(st.value)}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  <span className="min-w-0">
                    <span className="text-xs font-bold block">{st.label}{ignorado && ' · ignorado'}</span>
                    <span className={cn('text-[11px] leading-snug block', ignorado ? 'text-zinc-300' : 'text-zinc-500')}>{st.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {configSubTab === 'categorias' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
          <form onSubmit={handleAddCategory} className={cn(painel, 'lg:col-span-2 space-y-4 text-left')}>
            <div>
              <h3 className={titulo}>Nova subcategoria</h3>
              <p className="text-[11px] text-zinc-500 leading-snug mt-1.5">Categoria é roteamento (Compras, Estoque, Produção); status é ciclo de vida.</p>
            </div>
            <div className="space-y-1.5">
              <label className={rotulo}>Nome</label>
              <input type="text" placeholder="Ex: Tonalizantes, Fragrâncias..." value={configNewCatName} onChange={(e) => setConfigNewCatName(e.target.value)} className={campo} required />
            </div>
            <div className="space-y-1.5">
              <label className={rotulo}>Categoria pai</label>
              <select value={configNewCatParent} onChange={(e) => setConfigNewCatParent(e.target.value)} className={campo} required>
                <option value="">Selecione...</option>
                <option value="cat_mp">Matéria Prima</option>
                <option value="cat_emb">Embalagem</option>
                <option value="cat_mat">Materiais</option>
                <option value="cat_coloracao">Coloração</option>
                <option value="cat_apoio">Material de Apoio</option>
                <option value="cat_base">Base de Produção</option>
              </select>
            </div>
            <button type="submit" className="w-full min-h-[44px] md:min-h-0 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold py-2 rounded-xl shadow-sm transition-colors cursor-pointer">
              Adicionar subcategoria
            </button>
          </form>

          <div className={cn(painel, 'lg:col-span-3 space-y-3')}>
            <h3 className={cn(titulo, 'flex items-center justify-between')}>
              Subcategorias cadastradas
              <span className="text-[10px] font-bold bg-zinc-100 text-zinc-600 rounded-full px-2 py-0.5 tabular-nums">{subcategorias.length}</span>
            </h3>
            <div className="max-h-[420px] overflow-y-auto border border-zinc-100 rounded-xl divide-y divide-zinc-100">
              {subcategorias.length === 0 ? (
                <div className="p-4 text-center text-zinc-400 text-xs italic">Nenhuma subcategoria personalizada cadastrada.</div>
              ) : (
                subcategorias.map(cat => {
                  const parentName = categories.find(p => p.id === cat.parentId)?.name || cat.parentId;
                  return (
                    <div key={cat.id} className="flex justify-between items-center gap-2 pl-3.5 pr-1.5 py-1.5 min-h-[44px] text-xs hover:bg-zinc-50 transition-colors">
                      <div className="min-w-0">
                        <div className="font-bold text-zinc-800 truncate">{cat.name}</div>
                        <div className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider truncate">Pai: {parentName}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="shrink-0 h-11 w-11 md:h-8 md:w-8 flex items-center justify-center hover:bg-zinc-100 text-zinc-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                        title="Excluir subcategoria"
                        aria-label={`Excluir ${cat.name}`}
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
  );
}
