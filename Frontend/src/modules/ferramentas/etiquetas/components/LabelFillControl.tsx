import { useEffect, useState } from 'react';
import { readLabelFeed, writeLabelFeed, type LabelFeed } from '../lib/directPrint';
import { readLabelFillScale, writeLabelFillScale } from '../lib/printService';

/** Ajuste compartilhado por todas as impressões de etiqueta do Nexus. */
export default function LabelFillControl({
  onChange,
}: {
  onChange?: (next: { percent: number; feed: LabelFeed }) => void;
}) {
  const [percent, setPercent] = useState(100);
  const [feed, setFeed] = useState<LabelFeed>('landscape');

  useEffect(() => {
    const storedPercent = readLabelFillScale();
    const storedFeed = readLabelFeed();
    setPercent(storedPercent);
    setFeed(storedFeed);
    onChange?.({ percent: storedPercent, feed: storedFeed });
    // Só na abertura: onChange do pai muda a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseFeed = (next: LabelFeed) => {
    setFeed(next);
    writeLabelFeed(next);
    onChange?.({ percent, feed: next });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label className="text-xs font-bold text-zinc-900">Orientação</label>
          <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => chooseFeed('landscape')}
              className={`px-2.5 py-1 rounded-md cursor-pointer ${
                feed === 'landscape' ? 'bg-white text-zinc-900 shadow-xs font-bold' : 'text-zinc-500'
              }`}
            >
              Deitada
            </button>
            <button
              type="button"
              onClick={() => chooseFeed('portrait')}
              className={`px-2.5 py-1 rounded-md cursor-pointer ${
                feed === 'portrait' ? 'bg-white text-zinc-900 shadow-xs font-bold' : 'text-zinc-500'
              }`}
            >
              Em pé
            </button>
          </div>
        </div>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Deitada imprime na horizontal, sem girar. Em pé gira 90°. O envio vai direto para a impressora do Windows.
        </p>
      </div>

      <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-bold text-zinc-900">Preenchimento do adesivo</label>
        <span className="font-mono text-xs font-bold text-zinc-800">{percent}%</span>
      </div>
      <input
        type="range"
        min={90}
        max={115}
        step={1}
        value={percent}
        onChange={(e) => {
          const next = Number(e.target.value);
          setPercent(next);
          writeLabelFillScale(next);
          onChange?.({ percent: next, feed });
        }}
        className="w-full accent-zinc-900"
      />
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        100% usa a área exata do modelo. Aumente se a impressão ficar menor que o adesivo e sobrar borda branca; diminua se a arte cortar na borda.
      </p>
      </div>
    </div>
  );
}
