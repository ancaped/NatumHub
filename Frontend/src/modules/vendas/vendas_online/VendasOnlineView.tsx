import React from 'react';
import ModulePlaceholderView from '../../geral/components/ModulePlaceholderView';

interface Props {
  onBackToHub: () => void;
}

export default function VendasOnlineView({ onBackToHub }: Props) {
  return (
    <ModulePlaceholderView
      title="Vendas Online"
      subtitle="Integração Olist — em planejamento"
      description="Central de pedidos dos marketplaces, sincronização de estoque, baixas automáticas e cadastro de kits alinhado ao ERP Natum."
      onBackToHub={onBackToHub}
    />
  );
}
