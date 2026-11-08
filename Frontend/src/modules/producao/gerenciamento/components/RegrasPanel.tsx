import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Pencil, RotateCcw } from 'lucide-react';
import { apiJson } from '../../../geral/lib/http';
import { useAviso } from '../../../geral/components/ui/Aviso';
import { usePreviaServidor } from '../../lib/usePreviaServidor';

export interface Regra {
  id: number;
  escopo: 'geral' | 'linha' | 'base' | 'produto';
  alvo: string | null;
  tipo: 'regra' | 'anotacao';
  texto: string;
  ativo: boolean;
  criadoPor: string;
  criadoEm: string;
  atualizadoPor: string;
  atualizadoEm: string;
}

const ESCOPO_ROTULO: Record<Regra['escopo'], string> = { geral: 'Geral', linha: 'Linha', base: 'Base', produto: 'Produto' };
const TIPO_ROTULO: Record<Regra['tipo'], string> = { regra: 'Regra', anotacao: 'Anotação' };

interface Props {
  /** Com `produto`: as regras que valem para ele (geral, linha, base e o produto); só as do produto se editam. Sem: as gerais. */
  produto?: string;
  podeEditar: boolean;
}

/** Regras e anotações do planejamento: lista, adiciona, edita e arquiva (sempre com prévia do servidor). */
export default function RegrasPanel({ produto, podeEditar }: Props) {
  const { avisar, aviso } = useAviso();
  const { pedir, elemento } = usePreviaServidor(avisar);
  const [regras, setRegras] = useState<Regra[] | null>(null);
  const [arquivadas, setArquivadas] = useState(false);
  const [erro, setErro] = useState('');
  const [tipo, setTipo] = useState<Regra['tipo']>(produto ? 'anotacao' : 'regra');
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null);

  const escopoDoPanel: Regra['escopo'] = produto ? 'produto' : 'geral';

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const url = produto
        ? `/api/producao/regras?produto=${encodeURIComponent(produto)}`
        : `/api/producao/regras?escopo=geral&incluir_arquivadas=${arquivadas}`;
      setRegras(await apiJson<Regra[]>(url));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler as regras.');
    }
  }, [produto, arquivadas]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const adicionar = () => {
    if (!texto.trim()) return;
    void pedir({
      url: '/api/producao/regras',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ escopo: escopoDoPanel, alvo: produto ?? null, tipo, texto: texto.trim() }),
      },
      titulo: tipo === 'regra' ? 'Adicionar regra' : 'Adicionar anotação',
      confirmarRotulo: 'OK, adicionar',
      linhas: (d) => [{ titulo: `${TIPO_ROTULO[(d?.regra?.tipo as Regra['tipo']) ?? tipo]} • ${ESCOPO_ROTULO[escopoDoPanel]}${produto ? ` ${produto}` : ''}`, detalhe: d?.regra?.texto ?? texto.trim() }],
      erroPadrao: 'Não foi possível adicionar.',
      aoConcluir: async () => {
        setTexto('');
        avisar('Adicionado.', 'sucesso');
        await carregar();
      },
    });
  };

  const alterar = (r: Regra, corpo: { texto?: string; ativo?: boolean }, titulo: string, rotulo: string) => {
    void pedir({
      url: `/api/producao/regras/${r.id}`,
      init: { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) },
      titulo,
      confirmarRotulo: rotulo,
      linhas: (d) => [
        { titulo: 'Antes', detalhe: `${d?.antes?.ativo === false ? '(arquivada) ' : ''}${d?.antes?.texto ?? r.texto}` },
        { titulo: 'Depois', detalhe: `${d?.depois?.ativo === false ? '(arquivada) ' : ''}${d?.depois?.texto ?? ''}` },
      ],
      erroPadrao: 'Não foi possível alterar.',
      aoConcluir: async () => {
        setEditando(null);
        await carregar();
      },
    });
  };

  const editavel = (r: Regra) => podeEditar && r.escopo === escopoDoPanel;

  return (
    <div className="flex flex-col gap-3 text-xs text-left">
      {erro && <div className="px-2 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-semibold">{erro}</div>}

      {!produto && (
        <label className="flex items-center gap-1.5 text-zinc-600 font-semibold cursor-pointer w-fit">
          <input type="checkbox" checked={arquivadas} onChange={(e) => setArquivadas(e.target.checked)} />
          Mostrar arquivadas
        </label>
      )}

      {regras && regras.length === 0 && <div className="text-zinc-500">Nenhuma {produto ? 'regra ou anotação vale para este produto ainda.' : 'regra geral.'}</div>}

      {regras && regras.length > 0 && (
        <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg">
          {regras.map((r) => (
            <li key={r.id} className={`flex flex-col gap-1.5 px-2.5 py-2 ${r.ativo ? '' : 'bg-zinc-50 text-zinc-400'}`}>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-1.5 py-0.5 rounded-md bg-zinc-900 text-white font-bold text-[11px] md:text-[10px]">
                  {ESCOPO_ROTULO[r.escopo]}{r.alvo ? ` ${r.alvo}` : ''}
                </span>
                <span className="px-1.5 py-0.5 rounded-md border border-zinc-200 bg-white text-zinc-700 font-bold text-[11px] md:text-[10px]">{TIPO_ROTULO[r.tipo]}</span>
                {!r.ativo && <span className="px-1.5 py-0.5 rounded-md border border-zinc-200 bg-white font-bold text-[11px] md:text-[10px]">Arquivada</span>}
                <span className="ml-auto text-[11px] md:text-[10px] text-zinc-400">{r.atualizadoPor} • {r.atualizadoEm}</span>
              </div>

              {editando?.id === r.id ? (
                <div className="flex flex-col gap-1.5">
                  <textarea
                    value={editando.texto}
                    onChange={(e) => setEditando({ id: r.id, texto: e.target.value })}
                    rows={3}
                    className="px-2 py-1.5 border border-zinc-200 rounded-lg text-xs"
                  />
                  <div className="flex gap-1.5 justify-end">
                    <button type="button" onClick={() => setEditando(null)} className="px-2.5 py-1 max-md:min-h-11 text-[11px] font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 cursor-pointer">
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!editando.texto.trim() || editando.texto.trim() === r.texto}
                      onClick={() => alterar(r, { texto: editando.texto.trim() }, 'Editar texto', 'OK, salvar')}
                      className="px-2.5 py-1 max-md:min-h-11 text-[11px] font-bold rounded-lg bg-zinc-900 text-white disabled:opacity-50 cursor-pointer"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="whitespace-pre-wrap text-zinc-800">{r.texto}</div>
              )}

              {editavel(r) && editando?.id !== r.id && (
                <div className="flex gap-1.5">
                  {r.ativo && (
                    <button type="button" onClick={() => setEditando({ id: r.id, texto: r.texto })} className="flex items-center gap-1 px-2 py-0.5 max-md:min-h-11 text-[11px] md:text-[10px] font-bold rounded-md border border-zinc-200 bg-white text-zinc-700 cursor-pointer">
                      <Pencil size={10} /> Editar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => alterar(r, { ativo: !r.ativo }, r.ativo ? 'Arquivar' : 'Reativar', r.ativo ? 'OK, arquivar' : 'OK, reativar')}
                    className="flex items-center gap-1 px-2 py-0.5 max-md:min-h-11 text-[11px] md:text-[10px] font-bold rounded-md border border-zinc-200 bg-white text-zinc-700 cursor-pointer"
                  >
                    {r.ativo ? <Archive size={10} /> : <RotateCcw size={10} />} {r.ativo ? 'Arquivar' : 'Reativar'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {podeEditar && (
        <div className="flex flex-col gap-1.5 border border-zinc-200 rounded-lg p-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
            <label className="font-bold text-zinc-700" htmlFor={`regra-tipo-${produto ?? 'geral'}`}>Novo</label>
            <select
              id={`regra-tipo-${produto ?? 'geral'}`}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as Regra['tipo'])}
              className="w-full sm:w-auto px-2 py-1 max-md:min-h-11 border border-zinc-200 rounded-lg bg-white"
            >
              <option value="regra">Regra (o planejamento deve seguir)</option>
              <option value="anotacao">Anotação (contexto)</option>
            </select>
          </div>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            placeholder={produto ? 'Ex.: costuma render menos que a fórmula; produzir sempre com a base X' : 'Escreva a regra geral'}
            className="px-2 py-1.5 border border-zinc-200 rounded-lg text-xs"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!texto.trim()}
              onClick={adicionar}
              className="px-3 py-1.5 max-md:min-h-11 text-xs font-bold rounded-lg bg-zinc-900 text-white disabled:opacity-50 cursor-pointer"
            >
              Adicionar
            </button>
          </div>
        </div>
      )}

      {elemento}
      {aviso}
    </div>
  );
}
