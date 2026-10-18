import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, CalendarClock, Layers, RefreshCw, Search, Table, Target } from 'lucide-react';
import AppLayout from '../../geral/components/layout/AppLayout';
import { apiFetch } from '../../geral/lib/http';

type Aba = 'linha' | 'programadas' | 'fixas' | 'kits' | 'fora';

function emProgramada(p: any) {
  return p?.is_producao_programada === 1;
}

function emFixa(p: any) {
  return p?.is_lancamento_manual === 1
    || Number(p?.lancamento_gatilho) > 0
    || Number(p?.lancamento_estoque_maximo) > 0;
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

function soKit(p: any) {
  return p?.produzir_apenas_kit === 1;
}

function linhaRuim(p: any, prefixos: Set<string>) {
  const linha = String(p?.linha_prefix || '').trim();
  return !linha || linha === 'DEFAULT' || !prefixos.has(linha);
}

function regimeDe(p: any) {
  if (emProgramada(p) && emFixa(p)) return 'Dois regimes';
  if (emProgramada(p)) return 'Programada';
  if (emFixa(p)) return 'Fixa';
  return 'Linha';
}

function efpDe(p: any) {
  const efp = Number(p.estoque_futuro_com_producao);
  if (Number.isFinite(efp) && p.estoque_futuro_com_producao != null) return efp;
  return (Number(p.estoque) || 0) + (Number(p.producao) || 0) - (Number(p.pedidos_aberto) || 0);
}

function codeKey(value: string) {
  return String(value || '').replace(/"/g, '').trim();
}

async function lerLista(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
}

export default function ProducaoRotinaView({ onBackToHub }: { onBackToHub: () => void }) {
  const [aba, setAba] = useState<Aba>('linha');
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [linhaFiltro, setLinhaFiltro] = useState('ALL');
  const [configs, setConfigs] = useState<any[]>([]);
  const [goods, setGoods] = useState<any[]>([]);
  const [kits, setKits] = useState<any[]>([]);
  const [programadas, setProgramadas] = useState<any[]>([]);
  const [fixas, setFixas] = useState<any[]>([]);
  const [composicao, setComposicao] = useState<any[]>([]);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [marcados, setMarcados] = useState<string[]>([]);
  const [linhaNova, setLinhaNova] = useState('');
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setAviso('');
    try {
      const [cfg, acabados, listaKits, listaProg, listaFixas, comps] = await Promise.all([
        lerLista('/configs'),
        lerLista('/products?limit=5000&page=1&include_programadas=true'),
        lerLista('/products?status=kits&limit=5000&page=1&include_programadas=true'),
        lerLista('/products?programadas_only=true&limit=2000&page=1'),
        lerLista('/products?fixas_only=true&limit=2000&page=1&include_programadas=true'),
        lerLista('/kits/composicao'),
      ]);
      setConfigs(cfg);
      setGoods(acabados.filter((p) => !ehBase(p) && !p.is_kit));
      setKits(listaKits.filter((p) => p.is_kit && !ehBase(p)));
      setProgramadas(listaProg.filter((p) => emProgramada(p)));
      setFixas(listaFixas.filter((p) => emFixa(p) && !ehBase(p)));
      setComposicao(comps);
    } catch {
      setAviso('Não foi possível carregar a rotina.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const prefixos = useMemo(() => new Set(configs.map((c) => String(c.linha_prefix))), [configs]);
  const nomeLinha = (prefix: string) => configs.find((c) => c.linha_prefix === prefix)?.nome_linha || prefix || 'Outros';

  const porKit = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const row of composicao) {
      const key = codeKey(row.kit_codigo);
      map.set(key, [...(map.get(key) || []), row]);
    }
    return map;
  }, [composicao]);

  const daLinha = useMemo(() => {
    const kitsDeLinha = kits.filter((p) => !emProgramada(p) && !emFixa(p));
    return [...goods.filter((p) => !emProgramada(p) && !emFixa(p) && !soKit(p)), ...kitsDeLinha];
  }, [goods, kits]);

  const fora = useMemo(() => {
    const linhas: { item: any; motivo: string }[] = [];
    const vistos = new Set<string>();
    const porCodigo = new Map<string, any>();
    for (const p of [...goods, ...kits, ...programadas, ...fixas]) porCodigo.set(p.codigo, p);
    for (const p of porCodigo.values()) {
      const motivos: string[] = [];
      if (emProgramada(p) && emFixa(p)) motivos.push('Programada e fixa ao mesmo tempo');
      if (soKit(p) && !p.is_kit) motivos.push('Peça que só existe para kit');
      if (p.is_kit && linhaRuim(p, prefixos)) motivos.push('Kit sem linha');
      if (!p.is_kit && !soKit(p) && !emProgramada(p) && !emFixa(p) && !ehBase(p) && linhaRuim(p, prefixos)) {
        motivos.push('Linha indefinida');
      }
      if (motivos.length === 0 || vistos.has(p.codigo)) continue;
      vistos.add(p.codigo);
      linhas.push({ item: p, motivo: motivos.join(' · ') });
    }
    return linhas;
  }, [goods, kits, programadas, fixas, prefixos]);

  const q = busca.trim().toLowerCase();
  const bate = (p: any) => !q || String(p.codigo || '').toLowerCase().includes(q) || String(p.descricao || '').toLowerCase().includes(q);
  const naLinha = (p: any) => linhaFiltro === 'ALL' || p.linha_prefix === linhaFiltro;

  const linhasVisiveis = daLinha.filter((p) => bate(p) && naLinha(p));
  const programadasVisiveis = programadas.filter((p) => bate(p) && naLinha(p) && !emFixa(p));
  const fixasVisiveis = fixas.filter((p) => bate(p) && naLinha(p) && !emProgramada(p));
  const kitsVisiveis = kits.filter((p) => bate(p) && naLinha(p));
  const foraVisiveis = fora.filter((row) => bate(row.item) && naLinha(row.item));

  const aplicarLinha = async () => {
    if (!linhaNova || marcados.length === 0) return;
    setAviso('');
    const res = await apiFetch('/overrides/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigos: marcados, action: 'set_line', value_str: linhaNova }),
    });
    if (!res.ok) {
      setAviso('Não foi possível gravar a linha.');
      return;
    }
    setMarcados([]);
    await carregar();
  };

  const sidebar = [
    { id: 'linha', label: 'Linha', icon: Table, badge: daLinha.length },
    { id: 'programadas', label: 'Programadas', icon: CalendarClock, badge: programadas.filter((p) => !emFixa(p)).length },
    { id: 'fixas', label: 'Fixas', icon: Target, badge: fixas.filter((p) => !emProgramada(p)).length },
    { id: 'kits', label: 'Kits', icon: Layers, badge: kits.length },
    { id: 'fora', label: 'Fora do lugar', icon: AlertTriangle, badge: fora.length },
  ];

  return (
    <AppLayout
      moduleTitle="Rotina de Produção"
      onBackToHub={onBackToHub}
      sidebarItems={sidebar}
      activeTab={aba}
      onTabChange={(id) => { setAba(id as Aba); setBusca(''); }}
      headerActions={
        <button type="button" className="btn-secondary" onClick={() => void carregar()} title="Atualizar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      }
    >
      <div className="view-container">
        {aviso && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{aviso}</div>}

        <div className="tabs-container">
          <button type="button" className={`tab-btn ${linhaFiltro === 'ALL' ? 'active' : ''}`} onClick={() => setLinhaFiltro('ALL')}>Todas</button>
          {configs.filter((c) => c.visivel !== 0).map((c) => (
            <button key={c.linha_prefix} type="button" className={`tab-btn ${linhaFiltro === c.linha_prefix ? 'active' : ''}`} onClick={() => setLinhaFiltro(c.linha_prefix)}>
              {c.nome_linha}
            </button>
          ))}
        </div>

        <div className="toolbar-section">
          <div className="search-input-wrapper">
            <Search size={18} />
            <input className="search-input" placeholder="Buscar por código ou descrição" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          {aba === 'fora' && (
            <div className="filters-wrapper">
              <select className="select-filter" value={linhaNova} onChange={(e) => setLinhaNova(e.target.value)}>
                <option value="">Mover para a linha…</option>
                {configs.map((c) => <option key={c.linha_prefix} value={c.linha_prefix}>{c.nome_linha}</option>)}
              </select>
              <button type="button" className="btn-primary" disabled={!linhaNova || marcados.length === 0} onClick={() => void aplicarLinha()}>
                Aplicar ({marcados.length})
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden text-xs">
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-2 text-zinc-500">
              <RefreshCw className="animate-spin" size={28} />
              Carregando rotina…
            </div>
          ) : aba === 'linha' ? (
            <Tabela
              vazio="Nenhum produto de linha nessa visão."
              colunas={['REF', 'Descrição', 'Linha', 'EFP', 'Status', 'Sugestão']}
              linhas={linhasVisiveis.map((p) => [
                p.codigo,
                p.descricao,
                nomeLinha(p.linha_prefix),
                `${efpDe(p).toLocaleString('pt-BR')} un`,
                p.status_label || p.status,
                Number(p.producao_recomendada) > 0 ? `${Number(p.producao_recomendada).toLocaleString('pt-BR')} un` : '—',
              ])}
            />
          ) : aba === 'programadas' ? (
            <Tabela
              vazio="Nenhuma produção programada nessa visão."
              colunas={['REF', 'Descrição', 'Linha', 'EFP', 'Gatilho', 'Lote objetivo']}
              linhas={programadasVisiveis.map((p) => [
                p.codigo,
                p.descricao,
                nomeLinha(p.linha_prefix),
                `${efpDe(p).toLocaleString('pt-BR')} un`,
                `≤ ${Number(p.producao_programada_disparo || 0).toLocaleString('pt-BR')}`,
                `${Number(p.producao_programada_objetivo || 0).toLocaleString('pt-BR')} un`,
              ])}
            />
          ) : aba === 'fixas' ? (
            <Tabela
              vazio="Nenhuma produção fixa nessa visão."
              colunas={['REF', 'Descrição', 'Linha', 'Desde', 'Gatilho', 'Teto']}
              linhas={fixasVisiveis.map((p) => [
                p.codigo,
                p.descricao,
                nomeLinha(p.linha_prefix),
                p.lancamento_data_inicio ? String(p.lancamento_data_inicio).slice(0, 10).split('-').reverse().join('/') : '—',
                `≤ ${Number(p.lancamento_gatilho || 0).toLocaleString('pt-BR')}`,
                `${Number(p.lancamento_estoque_maximo || 0).toLocaleString('pt-BR')} un`,
              ])}
            />
          ) : aba === 'kits' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50">
                  <tr>
                    {['REF', 'Descrição', 'Linha', 'Regime', 'Monta agora'].map((h) => (
                      <th key={h} className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {kitsVisiveis.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-zinc-500">Nenhum kit nessa visão.</td></tr>
                  )}
                  {kitsVisiveis.map((p) => {
                    const comps = porKit.get(codeKey(p.codigo)) || [];
                    const aberto = !!abertos[p.codigo];
                    let monta: number | null = null;
                    if (comps.length) {
                      let min = Infinity;
                      for (const c of comps) {
                        const qtd = Number(c.quantidade) || 0;
                        if (qtd <= 0 || c.estoque_componente == null) continue;
                        min = Math.min(min, Math.floor(Number(c.estoque_componente) / qtd));
                      }
                      monta = Number.isFinite(min) ? min : null;
                    }
                    return (
                      <React.Fragment key={p.codigo}>
                        <tr className="border-t border-zinc-100">
                          <td className="px-4 py-2.5 font-mono font-bold">{p.codigo}</td>
                          <td className="px-4 py-2.5">
                            <button type="button" className="font-bold text-left cursor-pointer" onClick={() => setAbertos((prev) => ({ ...prev, [p.codigo]: !prev[p.codigo] }))}>
                              {p.descricao}
                            </button>
                          </td>
                          <td className="px-4 py-2.5">{nomeLinha(p.linha_prefix)}</td>
                          <td className="px-4 py-2.5">{regimeDe(p)}</td>
                          <td className="px-4 py-2.5 font-mono">{monta == null ? '—' : monta.toLocaleString('pt-BR')}</td>
                        </tr>
                        {aberto && (
                          <tr className="bg-zinc-50">
                            <td colSpan={5} className="px-4 py-3">
                              {comps.length === 0 ? (
                                <span className="text-zinc-500">Sem composição cadastrada.</span>
                              ) : comps.map((c) => (
                                <div key={c.componente_codigo} className="flex flex-wrap gap-x-4 text-[11px] text-zinc-700">
                                  <span className="font-mono font-bold">{c.componente_codigo}</span>
                                  <span>{c.componente_descricao}</span>
                                  <span>{Number(c.quantidade).toLocaleString('pt-BR')} / kit</span>
                                  <span>Estoque {c.estoque_componente == null ? '—' : Number(c.estoque_componente).toLocaleString('pt-BR')}</span>
                                </div>
                              ))}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              <div className="pagination-container"><Boxes size={14} /> A montagem das ordens continua no módulo Kits.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-4 py-3" />
                    {['REF', 'Descrição', 'Linha atual', 'Motivo'].map((h) => (
                      <th key={h} className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {foraVisiveis.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-zinc-500">Nada fora do lugar nessa visão.</td></tr>
                  )}
                  {foraVisiveis.map((row) => (
                    <tr key={row.item.codigo} className="border-t border-zinc-100">
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={marcados.includes(row.item.codigo)}
                          onChange={(e) => setMarcados((prev) => e.target.checked ? [...prev, row.item.codigo] : prev.filter((c) => c !== row.item.codigo))}
                        />
                      </td>
                      <td className="px-4 py-2.5 font-mono font-bold">{row.item.codigo}</td>
                      <td className="px-4 py-2.5">{row.item.descricao}</td>
                      <td className="px-4 py-2.5">{nomeLinha(row.item.linha_prefix)}</td>
                      <td className="px-4 py-2.5">{row.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pagination-container"><span>{foraVisiveis.length} fora do lugar</span></div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function Tabela({ colunas, linhas, vazio }: { colunas: string[]; linhas: string[][]; vazio: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-zinc-50">
          <tr>
            {colunas.map((h) => (
              <th key={h} className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 && (
            <tr><td colSpan={colunas.length} className="px-4 py-12 text-center text-zinc-500">{vazio}</td></tr>
          )}
          {linhas.map((cells, i) => (
            <tr key={`${cells[0]}-${i}`} className="border-t border-zinc-100">
              {cells.map((cell, j) => (
                <td key={j} className={`px-4 py-2.5 ${j === 0 ? 'font-mono font-bold' : ''}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pagination-container"><span>{linhas.length} itens</span></div>
    </div>
  );
}
