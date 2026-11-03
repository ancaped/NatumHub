import { useEffect, useState } from 'react';
import { apiJson } from '../../../geral/lib/http';

interface Bloco {
  titulo: string;
  itens: string[];
}

interface Normas {
  titulo: string;
  blocos: Bloco[];
}

/** Normas e regras do controle de documentos. O texto vem do servidor (`GET /qualidade/pops/normas`), a mesma fonte dos agentes. */
export default function NormasTab() {
  const [normas, setNormas] = useState<Normas | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void apiJson<Normas>('/qualidade/pops/normas')
      .then(setNormas)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Falha ao carregar as normas'));
  }, []);

  if (erro) return <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>;
  if (!normas) return <div className="text-sm text-zinc-500">Carregando…</div>;

  return (
    <div className="space-y-3 max-w-3xl">
      {(normas.blocos ?? []).map((b) => (
        <section key={b.titulo} className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden">
          <h2 className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500 bg-zinc-50/70 border-b border-zinc-200/80">
            {b.titulo}
          </h2>
          <ul className="divide-y divide-zinc-100">
            {(b.itens ?? []).map((item) => (
              <li key={item} className="px-4 py-3 text-sm text-zinc-800">{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
