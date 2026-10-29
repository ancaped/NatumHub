import { useEffect, useMemo, useState } from 'react';
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
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
}

function imprimir(f: Formulario) {
  const areas = f.areas.length ? f.areas : [''];
  const folhas = areas.map((area, i) => {
    const cols = f.fields.map((c) => `<th>${esc(c.label)}${c.limit ? `<small>${esc(c.limit)}</small>` : ''}</th>`).join('');
    const vazias = Array.from({ length: 18 }, () => `<tr>${f.fields.map(() => '<td></td>').join('')}</tr>`).join('');
    return `<section class="folha">
      <header>
        <div class="logo">NÁTUM BIO</div>
        <div><strong>${esc(f.title)}</strong><div>POP vinculado: ${esc(f.popCode)}</div></div>
        <div>Código: ${esc(f.code)}<br>Revisão: ${String(f.revision).padStart(2, '0')}<br>Folha: ${i + 1}/${areas.length}</div>
      </header>
      <div class="linha"><span>Mês/Ano: ____/______</span><span>${area ? `Área: ${esc(area)}` : 'Setor/Área: ________________'}</span><span>Equipamento/ID: ____________</span></div>
      ${f.limits ? `<p class="limites"><strong>Limites de aceitação:</strong> ${esc(f.limits)}</p>` : ''}
      <table><thead><tr>${cols}</tr></thead><tbody>${vazias}</tbody></table>
      <footer>
        <p>Caneta azul ou preta. Sem corretivo. Erro = um traço + valor correto + rubrica + data + motivo. Campo não aplicável = N/A. Fora do limite → abrir Não Conformidade (POP-CQL-081).</p>
        <p>Elaborado: __________ &nbsp; Aprovado (CQ): __________ &nbsp; Data: __/__/____ &nbsp; Página ${i + 1} de ${areas.length}</p>
      </footer>
    </section>`;
  }).join('');
  const w = window.open('', '_blank', 'noopener');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${esc(f.code)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { font-family: Arial, sans-serif; color: #18181b; }
      .folha { break-after: page; }
      header, .linha { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; }
      header { border-bottom: 2px solid #18181b; padding-bottom: 6px; }
      .logo { font-weight: 700; }
      .linha { margin: 8px 0; }
      .limites { font-size: 11px; background: #f4f4f5; padding: 6px; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th, td { border: 1px solid #a1a1aa; padding: 4px; height: 18px; }
      th small { display: block; font-weight: 400; color: #3f3f46; }
      footer { margin-top: 8px; font-size: 9px; color: #3f3f46; }
    </style></head><body>${folhas}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

export default function FormulariosTab() {
  const [lista, setLista] = useState<Formulario[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<Formulario | null>(null);

  useEffect(() => {
    void apiJson<Formulario[]>('/qualidade/pops/formularios')
      .then((rows) => setLista(Array.isArray(rows) ? rows : []))
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Falha ao carregar formulários'));
  }, []);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((f) => `${f.code} ${f.title} ${f.popCode} ${f.previousCode}`.toLowerCase().includes(q));
  }, [lista, busca]);

  return (
    <div className="space-y-3">
      {erro && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
      <div className="flex items-center gap-2 bg-white p-3 rounded-2xl border border-zinc-200/80">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            className="w-full rounded-xl border border-zinc-200 pl-9 pr-3 py-2 text-sm"
            placeholder="Buscar código, título ou POP…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <span className="text-xs font-semibold text-zinc-500">{visiveis.length} formulários</span>
      </div>
      <div className="bg-white rounded-2xl border border-zinc-200/80 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Título</th>
              <th className="px-4 py-2">POP</th>
              <th className="px-4 py-2">Folhas</th>
              <th className="px-4 py-2">Quando</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((f) => (
              <tr key={f.code} className="border-t border-zinc-100 hover:bg-zinc-50 cursor-pointer" onClick={() => setSel(f)}>
                <td className="px-4 py-2 font-mono text-xs">{f.code}</td>
                <td className="px-4 py-2">{f.title}</td>
                <td className="px-4 py-2 font-mono text-xs">{f.popCode}</td>
                <td className="px-4 py-2">{f.areas.length > 1 ? `${f.areas.length} (uma por área)` : '1'}</td>
                <td className="px-4 py-2 text-zinc-500">{f.periodicity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Drawer
        isOpen={!!sel}
        onClose={() => setSel(null)}
        title={sel ? sel.code : ''}
        subtitle={sel?.title}
        size="lg"
        headerActions={sel ? (
          <button type="button" onClick={() => imprimir(sel)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 text-white text-xs">
            <Printer className="w-3.5 h-3.5" /> Imprimir
          </button>
        ) : null}
      >
        {sel && (
          <div className="space-y-4 text-sm">
            <p className="text-zinc-500">Antes: {sel.previousCode} · Rev. {String(sel.revision).padStart(2, '0')} · {sel.periodicity}</p>
            {sel.note && <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 p-3">{sel.note}</p>}
            <p><span className="text-zinc-500">POP vinculado </span><span className="font-mono">{sel.popCode}</span></p>
            {sel.limits && <p><span className="text-zinc-500">Limites </span>{sel.limits}</p>}
            {sel.areas.length > 0 && (
              <div>
                <p className="text-zinc-500 mb-1">Uma folha por área</p>
                <ul className="list-disc pl-5 space-y-0.5">{sel.areas.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            )}
            <table className="w-full text-left">
              <thead className="text-xs uppercase text-zinc-500"><tr><th className="py-1">Coluna</th><th>Tipo</th><th>Limite</th></tr></thead>
              <tbody>
                {sel.fields.map((c) => (
                  <tr key={c.label} className="border-t border-zinc-100">
                    <td className="py-1">{c.label}</td>
                    <td>{c.kind}</td>
                    <td>{c.limit || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Drawer>
    </div>
  );
}
