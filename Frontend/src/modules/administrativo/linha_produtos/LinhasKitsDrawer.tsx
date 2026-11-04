import { useState } from 'react';
import { Edit, Plus, Trash2 } from 'lucide-react';
import Drawer from '../../geral/components/ui/Drawer';
import type { PreviaAcao } from '../../producao/gerenciamento/components/PreviaAcaoDrawer';
import { chamarLinhasKits, LinhaKit } from './linhasKits';

interface Props {
  linhas: LinhaKit[];
  onClose: () => void;
  /** Recarrega as linhas e os kits depois de gravar. */
  onChanged: () => Promise<void> | void;
  /** Abre o painel de prévia (o servidor só grava depois do OK). */
  pedirPrevia: (previa: PreviaAcao) => void;
  avisar: (mensagem: string, tipo?: 'sucesso' | 'erro' | 'info') => void;
}

interface Edicao {
  id?: string;
  nome: string;
  prefixos: string;
}

/** Gestão das linhas de kits: nome e prefixos de código que sugerem a linha. Separada das linhas de produto. */
export default function LinhasKitsDrawer({ linhas, onClose, onChanged, pedirPrevia, avisar }: Props) {
  const [edicao, setEdicao] = useState<Edicao | null>(null);

  const prefixosDe = (texto: string) =>
    texto
      .split(/[,\s;]+/)
      .map(p => p.trim())
      .filter(Boolean);

  const salvar = async () => {
    if (!edicao) return;
    const corpo = { id: edicao.id, nome: edicao.nome, prefixos: prefixosDe(edicao.prefixos) };
    try {
      const data = await chamarLinhasKits('', 'POST', corpo);
      const r = data.resultado || {};
      pedirPrevia({
        titulo: r.acao === 'criar' ? 'Criar linha de kits' : 'Alterar linha de kits',
        linhas: [
          {
            titulo: corpo.nome,
            detalhe: `Prefixos: ${corpo.prefixos.length ? corpo.prefixos.join(', ') : '(nenhum)'}${r.antes ? ` · antes: ${r.antes.nome} (${(r.antes.prefixos || []).join(', ') || 'nenhum'})` : ''}`,
          },
        ],
        confirmarRotulo: 'Salvar linha',
        executar: async () => {
          await chamarLinhasKits('', 'POST', corpo, { confirmar: true });
          setEdicao(null);
          await onChanged();
          avisar('Linha de kits salva.', 'sucesso');
        },
      });
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao preparar a linha.', 'erro');
    }
  };

  const excluir = async (l: LinhaKit) => {
    try {
      const data = await chamarLinhasKits(`/${encodeURIComponent(l.id)}`, 'DELETE', undefined);
      const r = data.resultado || {};
      pedirPrevia({
        titulo: 'Excluir linha de kits',
        linhas: [
          {
            titulo: l.nome,
            detalhe: `${r.ligacoesManuaisRemovidas ?? 0} ligação(ões) manual(is) saem; os kits voltam à sugestão pelo prefixo.`,
          },
        ],
        confirmarRotulo: 'Excluir linha',
        pedirMotivo: true,
        executar: async (motivo?: string) => {
          await chamarLinhasKits(`/${encodeURIComponent(l.id)}`, 'DELETE', undefined, { confirmar: true, motivo });
          await onChanged();
          avisar('Linha de kits excluída.', 'sucesso');
        },
      });
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao preparar a exclusão.', 'erro');
    }
  };

  return (
    <Drawer
      onClose={onClose}
      size="md"
      title="Linhas de kits"
      subtitle="Classificação própria dos kits, separada das linhas de produto"
      headerActions={
        <button
          type="button"
          onClick={() => setEdicao({ nome: '', prefixos: '' })}
          className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Nova linha
        </button>
      }
    >
      {edicao && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Nome da linha</span>
              <input
                value={edicao.nome}
                onChange={e => setEdicao({ ...edicao, nome: e.target.value })}
                placeholder="Ex.: Kits Natum"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Prefixos do código</span>
              <input
                value={edicao.prefixos}
                onChange={e => setEdicao({ ...edicao, prefixos: e.target.value })}
                placeholder="Ex.: 1, 10"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </label>
          </div>
          <p className="text-[11px] text-zinc-500">
            O primeiro número do código do kit sugere a linha (1 = Natum, 2 = Hair...). Um prefixo só pode estar em uma linha. Dá para corrigir kit a kit na tabela.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEdicao(null)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={edicao.nome.trim() === ''}
              onClick={() => void salvar()}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-zinc-900 text-white disabled:opacity-50 cursor-pointer"
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-zinc-50 border-b border-zinc-200 font-bold text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 text-[10px] uppercase tracking-wider">Linha</th>
              <th className="px-4 py-2.5 text-[10px] uppercase tracking-wider">Prefixos</th>
              <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider">Kits</th>
              <th className="px-4 py-2.5 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-zinc-400">Nenhuma linha de kits cadastrada.</td>
              </tr>
            ) : (
              linhas.map(l => (
                <tr key={l.id} className="hover:bg-zinc-50/70">
                  <td className="px-4 py-2.5 font-bold text-zinc-800">{l.nome}</td>
                  <td className="px-4 py-2.5 font-mono text-zinc-500">{l.prefixos.length ? l.prefixos.join(', ') : '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700">{l.kits}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setEdicao({ id: l.id, nome: l.nome, prefixos: l.prefixos.join(', ') })}
                      className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-800 rounded-lg cursor-pointer"
                      title="Editar linha"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void excluir(l)}
                      className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-rose-600 rounded-lg cursor-pointer"
                      title="Excluir linha"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Drawer>
  );
}
