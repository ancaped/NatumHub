import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { apiJson } from '../lib/http';
import { cn } from '../lib/utils';
import Drawer from '../components/ui/Drawer';

type Severidade = 'ok' | 'aviso' | 'critico';

interface Checagem {
  chave: string;
  titulo: string;
  severidade: Severidade;
  quantidade: number;
  exemplos: string[];
  explicacao: string;
}

interface ExecucaoResumo {
  id: number;
  executadoEm: string;
  origem: string;
  criticos: number;
  avisos: number;
}

interface RespostaSaude {
  ultima: (ExecucaoResumo & { resultado?: { checagens?: Checagem[] } }) | null;
  anteriores: ExecucaoResumo[];
}

const ROTULO: Record<Severidade, string> = { ok: 'ok', aviso: 'aviso', critico: 'crítico' };
const ORDEM: Record<Severidade, number> = { critico: 0, aviso: 1, ok: 2 };
const COR: Record<Severidade, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  aviso: 'bg-amber-50 text-amber-700 border border-amber-200',
  critico: 'bg-rose-50 text-rose-700 border border-rose-200',
};

const formatarData = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function SaudeDadosTab() {
  const [dados, setDados] = useState<RespostaSaude | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [checando, setChecando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<Checagem | null>(null);

  const carregar = useCallback(async () => {
    try {
      setDados(await apiJson<RespostaSaude>('/import/saude'));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar a saúde dos dados.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const checarAgora = async () => {
    setChecando(true);
    try {
      await apiJson('/import/saude/checar', { method: 'POST' });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao checar.');
    } finally {
      setChecando(false);
    }
  };

  const ultima = dados?.ultima ?? null;
  const checagens = [...(ultima?.resultado?.checagens ?? [])].sort(
    (a, b) => ORDEM[a.severidade] - ORDEM[b.severidade],
  );

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          {ultima
            ? `Última checagem: ${formatarData(ultima.executadoEm)} (${ultima.origem === 'sync' ? 'após o sync' : 'manual'}) — ${ultima.criticos} crítico(s), ${ultima.avisos} aviso(s)`
            : 'Nenhuma checagem feita ainda.'}
        </p>
        <button
          type="button"
          onClick={checarAgora}
          disabled={checando}
          className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
        >
          {checando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          <span>Checar agora</span>
        </button>
      </div>

      {erro && <p className="text-xs text-rose-700">{erro}</p>}

      {carregando ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      ) : checagens.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-400 text-[10px] font-bold uppercase tracking-wider">
                <th className="py-2.5 px-3">Checagem</th>
                <th className="py-2.5 px-3">Situação</th>
                <th className="py-2.5 px-3 text-right">Quantidade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {checagens.map((c) => (
                <tr
                  key={c.chave}
                  onClick={() => setAberta(c)}
                  className="hover:bg-zinc-50/80 transition-colors cursor-pointer"
                >
                  <td className="py-2.5 px-3 font-semibold text-zinc-800">{c.titulo}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide', COR[c.severidade])}>
                      {ROTULO[c.severidade]}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-900">
                    {c.quantidade.toLocaleString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !erro && <p className="text-xs text-zinc-400 py-6 text-center">Clique em "Checar agora" para conferir os dados importados.</p>
      )}

      {aberta && (
        <Drawer
          onClose={() => setAberta(null)}
          title={aberta.titulo}
          badge={
            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide', COR[aberta.severidade])}>
              {ROTULO[aberta.severidade]}
            </span>
          }
          size="md"
        >
          <div className="space-y-4 p-4">
            <p className="text-sm text-zinc-700 leading-relaxed">{aberta.explicacao}</p>
            <p className="text-xs text-zinc-500">
              Quantidade: <b className="font-mono text-zinc-900">{aberta.quantidade.toLocaleString('pt-BR')}</b>
            </p>
            {aberta.exemplos.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Exemplos</p>
                <ul className="space-y-1">
                  {aberta.exemplos.map((e, i) => (
                    <li key={i} className="font-mono text-[11px] text-zinc-700 bg-zinc-50 border border-zinc-100 rounded-lg px-2.5 py-1.5 break-words">
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
}
