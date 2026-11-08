import { apiFetch } from '../../geral/lib/http';
import React, { useState, useEffect } from 'react';
import { CheckCircle2, RefreshCw, ShieldAlert, Layers, Tags, SlidersHorizontal, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '../../geral/lib/utils';
import { canAccessView } from '../../geral/lib/modules/permissions';
import { getAuthUser } from '../../geral/lib/auth';
import { MODULE_KEYS } from '../../geral/lib/modules/registry';
import { Category, PRODUCT_LINE_STATUSES, GraduationCandidate } from '../../geral/lib/types';
import { api } from '../../geral/lib/api';
import { useAviso } from '../../geral/components/ui/Aviso';
import PreviaAcaoDrawer, { PreviaAcao } from '../../producao/gerenciamento/components/PreviaAcaoDrawer';
import ConfiguracoesTab from './ConfiguracoesTab';
import AuditOverridesTab from './AuditOverridesTab';
import type { LineConfig, ProductOverride, ProductResult } from './tipos';
import LinhasTab from './LinhasTab';
import LinhasKitsTab from './LinhasKitsTab';
import StatusTab from './StatusTab';


interface ActiveProductsViewProps {
  onBackToHub: () => void;
  standalone?: boolean;
  /** Abre Produção > Kits, onde a composição dos kits é cadastrada e editada. */
  onAbrirKits?: () => void;
}

export default function ActiveProductsView({ onBackToHub, standalone = false, onAbrirKits }: ActiveProductsViewProps) {
  const { avisar, aviso } = useAviso();
  const [previa, setPrevia] = useState<(PreviaAcao & { aoFechar?: () => void }) | null>(null);
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [configs, setConfigs] = useState<LineConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const [graduationCandidates, setGraduationCandidates] = useState<GraduationCandidate[]>([]);

  // Bulk actions state

  const [activeAtivosTab, setActiveAtivosTab] = useState<'status' | 'linhas' | 'linhaskits' | 'overrides' | 'configuracoes'>('status');
  const [mini, setMini] = useState(() => {
    try { return localStorage.getItem('nexus_linha_produtos_sidebar_mini') === '1'; } catch { return false; }
  });
  const alternarMini = () => setMini(m => {
    const n = !m;
    try { localStorage.setItem('nexus_linha_produtos_sidebar_mini', n ? '1' : '0'); } catch { /* sem armazenamento */ }
    return n;
  });

  // Kits Composition state
  const [kitComposicao, setKitComposicao] = useState<any[]>([]);

  // States: Drawer de Composição de Kits

  // States: Compor Novo Kit Modal

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
    if (v === null || v === undefined || v === '') {
      if (campo === 'status_produto') return 'Ativa (padrão)';
      if (campo === 'linha_prefix_manual') return 'Automática (pelo prefixo)';
      if (campo === 'categoria_produto') return 'Nenhuma';
      return '(vazio)';
    }
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

  useEffect(() => {
    loadData();
  }, []);

  // O atalho só aparece para quem tem acesso a Produção > Kits.
  const irParaKits = onAbrirKits && canAccessView(getAuthUser(), MODULE_KEYS.MONTAGEM_KITS) ? onAbrirKits : undefined;

  const SECOES = [
    { id: 'status' as const, label: 'Produtos', icon: CheckCircle2, sub: 'Catálogo mestre: status, linha, tipo e categoria de cada produto. Selecione vários para editar em lote.' },
    { id: 'linhas' as const, label: 'Linhas', icon: Layers, sub: 'Linhas de produto por prefixo do código. Abra uma linha para ver e mover seus produtos.' },
    { id: 'linhaskits' as const, label: 'Linhas de Kits', icon: Tags, sub: 'Classificação própria dos kits, no mesmo desenho das linhas de produto. Abra uma linha para ver e mover seus kits.' },
    { id: 'overrides' as const, label: 'Audit de Overrides', icon: ShieldAlert, sub: 'Ajustes manuais por produto sobre as regras automáticas.' },
    { id: 'configuracoes' as const, label: 'Configurações', icon: SlidersHorizontal, sub: 'Parâmetros globais, status ignorados e subcategorias.' },
  ];
  const secaoAtual = SECOES.find(x => x.id === activeAtivosTab) || SECOES[0];

  return (
    <div className="flex flex-col md:flex-row flex-1 h-full bg-zinc-100 font-sans text-zinc-900 overflow-hidden w-full">
      {/* Sidebar */}
      <div className={cn('bg-white border-b md:border-b-0 md:border-r border-zinc-200 flex flex-col shrink-0 md:-mt-px md:transition-[width] md:duration-300 md:ease-[cubic-bezier(0.2,0,0,1)] w-full', mini ? 'md:w-16' : 'md:w-64')}>
        <div className={cn('hidden md:flex items-center', mini ? 'justify-center py-3.5' : 'justify-between pl-5 pr-2 py-3.5')}>
          {!mini && <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest whitespace-nowrap">Painel Ativos</span>}
          <button
            type="button"
            onClick={alternarMini}
            aria-label={mini ? 'Expandir menu' : 'Recolher menu'}
            title={mini ? 'Expandir menu' : 'Recolher menu'}
            className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors cursor-pointer"
          >
            {mini ? <PanelLeftOpen className="h-[17px] w-[17px]" /> : <PanelLeftClose className="h-[17px] w-[17px]" />}
          </button>
        </div>

        {/* Navigation */}
        <div className="flex md:block gap-1 md:gap-0 overflow-x-auto md:overflow-visible px-2 py-2 md:pt-0 md:space-y-0.5">
          {SECOES.map((item) => {
            const Icon = item.icon;
            const isActive = activeAtivosTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveAtivosTab(item.id)}
                title={mini ? item.label : undefined}
                className={cn(
                  'group relative md:w-full shrink-0 min-h-[44px] md:min-h-0 flex items-center gap-2 md:gap-3 px-3 py-2.5 rounded-xl text-[13px] whitespace-nowrap transition-all cursor-pointer',
                  mini && 'md:justify-center',
                  isActive ? 'bg-zinc-900 text-white font-bold shadow-sm' : 'text-zinc-600 font-medium hover:bg-zinc-100 hover:text-zinc-900'
                )}
              >
                <Icon className="h-[17px] w-[17px] shrink-0" />
                <span className={cn('truncate text-left', mini && 'md:hidden')}>{item.label}</span>
                {mini && (
                  <span className="hidden md:block pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-white shadow-xl opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100">
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Resumo */}
        {!mini && (
          <div className="hidden md:block flex-1 overflow-y-auto p-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Produtos</span>
                <span className="text-sm font-extrabold text-zinc-900 tabular-nums">{products.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Linhas</span>
                <span className="text-sm font-extrabold text-zinc-900 tabular-nums">{configs.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Overrides</span>
                <span className="text-sm font-extrabold text-zinc-900 tabular-nums">{allOverrides.length}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <main className="flex-1 overflow-y-auto p-3 md:p-6 flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3 md:gap-4 mb-4 no-print">
            <div className="min-w-0 flex-1 basis-56">
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <span>Administrativo</span>
                <span aria-hidden="true">/</span>
                <span>Linha de Produtos</span>
                <span aria-hidden="true">/</span>
                <span className="font-semibold text-zinc-900">{secaoAtual.label}</span>
              </div>
              <h1 className="mt-1.5 text-[22px] font-extrabold tracking-tight text-zinc-900">{secaoAtual.label}</h1>
              <p className="mt-1 text-[13px] text-zinc-500">{secaoAtual.sub}</p>
            </div>
            <button
              onClick={loadData}
              className="shrink-0 min-h-[44px] md:min-h-0 px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl text-zinc-700 transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-sm cursor-pointer"
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
              codigosComAjuste={new Set(allOverrides.map(o => o.codigo))}
              loading={loading}
              pedirBulk={pedirBulk}
              avisar={avisar}
              onReload={loadData}
              onAbrirKits={irParaKits}
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

          {activeAtivosTab === 'linhaskits' && (
            <LinhasKitsTab pedirPrevia={(p) => setPrevia(p)} avisar={avisar} onAbrirKits={irParaKits} />
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
