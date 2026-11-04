import { apiFetch } from '../../geral/lib/http';
import React, { useState, useEffect } from 'react';
import { Search, CheckCircle2, RefreshCw, ShieldAlert, Layers, Database, Settings } from 'lucide-react';
import { cn } from '../../geral/lib/utils';
import { Category, PRODUCT_LINE_STATUSES, GraduationCandidate } from '../../geral/lib/types';
import { api } from '../../geral/lib/api';
import KitCompositionDrawer from '../../producao/components/KitCompositionDrawer';
import Drawer from '../../geral/components/ui/Drawer';
import { useAviso } from '../../geral/components/ui/Aviso';
import PreviaAcaoDrawer, { PreviaAcao } from '../../producao/gerenciamento/components/PreviaAcaoDrawer';
import ConfiguracoesTab from './ConfiguracoesTab';
import AuditOverridesTab from './AuditOverridesTab';
import type { LineConfig, ProductOverride, ProductResult } from './tipos';
import KitsTab from './KitsTab';
import LinhasTab from './LinhasTab';
import StatusTab from './StatusTab';


interface ActiveProductsViewProps {
  onBackToHub: () => void;
  standalone?: boolean;
}

export default function ActiveProductsView({ onBackToHub, standalone = false }: ActiveProductsViewProps) {
  const { avisar, aviso } = useAviso();
  const [previa, setPrevia] = useState<(PreviaAcao & { aoFechar?: () => void }) | null>(null);
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [configs, setConfigs] = useState<LineConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const [graduationCandidates, setGraduationCandidates] = useState<GraduationCandidate[]>([]);

  // Bulk actions state

  const [activeAtivosTab, setActiveAtivosTab] = useState<'status' | 'linhas' | 'kits' | 'overrides' | 'configuracoes'>('status');

  // Kits Composition state
  const [kitComposicao, setKitComposicao] = useState<any[]>([]);
  const [uploadingKitsConfig, setUploadingKitsConfig] = useState(false);

  // States: Drawer de Composição de Kits
  const [selectedDrawerKitCode, setSelectedDrawerKitCode] = useState('');
  const [selectedDrawerKitDesc, setSelectedDrawerKitDesc] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // States: Compor Novo Kit Modal
  const [isNewKitModalOpen, setIsNewKitModalOpen] = useState(false);
  const [newKitSearch, setNewKitSearch] = useState('');

  // Lista Mestre unificada de Kits Montáveis




  // Overrides Audit states
  const [allOverrides, setAllOverrides] = useState<ProductOverride[]>([]);

  // Category & Ignored status configuration states

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodsRes, confRes, ovrRes, catsData, gradRes, kitsRes] = await Promise.all([
        apiFetch(`/products?limit=5000&show_hidden=true&include_kits=true`),
        apiFetch(`/configs`),
        apiFetch(`/overrides`),
        api.getCategories(),
        apiFetch(`/lancamento/graduation-check`),
        apiFetch(`/kits/composicao`)
      ]);
      
      if (prodsRes.ok && confRes.ok && ovrRes.ok) {
        const prodsData = await prodsRes.json();
        const confsData = await confRes.json();
        const overridesData = await ovrRes.json();
        setProducts(prodsData.items || []);
        setConfigs(confsData || []);
        setAllOverrides(overridesData || []);
        setCategories(catsData || []);
        
        if (gradRes.ok) {
          const gradData = await gradRes.json();
          setGraduationCandidates(gradData || []);
        }

        if (kitsRes.ok) {
          const kitsData = await kitsRes.json();
          setKitComposicao(kitsData || []);
        }
      }
    } catch (e) {
      console.error("Erro ao carregar dados de produtos ativos:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchKitComposicao = async () => {
    try {
      const res = await apiFetch(`/kits/composicao`);
      if (res.ok) setKitComposicao(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const ROTULO_CAMPO: Record<string, string> = {
    visivel: 'Visibilidade',
    is_lancamento_manual: 'Lançamento',
    lancamento_gatilho: 'Gatilho',
    lancamento_estoque_maximo: 'Estoque máximo',
    observacao: 'Observação',
    linha_prefix_manual: 'Linha',
    status_produto: 'Status',
    categoria_produto: 'Categoria',
    estoque_ideal_manual: 'Estoque ideal',
    pedidos_manual: 'Pedidos',
    media_manual: 'Média de vendas',
  };

  const formatarValorPrevia = (campo: string, v: string | null) => {
    if (v === null || v === undefined || v === '') return '(vazio)';
    if (campo === 'visivel') return v === '0' ? 'oculto' : 'visível';
    if (campo === 'is_lancamento_manual') return v === '1' ? 'sim' : 'não';
    if (campo === 'status_produto') return PRODUCT_LINE_STATUSES.find(s => s.value === v)?.label || v;
    if (campo === 'categoria_produto') return categories.find(c => c.id === v)?.name || v;
    if (campo === 'linha_prefix_manual') return configs.find(c => c.linha_prefix === v)?.nome_linha || v;
    return v;
  };

  const chamarBulk = (codigos: string[], action: string, value: string | null, confirmar: boolean) =>
    apiFetch(`/overrides/bulk${confirmar ? '?confirmar=true' : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigos, action, value_str: value }),
    });

  /** Ação em lote em 2 passos: pede a prévia ao servidor, mostra no painel e só grava no OK. */
  const pedirBulk = async (opts: {
    titulo: string;
    codigos: string[];
    action: string;
    value: string | null;
    confirmarRotulo: string;
    aoConcluir: () => void | Promise<void>;
    aoCancelar?: () => void;
  }) => {
    try {
      const res = await chamarBulk(opts.codigos, opts.action, opts.value, false);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        avisar(data.error || 'Erro ao preparar a alteração em lote.', 'erro');
        opts.aoCancelar?.();
        return;
      }
      const r = data.resultado || {};
      const itens: { codigo: string; mudancas: { campo: string; de: string | null; para: string | null }[] }[] = r.itens || [];
      const linhas = itens.map(i => ({
        titulo: `${i.codigo} · ${products.find(p => p.codigo === i.codigo)?.descricao || 'produto'}`,
        detalhe: i.mudancas
          .map(m => `${ROTULO_CAMPO[m.campo] || m.campo}: ${formatarValorPrevia(m.campo, m.de)} → ${formatarValorPrevia(m.campo, m.para)}`)
          .join(' | '),
      }));
      const avisos: string[] = [];
      if ((r.totalComMudanca ?? 0) > itens.length) avisos.push(`Mostrando ${itens.length} de ${r.totalComMudanca} produtos que mudam.`);
      if ((r.totalProdutos ?? 0) > (r.totalComMudanca ?? 0)) avisos.push(`${r.totalProdutos - r.totalComMudanca} produto(s) já estão com esse valor e não mudam.`);
      setPrevia({
        titulo: opts.titulo,
        linhas,
        avisos,
        confirmarRotulo: opts.confirmarRotulo,
        aoFechar: opts.aoCancelar,
        executar: async () => {
          const r2 = await chamarBulk(opts.codigos, opts.action, opts.value, true);
          if (!r2.ok) {
            const e = await r2.json().catch(() => ({}));
            throw new Error(e.error || 'Erro ao aplicar a alteração em lote.');
          }
          await opts.aoConcluir();
        },
      });
    } catch (e) {
      console.error(e);
      avisar('Erro de conexão ao preparar a alteração em lote.', 'erro');
      opts.aoCancelar?.();
    }
  };

  const handleUploadKitsConfig = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingKitsConfig(true);
    const enviar = (confirmar: boolean) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch(`/kits/composicao/upload${confirmar ? '?confirmar=true' : ''}`, { method: 'POST', body: formData });
    };
    try {
      const res = await enviar(false);
      const data = await res.json();
      if (!res.ok) {
        avisar(data.error || 'Erro ao importar.', 'erro');
        return;
      }
      const r = data.resultado || {};
      const kits: string[] = r.kitsAfetados || [];
      setPrevia({
        titulo: 'Importar composição de kits',
        linhas: [
          { titulo: 'Relações manuais que saem', detalhe: String(r.removidas ?? 0) },
          { titulo: 'Relações do arquivo que entram', detalhe: String(r.importadas ?? 0) },
          { titulo: 'Kits afetados', detalhe: String(kits.length) },
          ...kits.slice(0, 50).map(k => ({ titulo: k })),
        ],
        avisos: [
          'Todas as relações manuais atuais são substituídas pelas do arquivo (as vindas do ERP ficam).',
          ...(kits.length > 50 ? [`Mostrando 50 de ${kits.length} kits.`] : []),
        ],
        confirmarRotulo: 'Importar e substituir',
        executar: async () => {
          const r2 = await enviar(true);
          const d2 = await r2.json().catch(() => ({}));
          if (!r2.ok) throw new Error(d2.error || 'Erro ao importar.');
          await fetchKitComposicao();
          await loadData();
          avisar(d2.message || 'Composição de kits importada.', 'sucesso');
        },
      });
    } catch (err) {
      console.error(err);
      avisar('Erro de conexão.', 'erro');
    } finally {
      setUploadingKitsConfig(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="flex flex-1 h-full bg-zinc-50 font-sans text-zinc-900 overflow-hidden w-full">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-zinc-200 flex flex-col shrink-0 -mt-px">

        {/* Navigation Tabs */}
        <div className="p-2 border-b border-zinc-100 space-y-0.5">
          <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
            Painel Ativos
          </div>
          {([
            { id: 'status' as const, label: 'Status dos Produtos', icon: CheckCircle2 },
            { id: 'linhas' as const, label: 'Definição de Linhas', icon: Layers },
            { id: 'kits' as const, label: 'Composição de Kits', icon: Database },
            { id: 'overrides' as const, label: 'Audit de Overrides', icon: ShieldAlert },
            { id: 'configuracoes' as const, label: 'Configurações', icon: Settings },
          ]).map((item) => {
            const Icon = item.icon;
            const isActive = activeAtivosTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveAtivosTab(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all cursor-pointer",
                  isActive
                    ? "bg-zinc-900 text-white font-bold shadow-sm"
                    : "text-zinc-600 font-medium hover:bg-zinc-50 hover:text-zinc-900"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-white" : item.id === 'overrides' ? "text-rose-500" : "text-zinc-400")} />
                <span className="truncate text-left">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Sidebar Info/Stats */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3.5 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Produtos</span>
              <span className="text-sm font-extrabold text-zinc-900 tabular-nums">{products.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Linhas</span>
              <span className="text-sm font-extrabold text-zinc-900 tabular-nums">{configs.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Overrides</span>
              <span className="text-sm font-extrabold text-amber-600 tabular-nums">{allOverrides.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <main className="flex-1 overflow-y-auto p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6 no-print">
            <div />
            <button 
              onClick={loadData}
              className="p-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl text-zinc-650 transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-sm cursor-pointer active:scale-98"
            >
              <RefreshCw className="h-4 w-4" />
              Recarregar
            </button>
          </div>
          {activeAtivosTab === 'status' && (
            <StatusTab
              products={products}
              categories={categories}
              configs={configs}
              kitComposicao={kitComposicao}
              graduationCandidates={graduationCandidates}
              loading={loading}
              pedirBulk={pedirBulk}
              avisar={avisar}
              onReload={loadData}
              onAbrirComposicao={(codigo, descricao) => {
                setSelectedDrawerKitCode(codigo);
                setSelectedDrawerKitDesc(descricao);
                setIsDrawerOpen(true);
              }}
            />
          )}

          {activeAtivosTab === 'linhas' && (
            <LinhasTab
              products={products}
              configs={configs}
              pedirBulk={pedirBulk}
              pedirPrevia={(p) => setPrevia(p)}
              avisar={avisar}
              onReload={loadData}
            />
          )}

          {activeAtivosTab === 'kits' && (
            <KitsTab
              products={products}
              categories={categories}
              kitComposicao={kitComposicao}
              onAbrirComposicao={(codigo, descricao) => {
                setSelectedDrawerKitCode(codigo);
                setSelectedDrawerKitDesc(descricao);
                setIsDrawerOpen(true);
              }}
              onNovoKit={() => setIsNewKitModalOpen(true)}
              uploadingKits={uploadingKitsConfig}
              onUploadKits={handleUploadKitsConfig}
              pedirPrevia={(p) => setPrevia(p)}
              avisar={avisar}
            />
          )}

          {activeAtivosTab === 'overrides' && (
            <AuditOverridesTab
              allOverrides={allOverrides}
              products={products}
              configs={configs}
              categories={categories}
              pedirBulk={pedirBulk}
              onReload={loadData}
            />
          )}

          {activeAtivosTab === 'configuracoes' && (
            <ConfiguracoesTab
              products={products}
              categories={categories}
              setCategories={setCategories}
              pedirPrevia={(p) => setPrevia(p)}
              avisar={avisar}
              onSettingsSaved={loadData}
            />
          )}
        </main>
      </div>

      <KitCompositionDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        kitCodigo={selectedDrawerKitCode}
        kitDescricao={selectedDrawerKitDesc}
        onCompositionUpdated={() => {
          fetchKitComposicao();
        }}
      />

      {/* Compor novo kit: escolher o produto */}
      {isNewKitModalOpen && (
        <Drawer
          onClose={() => { setIsNewKitModalOpen(false); setNewKitSearch(''); }}
          size="md"
          title="Definir Composição para Novo Kit"
          footer={
            <button
              type="button"
              onClick={() => { setIsNewKitModalOpen(false); setNewKitSearch(''); }}
              className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          }
        >
          <div className="space-y-3 flex-1 flex flex-col overflow-hidden">
            <p className="text-xs text-zinc-500 font-medium">
              Pesquise e selecione qualquer produto cadastrado no sistema para iniciar a definição da sua composição (estrutura de insumos).
            </p>

            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Pesquise por código ou descrição do produto..."
                value={newKitSearch}
                onChange={(e) => setNewKitSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 text-xs font-semibold text-zinc-900"
              />
            </div>

            <div className="flex-1 overflow-y-auto border border-zinc-200 rounded-xl divide-y divide-zinc-100">
              {products
                .filter(p => {
                  if (!newKitSearch.trim()) return false;
                  const q = newKitSearch.toLowerCase();
                  return (
                    (p.codigo || '').toLowerCase().includes(q) ||
                    (p.descricao || '').toLowerCase().includes(q)
                  );
                })
                .slice(0, 50)
                .map(p => {
                  const isAlreadyKit = kitComposicao.some(kc => kc.kit_codigo === p.codigo);
                  return (
                    <button
                      key={p.codigo}
                      type="button"
                      onClick={() => {
                        setSelectedDrawerKitCode(p.codigo);
                        setSelectedDrawerKitDesc(p.descricao);
                        setIsDrawerOpen(true);
                        setIsNewKitModalOpen(false);
                        setNewKitSearch('');
                      }}
                      className="w-full text-left p-3 hover:bg-zinc-50 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md border border-zinc-200">
                            {p.codigo}
                          </span>
                          <span className="text-xs font-bold text-zinc-950 truncate">
                            {p.descricao}
                          </span>
                        </div>
                      </div>
                      {isAlreadyKit ? (
                        <span className="text-[10px] font-bold text-zinc-400 shrink-0">
                          Já possui composição
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-zinc-700 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-md shrink-0">
                          Iniciar composição
                        </span>
                      )}
                    </button>
                  );
                })}
              {newKitSearch.trim() && products.filter(p => {
                const q = newKitSearch.toLowerCase();
                return (
                  (p.codigo || '').toLowerCase().includes(q) ||
                  (p.descricao || '').toLowerCase().includes(q)
                );
              }).length === 0 && (
                <div className="p-8 text-center text-zinc-400 font-bold text-xs">
                  Nenhum produto encontrado com essa busca.
                </div>
              )}
              {!newKitSearch.trim() && (
                <div className="p-8 text-center text-zinc-450 font-bold text-xs space-y-1">
                  <Search className="w-5 h-5 text-zinc-350 mx-auto" />
                  <p>Comece a digitar para pesquisar produtos.</p>
                </div>
              )}
            </div>
          </div>
        </Drawer>
      )}

      {previa && (
        <PreviaAcaoDrawer
          previa={previa}
          onClose={() => {
            previa.aoFechar?.();
            setPrevia(null);
          }}
        />
      )}
      {aviso}
    </div>
  );
}
