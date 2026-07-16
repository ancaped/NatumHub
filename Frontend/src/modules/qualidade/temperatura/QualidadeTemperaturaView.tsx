import React from 'react';
import ModulePlaceholderView from '../../geral/components/ModulePlaceholderView';

interface Props {
  onBackToHub: () => void;
}

export default function QualidadeTemperaturaView({ onBackToHub }: Props) {
  return (
    <ModulePlaceholderView
      title="Temperatura"
      description="Monitoramento de câmaras e áreas críticas — leituras, faixas aceitáveis e desvios."
      onBackToHub={onBackToHub}
    />
  );
}
