import React, { useMemo, useState } from 'react';
import { Edit, Plus, Search, UploadCloud } from 'lucide-react';
import { cn } from '../../geral/lib/utils';
import { Category } from '../../geral/lib/types';
import { KitComLinha, useLinhasKits } from './linhasKits';

interface ProdutoKit {
  codigo: string;
  descricao: string;
  status_produto: string | null;
  categoria_produto: string | null;
}

interface Props {
  products: ProdutoKit[];
  categories: Category[];
  /** Composição dos kits vinda do ERP (usada só como reserva quando o servidor de linhas não responde). */
  kitComposicao: any[];
  /** Abre o painel de composição do kit (mora no arquivo principal; a aba Status também o usa). */
  onAbrirComposicao: (codigo: string, descricao: string) => void;
  onNovoKit: () => void;
  uploadingKits: boolean;
  onUploadKits: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/** Aba Composição de Kits da Linha de Produtos: kits ativos com a linha de kits e a composição do ERP. A gestão das linhas é a aba Linhas de Kits. */
export default function KitsTab({ products, categories, kitComposicao, onAbrirComposicao, onNovoKit, uploadingKits, onUploadKits }: Props) {
  const [kitCompSearch, setKitCompSearch] = useState('');
  const [kitFiltro, setKitFiltro] = useState<string>('ALL');

  const masterKitsList = useMemo(() => {
    const map = new Map<string, { codigo: string; descricao: string; status?: string; categoria?: string }>();
    
    // 1. Identificar categorias de Kit cadastradas no banco
    const kitCategoryIds = categories
      .filter(c => {
        const name = (c.name || '').toLowerCase();
        return name === 'kits' || name === 'kit';
      })
      .map(c => c.id);

    // 2. Adicionar produtos com a categoria de Kits
    products.forEach(p => {
      const isKit = p.categoria_produto === 'kit' || (p.categoria_produto && kitCategoryIds.includes(p.categoria_produto));
      if (isKit && p.codigo) {
        map.set(p.codigo, {
          codigo: p.codigo,
          descricao: p.descricao || 'Kit Montável',
          status: p.status_produto,
          categoria: p.categoria_produto
        });
      }
    });

    // 3. Adicionar composições existentes para não ocultar nada preexistente
    kitComposicao.forEach(kc => {
      if (kc.kit_codigo && !map.has(kc.kit_codigo)) {
        map.set(kc.kit_codigo, {
          codigo: kc.kit_codigo,
          descricao: kc.kit_descricao || 'Kit Montável',
          status: 'Ativo',
          categoria: 'kit'
        });
      }
    });

    const list = Array.from(map.values()).sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));
    if (!kitCompSearch.trim()) return list;
    const q = kitCompSearch.trim().toLowerCase();
    return list.filter(k => 
      (k.codigo || '').toLowerCase().includes(q) || 
      (k.descricao || '').toLowerCase().includes(q)
    );
  }, [categories, products, kitComposicao, kitCompSearch]);

  const { linhas: linhasKits, kits: kitsServidor } = useLinhasKits(true);

  // Fonte da tabela: kits ativos do servidor (com linha sugerida e manual); sem resposta, a lista local.
  const kitsTabela = useMemo<KitComLinha[]>(() => {
    const q = kitCompSearch.trim().toLowerCase();
    const base: KitComLinha[] = kitsServidor.length > 0
      ? kitsServidor
      : masterKitsList.map(k => ({
          codigo: k.codigo,
          descricao: k.descricao,
          composicao: kitComposicao.filter(r => r.kit_codigo === k.codigo).length,
          linhaSugerida: null,
          linhaManual: null,
          linha: null,
        }));
    return q ? base.filter(k => k.codigo.toLowerCase().includes(q) || (k.descricao || '').toLowerCase().includes(q)) : base;
  }, [kitsServidor, masterKitsList, kitComposicao, kitCompSearch]);
  const kitsSemComposicao = kitsTabela.filter(k => k.composicao === 0).length;
  const kitsExibidos = useMemo(
    () => kitsTabela.filter(k => (kitFiltro === 'ALL' ? true : kitFiltro === 'SEM' ? k.composicao === 0 : k.linha === kitFiltro)),
    [kitsTabela, kitFiltro],
  );
  const nomeLinhaKit = (id: string | null) => (id ? linhasKits.find(l => l.id === id)?.nome || id : null);

  return (
    <>
            <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
              {/* Busca, filtro e ações */}
              <div className="bg-white border border-zinc-200 rounded-2xl p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shrink-0">
                <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                  <div className="relative w-full max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Buscar kit por código ou descrição..."
                      value={kitCompSearch}
                      onChange={(e) => setKitCompSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-sm font-medium"
                    />
                  </div>
                  {[
                    { id: 'ALL', rotulo: 'Todos', n: kitsTabela.length },
                    { id: 'SEM', rotulo: 'Sem composição', n: kitsSemComposicao },
                  ].filter(c => c.id === 'ALL' || c.n > 0 || kitFiltro === c.id).map(c => (
                    <button
                      key={c.id}
                      onClick={() => setKitFiltro(c.id)}
                      className={cn(
                        'px-3 py-1.5 rounded-full border text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5',
                        kitFiltro === c.id ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                      )}
                    >
                      {c.rotulo}
                      <span className={cn('font-mono text-[10px]', kitFiltro === c.id ? 'text-zinc-300' : 'text-zinc-400')}>{c.n}</span>
                    </button>
                  ))}
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <label className="bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-200 text-xs font-bold py-2 px-4 rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5">
                    <UploadCloud className="w-4 h-4 text-zinc-500" />
                    {uploadingKits ? 'Importando...' : 'Importar Excel (.xlsx)'}
                    <input
                      type="file"
                      accept=".xlsx"
                      className="hidden"
                      onChange={onUploadKits}
                      disabled={uploadingKits}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onNovoKit()}
                    className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Compor novo kit
                  </button>
                </div>
              </div>

              {/* Tabela de kits */}
              <div className="table-card !rounded-2xl !mb-0 flex-1 overflow-hidden flex flex-col min-h-0">
                <div className="flex-1 overflow-auto table-wrapper">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-zinc-50 border-b border-zinc-150 font-bold text-zinc-500 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 w-28 text-[10px] uppercase tracking-wider">Código</th>
                        <th className="px-6 py-3 text-[10px] uppercase tracking-wider">Kit</th>
                        <th className="px-6 py-3 w-72 text-[10px] uppercase tracking-wider">Linha de kits</th>
                        <th className="px-6 py-3 w-40 text-[10px] uppercase tracking-wider">Composição</th>
                        <th className="px-6 py-3 w-24"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {kitsExibidos.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-10 text-center text-zinc-400 font-medium">Nenhum kit encontrado.</td>
                        </tr>
                      ) : (
                        kitsExibidos.map((kit) => {
                          const compCount = kit.composicao;
                          return (
                            <tr
                              key={kit.codigo}
                              onClick={() => {
                                onAbrirComposicao(kit.codigo, kit.descricao);
                              }}
                              className="hover:bg-zinc-50/70 transition-colors cursor-pointer"
                            >
                              <td className="px-6 py-2.5 font-mono font-bold text-zinc-500">{kit.codigo}</td>
                              <td className="px-6 py-2.5 font-bold text-zinc-800">{kit.descricao}</td>
                              <td className="px-6 py-2.5 text-zinc-700">
                                {nomeLinhaKit(kit.linha) || <span className="text-zinc-400">Sem linha</span>}
                                {kit.linhaManual && <span className="ml-2 text-[10px] font-bold uppercase bg-zinc-100 text-zinc-500 border border-zinc-200 rounded px-1.5 py-0.5">manual</span>}
                              </td>
                              <td className="px-6 py-2.5">
                                {compCount > 0 ? (
                                  <span className="px-2 py-0.5 bg-zinc-100 border border-zinc-200 text-zinc-700 rounded-full font-bold text-[11px]">
                                    {compCount} {compCount === 1 ? 'insumo' : 'insumos'}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-white border border-dashed border-zinc-300 text-zinc-500 rounded-full font-bold text-[11px]">
                                    Sem composição
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => {
                                    onAbrirComposicao(kit.codigo, kit.descricao);
                                  }}
                                  className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-800 rounded-lg transition-colors cursor-pointer"
                                  title="Ver / editar composição"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
    </>
  );
}
