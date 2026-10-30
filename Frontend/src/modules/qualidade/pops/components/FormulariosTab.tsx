import { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, Search } from 'lucide-react';
import { apiJson } from '../../../geral/lib/http';
import { useAviso } from '../../../geral/components/ui/Aviso';
import { usePreviaServidor } from '../../../producao/lib/usePreviaServidor';
import FormularioDrawer from './formularios/FormularioDrawer';
import { FolhasImpressao, type ImpressaoDados } from './formularios/FormularioFolhas';
import { fmtData, linhasPorFolha, montarFolhas, paraImpressao, rev2, rotuloStatus } from './formularios/montagem';
import type { Formulario, FormularioDetalhe } from './formularios/tipos';

export type { Formulario, FormCampo } from './formularios/tipos';

function setorDe(code: string) {
  return code.split('-')[1] || '';
}

export default function FormulariosTab({ logoSrc }: { logoSrc?: string | null }) {
  const { avisar, aviso } = useAviso();
  const { pedir, elemento: previaElemento } = usePreviaServidor(avisar);
  const [lista, setLista] = useState<Formulario[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [setor, setSetor] = useState('');
  const [status, setStatus] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [imprimindo, setImprimindo] = useState<ImpressaoDados | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [novo, setNovo] = useState({ code: '', popCode: '', title: '', periodicity: 'Por uso', orientation: 'portrait' });

  const carregar = useCallback(() => {
    void apiJson<Formulario[]>('/qualidade/pops/formularios')
      .then((rows) => {
        setLista(Array.isArray(rows) ? rows : []);
        setErro(null);
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Falha ao carregar formulários'));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const fim = () => setImprimindo(null);
    window.addEventListener('afterprint', fim);
    return () => window.removeEventListener('afterprint', fim);
  }, []);

  const setores = useMemo(() => Array.from(new Set(lista.map((f) => setorDe(f.code)).filter(Boolean))), [lista]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter((f) => {
      if (setor && setorDe(f.code) !== setor) return false;
      if (status && f.status !== status) return false;
      if (!q) return true;
      return `${f.code} ${f.title} ${f.popCode} ${f.previousCode}`.toLowerCase().includes(q);
    });
  }, [lista, busca, setor, status]);

  const imprimir = useCallback((d: ImpressaoDados) => {
    setImprimindo(d);
    window.setTimeout(() => window.print(), 200);
  }, []);

  const imprimirLinha = async (f: Formulario) => {
    try {
      const det = await apiJson<FormularioDetalhe>(`/qualidade/pops/formularios/${encodeURIComponent(f.code)}`);
      imprimir({ ...paraImpressao({ ...det, revisoes: det.revisoes ?? [], eventos: det.eventos ?? [] }), logoSrc });
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não foi possível preparar a impressão.', 'erro');
    }
  };

  const criar = () => {
    void pedir({
      url: '/qualidade/pops/formularios',
      init: { method: 'POST', body: JSON.stringify(novo) },
      titulo: 'Novo formulário',
      confirmarRotulo: 'Criar rascunho',
      linhas: (d) => [{
        titulo: String(d?.code ?? novo.code),
        detalhe: `Ligado a ${d?.popCode ?? novo.popCode} · ${d?.orientation === 'landscape' ? 'horizontal' : 'vertical'} · nasce com Data, Executado por e Verificado (CQ)`,
      }],
      erroPadrao: 'Não foi possível criar o formulário.',
      aoConcluir: async () => {
        setNovoAberto(false);
        setNovo({ code: '', popCode: '', title: '', periodicity: 'Por uso', orientation: 'portrait' });
        carregar();
      },
    });
  };

  return (
    <div className="space-y-3">
      {erro && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
      <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-2xl border border-zinc-200/80 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            className="w-full rounded-xl border border-zinc-200 pl-9 pr-3 py-2 text-sm bg-zinc-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
            placeholder="Buscar código, título ou POP…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <select className="rounded-xl border border-zinc-200 px-3 py-2 text-sm bg-zinc-50/50" value={setor} onChange={(e) => setSetor(e.target.value)}>
          <option value="">Todos os setores</option>
          {setores.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="rounded-xl border border-zinc-200 px-3 py-2 text-sm bg-zinc-50/50" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="draft">Rascunho</option>
          <option value="in_review">Em aprovação</option>
          <option value="published">Vigente</option>
          <option value="obsolete">Obsoleto</option>
        </select>
        <span className="text-xs font-semibold text-zinc-500">{visiveis.length} formulários</span>
        <button type="button" onClick={() => setNovoAberto((v) => !v)} className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium">
          Novo
        </button>
      </div>
      {novoAberto && (
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-3 grid gap-2 sm:grid-cols-2">
          <input className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" placeholder="Código FOR-…" value={novo.code} onChange={(e) => setNovo({ ...novo, code: e.target.value })} />
          <input className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" placeholder="POP vinculado POP-…" value={novo.popCode} onChange={(e) => setNovo({ ...novo, popCode: e.target.value })} />
          <input className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" placeholder="Título" value={novo.title} onChange={(e) => setNovo({ ...novo, title: e.target.value })} />
          <input className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" placeholder="Periodicidade" value={novo.periodicity} onChange={(e) => setNovo({ ...novo, periodicity: e.target.value })} />
          <select className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" value={novo.orientation} onChange={(e) => setNovo({ ...novo, orientation: e.target.value })}>
            <option value="portrait">Vertical</option>
            <option value="landscape">Horizontal</option>
          </select>
          <button type="button" disabled={!novo.code.trim() || !novo.popCode.trim() || !novo.title.trim()} onClick={criar} className="sm:col-span-2 rounded-xl border border-zinc-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">
            Ver prévia e criar
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-50/70 text-zinc-500 text-xs uppercase tracking-wider border-b border-zinc-200/80">
            <tr>
              <th className="px-4 py-3 font-semibold">Código</th>
              <th className="px-4 py-3 font-semibold">Título</th>
              <th className="px-4 py-3 font-semibold">POP</th>
              <th className="px-4 py-3 font-semibold text-center">Folhas</th>
              <th className="px-4 py-3 font-semibold">Quando</th>
              <th className="px-4 py-3 font-semibold text-center">Rev.</th>
              <th className="px-4 py-3 font-semibold">Vigência</th>
              <th className="px-4 py-3 font-semibold text-center">Status</th>
              <th className="px-4 py-3 w-28" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visiveis.map((f) => {
              const st = rotuloStatus(f.status);
              const vencida = f.status === 'published' && (f.daysToReview ?? 1) < 0;
              return (
                <tr key={f.code} className="hover:bg-zinc-50/80 cursor-pointer" onClick={() => setAberto(f.code)}>
                  <td className="px-4 py-3 align-middle">
                    <div className="font-mono text-xs font-bold text-zinc-900">{f.code}</div>
                    <div className="text-[10px] text-zinc-400">antes: {f.previousCode}</div>
                  </td>
                  <td className="px-4 py-3 font-medium text-zinc-900">{f.title}</td>
                  <td className="px-4 py-3 font-mono text-xs">{f.popCode}</td>
                  <td className="px-4 py-3 text-center text-zinc-600">
                    {montarFolhas(f.areas).length > 1 ? `${montarFolhas(f.areas).length} (por área)` : '1'}
                    <div className="text-[10px] text-zinc-400">{f.orientation === 'landscape' ? 'horizontal' : 'vertical'} · {linhasPorFolha(f)} linhas</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{f.periodicity}</td>
                  <td className="px-4 py-3 text-center font-mono text-xs">
                    {rev2(f.revision)}
                    {f.emRevisao && <div className="text-[10px] text-sky-700">Rev. {rev2(f.nextRevision)} em edição</div>}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 text-xs">
                    {fmtData(f.effectiveDate) || '—'}
                    {vencida && <div className="text-[10px] font-semibold text-red-700">revisão vencida</div>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${st.classe}`}>{st.texto}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        void imprimirLinha(f);
                      }}
                    >
                      <Printer className="w-3.5 h-3.5" /> Imprimir
                    </button>
                  </td>
                </tr>
              );
            })}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-zinc-500">Nenhum formulário neste filtro.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <FormularioDrawer
        code={aberto}
        logoSrc={logoSrc}
        onClose={() => setAberto(null)}
        onMudou={carregar}
        onImprimir={imprimir}
        avisar={avisar}
      />

      {previaElemento}
      {aviso}
      {imprimindo && <FolhasImpressao dados={imprimindo} />}
    </div>
  );
}
