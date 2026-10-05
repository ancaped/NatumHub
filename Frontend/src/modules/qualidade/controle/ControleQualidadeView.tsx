import React from 'react';
import ModulePlaceholderView from '../../geral/components/ModulePlaceholderView';

interface Props {
  onBackToHub: () => void;
}

export default function ControleQualidadeView({ onBackToHub }: Props) {
  return (
    <ModulePlaceholderView
      title="Controle de Qualidade"
      description="Visão geral de laudos, especificações, não-conformidades e rastreabilidade de lotes."
      onBackToHub={onBackToHub}
    />
  );
}
