import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer, Search } from 'lucide-react';
import { apiJson } from '../../../geral/lib/http';
import type { Formulario } from './FormulariosTab';
import type { PopDocument } from '../types';

interface Linha {
  tipo: 'POP' | 'Formulário';
  code: string;
  title: string;
  setor: string;
  revision: number;
  status: string;
  vigencia: string;
  proxima: string;
  vinculo: string;
}

const STATUS: Record<string, string> = {
  draft: 'Rascunho',
  in_review: 'Em aprovação',
  published: 'Vigente',
  obsolete: 'Obsoleto',
};

function rotuloStatus(s: string) {
  return STATUS[s] ?? s;
}

function setorDoCodigo(code: string) {
  const p = code.split('-');
  return p.length >= 2 ? p[1] : '';
}

function dataCurta(v?: string | null) {
  if (!v) return '';
  return v.slice(0, 10);
}

function paraCsv(linhas: Linha[]) {
  const cab = ['Tipo', 'Código', 'Título', 'Setor', 'Revisão', 'Status', 'Vigência', 'Próxima revisão', 'Vínculo'];
  const cel = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const corpo = linhas.map((l) =>
    [l.tipo, l.code, l.title, l.setor, String(l.revision).padStart(2, '0'), rotuloStatus(l.status), l.vigencia, l.proxima, l.vinculo]
      .map(cel)
      .join(';'),
  );
  return `\uFEFF${cab.join(';')}\n${corpo.join('\n')}\n`;
}

export default function ListaMestraTab() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [setor, setSetor] = useState('');
  const [status, setStatus] = useState('');
  const [imprimindo, setImprimindo] = useState(false);

  useEffect(() => {
    void Promise.all([
      apiJson<PopDocument[]>('/qualidade/pops/documents'),
      apiJson<Formulario[]>('/qualidade/pops/formularios'),
    ])
      .then(([docs, forms]) => {
        const pops: Linha[] = (Array.isArray(docs) ? docs : []).map((d) => ({
          tipo: 'POP',
          code: d.code,
          title: d.title,
          setor: setorDoCodigo(d.code) || d.sectorName || '',
          revision: d.currentRevision,
          status: d.status,
          vigencia: dataCurta(d.effectiveDate),
          proxima: dataCurta(d.nextReviewDate),
          vinculo: '',
        }));
        const fors: Linha[] = (Array.isArray(forms) ? forms : []).map((f) => ({
          tipo: 'Formulário',
          code: f.code,
          title: f.title,
          setor: setorDoCodigo(f.code),
          revision: f.revision,
          status: f.status,
          vigencia: dataCurta(f.effectiveDate),
          proxima: dataCurta(f.nextReviewDate),
          vinculo: f.popCode,
        }));
        setLinhas([...pops, ...fors].sort((a, b) => a.code.localeCompare(b.code, 'pt-BR')));
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Falha ao montar a lista mestra'));
  }, []);

  useEffect(() => {
    const fim = () => setImprimindo(false);
    window.addEventListener('afterprint', fim);
    return () => window.removeEventListener('afterprint', fim);
  }, []);

  const setores = useMemo(() => Array.from(new Set(linhas.map((l) => l.setor).filter(Boolean))).sort(), [linhas]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (status === '' && l.status === 'obsolete') return false;
      if (status && status !== 'all' && l.status !== status) return false;
      if (setor && l.setor !== setor) return false;
      if (!q) return true;
      return `${l.code} ${l.title} ${l.vinculo}`.toLowerCase().includes(q);
    });
  }, [linhas, busca, setor, status]);

  const baixar = () => {
    const blob = new Blob([paraCsv(visiveis)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lista-mestra-pops.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const imprimir = () => {
    setImprimindo(true);
    window.setTimeout(() => window.print(), 180);
  };

  return (
    <div className="space-y-3">
      {erro && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
      <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-2xl border border-zinc-200/80 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            className="w-full rounded-xl border border-zinc-200 pl-9 pr-3 py-2 text-sm bg-zinc-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
            placeholder="Buscar código ou título…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <select className="rounded-xl border border-zinc-200 px-3 py-2 text-sm bg-zinc-50/50" value={setor} onChange={(e) => setSetor(e.target.value)}>
          <option value="">Todos os setores</option>
          {setores.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="rounded-xl border border-zinc-200 px-3 py-2 text-sm bg-zinc-50/50" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Em uso</option>
          <option value="all">Todos os status</option>
          <option value="published">Vigente</option>
          <option value="in_review">Em aprovação</option>
          <option value="draft">Rascunho</option>
          <option value="obsolete">Obsoleto</option>
        </select>
        <span className="text-xs font-semibold text-zinc-500">{visiveis.length}</span>
        <button type="button" onClick={baixar} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
          <Download className="w-4 h-4" /> Planilha
        </button>
        <button type="button" onClick={imprimir} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium">
          <Printer className="w-4 h-4" /> Imprimir
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-50/70 text-zinc-500 text-xs uppercase tracking-wider border-b border-zinc-200/80">
            <tr>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Título</th>
              <th className="px-4 py-3">Setor</th>
              <th className="px-4 py-3 text-center">Rev.</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Vigência</th>
              <th className="px-4 py-3">Próxima revisão</th>
              <th className="px-4 py-3">Vínculo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visiveis.map((l) => (
              <tr key={`${l.tipo}-${l.code}`}>
                <td className="px-4 py-2.5 text-zinc-500">{l.tipo}</td>
                <td className="px-4 py-2.5 font-mono text-xs font-bold">{l.code}</td>
                <td className="px-4 py-2.5">{l.title}</td>
                <td className="px-4 py-2.5">{l.setor || '—'}</td>
                <td className="px-4 py-2.5 text-center font-mono text-xs">{String(l.revision).padStart(2, '0')}</td>
                <td className="px-4 py-2.5">{rotuloStatus(l.status)}</td>
                <td className="px-4 py-2.5 text-zinc-600">{l.vigencia || '—'}</td>
                <td className="px-4 py-2.5 text-zinc-600">{l.proxima || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{l.vinculo || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {imprimindo && (
        <TabelaImpressao linhas={visiveis} />
      )}
    </div>
  );
}

function TabelaImpressao({ linhas }: { linhas: Linha[] }) {
  return createPortal(
    <>
      <style>{`
        @media screen { .lm-print-root { display: none !important; } }
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body { margin: 0 !important; background: #fff !important; }
          body > *:not(.lm-print-root) { display: none !important; }
          .lm-print-root { display: block !important; font-family: Arial, sans-serif; color: #000; font-size: 9px; }
          .lm-print-root table { width: 100%; border-collapse: collapse; }
          .lm-print-root th, .lm-print-root td { border: 1px solid #000; padding: 3px 4px; text-align: left; }
          .lm-print-root th { background: #eee; }
        }
      `}</style>
      <div className="lm-print-root">
        <h1 style={{ fontSize: 14, margin: '0 0 8px' }}>Lista mestra — POPs e formulários</h1>
        <table>
          <thead>
            <tr>
              <th>Tipo</th><th>Código</th><th>Título</th><th>Setor</th><th>Rev.</th><th>Status</th><th>Vigência</th><th>Próxima revisão</th><th>Vínculo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={`${l.tipo}-${l.code}`}>
                <td>{l.tipo}</td>
                <td>{l.code}</td>
                <td>{l.title}</td>
                <td>{l.setor}</td>
                <td>{String(l.revision).padStart(2, '0')}</td>
                <td>{rotuloStatus(l.status)}</td>
                <td>{l.vigencia || '—'}</td>
                <td>{l.proxima || '—'}</td>
                <td>{l.vinculo || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>,
    document.body,
  );
}
