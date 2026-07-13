import React from 'react';
import ModulePlaceholderView from '../../geral/components/ModulePlaceholderView';

interface Props {
  onBackToHub: () => void;
}

export default function ControleQualidadeView({ onBackToHub }: Props) {
  return (
    <ModulePlaceholderView
      title="Controle de Qualidade"
      description="Laudos, especificações, não-conformidades e rastreabilidade de lotes. Em breve integrado à produção e estoque."
      onBackToHub={onBackToHub}
    />
  );
}
