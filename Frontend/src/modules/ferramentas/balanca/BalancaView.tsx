import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Printer, RefreshCw, Scale, Search } from 'lucide-react';
import AppLayout, { type SidebarItem } from '../../geral/components/layout/AppLayout';
import { apiFetch, apiJson } from '../../geral/lib/http';

type Grupo = 'ativos' | 'terceirizados' | 'inativos' | 'fragrancias';

interface ItemCarga {
  codigoErp: string;
  codigoSistema: string;
  codigoRapido: number;
  novo: boolean;
  nomeBalanca: string;
  nomeCompleto: string;
  unidade: string;
}

interface Carga {
  total: number;
  novosCodigos: number;
  grupos: Record<Grupo, ItemCarga[]>;
}

interface NovoCodigo {
  codigoErp: string;
  codigoRapido: number;
  nome: string;
}

const GRUPOS: Array<{ id: Grupo; titulo: string }> = [
  { id: 'ativos', titulo: 'Itens ativos' },
  { id: 'terceirizados', titulo: 'Terceirizados / linhas suspensas' },
  { id: 'inativos', titulo: 'Inativos' },
  { id: 'fragrancias', titulo: 'Fragrâncias e bouquets' },
];

interface BalancaViewProps {
  onBackToHub?: () => void;
}

export default function BalancaView({ onBackToHub }: BalancaViewProps) {
  const [dados, setDados] = useState<Carga | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [grupo, setGrupo] = useState<Grupo | 'todos'>('todos');
  const [previa, setPrevia] = useState<NovoCodigo[] | null>(null);
  const [gravando, setGravando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      setDados(await apiJson<Carga>('/api/ferramentas/balanca/itens'));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os itens da balança.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // 1º passo: prévia dos códigos novos (nada é gravado)
  const verPrevia = async () => {
    setErro(null);
    try {
      const r = await apiJson<{ novos: NovoCodigo[] }>('/api/ferramentas/balanca/codigos', {
        method: 'POST',
        body: JSON.stringify({ confirmar: false }),
      });
      setPrevia(r.novos ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível calcular os códigos novos.');
    }
  };

  // 2º passo: confirmar
  const confirmar = async () => {
    setGravando(true);
    setErro(null);
    try {
      await apiJson('/api/ferramentas/balanca/codigos', { method: 'POST', body: JSON.stringify({ confirmar: true }) });
      setPrevia(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar os códigos.');
    } finally {
      setGravando(false);
    }
  };

  const baixar = async () => {
    setErro(null);
    try {
      const res = await apiFetch('/api/ferramentas/balanca/itensmgv');
      if (!res.ok) {
        const corpo = await res.json().catch(() => null);
        throw new Error(corpo?.error ?? `HTTP ${res.status}`);
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ITENSMGV.TXT';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível baixar a carga.');
    }
  };

  const q = filtro.trim().toUpperCase();
  const visiveis = useMemo(
    () =>
      GRUPOS.filter((g) => grupo === 'todos' || grupo === g.id).map((g) => ({
        ...g,
        itens: (dados?.grupos?.[g.id] ?? []).filter(
          (i) =>
            !q ||
            `${i.nomeBalanca} ${i.nomeCompleto} ${i.codigoSistema} ${i.codigoRapido}`.toUpperCase().includes(q)
        ),
      })),
    [dados, grupo, q]
  );

  const sidebarItems: SidebarItem[] = [{ id: 'carga', label: 'Carga da Balança', icon: Scale }];

  return (
    <AppLayout
      moduleTitle="Carga da Balança"
      moduleSubtitle="Toledo Prix 4 Due · MGV 7 · matérias-primas"
      onBackToHub={onBackToHub || (() => undefined)}
      sidebarItems={sidebarItems}
      activeTab="carga"
      onTabChange={() => undefined}
    >
      <div className="p-6 space-y-5 balanca-print">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            .balanca-print, .balanca-print * { visibility: visible; }
            .balanca-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 10mm; }
            .balanca-no-print { display: none !important; }
            @page { size: A4; margin: 10mm; }
            tr { break-inside: avoid; }
          }
        `}</style>

        <div className="flex flex-wrap items-center justify-between gap-3 balanca-no-print">
          <p className="text-xs text-zinc-600 max-w-xl">
            Cada matéria-prima sai com dois códigos na balança: o <strong>rápido</strong> (permanente) e o do <strong>sistema</strong> (6 dígitos).
            Depois de baixar o arquivo: MGV 7 → Importar Itens/TXT → Carga para Balanças (itens).
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={carregar}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir
            </button>
            <button
              type="button"
              onClick={baixar}
              disabled={!dados || dados.novosCodigos > 0}
              title={dados && dados.novosCodigos > 0 ? 'Confirme os códigos novos antes de baixar' : 'Baixar ITENSMGV.TXT'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar ITENSMGV.TXT
            </button>
          </div>
        </div>

        {erro && <p className="text-xs font-semibold text-rose-700">{erro}</p>}

        {dados && dados.novosCodigos > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2 balanca-no-print">
            <p className="text-xs font-bold text-amber-900">
              {dados.novosCodigos} matéria(s)-prima(s) sem código rápido.
            </p>
            {!previa ? (
              <button
                type="button"
                onClick={verPrevia}
                className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer"
              >
                Ver os códigos que serão atribuídos
              </button>
            ) : (
              <>
                <ul className="text-[11px] text-zinc-800 space-y-0.5 max-h-40 overflow-y-auto">
                  {previa.map((n) => (
                    <li key={n.codigoErp}>
                      <strong>{n.codigoRapido}</strong> → {n.nome} <span className="text-zinc-500">({n.codigoErp})</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={gravando}
                    onClick={confirmar}
                    className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                  >
                    Confirmar códigos
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrevia(null)}
                    className="px-3 py-1.5 text-[11px] font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 balanca-no-print">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar nome ou código"
              className="pl-7 pr-2 py-1.5 text-xs border border-zinc-200 rounded-lg w-64"
            />
          </div>
          {([{ id: 'todos', titulo: 'Todos' }, ...GRUPOS] as Array<{ id: Grupo | 'todos'; titulo: string }>).map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGrupo(g.id)}
              className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border cursor-pointer ${
                grupo === g.id ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              {g.titulo}
              {g.id !== 'todos' && dados ? ` (${dados.grupos[g.id].length})` : ''}
            </button>
          ))}
        </div>

        {loading && !dados && <p className="text-xs text-zinc-500">Carregando...</p>}

        {visiveis.map((g) => (
          <section key={g.id} className="space-y-1.5">
            <h2 className="text-sm font-extrabold text-zinc-900">
              {g.titulo} <span className="text-xs font-medium text-zinc-500">({g.itens.length})</span>
            </h2>
            <div className="overflow-x-auto bg-white border border-zinc-200 rounded-xl">
              <table className="w-full text-[11px]">
                <thead className="bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-2 py-1.5 text-center w-24">Código 1 (rápido)</th>
                    <th className="px-2 py-1.5 text-center w-28">Código sistema</th>
                    <th className="px-2 py-1.5 text-left">Nome na balança</th>
                    <th className="px-2 py-1.5 text-left">Nome completo</th>
                    <th className="px-2 py-1.5 text-center w-12">Un.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {g.itens.map((i) => (
                    <tr key={i.codigoErp}>
                      <td className="px-2 py-1.5 text-center font-extrabold text-zinc-900">
                        {i.codigoRapido}
                        {i.novo && <span className="ml-1 text-[9px] font-bold text-amber-700">novo</span>}
                      </td>
                      <td className="px-2 py-1.5 text-center font-mono">{i.codigoSistema}</td>
                      <td className="px-2 py-1.5 font-semibold text-zinc-900">{i.nomeBalanca}</td>
                      <td className="px-2 py-1.5 text-zinc-600">{i.nomeCompleto}</td>
                      <td className="px-2 py-1.5 text-center">{i.unidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </AppLayout>
  );
}
