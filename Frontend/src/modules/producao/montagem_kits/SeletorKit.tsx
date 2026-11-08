import React, { useMemo, useState } from 'react';
import { Search, X, Check } from 'lucide-react';

type ItemKit = { codigo: string; descricao: string; estoque?: number | string };

const normalizar = (t: string) =>
  String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Escolha de kit por busca: digita parte do código ou da descrição (várias palavras, em qualquer ordem)
 * e toca no resultado. Sem abrir lista longa de <select>.
 */
export default function SeletorKit({
  kits,
  valor,
  onChange,
  placeholder = 'Digite o código ou o nome do kit…',
}: {
  kits: ItemKit[];
  valor: string;
  onChange: (codigo: string) => void;
  placeholder?: string;
}) {
  const [busca, setBusca] = useState('');
  const escolhido = kits.find((k) => k.codigo === valor) || null;

  const resultados = useMemo(() => {
    const termos = normalizar(busca).split(/\s+/).filter(Boolean);
    if (termos.length === 0) return [];
    return kits
      .filter((k) => {
        const alvo = normalizar(`${k.codigo} ${k.descricao}`);
        return termos.every((t) => alvo.includes(t));
      })
      .slice(0, 30);
  }, [busca, kits]);

  if (escolhido) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-zinc-900 bg-zinc-50 px-3 py-2">
        <Check size={14} className="text-zinc-900 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="block font-bold text-zinc-900 text-xs break-words">{escolhido.descricao}</span>
          <span className="font-mono text-[10px] text-zinc-500">
            {escolhido.codigo}
            {escolhido.estoque !== undefined ? ` · estoque ${escolhido.estoque} un` : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={() => { onChange(''); setBusca(''); }}
          className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 inline-flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-900 cursor-pointer"
          aria-label="Trocar kit"
          title="Trocar kit"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full border border-zinc-300 rounded-xl pl-9 pr-3 py-2.5 text-xs font-semibold text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
      </div>
      {busca.trim() !== '' && (
        <div className="border border-zinc-200 rounded-xl divide-y divide-zinc-100 max-h-64 overflow-y-auto bg-white">
          {resultados.length === 0 ? (
            <p className="p-4 text-center text-zinc-400 font-bold text-xs">Nenhum kit encontrado.</p>
          ) : (
            resultados.map((k) => (
              <button
                key={k.codigo}
                type="button"
                onClick={() => { onChange(k.codigo); setBusca(''); }}
                className="w-full text-left px-3 py-2.5 min-h-11 hover:bg-zinc-50 cursor-pointer flex items-center justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="block font-bold text-zinc-900 text-xs break-words">{k.descricao}</span>
                  <span className="font-mono text-[10px] text-zinc-500">{k.codigo}</span>
                </span>
                {k.estoque !== undefined && <span className="text-[10px] font-bold text-zinc-500 shrink-0">{k.estoque} un</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
