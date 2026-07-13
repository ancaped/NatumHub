import React from 'react';
import ModulePlaceholderView from '../geral/components/ModulePlaceholderView';

interface Props {
  onBackToHub: () => void;
}

export default function ExpedicaoView({ onBackToHub }: Props) {
  return (
    <ModulePlaceholderView
      title="Expedição"
      description="Separação, conferência, romaneios e despacho de pedidos. Futura integração com vendas online e transportadoras."
      onBackToHub={onBackToHub}
    />
  );
}
