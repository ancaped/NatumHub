import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '../../geral/lib/http';

interface ItemDemanda { codigo: string; descricao: string; estoque: number; emProducao: number; faltas: number; status: string; statusRotulo: string; produzir: number }
interface Resumo {
  vendas: { porMes: { mes: string; rotulo: string; unidades: number }[]; total12m: number; maisVendem: { codigo: string; descricao: string; unidades12m: number }[] };
  estoque: { produtosNaDemanda: number; estoqueTotal: number; emProducao: number; abaixoDoGatilho: number; faltasTotal: number; listaAbaixoDoGatilho: ItemDemanda[]; listaFaltas: ItemDemanda[] };
  producao: {
    porMes: { mes: string; unidades: number; produtos: number }[];
    planejado: { codigo: string; descricao: string; data: string; quantidade: number; unidade: string; situacao: string }[];
    naFila: { codigo: string; descricao: string; quantidade: number; unidade: string; origem: string }[];
  };
  observacoes: string[];
}

const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const dataBR = (iso: string) => iso.split('-').reverse().join('/');

function Bloco({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-xs font-bold text-zinc-800">{titulo}</h3>
        {nota && <span className="text-[11px] text-zinc-500">{nota}</span>}
      </div>
      <div className="border border-zinc-200 rounded-2xl overflow-x-auto">{children}</div>
    </section>
  );
}

const TH = 'px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500';
const TD = 'px-3 py-2 text-xs text-zinc-700';

function Vazio({ texto }: { texto: string }) {
  return <div className="p-4 text-center text-xs text-zinc-400">{texto}</div>;
}

/** Aba Resumo do painel da linha: só leitura. Vendas, estoque/faltas e produção da linha (dados que já existem no Nexus). */
export default function LinhaResumo({ prefixo }: { prefixo: string }) {
  const [dados, setDados] = useState<Resumo | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let cancelado = false;
    setDados(null);
    setErro('');
    (async () => {
      try {
        const res = await apiFetch(`/admin/produtos-ativos/linhas/${encodeURIComponent(prefixo)}/resumo`);
        const corpo = await res.json().catch(() => ({}));
        if (cancelado) return;
        if (!res.ok) setErro(corpo.error || 'Não foi possível carregar o resumo.');
        else setDados(corpo as Resumo);
      } catch {
        if (!cancelado) setErro('Falha de conexão ao carregar o resumo.');
      }
    })();
    return () => { cancelado = true; };
  }, [prefixo]);

  if (erro) return <div className="p-4 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl">{erro}</div>;
  if (!dados) return <div className="p-8 flex justify-center text-zinc-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const maxMes = Math.max(1, ...dados.vendas.porMes.map(m => m.unidades));
  const tabelaItens = (lista: ItemDemanda[], mostrarFaltas: boolean) => (
    <table className="w-full text-left border-collapse">
      <thead className="bg-zinc-50 border-b border-zinc-200"><tr>
        <th className={TH}>Produto</th><th className={`${TH} text-right`}>Estoque</th>
        <th className={`${TH} text-right`}>{mostrarFaltas ? 'Faltas' : 'Produzir'}</th><th className={TH}>Situação</th>
      </tr></thead>
      <tbody className="divide-y divide-zinc-100">
        {lista.map(i => (
          <tr key={i.codigo}>
            <td className={TD}><span className="block font-bold text-zinc-800">{i.descricao}</span><span className="font-mono text-[11px] text-zinc-500">{i.codigo}</span></td>
            <td className={`${TD} text-right tabular-nums`}>{n(i.estoque)}</td>
            <td className={`${TD} text-right tabular-nums font-bold`}>{n(mostrarFaltas ? i.faltas : i.produzir)}</td>
            <td className={TD}>{i.statusRotulo || i.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-5">
      <Bloco titulo="Vendas por mês (unidades)" nota={`${n(dados.vendas.total12m)} un. em 12 meses`}>
        <table className="w-full text-left border-collapse">
          <tbody className="divide-y divide-zinc-100">
            {dados.vendas.porMes.map(m => (
              <tr key={m.mes}>
                <td className={`${TD} w-20 font-mono text-zinc-500`}>{m.rotulo}</td>
                <td className={`${TD} w-24 text-right tabular-nums font-bold`}>{n(m.unidades)}</td>
                <td className={`${TD} w-full`}><div className="h-1.5 rounded-full bg-zinc-900" style={{ width: `${(m.unidades / maxMes) * 100}%` }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Bloco>

      <Bloco titulo="Produtos que mais vendem" nota="unidades em 12 meses">
        {dados.vendas.maisVendem.length === 0 ? <Vazio texto="Sem vendas registradas." /> : (
          <table className="w-full text-left border-collapse">
            <tbody className="divide-y divide-zinc-100">
              {dados.vendas.maisVendem.map(p => (
                <tr key={p.codigo}>
                  <td className={TD}><span className="block font-bold text-zinc-800">{p.descricao}</span><span className="font-mono text-[11px] text-zinc-500">{p.codigo}</span></td>
                  <td className={`${TD} text-right tabular-nums font-bold`}>{n(p.unidades12m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Bloco>

      <Bloco titulo="Estoque da linha" nota={`${dados.estoque.produtosNaDemanda} produtos na Demanda`}>
        <table className="w-full text-left border-collapse">
          <tbody className="divide-y divide-zinc-100">
            <tr><td className={TD}>Estoque atual</td><td className={`${TD} text-right tabular-nums font-bold`}>{n(dados.estoque.estoqueTotal)} un.</td></tr>
            <tr><td className={TD}>Em produção (ERP)</td><td className={`${TD} text-right tabular-nums font-bold`}>{n(dados.estoque.emProducao)} un.</td></tr>
            <tr><td className={TD}>Produtos abaixo do gatilho</td><td className={`${TD} text-right tabular-nums font-bold`}>{dados.estoque.abaixoDoGatilho}</td></tr>
            <tr><td className={TD}>Faltas de venda</td><td className={`${TD} text-right tabular-nums font-bold`}>{n(dados.estoque.faltasTotal)} un.</td></tr>
          </tbody>
        </table>
      </Bloco>

      {dados.estoque.listaAbaixoDoGatilho.length > 0 && (
        <Bloco titulo="Abaixo do gatilho" nota={dados.estoque.abaixoDoGatilho > dados.estoque.listaAbaixoDoGatilho.length ? `primeiros ${dados.estoque.listaAbaixoDoGatilho.length} de ${dados.estoque.abaixoDoGatilho}` : undefined}>
          {tabelaItens(dados.estoque.listaAbaixoDoGatilho, false)}
        </Bloco>
      )}
      {dados.estoque.listaFaltas.length > 0 && (
        <Bloco titulo="Com faltas de venda">{tabelaItens(dados.estoque.listaFaltas, true)}</Bloco>
      )}

      <Bloco titulo="Produção lançada por mês" nota="últimos 6 meses">
        {dados.producao.porMes.length === 0 ? <Vazio texto="Nenhuma produção lançada no período." /> : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-zinc-50 border-b border-zinc-200"><tr><th className={TH}>Mês</th><th className={`${TH} text-right`}>Unidades</th><th className={`${TH} text-right`}>Produtos</th></tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {dados.producao.porMes.map(m => (
                <tr key={m.mes}><td className={`${TD} font-mono`}>{m.mes.split('-').reverse().join('/')}</td><td className={`${TD} text-right tabular-nums font-bold`}>{n(m.unidades)}</td><td className={`${TD} text-right tabular-nums`}>{m.produtos}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Bloco>

      <Bloco titulo="Planejado no Planejamento Semanal" nota="de hoje em diante">
        {dados.producao.planejado.length === 0 ? <Vazio texto="Nada planejado para esta linha." /> : (
          <table className="w-full text-left border-collapse">
            <tbody className="divide-y divide-zinc-100">
              {dados.producao.planejado.map((p, i) => (
                <tr key={`${p.codigo}-${p.data}-${i}`}>
                  <td className={`${TD} whitespace-nowrap font-mono text-zinc-500`}>{dataBR(p.data)}</td>
                  <td className={TD}><span className="block font-bold text-zinc-800">{p.descricao}</span><span className="font-mono text-[11px] text-zinc-500">{p.codigo}</span></td>
                  <td className={`${TD} text-right tabular-nums font-bold whitespace-nowrap`}>{n(p.quantidade)} {p.unidade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Bloco>

      <Bloco titulo="Na fila de demandas">
        {dados.producao.naFila.length === 0 ? <Vazio texto="Nenhum item da linha na fila." /> : (
          <table className="w-full text-left border-collapse">
            <tbody className="divide-y divide-zinc-100">
              {dados.producao.naFila.map(f => (
                <tr key={`${f.codigo}-${f.origem}`}>
                  <td className={TD}><span className="block font-bold text-zinc-800">{f.descricao}</span><span className="font-mono text-[11px] text-zinc-500">{f.codigo}</span></td>
                  <td className={`${TD} text-right tabular-nums font-bold whitespace-nowrap`}>{n(f.quantidade)} {f.unidade}</td>
                  <td className={`${TD} text-zinc-500`}>{f.origem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Bloco>

      <ul className="text-[11px] text-zinc-500 space-y-0.5 list-disc pl-4">
        {dados.observacoes.map(o => <li key={o}>{o}</li>)}
      </ul>
    </div>
  );
}
