import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle,
  ChevronLeft, ChevronRight, Edit3, CheckCircle2, PlusCircle,
  Target, Zap, CheckCircle, Package, Sparkles, ChevronDown, ArrowRightLeft,
} from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';

function DuracaoEstoque({ dias }: { dias: number }) {
  const semConsumo = !Number.isFinite(dias) || dias >= 900;
  const largura = semConsumo ? 100 : Math.max(6, Math.min(100, (dias / 90) * 100));
  const cor = semConsumo ? 'bg-zinc-300' : dias < 30 ? 'bg-rose-500' : dias <= 60 ? 'bg-amber-500' : 'bg-emerald-600';
  return (
    <div className="min-w-[92px]">
      <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${largura}%` }} />
      </div>
      <div className="text-[10px] text-zinc-500 mt-1">{semConsumo ? 'Sem consumo' : `${Math.round(dias)} dias`}</div>
    </div>
  );
}

function SortMark({ field, activeField, activeDir }: { field: string; activeField: string; activeDir: string }) {
  if (activeField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.3, marginLeft: 4 }} />;
  if (activeDir === 'asc') return <ArrowUp size={12} style={{ opacity: 0.7, marginLeft: 4 }} />;
  return <ArrowDown size={12} style={{ opacity: 0.7, marginLeft: 4 }} />;
}

function codeKey(value: string) {
  return String(value || '').replace(/"/g, '').trim();
}

function ehBase(p: any) {
  const desc = String(p?.descricao || '').toUpperCase();
  return p?.categoria_produto === 'cat_base'
    || p?.status_produto === 'bases'
    || p?.status === 'bases'
    || String(p?.codigo || '').includes('.36.')
    || desc.startsWith('BASE ')
    || desc.startsWith('PRE BASE ');
}

function emRegimeFixo(p: any) {
  return p?.is_lancamento_manual === 1
    || Number(p?.lancamento_gatilho) > 0
    || Number(p?.lancamento_estoque_maximo) > 0;
}

function projetado(p: any) {
  const efp = Number(p.estoque_futuro_com_producao);
  if (Number.isFinite(efp) && p.estoque_futuro_com_producao != null) return efp;
  return (Number(p.estoque) || 0) + (Number(p.producao) || 0) - (Number(p.pedidos_aberto) || 0);
}

function diasCobertura(p: any) {
  if (Number.isFinite(Number(p.duracao_dias)) && Number(p.duracao_dias) > 0) return Number(p.duracao_dias);
  const media = Number(p.media_vendas) || 0;
  if (media <= 0) return 999;
  return Math.round(Math.max(0, projetado(p)) / (media / 30));
}

function sugerida(p: any) {
  const gatilho = Number(p.lancamento_gatilho) || 0;
  const teto = Number(p.lancamento_estoque_maximo) || 0;
  const est = projetado(p);
  if (teto <= 0 || est > gatilho) return 0;
  return Math.max(0, teto - est);
}

function familiaDe(p: any) {
  const manual = String(p?.familia_produto || '').trim();
  if (manual) return manual;
  const desc = String(p?.descricao || '').toUpperCase();
  const regras: [string, string][] = [
    ['CRONOGRAMA', 'Cronograma'],
    ['CACHOS', 'Cachos'],
    ['MANDIOCA', 'Mandioca'],
    ['BOMBA', 'S.O.S Bomba'],
    ['DESMAIA', 'Desmaia Fios'],
    ['MILAGRE', 'Milagre dos Fios'],
    ['MAIS LISO', 'Mais Liso'],
    ['PESSEGO', 'Pêssego'],
    ['PÊSSEGO', 'Pêssego'],
  ];
  for (const [chave, nome] of regras) {
    if (desc.includes(chave)) return nome;
  }
  return 'Geral';
}

function fixoDesde(iso?: string) {
  if (!iso) return null;
  const dia = String(iso).slice(0, 10);
  const data = new Date(`${dia}T12:00:00`);
  if (Number.isNaN(data.getTime())) return null;
  const dias = Math.max(0, Math.round((Date.now() - data.getTime()) / 86400000));
  return { label: data.toLocaleDateString('pt-BR'), dias };
}

function capacidadeKit(comps: any[]) {
  let min = Infinity;
  for (const c of comps) {
    const qtd = Number(c.quantidade) || 0;
    if (qtd <= 0 || c.estoque_componente == null) continue;
    min = Math.min(min, Math.floor(Number(c.estoque_componente) / qtd));
  }
  return Number.isFinite(min) ? min : null;
}

interface Props {
  tabOptions?: { id: string; name: string }[];
  reloadToken?: number;
  onEditOverrides: (p: any) => void;
  onShowDetails?: (code: string) => void;
  productionApprovalList?: string[];
  onToggleApprovalList?: (code: string) => void;
}

const POR_PAGINA = 50;

export function ProducoesFixasTab({
  tabOptions = [],
  reloadToken = 0,
  onEditOverrides,
  onShowDetails,
  productionApprovalList = [],
  onToggleApprovalList,
}: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [composicao, setComposicao] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [linha, setLinha] = useState('ALL');
  const [familia, setFamilia] = useState('ALL');
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<'ALL' | 'disparo' | 'estavel'>('ALL');
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState('descricao');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, compRes] = await Promise.all([
        apiFetch('/products?limit=2000&page=1&fixas_only=true&include_programadas=true'),
        apiFetch('/kits/composicao'),
      ]);
      if (res.ok) {
        const data = await res.json();
        const lista = (data.items || []).filter((p: any) => emRegimeFixo(p) && !ehBase(p));
        setItems(lista);
      }
      if (compRes.ok) {
        const rows = await compRes.json();
        setComposicao(Array.isArray(rows) ? rows : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const porKit = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const row of composicao) {
      const key = codeKey(row.kit_codigo);
      const lista = map.get(key) || [];
      lista.push(row);
      map.set(key, lista);
    }
    return map;
  }, [composicao]);

  const daLinha = useMemo(() => items.filter((p) => linha === 'ALL' || p.linha_prefix === linha), [items, linha]);

  const familias = useMemo(() => {
    const nomes = new Set<string>();
    for (const p of daLinha) nomes.add(familiaDe(p));
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [daLinha]);

  const visiveis = useMemo(() => {
    const q = search.trim().toLowerCase();
    const lista = daLinha.filter((p) => {
      if (familia !== 'ALL' && familiaDe(p) !== familia) return false;
      const disparado = sugerida(p) > 0;
      if (filtro === 'disparo' && !disparado) return false;
      if (filtro === 'estavel' && disparado) return false;
      if (!q) return true;
      return String(p.codigo || '').toLowerCase().includes(q) || String(p.descricao || '').toLowerCase().includes(q);
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    lista.sort((a, b) => {
      const valor = (p: any) => {
        if (sortField === 'codigo') return String(p.codigo || '');
        if (sortField === 'efp') return projetado(p);
        if (sortField === 'gatilho') return Number(p.lancamento_gatilho) || 0;
        if (sortField === 'teto') return Number(p.lancamento_estoque_maximo) || 0;
        if (sortField === 'sugestao') return sugerida(p);
        if (sortField === 'desde') return fixoDesde(p.lancamento_data_inicio)?.dias ?? -1;
        return String(p.descricao || '');
      };
      const va = valor(a);
      const vb = valor(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'pt-BR') * dir;
    });
    return lista;
  }, [daLinha, familia, search, filtro, sortField, sortDir]);

  const stats = useMemo(() => {
    let disparos = 0;
    let volume = 0;
    for (const p of daLinha) {
      const qtd = sugerida(p);
      if (qtd > 0) {
        disparos += 1;
        volume += qtd;
      }
    }
    return { total: daLinha.length, disparos, estavel: daLinha.length - disparos, volume };
  }, [daLinha]);

  const totalPages = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA));
  const paginaAtual = Math.min(page, totalPages);
  const pagina = visiveis.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);
  const inicio = visiveis.length === 0 ? 0 : (paginaAtual - 1) * POR_PAGINA + 1;
  const fim = Math.min(paginaAtual * POR_PAGINA, visiveis.length);

  const alternarOrdem = (field: string) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(1);
  };

  const migrar = async (p: any) => {
    if (!window.confirm(`Tirar ${p.codigo} da produção fixa e devolver para a linha normal?`)) return;
    const res = await apiFetch('/overrides/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigos: [p.codigo], action: 'sair_producao_fixa' }),
    });
    if (res.ok) void load();
  };

  const filtrado = search.trim() !== '' || filtro !== 'ALL' || familia !== 'ALL' || linha !== 'ALL';

  return (
    <div className="view-container animate-in fade-in duration-200">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-sm flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 shrink-0">
            <Target size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Itens em produção fixa</div>
            <div className="text-xl font-bold text-zinc-900">{stats.total}</div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-sm flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-rose-50 text-rose-600 shrink-0">
            <Zap size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Disparos ativos (produzir)</div>
            <div className="text-xl font-bold text-rose-600">{stats.disparos}</div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-sm flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
            <CheckCircle size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Estoque estável</div>
            <div className="text-xl font-bold text-emerald-600">{stats.estavel}</div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-sm flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600 shrink-0">
            <Package size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Volume a produzir</div>
            <div className="text-xl font-bold text-zinc-900">{stats.volume.toLocaleString('pt-BR')} un</div>
          </div>
        </div>
      </div>

      {tabOptions.length > 0 && (
        <div className="tabs-container">
          {tabOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`tab-btn ${linha === opt.id ? 'active' : ''}`}
              onClick={() => { setLinha(opt.id); setFamilia('ALL'); setPage(1); }}
            >
              {opt.name}
            </button>
          ))}
        </div>
      )}

      <div className="toolbar-section">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input
            type="text"
            placeholder="Buscar item fixo por código ou descrição..."
            className="search-input"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="filters-wrapper">
          <select
            className="select-filter"
            value={familia}
            onChange={(e) => { setFamilia(e.target.value); setPage(1); }}
          >
            <option value="ALL">Todas as famílias</option>
            {familias.map((nome) => (
              <option key={nome} value={nome}>{nome}</option>
            ))}
          </select>
          <select
            className="select-filter"
            value={filtro}
            onChange={(e) => { setFiltro(e.target.value as 'ALL' | 'disparo' | 'estavel'); setPage(1); }}
          >
            <option value="ALL">Todos os disparos</option>
            <option value="disparo">Disparo atingido (produzir)</option>
            <option value="estavel">Estoque estável</option>
          </select>
          <button type="button" className="btn-secondary cursor-pointer" onClick={() => void load()} title="Recarregar dados">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col w-full text-xs">
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <RefreshCw className="animate-spin" size={32} />
            <span>Carregando produções fixas...</span>
          </div>
        ) : visiveis.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
              <Target size={24} />
            </div>
            <div className="text-base font-bold text-zinc-800">
              {filtrado ? 'Nenhum produto encontrado com os filtros selecionados.' : 'Nenhum produto em Produção Fixa'}
            </div>
            <p className="max-w-md text-xs text-zinc-500 leading-relaxed">
              {filtrado
                ? 'Tente limpar a busca ou alterar os filtros de família, disparo ou linha.'
                : 'Para colocar um produto aqui, abra a edição dele, marque a etiqueta Lançamento ou informe o gatilho fixo e o estoque máximo.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
              <thead className="bg-zinc-50 sticky top-0 z-10">
                <tr className="border-b border-zinc-200">
                  <th style={{ width: '10%', cursor: 'pointer' }} onClick={() => alternarOrdem('codigo')} className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors">
                    <div className="flex items-center gap-1">REF <SortMark field="codigo" activeField={sortField} activeDir={sortDir} /></div>
                  </th>
                  <th style={{ width: '28%', cursor: 'pointer' }} onClick={() => alternarOrdem('descricao')} className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors">
                    <div className="flex items-center gap-1">Descrição / Linha <SortMark field="descricao" activeField={sortField} activeDir={sortDir} /></div>
                  </th>
                  <th style={{ width: '12%', cursor: 'pointer' }} onClick={() => alternarOrdem('efp')} className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors text-right" title="EFP = Estoque + Produção − Pedidos">
                    <div className="flex items-center gap-1 justify-end">EFP projetado <SortMark field="efp" activeField={sortField} activeDir={sortDir} /></div>
                  </th>
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Duração</th>
                  <th style={{ width: '11%', cursor: 'pointer' }} onClick={() => alternarOrdem('gatilho')} className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors text-right">
                    <div className="flex items-center gap-1 justify-end">Gatilho fixo <SortMark field="gatilho" activeField={sortField} activeDir={sortDir} /></div>
                  </th>
                  <th style={{ width: '11%', cursor: 'pointer' }} onClick={() => alternarOrdem('teto')} className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors text-right">
                    <div className="flex items-center gap-1 justify-end">Estoque máximo <SortMark field="teto" activeField={sortField} activeDir={sortDir} /></div>
                  </th>
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Status disparo</th>
                  <th style={{ width: '10%', cursor: 'pointer' }} onClick={() => alternarOrdem('sugestao')} className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors text-right">
                    <div className="flex items-center gap-1 justify-end">Sugestão <SortMark field="sugestao" activeField={sortField} activeDir={sortDir} /></div>
                  </th>
                  <th style={{ width: '8%', textAlign: 'center' }} className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Fila aprov.</th>
                  <th style={{ width: '8%', textAlign: 'center' }} className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {pagina.map((p) => {
                  const qtd = sugerida(p);
                  const efp = projetado(p);
                  const gatilho = Number(p.lancamento_gatilho) || 0;
                  const teto = Number(p.lancamento_estoque_maximo) || 0;
                  const disparado = qtd > 0;
                  const desde = fixoDesde(p.lancamento_data_inicio);
                  const comps = porKit.get(codeKey(p.codigo)) || [];
                  const aberto = !!abertos[p.codigo];
                  const montagem = capacidadeKit(comps);
                  return (
                    <React.Fragment key={p.codigo}>
                      <tr className={`hover:bg-zinc-50/40 transition-colors ${disparado ? 'bg-rose-50/20' : ''}`}>
                        <td className="px-4 py-2.5 border-b border-zinc-100 align-middle font-mono font-bold text-zinc-600">
                          <button type="button" onClick={() => onShowDetails?.(p.codigo)} className="hover:underline text-left font-bold text-zinc-800 cursor-pointer bg-transparent border-none p-0">
                            {p.codigo}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 border-b border-zinc-100 align-middle whitespace-normal">
                          <div className="font-bold text-zinc-900 flex items-center gap-1">
                            {p.is_kit && comps.length > 0 && (
                              <button type="button" className="p-0.5 text-zinc-500 cursor-pointer" title="Ver composição" onClick={() => setAbertos((prev) => ({ ...prev, [p.codigo]: !prev[p.codigo] }))}>
                                <ChevronDown size={14} className={aberto ? 'rotate-180' : ''} />
                              </button>
                            )}
                            <button type="button" onClick={() => onShowDetails?.(p.codigo)} className="hover:underline text-left font-bold text-zinc-900 cursor-pointer bg-transparent border-none p-0">
                              {p.descricao}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                            <span className="text-[10px] text-zinc-500 font-semibold bg-zinc-100 px-1.5 py-0.5 rounded">Linha: {p.nome_linha || '—'}</span>
                            <span className="text-[10px] text-zinc-600 font-semibold bg-zinc-100 px-1.5 py-0.5 rounded">Família: {familiaDe(p)}</span>
                            <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                              <Target size={10} /> Fixa
                            </span>
                            {p.is_kit && <span className="text-[10px] font-semibold bg-zinc-100 text-zinc-700 px-1.5 py-0.5 rounded">Kit</span>}
                            {p.is_lancamento_manual === 1 && (
                              <span className="text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                <Sparkles size={10} /> Lançamento
                              </span>
                            )}
                          </div>
                          {desde && (
                            <div className="text-[10px] text-zinc-500 mt-1">Em fixo desde {desde.label} · {desde.dias} dias</div>
                          )}
                          {p.observacao && (
                            <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 w-fit">
                              <AlertTriangle size={11} className="shrink-0" />
                              <span>Obs: {p.observacao}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 border-b border-zinc-100 align-middle text-right font-bold text-zinc-900">
                          <span className={disparado ? 'text-rose-600 font-extrabold text-sm' : 'text-zinc-900 font-bold'}>
                            {efp.toLocaleString('pt-BR')} un
                          </span>
                          <div className="text-[10px] text-zinc-400 font-semibold mt-0.5">
                            <span>Est: {p.estoque}</span>
                            {' | '}
                            <span>Prod: {p.producao}</span>
                            {' | '}
                            <span>Ped: {p.pedidos_aberto}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 border-b border-zinc-100 align-middle">
                          <DuracaoEstoque dias={diasCobertura(p)} />
                        </td>
                        <td className="px-4 py-2.5 border-b border-zinc-100 align-middle text-right font-semibold text-zinc-700">
                          <div className="inline-flex items-center gap-1 bg-zinc-100 px-2 py-0.5 rounded text-zinc-800 font-mono font-bold">
                            ≤ {gatilho.toLocaleString('pt-BR')} un
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">Ponto de disparo</div>
                        </td>
                        <td className="px-4 py-2.5 border-b border-zinc-100 align-middle text-right font-semibold text-zinc-700">
                          <div className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 px-2 py-0.5 rounded font-mono font-bold">
                            {teto.toLocaleString('pt-BR')} un
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">Teto de estoque</div>
                        </td>
                        <td className="px-4 py-2.5 border-b border-zinc-100 align-middle">
                          {disparado ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              <Zap size={12} className="text-rose-600" /> Disparar produção
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 size={12} className="text-emerald-600" /> Estoque OK
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 border-b border-zinc-100 align-middle text-right font-bold">
                          {qtd > 0 ? (
                            <span className="text-rose-600 text-sm font-extrabold">{qtd.toLocaleString('pt-BR')} un</span>
                          ) : (
                            <span className="text-zinc-400 font-normal">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 border-b border-zinc-100 align-middle text-center">
                          {onToggleApprovalList && (
                            <button
                              type="button"
                              onClick={() => onToggleApprovalList(p.codigo)}
                              className={`p-1.5 rounded transition-colors cursor-pointer ${
                                productionApprovalList.includes(p.codigo)
                                  ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                                  : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600'
                              }`}
                              title={productionApprovalList.includes(p.codigo) ? 'Remover da fila de aprovação' : 'Adicionar à fila de aprovação'}
                            >
                              {productionApprovalList.includes(p.codigo) ? <CheckCircle2 size={16} /> : <PlusCircle size={16} />}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2.5 border-b border-zinc-100 align-middle text-center">
                          <button type="button" className="p-1.5 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer" onClick={() => onEditOverrides(p)} title="Editar parâmetros">
                            <Edit3 size={15} />
                          </button>
                          <button type="button" className="p-1.5 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer" onClick={() => void migrar(p)} title="Migrar para a linha normal">
                            <ArrowRightLeft size={15} />
                          </button>
                        </td>
                      </tr>
                      {aberto && comps.length > 0 && (
                        <tr className="bg-zinc-50">
                          <td colSpan={10} className="px-4 py-3 border-b border-zinc-100">
                            <div className="ml-6 border-l-2 border-zinc-300 pl-3 space-y-1">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                                Composição {montagem != null ? `· monta ${montagem.toLocaleString('pt-BR')} agora` : ''}
                              </div>
                              {comps.map((c) => (
                                <div key={c.componente_codigo} className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-zinc-700">
                                  <span className="font-mono font-bold">{c.componente_codigo}</span>
                                  <span>{c.componente_descricao}</span>
                                  <span>{Number(c.quantidade).toLocaleString('pt-BR')} / kit</span>
                                  <span>Estoque {c.estoque_componente == null ? '—' : Number(c.estoque_componente).toLocaleString('pt-BR')}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="pagination-container">
          <span>Exibindo de {inicio} a {fim} de {visiveis.length} produtos em produção fixa</span>
          <div className="pagination-controls">
            <button type="button" className="pagination-btn cursor-pointer" disabled={paginaAtual <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontWeight: '700' }}>
              Página {paginaAtual} de {totalPages}
            </span>
            <button type="button" className="pagination-btn cursor-pointer" disabled={paginaAtual >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
