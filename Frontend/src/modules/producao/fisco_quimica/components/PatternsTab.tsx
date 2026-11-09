import React, { useState, useMemo, useEffect } from 'react';
import { pedirMotivoExclusao } from '../../../producao/lib/useMotivoExclusao';
import { api } from '../../../geral/lib/api';
import { FiscoQuimicaPattern, FiscoQuimicaAgent, Product } from '../../../geral/lib/types';
import { FilterBar, ReportTabs, StatusBadge } from '../../../geral/components/ui/ReportKit';
import { formatViscosity } from '../lib/fiscoUtils';
import { PatternEditor } from './PatternEditor';

interface PatternsTabProps {
  products: Product[];
  patterns: FiscoQuimicaPattern[];
  agents: FiscoQuimicaAgent[];
  onRefresh: () => void;
}

type Filtro = 'all' | 'configured' | 'missing';
const POR_PAGINA = 50;
const normalizeCode = (code: string) => code.replace(/\./g, '').trim().toLowerCase();

/** Padrão de pH, viscosidade e densidade de cada produto acabado. */
export function PatternsTab({ products, patterns, agents, onRefresh }: PatternsTabProps) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('all');
  const [pagina, setPagina] = useState(1);
  const [aberto, setAberto] = useState<Product | null>(null);

  const padraoPorCodigo = useMemo(() => new Map(patterns.map((p) => [normalizeCode(p.productCode), p] as const)), [patterns]);

  const produtos = useMemo(() => {
    const mapa = new Map<string, Product>();
    for (const p of products) mapa.set(normalizeCode(p.code), p);
    for (const pat of patterns) {
      const k = normalizeCode(pat.productCode);
      if (!mapa.has(k)) mapa.set(k, { code: pat.productCode, name: pat.productCode, packaging: `${pat.packageVolume} ${pat.packageUnit}`, validity: '3 anos' });
    }
    return Array.from(mapa.values());
  }, [products, patterns]);

  const configurados = produtos.filter((p) => padraoPorCodigo.has(normalizeCode(p.code))).length;

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim();
    const qNorm = q.replace(/\./g, '');
    return produtos.filter((p) => {
      if (q && !p.code.toLowerCase().replace(/\./g, '').includes(qNorm) && !p.name.toLowerCase().includes(q)) return false;
      const tem = padraoPorCodigo.has(normalizeCode(p.code));
      return filtro === 'all' || (filtro === 'configured' ? tem : !tem);
    });
  }, [produtos, padraoPorCodigo, busca, filtro]);

  useEffect(() => setPagina(1), [busca, filtro]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const visiveis = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const excluir = (p: Product) =>
    pedirMotivoExclusao({
      titulo: 'Excluir padrão do produto',
      alvo: `${p.name} (${p.code})`,
      confirmarRotulo: 'Excluir',
      executar: async (motivo) => {
        await api.deleteFiscoQuimicaPattern(p.code, motivo);
        setAberto(null);
        onRefresh();
      },
    });

  const selo = (tem: boolean) => (tem ? <StatusBadge variante="saudavel">Com padrão</StatusBadge> : <StatusBadge variante="aguardando">Sem padrão</StatusBadge>);

  const abas = [
    { id: 'all', label: 'Todos', contagem: produtos.length },
    { id: 'missing', label: 'Sem padrão', contagem: produtos.length - configurados },
    { id: 'configured', label: 'Com padrão', contagem: configurados },
  ];

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <ReportTabs abas={abas} ativa={filtro} onChange={(id) => setFiltro(id as Filtro)} />
      <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar produto por nome ou código..." />

      <div className="panel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="px-4 py-2.5 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
          <span className="font-bold text-zinc-700">{filtrados.length} {filtrados.length === 1 ? 'produto' : 'produtos'}</span>
          <span className="text-[11px] text-zinc-500">Os limites de pH, viscosidade e densidade valem para os laudos. Toque num produto para ver ou definir.</span>
        </div>

        {filtrados.length === 0 ? (
          <p className="p-10 text-center text-zinc-500 font-bold text-xs">Nenhum produto encontrado.</p>
        ) : (
          <>
            <div className="md:hidden divide-y divide-zinc-100">
              {visiveis.map((p) => (
                <button key={p.code} type="button" onClick={() => setAberto(p)} className="w-full min-h-11 px-4 py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer active:bg-zinc-50">
                  <span className="min-w-0">
                    <span className="block font-mono text-[11px] font-bold text-zinc-500">{p.code}</span>
                    <span className="block text-xs font-bold text-zinc-900 break-words">{p.name}</span>
                  </span>
                  <span className="shrink-0">{selo(padraoPorCodigo.has(normalizeCode(p.code)))}</span>
                </button>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="data-table compacta w-full text-left">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>pH</th>
                    <th>Viscosidade (cps)</th>
                    <th className="hidden xl:table-cell">Densidade (g/mL)</th>
                    <th className="hidden xl:table-cell">Embalagem</th>
                    <th>Padrão</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((p) => {
                    const pat = padraoPorCodigo.get(normalizeCode(p.code));
                    const vazio = <span className="text-zinc-400">—</span>;
                    return (
                      <tr key={p.code} onClick={() => setAberto(p)} className="border-b border-zinc-150 hover:bg-zinc-50 cursor-pointer">
                        <td className="max-w-[320px]">
                          <span className="block font-bold text-zinc-900 truncate" title={p.name}>{p.name}</span>
                          <span className="block font-mono text-[10px] text-zinc-400">{p.code}</span>
                        </td>
                        <td className="font-mono whitespace-nowrap">{pat ? `${pat.phMin.toFixed(2)} – ${pat.phMax.toFixed(2)}` : vazio}</td>
                        <td className="font-mono whitespace-nowrap">{pat ? `${formatViscosity(pat.viscosityMin, pat)} – ${formatViscosity(pat.viscosityMax, pat)}` : vazio}</td>
                        <td className="hidden xl:table-cell font-mono whitespace-nowrap">{pat ? `${pat.densityTarget.toFixed(3)} ± ${pat.densityTolerance.toFixed(3)}` : vazio}</td>
                        <td className="hidden xl:table-cell whitespace-nowrap">{pat ? `${pat.packageVolume} ${pat.packageUnit}` : vazio}</td>
                        <td>{selo(!!pat)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 && (
              <div className="px-4 py-2.5 border-t border-zinc-200 flex items-center justify-between gap-3 text-xs text-zinc-600">
                <button type="button" disabled={pagina === 1} onClick={() => setPagina((n) => n - 1)} className="tab-btn min-h-11 md:min-h-0 px-4 disabled:opacity-40">Anterior</button>
                <span className="font-bold">Página {pagina} de {totalPaginas}</span>
                <button type="button" disabled={pagina === totalPaginas} onClick={() => setPagina((n) => n + 1)} className="tab-btn min-h-11 md:min-h-0 px-4 disabled:opacity-40">Próxima</button>
              </div>
            )}
          </>
        )}
      </div>

      {aberto && (
        <PatternEditor
          key={aberto.code}
          produto={aberto}
          padrao={padraoPorCodigo.get(normalizeCode(aberto.code)) || null}
          agents={agents}
          onClose={() => setAberto(null)}
          onSaved={() => { setAberto(null); onRefresh(); }}
          onExcluir={() => excluir(aberto)}
        />
      )}
    </div>
  );
}
