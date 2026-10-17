import React from 'react';
import AcompanhamentoProducaoView from '../../administrativo/acompanhamento_producao/AcompanhamentoProducaoView';

export default function PlanejamentoProducaoView({ onBackToHub }: { onBackToHub?: () => void }) {
  return (
    <AcompanhamentoProducaoView
      onBack={onBackToHub}
      mode="planejamento"
    />
  );
}
