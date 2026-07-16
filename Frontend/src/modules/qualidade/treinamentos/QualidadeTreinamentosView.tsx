import React from 'react';
import ModulePlaceholderView from '../../geral/components/ModulePlaceholderView';

interface Props {
  onBackToHub: () => void;
}

export default function QualidadeTreinamentosView({ onBackToHub }: Props) {
  return (
    <ModulePlaceholderView
      title="Treinamentos"
      description="Registro de capacitação e reciclagem BPF — evidências por colaborador e área."
      onBackToHub={onBackToHub}
    />
  );
}
