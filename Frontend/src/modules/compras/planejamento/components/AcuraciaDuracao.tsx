import React, { useEffect, useState } from 'react';
import { api } from '../../../geral/lib/api';
import type { AcuraciaDuracao as Acuracia, AcuraciaFamilia } from '../../../geral/lib/types';
import { TabelaPainel } from '../../../geral/components/ui/ReportKit';

const NOME: Record<string, string> = {
  materia_prima: 'Matéria-Prima',
  embalagens: 'Embalagens',
  coloracao: 'Coloração',
  apoio: 'Material de Apoio',
};
const PADRAO: Record<string, string> = { continuo: 'Consumo contínuo (10+ meses no ano)', ocasional: 'Ocasional (5 a 9 meses)', em_lotes: 'Em lotes (1 a 4 meses)' };
const vazio: React.CSSProperties = { padding: '1.25rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' };
const num = (n: number) => n.toLocaleString('pt-BR');
const pct = (n?: number | null) => (n === null || n === undefined ? '—' : `${n.toLocaleString('pt-BR')}%`);

function Linhas({ linhas }: { linhas: AcuraciaFamilia[] }) {
  return (
    <>
      {linhas.map((f) => (
        <tr key={f.familia}>
          <td style={{ fontWeight: 600 }}>{NOME[f.familia] ?? f.familia}</td>
          <td className="numeric-col">{num(f.itens)}</td>
          <td className="numeric-col">{num(f.previsto)}</td>
          <td className="numeric-col">{num(f.real)}</td>
          <td className="numeric-col" style={{ fontWeight: 700 }}>{pct(f.erroPct)}</td>
          <td className="numeric-col">{pct(f.viesPct)}</td>
          <td className="numeric-col">{f.amostras > 0 ? `${Math.round((100 * f.semConsumo) / f.amostras)}%` : '—'}</td>
        </tr>
      ))}
    </>
  );
}

const CABECALHO = (
  <thead>
    <tr>
      <th>Família</th>
      <th className="numeric-col">Itens</th>
      <th className="numeric-col">Consumo previsto</th>
      <th className="numeric-col">Consumo real</th>
      <th className="numeric-col" title="Soma do erro absoluto sobre o consumo real">Erro</th>
      <th className="numeric-col" title="Negativo = previu menos do que saiu; positivo = previu mais">Viés</th>
      <th className="numeric-col" title="Parte das janelas em que o item não teve nenhuma saída">Sem consumo</th>
    </tr>
  </thead>
);

/** Quanto a previsão de consumo (base da duração estimada) erra: teste histórico e medição real das fotos diárias. */
export function AcuraciaDuracao({ active = false }: { active?: boolean }) {
  const [horizonte, setHorizonte] = useState(30);
  const [dados, setDados] = useState<Acuracia | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    setDados(null);
    setErro(null);
    api.getAcuraciaDuracao(horizonte).then(setDados).catch(() => setErro('Não foi possível medir agora.'));
  }, [active, horizonte]);

  const real = dados?.real;
  const hist = dados?.historico;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-zinc-900">Acerto da previsão de consumo</h3>
          <select value={horizonte} onChange={(e) => setHorizonte(Number(e.target.value))} className="text-sm border border-zinc-300 rounded-md px-2 py-1.5 bg-white">
            <option value={30}>Próximos 30 dias</option>
            <option value={60}>Próximos 60 dias</option>
            <option value={90}>Próximos 90 dias</option>
          </select>
        </div>
        <p className="text-xs text-zinc-500">
          A duração estimada usa o consumo médio dos últimos meses. Aqui se mede o quanto essa previsão erra. Só mede: nenhum número da tela muda.
        </p>
      </div>

      {erro && <p className="text-xs text-red-600">{erro}</p>}
      {!dados && !erro && <p className="text-sm text-zinc-400">Calculando...</p>}

      {hist && (
        <div>
          <h4 style={{ fontSize: '0.82rem', fontWeight: 800, marginBottom: 2 }}>Teste histórico: o método de hoje nos últimos meses ({hist.horizonteMeses} {hist.horizonteMeses === 1 ? 'mês' : 'meses'} à frente)</h4>
          <p style={{ fontSize: '0.72rem', color: 'hsl(var(--text-secondary-hsl))', marginBottom: 6 }}>
            Previsão = média dos 12 meses anteriores × horizonte, comparada com o que saiu de fato. Quanto maior o erro, menos a duração estimada serve de guia.
          </p>
          <TabelaPainel>
            {CABECALHO}
            <tbody>
              {hist.familias.length === 0 && <tr><td colSpan={7} style={vazio}>Sem movimento suficiente para medir.</td></tr>}
              <Linhas linhas={hist.familias} />
            </tbody>
          </TabelaPainel>
          <p style={{ fontSize: '0.72rem', color: 'hsl(var(--text-secondary-hsl))', marginTop: 6 }}>
            Padrão de consumo no último ano:{' '}
            {Object.entries(hist.padraoDeConsumo).map(([k, v]) => `${PADRAO[k] ?? k}: ${num(v)}`).join(' · ')}
          </p>
        </div>
      )}

      {real && (
        <div>
          <h4 style={{ fontSize: '0.82rem', fontWeight: 800, marginBottom: 2 }}>Medição real: fotos diárias da previsão ({horizonte} dias depois)</h4>
          <p style={{ fontSize: '0.72rem', color: 'hsl(var(--text-secondary-hsl))', marginBottom: 6 }}>
            {real.fotos.dias > 0
              ? `${real.fotos.dias} foto(s) guardada(s), de ${real.fotos.primeira} a ${real.fotos.ultima}.`
              : 'A primeira foto é gravada pelo servidor (uma por dia). A medição aparece depois que ela completar o horizonte.'}
          </p>
          <TabelaPainel>
            {CABECALHO}
            <tbody>
              {real.familias.length === 0 && <tr><td colSpan={7} style={vazio}>Ainda sem fotos com {horizonte} dias.</td></tr>}
              <Linhas linhas={real.familias} />
            </tbody>
          </TabelaPainel>
        </div>
      )}
    </div>
  );
}
