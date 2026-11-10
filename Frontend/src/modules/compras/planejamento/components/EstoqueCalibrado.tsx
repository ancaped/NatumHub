import React, { useState } from 'react';
import type { Calibracao } from '../../../geral/lib/types';

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const sinal = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));

/** Pontinho azul ao lado do estoque quando ele é calibrado manualmente; o balão explica a diferença para o ERP. */
export function MarcaCalibrado({ calibracao, unit }: { calibracao?: Calibracao; unit?: string }) {
  if (!calibracao) return null;
  const txt = calibracao.fixa
    ? `Estoque calibrado manualmente com valor fixo (antigo). ERP hoje: ${fmt(calibracao.erp)} ${unit ?? ''}. Abra o item para remover a calibração.`
    : `Estoque calibrado manualmente: ERP ${fmt(calibracao.erp)} ${unit ?? ''} ${sinal(calibracao.diferenca)} de diferença, que acompanha o ERP.`;
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-600 align-middle mr-1" title={txt} aria-label="Estoque calibrado manualmente" />;
}

/** Aviso no painel de detalhes, com o botão que devolve o item ao estoque do ERP. */
export function NotaCalibracao({
  calibracao, unit, onRemover,
}: { calibracao?: Calibracao; unit?: string; onRemover: () => Promise<void> }) {
  const [removendo, setRemovendo] = useState(false);
  if (!calibracao) return null;
  const remover = async () => {
    if (!window.confirm('Remover a calibração? O item volta a mostrar o estoque do ERP.')) return;
    setRemovendo(true);
    try {
      await onRemover();
    } finally {
      setRemovendo(false);
    }
  };
  return (
    <div className="mt-2 text-[11px] text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5">
      <p>
        Calibrado manualmente. ERP: <strong>{fmt(calibracao.erp)} {unit}</strong>
        {calibracao.fixa ? ' · valor fixo antigo, não acompanha o ERP.' : ` · diferença ${sinal(calibracao.diferenca)}, acompanha o ERP.`}
      </p>
      <button
        type="button"
        onClick={remover}
        disabled={removendo}
        className="mt-2 inline-flex items-center justify-center min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1 text-[12px] font-bold text-blue-900 bg-white border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50 cursor-pointer"
      >
        {removendo ? 'Removendo...' : 'Remover calibração'}
      </button>
    </div>
  );
}
