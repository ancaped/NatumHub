import React from 'react';
import ModulePlaceholderView from '../../geral/components/ModulePlaceholderView';

interface Props {
  onBackToHub: () => void;
}

export default function QualidadePopsView({ onBackToHub }: Props) {
  return (
    <ModulePlaceholderView
      title="POPs"
      description="Procedimentos operacionais padrão versionados para BPF cosméticos — higienização, produção, amostragem e liberação."
      onBackToHub={onBackToHub}
    />
  );
}
