import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Check, X } from 'lucide-react';
import { apiFetch } from '../../geral/lib/http';

/** Lista compartilhada de quem monta e confere (servidor: /kits/pessoas). */
export function usePessoasKits(avisar: (msg: string, tipo?: any) => void, abrirPrevia: (p: any) => void) {
  const [pessoas, setPessoas] = useState<string[]>([]);

  const carregar = useCallback(async () => {
    try {
      const res = await apiFetch('/kits/pessoas');
      if (res.ok) setPessoas(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const adicionar = async (nome: string): Promise<string | null> => {
    const limpo = nome.trim().replace(/\s+/g, ' ');
    if (!limpo) return null;
    try {
      const res = await apiFetch('/kits/pessoas?confirmar=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: limpo }),
      });
      if (res.ok) {
        const lista: string[] = await res.json();
        setPessoas(lista);
        return lista.find((x) => x.toLowerCase() === limpo.toLowerCase()) || limpo;
      }
      const err = await res.json().catch(() => ({}));
      avisar(err.error || 'Não foi possível adicionar o nome.', 'erro');
    } catch (e) {
      console.error(e);
      avisar('Erro de conexão.', 'erro');
    }
    return null;
  };

  const remover = (nome: string, depois?: () => void) => {
    abrirPrevia({
      titulo: 'Tirar da lista',
      linhas: [{ titulo: nome, detalhe: 'sai da lista de quem monta e confere (ordens antigas mantêm o nome)' }],
      confirmarRotulo: 'OK, tirar',
      pedirMotivo: true,
      executar: async (motivo: string) => {
        try {
          const res = await apiFetch(
            `/kits/pessoas?nome=${encodeURIComponent(nome)}&confirmar=true&motivo=${encodeURIComponent(motivo ?? '')}`,
            { method: 'DELETE' },
          );
          if (res.ok) {
            setPessoas(await res.json());
            depois?.();
          } else {
            const err = await res.json().catch(() => ({}));
            avisar(err.error || 'Não foi possível tirar o nome.', 'erro');
          }
        } catch (e) {
          console.error(e);
          avisar('Erro de conexão.', 'erro');
        }
      },
    });
  };

  return { pessoas, adicionar, remover };
}

/**
 * Escolha de pessoa: lista + botão de adicionar do lado + botão de tirar da lista.
 * Nome que já estava gravado na ordem e não está na lista continua aparecendo.
 */
export default function SeletorPessoa({
  valor,
  onChange,
  pessoas,
  adicionar,
  remover,
  placeholder = 'Selecionar',
}: {
  valor: string;
  onChange: (nome: string) => void;
  pessoas: string[];
  adicionar: (nome: string) => Promise<string | null>;
  remover: (nome: string, depois?: () => void) => void;
  placeholder?: string;
}) {
  const [novo, setNovo] = useState(false);
  const [rascunho, setRascunho] = useState('');
  const naLista = pessoas.some((p) => p === valor);
  const opcoes = valor && !naLista ? [valor, ...pessoas] : pessoas;

  const confirmar = async () => {
    const nome = await adicionar(rascunho);
    if (nome) {
      onChange(nome);
      setRascunho('');
      setNovo(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 min-h-11 sm:min-h-10 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        >
          <option value="">{placeholder}</option>
          {opcoes.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setNovo((v) => !v)}
          className="min-h-11 min-w-11 sm:min-h-10 sm:min-w-10 shrink-0 inline-flex items-center justify-center rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer"
          aria-label="Adicionar pessoa à lista"
          title="Adicionar pessoa à lista"
        >
          {novo ? <X size={16} /> : <Plus size={16} />}
        </button>
        {valor && naLista && (
          <button
            type="button"
            onClick={() => remover(valor, () => onChange(''))}
            className="min-h-11 min-w-11 sm:min-h-10 sm:min-w-10 shrink-0 inline-flex items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 hover:text-red-600 hover:border-red-200 cursor-pointer"
            aria-label="Tirar esta pessoa da lista"
            title="Tirar esta pessoa da lista"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {novo && (
        <div className="flex gap-2">
          <input
            autoFocus
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void confirmar(); }
            }}
            placeholder="Nome da pessoa"
            maxLength={60}
            className="min-w-0 flex-1 min-h-11 sm:min-h-10 rounded-xl border border-zinc-300 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
          <button
            type="button"
            onClick={() => void confirmar()}
            className="min-h-11 sm:min-h-10 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-800 hover:bg-zinc-50 inline-flex items-center gap-1 cursor-pointer"
          >
            <Check size={14} /> Adicionar
          </button>
        </div>
      )}
    </div>
  );
}
