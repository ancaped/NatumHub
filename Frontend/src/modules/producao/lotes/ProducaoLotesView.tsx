import ProducaoView from '../gerenciamento/ProducaoView';

interface ProducaoLotesViewProps {
  onBackToHub: () => void;
}

export default function ProducaoLotesView({ onBackToHub }: ProducaoLotesViewProps) {
  return <ProducaoView onBackToHub={onBackToHub} lockedView="lotes" />;
}
