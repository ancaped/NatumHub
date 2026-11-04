import { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import Drawer from '../../../geral/components/ui/Drawer';
import { apiJson } from '../../../geral/lib/http';
import type { TipoAviso } from '../../../geral/components/ui/Aviso';
import type { ImpressaoDados } from './formularios/FormularioFolhas';
import { montarFolhas, paraImpressao, rotuloStatus } from './formularios/montagem';
import type { Formulario, FormularioDetalhe } from './formularios/tipos';

interface Props {
  aberto: boolean;
  onClose: () => void;
  lista: Formulario[];
  /** Siglas dos setores (FOR-<SIGLA>-…), na ordem da tela. */
  setores: string[];
  nomeDoSetor: (sigla: string) => string;
  setorInicial: string;
  logoSrc?: string | null;
  avisar: (mensagem: string, tipo?: TipoAviso) => void;
  onImprimir: (d: ImpressaoDados[]) => void;
}

const mesAtual = () => new Date().toISOString().slice(0, 7);

/** Imprime, de uma vez, os formulários marcados na «pasta do mês» de um setor, já com o Mês/Ano preenchido. */
export default function PastaDoMesDrawer({ aberto, onClose, lista, setores, nomeDoSetor, setorInicial, logoSrc, avisar, onImprimir }: Props) {
  const [sigla, setSigla] = useState('');
  const [mes, setMes] = useState(mesAtual());
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setSigla(setorInicial || setores[0] || '');
    setMes(mesAtual());
    setFora(new Set());
  }, [aberto, setorInicial, setores]);

  const daPasta = useMemo(
    () => lista.filter((f) => f.pastaDoMes && f.status !== 'obsolete' && f.code.split('-')[1] === sigla),
    [lista, sigla],
  );
  const imprimiveis = daPasta.filter((f) => !fora.has(f.code));
  const folhas = imprimiveis.reduce((n, f) => n + montarFolhas(f.areas).length, 0);

  const alternar = (code: string) =>
    setFora((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(code)) novo.add(code);
      return novo;
    });

  const imprimir = async () => {
    if (imprimiveis.length === 0 || !mes) return;
    setOcupado(true);
    try {
      const [ano, m] = mes.split('-');
      const dets = await Promise.all(
        imprimiveis.map((f) => apiJson<FormularioDetalhe>(`/qualidade/pops/formularios/${encodeURIComponent(f.code)}`)),
      );
      onImprimir(dets.map((d) => ({ ...paraImpressao({ ...d, revisoes: d.revisoes ?? [], eventos: d.eventos ?? [] }), logoSrc, mesAno: `${m}/${ano}` })));
      onClose();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não foi possível preparar a impressão.', 'erro');
    } finally {
      setOcupado(false);
    }
  };

  const campo = 'mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 bg-zinc-50/50';
  return (
    <Drawer
      isOpen={aberto}
      onClose={onClose}
      size="sm"
      title="Pasta do mês"
      subtitle="Imprime os formulários marcados do setor, com o mês já preenchido"
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-zinc-500">{imprimiveis.length} formulários · {folhas} folhas</span>
          <button
            type="button"
            disabled={ocupado || imprimiveis.length === 0 || !mes}
            onClick={() => void imprimir()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-zinc-900 text-white disabled:opacity-50 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" /> {ocupado ? 'Preparando…' : 'Imprimir'}
          </button>
        </div>
      }
    >
      <div className="p-4 space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-500">Setor
            <select className={campo} value={sigla} onChange={(e) => { setSigla(e.target.value); setFora(new Set()); }}>
              {setores.map((s) => <option key={s} value={s}>{nomeDoSetor(s)}</option>)}
            </select>
          </label>
          <label className="text-xs text-zinc-500">Mês
            <input type="month" className={campo} value={mes} onChange={(e) => setMes(e.target.value)} />
          </label>
        </div>
        {daPasta.length === 0 ? (
          <p className="rounded-xl bg-zinc-50 border border-zinc-200 p-3 text-xs text-zinc-600">
            Nenhum formulário deste setor está marcado. Marque a coluna «Pasta» na lista dos formulários que são preenchidos todo mês.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {daPasta.map((f) => {
              const st = rotuloStatus(f.status);
              const n = montarFolhas(f.areas).length;
              return (
                <li key={f.code}>
                  <label className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-zinc-900" checked={!fora.has(f.code)} onChange={() => alternar(f.code)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs font-bold text-zinc-900">{f.code}</span>
                      <span className="block truncate text-xs text-zinc-600">{f.title}</span>
                    </span>
                    <span className="text-right text-[10px] text-zinc-500">
                      {n} {n === 1 ? 'folha' : 'folhas'}
                      {f.status !== 'published' && <span className={`block mt-0.5 px-1.5 rounded-full border font-semibold ${st.classe}`}>{st.texto}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {imprimiveis.some((f) => f.status !== 'published') && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            Formulário que não está vigente sai com a marca de água de rascunho/aprovação.
          </p>
        )}
      </div>
    </Drawer>
  );
}
