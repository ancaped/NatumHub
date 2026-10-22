import React, { useEffect, useState } from 'react';
import Drawer from '../../../geral/components/ui/Drawer';
import { apiJson } from '../../../geral/lib/http';

export const MOTIVOS_FILA: Array<{ id: string; rotulo: string }> = [
  { id: 'estoque_suficiente', rotulo: 'Estoque suficiente' },
  { id: 'sem_demanda', rotulo: 'Sem demanda' },
  { id: 'falta_insumo', rotulo: 'Falta insumo' },
  { id: 'ja_planejado', rotulo: 'Já planejado/produzido' },
];

interface Previa {
  itens: Array<{ id: string; codigo: string; descricao: string; quantidadeKg?: number | null }>;
  batch?: string | null;
}

/** Tira item(ns) da fila: mostra a prévia, pede o motivo e só grava no OK. */
export default function RetirarDaFilaDrawer({
  filaId,
  onClose,
  onRetirado,
}: {
  filaId: string;
  onClose: () => void;
  onRetirado: () => void;
}) {
  const [grupo, setGrupo] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [motivo, setMotivo] = useState('');
  const [outro, setOutro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const corpo = (m: string, confirmar: boolean) =>
    JSON.stringify({ motivo: m, grupo, confirmar });
  const url = `/api/producao/fila-demandas/${encodeURIComponent(filaId)}/retirar`;

  useEffect(() => {
    let vivo = true;
    setErro('');
    apiJson<Previa>(url, { method: 'POST', body: corpo('previa', false) })
      .then((p) => vivo && setPrevia(p))
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : 'Não foi possível ler o item da fila.'));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filaId, grupo]);

  const motivoFinal = motivo === 'outro' ? (outro.trim() ? `outro: ${outro.trim()}` : '') : motivo;
  const emBatelada = !!previa?.batch;

  const confirmar = async () => {
    if (!motivoFinal) return;
    setSalvando(true);
    setErro('');
    try {
      await apiJson(url, { method: 'POST', body: corpo(motivoFinal, true) });
      onRetirado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível tirar da fila.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Drawer
      onClose={onClose}
      size="sm"
      title="Tirar da fila"
      subtitle={previa ? `${previa.itens.length} ${previa.itens.length === 1 ? 'item' : 'itens'}` : undefined}
      loading={!previa && !erro}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 cursor-pointer">
            Cancelar
          </button>
          <button
            type="button"
            disabled={salvando || !motivoFinal || !previa}
            onClick={confirmar}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-zinc-900 text-white disabled:opacity-50 cursor-pointer"
          >
            OK, tirar
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4 text-xs">
        {erro && <div className="px-2 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-semibold">{erro}</div>}

        {previa && (
          <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg">
            {previa.itens.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 px-2.5 py-2">
                <span className="font-semibold text-zinc-900 truncate">{i.descricao}</span>
                <span className="font-mono text-[10px] text-zinc-600 shrink-0">
                  {i.codigo}
                  {i.quantidadeKg ? ` • ${Number(i.quantidadeKg).toLocaleString('pt-BR')} kg` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}

        {(emBatelada || grupo) && (
          <label className="flex items-center gap-2 text-zinc-700 font-semibold cursor-pointer">
            <input type="checkbox" checked={grupo} onChange={(e) => setGrupo(e.target.checked)} />
            Tirar a batelada toda
          </label>
        )}

        <div className="flex flex-col gap-1.5">
          <div className="font-bold text-zinc-700">Por quê?</div>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS_FILA.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMotivo(m.id)}
                className={`px-2 py-1 text-[11px] font-bold rounded border cursor-pointer ${
                  motivo === m.id ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                {m.rotulo}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMotivo('outro')}
              className={`px-2 py-1 text-[11px] font-bold rounded border cursor-pointer ${
                motivo === 'outro' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              Outro
            </button>
          </div>
          {motivo === 'outro' && (
            <input
              value={outro}
              onChange={(e) => setOutro(e.target.value)}
              placeholder="Qual o motivo?"
              className="px-2 py-1.5 border border-zinc-200 rounded-lg"
            />
          )}
        </div>
      </div>
    </Drawer>
  );
}
