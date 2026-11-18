import { agruparLinhas, alternarLinhaNoFiltro, type LinhaBase } from '../../lib/linhas';
import { cn } from '../../lib/utils';

interface Props {
  linhas: readonly LinhaBase[];
  /** Prefixos marcados. */
  marcados: ReadonlySet<string>;
  onChange: (marcados: Set<string>) => void;
  className?: string;
}

/** Filtro de linhas com sublinhas recuadas; marcar a principal marca as sublinhas dela (`alternarLinhaNoFiltro`). */
export default function FiltroLinhas({ linhas, marcados, onChange, className }: Props) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)} role="group" aria-label="Filtrar por linha">
      {agruparLinhas(linhas).map(({ linha, nivel }) => (
        <label
          key={linha.linha_prefix}
          className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-zinc-700 hover:bg-zinc-50', nivel === 1 && 'ml-6 text-zinc-600')}
        >
          <input
            type="checkbox"
            className="h-4 w-4 accent-zinc-900"
            checked={marcados.has(linha.linha_prefix)}
            onChange={() => onChange(alternarLinhaNoFiltro(linhas, marcados, linha.linha_prefix))}
          />
          <span className="truncate">{linha.nome_linha}</span>
          <span className="text-xs text-zinc-400">{linha.linha_prefix}</span>
        </label>
      ))}
    </div>
  );
}
