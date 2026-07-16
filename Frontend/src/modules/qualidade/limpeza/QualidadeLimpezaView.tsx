import React from 'react';
import ModulePlaceholderView from '../../geral/components/ModulePlaceholderView';

interface Props {
  onBackToHub: () => void;
}

export default function QualidadeLimpezaView({ onBackToHub }: Props) {
  return (
    <ModulePlaceholderView
      title="Limpeza"
      description="Planos e registros de higienização de áreas, equipamentos e utensílios de produção."
      onBackToHub={onBackToHub}
    />
  );
}
