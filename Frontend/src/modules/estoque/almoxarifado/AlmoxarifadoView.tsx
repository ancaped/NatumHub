import React from 'react';
import EstoqueOpsView from '../ops/EstoqueOpsView';

/** Compat: abre Ops na aba Almoxarifado. Prefira `EstoqueOpsView` no App. */
export default function AlmoxarifadoView({ onBackToHub }: { onBackToHub: () => void }) {
  return (
    <EstoqueOpsView
      mode="almoxarifado"
      onBackToHub={onBackToHub}
      setView={() => undefined}
    />
  );
}
