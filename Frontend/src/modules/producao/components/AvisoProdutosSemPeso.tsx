import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Drawer from '../../geral/components/ui/Drawer';
import { apiJson } from '../../geral/lib/http';

interface ProdutoSemPeso {
  codigo: string;
  descricao: string;
  linha: string;
}

/**
 * Aviso discreto: produtos ativos cuja descrição não traz medida ("500ML", "1KG"). Para eles o peso por unidade é
 * desconhecido e o Nexus não converte unidade <-> kg. A lista abre em Drawer; a correção é a descrição no ERP.
 */
export default function AvisoProdutosSemPeso({ className = '' }: { className?: string }) {
  const [itens, setItens] = useState<ProdutoSemPeso[]>([]);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    let vivo = true;
    apiJson<{ itens: ProdutoSemPeso[] }>('/api/producao/produtos-sem-peso')
      .then(r => { if (vivo) setItens(Array.isArray(r?.itens) ? r.itens : []); })
      .catch(() => { /* aviso é opcional: sem permissão ou rede, some */ });
    return () => { vivo = false; };
  }, []);

  if (itens.length === 0) return null;

  const termo = busca.trim().toLowerCase();
  const filtrados = termo
    ? itens.filter(i => `${i.codigo} ${i.descricao} ${i.linha}`.toLowerCase().includes(termo))
    : itens;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={`inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-900 hover:underline cursor-pointer ${className}`}
        title="Produtos ativos sem medida na descrição: o peso por unidade é desconhecido"
      >
        <AlertTriangle className="w-3 h-3" />
        {itens.length} {itens.length === 1 ? 'produto sem peso' : 'produtos sem peso'} na descrição
      </button>
      {aberto && (
        <Drawer
          onClose={() => setAberto(false)}
          title="Produtos sem peso na descrição"
          subtitle="Sem medida (ML, L, G, KG) na descrição, o Nexus não converte unidades em kg. Corrija a descrição no ERP."
          badge={itens.length}
          size="lg"
        >
          <div className="space-y-3">
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar código, descrição ou linha"
              className="w-full px-3 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-200">
                  <th className="py-1.5 pr-2 font-semibold">Código</th>
                  <th className="py-1.5 pr-2 font-semibold">Descrição</th>
                  <th className="py-1.5 font-semibold">Linha</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(i => (
                  <tr key={i.codigo} className="border-b border-zinc-100">
                    <td className="py-1.5 pr-2 font-mono text-zinc-700 whitespace-nowrap">{i.codigo}</td>
                    <td className="py-1.5 pr-2 text-zinc-800">{i.descricao}</td>
                    <td className="py-1.5 text-zinc-500 whitespace-nowrap">{i.linha}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Drawer>
      )}
    </>
  );
}
