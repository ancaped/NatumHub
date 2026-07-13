import ProducaoView from '../gerenciamento/ProducaoView';

interface ProducaoBasesViewProps {
  onBackToHub: () => void;
}

export default function ProducaoBasesView({ onBackToHub }: ProducaoBasesViewProps) {
  return <ProducaoView onBackToHub={onBackToHub} lockedView="bases" />;
}
