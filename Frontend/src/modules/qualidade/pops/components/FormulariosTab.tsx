import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Search } from 'lucide-react';
import Drawer from '../../../geral/components/ui/Drawer';
import { apiJson } from '../../../geral/lib/http';

export interface FormCampo {
  label: string;
  kind: string;
  limit?: string | null;
}

export interface Formulario {
  code: string;
  popCode: string;
  title: string;
  previousCode: string;
  periodicity: string;
  areas: string[];
  fields: FormCampo[];
  limits?: string | null;
  note?: string | null;
  status: string;
  revision: number;
  orientation?: string;
}

const BORDA = '1.5px solid #000';
const LINHAS = 14;

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  draft: { rotulo: 'Rascunho', classe: 'bg-amber-50 text-amber-800 border-amber-200' },
  in_review: { rotulo: 'Em aprovação', classe: 'bg-sky-50 text-sky-800 border-sky-200' },
  published: { rotulo: 'Vigente', classe: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  obsolete: { rotulo: 'Obsoleto', classe: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
};

function setorDe(code: string) {
  return code.split('-')[1] || '';
}

function deitado(f: Formulario) {
  return f.orientation === 'landscape';
}

function Folha({ f, area, pagina, total, logoSrc }: { f: Formulario; area: string; pagina: number; total: number; logoSrc?: string | null }) {
  const paisagem = deitado(f);
  const vazias = Array.from({ length: paisagem ? 8 : LINHAS });
  return (
    <div
      className="for-folha"
      style={{
        width: paisagem ? '297mm' : '210mm',
        height: paisagem ? '209mm' : '296mm',
        boxSizing: 'border-box',
        padding: '8mm',
        background: '#fff',
        color: '#000',
        overflow: 'hidden',
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', border: BORDA, boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '32mm 1fr 48mm', borderBottom: BORDA }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: BORDA, padding: 4 }}>
            {logoSrc ? (
              <img src={logoSrc} alt="Logo" style={{ maxHeight: 36, maxWidth: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontWeight: 800, fontSize: 11 }}>NÁTUM</span>
            )}
          </div>
          <div style={{ textAlign: 'center', padding: '4px 8px', borderRight: BORDA }}>
            <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase' }}>{f.title}</div>
            <div style={{ fontSize: 9, marginTop: 2 }}>POP vinculado: {f.popCode}</div>
          </div>
          <div style={{ fontSize: 9, lineHeight: 1.45, padding: '4px 8px' }}>
            <div><b>Código:</b> {f.code}</div>
            <div><b>Revisão:</b> {String(f.revision).padStart(2, '0')}</div>
            <div><b>Folha:</b> {pagina}/{total}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 9, padding: '3px 8px', borderBottom: BORDA }}>
          <span><b>Mês/Ano:</b> ____/______</span>
          <span><b>{area ? 'Área:' : 'Setor/Área:'}</b> {area || '________________'}</span>
          <span><b>Equipamento/ID:</b> ____________</span>
        </div>
        {f.limits && (
          <div style={{ fontSize: 8.5, padding: '3px 8px', borderBottom: BORDA, background: '#f4f4f5' }}>
            <b>Limites de aceitação:</b> {f.limits}
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8, tableLayout: 'fixed' }}>
            <thead>
              <tr>
                {f.fields.map((c) => (
                  <th key={c.label} style={{ border: '1px solid #000', padding: '2px 3px', background: '#e5e7eb', textAlign: 'center', lineHeight: 1.15 }}>
                    {c.label}
                    {c.limit ? <small style={{ display: 'block', fontWeight: 400 }}>{c.limit}</small> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vazias.map((_, i) => (
                <tr key={i}>
                  {f.fields.map((c) => (
                    <td key={c.label} style={{ border: '1px solid #000', height: '7.2mm' }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ borderTop: BORDA, fontSize: 8 }}>
          <div style={{ padding: '3px 8px', borderBottom: BORDA, lineHeight: 1.35 }}>
            <b>Instruções:</b> caneta azul ou preta. Sem corretivo. Erro = um traço + valor correto + rubrica + data + motivo. Campo não aplicável = N/A. Fora do limite → abrir Não Conformidade (POP-CQL-081).
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 36mm' }}>
            <div style={{ padding: '4px 8px', borderRight: BORDA }}><b>Elaborado:</b><br />________________</div>
            <div style={{ padding: '4px 8px', borderRight: BORDA }}><b>Aprovado (CQ):</b><br />________________</div>
            <div style={{ padding: '4px 8px', borderRight: BORDA }}><b>Data:</b><br />__/__/____</div>
            <div style={{ padding: '4px 8px', textAlign: 'right' }}>Página {pagina} de {total}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FolhasImpressao({ f, logoSrc }: { f: Formulario; logoSrc?: string | null }) {
  const areas = f.areas.length ? f.areas : [''];
  const pagina = deitado(f) ? 'A4 landscape' : 'A4 portrait';
  return createPortal(
    <>
      <style>{`
        @media screen { .for-print-root { display: none !important; } }
        @media print {
          @page { size: ${pagina}; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body > *:not(.for-print-root) { display: none !important; }
          .for-print-root { display: block !important; background: #fff !important; }
          .for-folha { break-after: page; page-break-after: always; }
          .for-folha:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
      <div className="for-print-root">
        {areas.map((area, i) => (
          <Folha key={`${f.code}-${i}`} f={f} area={area} pagina={i + 1} total={areas.length} logoSrc={logoSrc} />
        ))}
      </div>
    </>,
    document.body,
  );
}

export default function FormulariosTab({ logoSrc }: { logoSrc?: string | null }) {
  const [lista, setLista] = useState<Formulario[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [setor, setSetor] = useState('');
  const [sel, setSel] = useState<Formulario | null>(null);
  const [folha, setFolha] = useState(0);
  const [imprimindo, setImprimindo] = useState<Formulario | null>(null);
  const [popVinculo, setPopVinculo] = useState('');
  const [orientacao, setOrientacao] = useState('portrait');
  const [motivo, setMotivo] = useState('');
  const [previaRev, setPreviaRev] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [novo, setNovo] = useState({ code: '', popCode: '', title: '', periodicity: 'Por uso', orientation: 'portrait' });
  const [previaNovo, setPreviaNovo] = useState<string | null>(null);

  const carregar = () => {
    void apiJson<Formulario[]>('/qualidade/pops/formularios')
      .then((rows) => setLista(Array.isArray(rows) ? rows : []))
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Falha ao carregar formulários'));
  };

  useEffect(() => {
    carregar();
  }, []);

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
      if (!q) return true;
      return `${f.code} ${f.title} ${f.popCode} ${f.previousCode}`.toLowerCase().includes(q);
    });
  }, [lista, busca, setor]);

  const abrir = (f: Formulario) => {
    setSel(f);
    setFolha(0);
    setPopVinculo(f.popCode);
    setOrientacao(f.orientation === 'landscape' ? 'landscape' : 'portrait');
    setMotivo('');
    setPreviaRev(null);
  };

  const revisar = async (confirmar: boolean) => {
    if (!sel) return;
    if (!motivo.trim()) {
      setErro('Informe o motivo da revisão.');
      return;
    }
    try {
      setErro(null);
      const r = await apiJson<Formulario & { previa?: boolean; revision: number }>(`/qualidade/pops/formularios/${encodeURIComponent(sel.code)}/revisao`, {
        method: 'POST',
        body: JSON.stringify({
          popCode: popVinculo.trim(),
          orientation: orientacao,
          motivo: motivo.trim(),
          confirmar,
        }),
      });
      if (r.previa) {
        setPreviaRev(`Rev. ${String(r.revision).padStart(2, '0')} · ${r.popCode} · ${orientacao === 'landscape' ? 'horizontal' : 'vertical'}`);
        return;
      }
      setSel(r);
      setPreviaRev(null);
      setMotivo('');
      carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao revisar');
    }
  };

  const criar = async (confirmar: boolean) => {
    try {
      setErro(null);
      const r = await apiJson<Formulario & { previa?: boolean }>(`/qualidade/pops/formularios`, {
        method: 'POST',
        body: JSON.stringify({ ...novo, confirmar }),
      });
      if (r.previa) {
        setPreviaNovo(`${r.code} ligado a ${r.popCode}, revisão 00, ${novo.orientation === 'landscape' ? 'horizontal' : 'vertical'}.`);
        return;
      }
      setNovoAberto(false);
      setPreviaNovo(null);
      setNovo({ code: '', popCode: '', title: '', periodicity: 'Por uso', orientation: 'portrait' });
      carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao criar');
    }
  };

  const imprimir = (f: Formulario) => {
    setImprimindo(f);
    window.setTimeout(() => window.print(), 180);
  };

  const areasSel = sel && sel.areas.length ? sel.areas : [''];
  const areaAtual = areasSel[Math.min(folha, areasSel.length - 1)] ?? '';
  const folhaSel = sel ? { ...sel, orientation: orientacao, popCode: popVinculo || sel.popCode } : null;

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
        <select
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm bg-zinc-50/50"
          value={setor}
          onChange={(e) => setSetor(e.target.value)}
        >
          <option value="">Todos os setores</option>
          {setores.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-xs font-semibold text-zinc-500">{visiveis.length} formulários</span>
        <button type="button" onClick={() => { setNovoAberto((v) => !v); setPreviaNovo(null); }} className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium">
          Novo
        </button>
      </div>
      {novoAberto && (
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-3 grid gap-2 sm:grid-cols-2">
          <input className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" placeholder="Código FOR-…" value={novo.code} onChange={(e) => { setNovo({ ...novo, code: e.target.value }); setPreviaNovo(null); }} />
          <input className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" placeholder="POP vinculado POP-…" value={novo.popCode} onChange={(e) => { setNovo({ ...novo, popCode: e.target.value }); setPreviaNovo(null); }} />
          <input className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" placeholder="Título" value={novo.title} onChange={(e) => { setNovo({ ...novo, title: e.target.value }); setPreviaNovo(null); }} />
          <select className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" value={novo.orientation} onChange={(e) => setNovo({ ...novo, orientation: e.target.value })}>
            <option value="portrait">Vertical</option>
            <option value="landscape">Horizontal</option>
          </select>
          <button type="button" onClick={() => void criar(!!previaNovo)} className="rounded-xl border border-zinc-300 px-3 py-2 text-sm font-semibold">
            {previaNovo ? 'Confirmar criação' : 'Ver prévia'}
          </button>
          {previaNovo && <p className="sm:col-span-2 text-xs text-zinc-600">{previaNovo} A folha nasce com Data, Executado por e Verificado (CQ).</p>}
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
              <th className="px-4 py-3 font-semibold text-center">Status</th>
              <th className="px-4 py-3 w-28" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visiveis.map((f) => {
              const st = STATUS[f.status] ?? { rotulo: f.status, classe: 'bg-zinc-100 text-zinc-600 border-zinc-200' };
              return (
                <tr key={f.code} className="hover:bg-zinc-50/80 cursor-pointer" onClick={() => abrir(f)}>
                  <td className="px-4 py-3 align-middle">
                    <div className="font-mono text-xs font-bold text-zinc-900">{f.code}</div>
                    <div className="text-[10px] text-zinc-400">antes: {f.previousCode}</div>
                  </td>
                  <td className="px-4 py-3 font-medium text-zinc-900">{f.title}</td>
                  <td className="px-4 py-3 font-mono text-xs">{f.popCode}</td>
                  <td className="px-4 py-3 text-center text-zinc-600">
                    {f.areas.length > 1 ? `${f.areas.length} (por área)` : '1'}
                    <div className="text-[10px] text-zinc-400">{f.orientation === 'landscape' ? 'horizontal' : 'vertical'}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{f.periodicity}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${st.classe}`}>{st.rotulo}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        imprimir(f);
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
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-500">Nenhum formulário neste filtro.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Drawer
        isOpen={!!sel}
        onClose={() => setSel(null)}
        title={sel ? sel.code : ''}
        subtitle={sel?.title}
        size="xl"
        headerActions={sel ? (
          <button type="button" onClick={() => imprimir(sel)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold">
            <Printer className="w-3.5 h-3.5" /> Imprimir
          </button>
        ) : null}
      >
        {sel && (
          <div className="space-y-4 text-sm">
            <p className="text-zinc-500">Antes: {sel.previousCode} · Rev. {String(sel.revision).padStart(2, '0')} · {sel.periodicity}</p>
            {sel.note && <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 p-3">{sel.note}</p>}
            {sel.areas.length > 1 && (
              <label className="block text-xs text-zinc-500">
                Prévia da área
                <select
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
                  value={folha}
                  onChange={(e) => setFolha(Number(e.target.value))}
                >
                  {sel.areas.map((a, i) => (
                    <option key={a} value={i}>{a}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="rounded-xl border border-zinc-200 bg-zinc-100 p-3 overflow-auto">
              <div style={{ width: folhaSel && deitado(folhaSel) ? 'calc(297mm * 0.42)' : 'calc(210mm * 0.48)', height: folhaSel && deitado(folhaSel) ? 'calc(209mm * 0.42)' : 'calc(296mm * 0.48)', overflow: 'hidden', margin: '0 auto' }}>
                <div style={{ transform: `scale(${folhaSel && deitado(folhaSel) ? 0.42 : 0.48})`, transformOrigin: 'top left' }}>
                  {folhaSel && <Folha f={folhaSel} area={areaAtual} pagina={Math.min(folha, areasSel.length - 1) + 1} total={areasSel.length} logoSrc={logoSrc} />}
                </div>
              </div>
              <p className="text-[11px] text-zinc-500 text-center mt-2">
                {folhaSel && deitado(folhaSel) ? 'Folha horizontal (A4 deitado).' : 'Folha vertical (A4).'}
                {areasSel.length > 1 ? ` ${areasSel.length} folhas, uma por área.` : ''}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-zinc-500">POP vinculado
                <input className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-mono text-zinc-900" value={popVinculo} onChange={(e) => { setPopVinculo(e.target.value); setPreviaRev(null); }} />
              </label>
              <label className="text-xs text-zinc-500">Impressão
                <select className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900" value={orientacao} onChange={(e) => { setOrientacao(e.target.value); setPreviaRev(null); }}>
                  <option value="portrait">Vertical</option>
                  <option value="landscape">Horizontal</option>
                </select>
              </label>
              <label className="text-xs text-zinc-500 sm:col-span-2">Motivo da revisão
                <input className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900" value={motivo} onChange={(e) => { setMotivo(e.target.value); setPreviaRev(null); }} placeholder="O que mudou" />
              </label>
              <button type="button" onClick={() => void revisar(!!previaRev)} className="sm:col-span-2 rounded-xl border border-zinc-300 px-3 py-2 text-sm font-semibold">
                {previaRev ? 'Confirmar revisão' : 'Ver prévia da revisão'}
              </button>
              {previaRev && <p className="sm:col-span-2 text-xs text-zinc-600">{previaRev}. A revisão anterior fica guardada.</p>}
            </div>
            {sel.limits && <p><span className="text-zinc-500">Limites </span>{sel.limits}</p>}
            <table className="w-full text-left">
              <thead className="text-xs uppercase text-zinc-500">
                <tr><th className="py-1">Coluna</th><th>Tipo</th><th>Limite</th></tr>
              </thead>
              <tbody>
                {sel.fields.map((c) => (
                  <tr key={c.label} className="border-t border-zinc-100">
                    <td className="py-1">{c.label}</td>
                    <td className="text-zinc-500">{c.kind}</td>
                    <td>{c.limit || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Drawer>

      {imprimindo && <FolhasImpressao f={imprimindo} logoSrc={logoSrc} />}
    </div>
  );
}
