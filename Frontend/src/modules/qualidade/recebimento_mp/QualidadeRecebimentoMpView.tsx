import React from 'react';
import ModulePlaceholderView from '../../geral/components/ModulePlaceholderView';

interface Props {
  onBackToHub: () => void;
}

export default function QualidadeRecebimentoMpView({ onBackToHub }: Props) {
  return (
    <ModulePlaceholderView
      title="Recebimento de Matéria-Prima"
      description="Inspeção na entrada — COA, aspecto, conformidade e quarentena de lotes recebidos."
      onBackToHub={onBackToHub}
    />
  );
}
