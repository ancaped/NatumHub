import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiJson } from '../../geral/lib/http';
import { cn } from '../../geral/lib/utils';

interface Movimento {
  data: string;
  hora: string;
  origem: 'ajuste' | 'lote' | 'nf';
  es: string;
  tipo: string;
  qtde: number;
  lote: string | null;
  loteFornecedor: string | null;
  documento: string | null;
  usuario: string | null;
  motivo: string | null;
}

interface Resumo {
  entradas: number;
  saidas: number;
  saldoMovimentos: number;
  estoqueInicio: number | null;
  estoqueFim: number | null;
  diferenca: number | null;
  estoqueAtual: number | null;
  acertosSemMotivo: number;
  acertosGrandes: number;
}

interface Resposta {
  codigo: string;
  desde: string;
  ate: string;
  movimentos: Movimento[];
  resumo: Resumo;
}

const ORIGEM: Record<Movimento['origem'], { label: string; cls: string }> = {
  ajuste: { label: 'Acerto/Ajuste', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  lote: { label: 'Lote', cls: 'bg-zinc-100 text-zinc-700 border-zinc-200' },
  nf: { label: 'NF', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

function isoDias(delta: number): string {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function dataBr(iso: string): string {
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

export function MovimentacaoInsumoTab({ codigo }: { codigo: string }) {
  const [desde, setDesde] = useState(() => isoDias(-90));
  const [ate, setAte] = useState(() => isoDias(0));
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    apiJson<Resposta>(
      `/estoque/insumos/${encodeURIComponent(codigo.trim())}/movimentos?desde=${desde}&ate=${ate}`,
    )
      .then((r) => vivo && setDados(r))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : 'Falha ao carregar a movimentação.'))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [codigo, desde, ate]);

  const r = dados?.resumo;

  return (
    <div className="space-y-3 text-left">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
        <label className="flex items-center gap-1.5">
          De
          <input type="date" value={desde} max={ate} onChange={(e) => e.target.value && setDesde(e.target.value)}
            className="border border-zinc-200 rounded-lg px-2 py-1 text-xs" />
        </label>
        <label className="flex items-center gap-1.5">
          Até
          <input type="date" value={ate} min={desde} onChange={(e) => e.target.value && setAte(e.target.value)}
            className="border border-zinc-200 rounded-lg px-2 py-1 text-xs" />
        </label>
        {carregando && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
      </div>

      {r && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-y border-zinc-100 py-2 text-xs text-zinc-600">
          <span>Entradas <b className="text-emerald-700">{fmt(r.entradas)}</b></span>
          <span>Saídas <b className="text-rose-700">{fmt(r.saidas)}</b></span>
          <span>Saldo dos movimentos <b className="text-zinc-900">{fmt(r.saldoMovimentos)}</b></span>
          {r.estoqueAtual != null && <span>Estoque atual <b className="text-zinc-900">{fmt(r.estoqueAtual)}</b></span>}
          {r.diferenca != null && <span>Diferença <b className="text-zinc-900">{fmt(r.diferenca)}</b></span>}
          {r.acertosGrandes > 0 && (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">
              {r.acertosGrandes} acerto(s) grande(s)
            </span>
          )}
          {r.acertosSemMotivo > 0 && (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">
              {r.acertosSemMotivo} acerto(s) sem motivo
            </span>
          )}
        </div>
      )}

      {erro && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{erro}</p>}

      {dados && dados.movimentos.length === 0 && !carregando && (
        <p className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 text-center text-xs text-zinc-500">
          Nenhum movimento no período.
        </p>
      )}

      {dados && dados.movimentos.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50 font-bold text-zinc-600">
              <tr>
                <th className="px-3 py-2">Data/hora</th>
                <th className="px-3 py-2">Origem</th>
                <th className="px-3 py-2">E/S</th>
                <th className="px-3 py-2 text-right">Qtde</th>
                <th className="px-3 py-2">Lote</th>
                <th className="px-3 py-2">Usuário</th>
                <th className="px-3 py-2">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {dados.movimentos.map((m, i) => {
                const o = ORIGEM[m.origem];
                return (
                  <tr key={i} className={cn('hover:bg-zinc-50/60', m.origem === 'ajuste' && 'bg-amber-50/40')}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-zinc-700">
                      {dataBr(m.data)} {m.hora}
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-bold', o.cls)}>{o.label}</span>
                      {m.origem === 'ajuste' && (
                        <span className="ml-1 text-[10px] text-zinc-400">{m.tipo.replace(/_/g, ' ')}</span>
                      )}
                    </td>
                    <td className={cn('px-3 py-2 font-bold', m.es === 'E' ? 'text-emerald-700' : 'text-rose-700')}>{m.es}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-zinc-900">{fmt(m.qtde)}</td>
                    <td className="px-3 py-2 font-mono text-zinc-600">{m.lote ?? m.loteFornecedor ?? m.documento ?? '-'}</td>
                    <td className="px-3 py-2 text-zinc-600">{m.usuario ?? '-'}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-zinc-600" title={m.motivo ?? ''}>
                      {m.origem === 'nf' && m.documento ? `${m.documento} · ` : ''}
                      {m.motivo ?? '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-zinc-400">
        Fontes do ERP: acertos/ajustes (ENTDEVINS), reservas por lote e entradas por NF. O Nexus guarda só o estoque
        atual, por isso não há comparação de estoque início/fim.
      </p>
    </div>
  );
}

export default MovimentacaoInsumoTab;
