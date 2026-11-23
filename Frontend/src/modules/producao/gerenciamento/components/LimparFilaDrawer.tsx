import React, { useEffect, useState } from 'react';
import Drawer from '../../../geral/components/ui/Drawer';
import { apiJson } from '../../../geral/lib/http';

interface Previa {
  total: number;
  itens: Array<{ id: string; codigo_produto: string; descricao: string; quantidade_kg?: number | null }>;
}

const URL_LIMPAR = '/api/producao/fila-demandas/limpar';

/** Limpar fila: mostra o que sairia (prévia do servidor), pede o motivo e só apaga no OK. */
export default function LimparFilaDrawer({
  onClose,
  onLimpa,
  automaticosCount = 0,
}: {
  onClose: () => void;
  onLimpa: () => void;
  automaticosCount?: number;
}) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    apiJson<Previa>(URL_LIMPAR, { method: 'POST', body: JSON.stringify({ confirmar: false }) })
      .then((p) => vivo && setPrevia(p))
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : 'Não foi possível ler a fila.'));
    return () => {
      vivo = false;
    };
  }, []);

  const confirmar = async () => {
    if (!motivo.trim()) return;
    setSalvando(true);
    setErro('');
    try {
      await apiJson(URL_LIMPAR, { method: 'POST', body: JSON.stringify({ motivo: motivo.trim(), confirmar: true }) });
      onLimpa();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível limpar a fila.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Drawer
      onClose={onClose}
      size="sm"
      title="Limpar fila"
      subtitle={
        previa
          ? previa.total > 0
            ? `${previa.total} ${previa.total === 1 ? 'item manual sai' : 'itens manuais saem'} da fila`
            : 'Nenhum item manual na fila'
          : undefined
      }
      loading={!previa && !erro}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 max-md:min-h-11 text-xs font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 cursor-pointer"
          >
            {previa && previa.total === 0 ? 'Fechar' : 'Cancelar'}
          </button>
          {(!previa || previa.total > 0) && (
            <button
              type="button"
              disabled={salvando || !motivo.trim() || !previa || previa.total === 0}
              onClick={confirmar}
              className="px-3 py-1.5 max-md:min-h-11 text-xs font-bold rounded-lg bg-zinc-900 text-white disabled:opacity-50 cursor-pointer"
            >
              OK, limpar
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4 text-xs">
        {erro && <div className="px-2 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 font-semibold">{erro}</div>}

        {previa && previa.total === 0 && (
          <div className="space-y-2">
            <div className="text-zinc-700 font-semibold">
              {automaticosCount > 0 ? 'Não há itens manuais na fila para limpar.' : 'A fila já está vazia.'}
            </div>
            {automaticosCount > 0 && (
              <div className="px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-[11px] leading-relaxed">
                Os <strong>{automaticosCount}</strong> {automaticosCount === 1 ? 'item exibido vem' : 'itens exibidos vêm'} automaticamente da Demanda de Produção e não {automaticosCount === 1 ? 'é apagado' : 'são apagados'} ao limpar a fila. Para ocultar um item automático específico, clique em <strong>Fixar na fila</strong> no card e depois em <strong>Tirar</strong>.
              </div>
            )}
          </div>
        )}
        {previa && previa.total > 0 && (
          <>
            <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg max-h-[50vh] overflow-y-auto">
              {previa.itens.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 px-2.5 py-2">
                  <span className="font-semibold text-zinc-900 truncate">{i.descricao}</span>
                  <span className="font-mono text-[10px] text-zinc-600 shrink-0">
                    {i.codigo_produto}
                    {i.quantidade_kg ? ` • ${Number(i.quantidade_kg).toLocaleString('pt-BR')} kg` : ''}
                  </span>
                </li>
              ))}
            </ul>
            {automaticosCount > 0 && (
              <div className="px-2.5 py-2 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 text-[11px]">
                Obs.: os {automaticosCount} {automaticosCount === 1 ? 'item automático vindo' : 'itens automáticos vindos'} da Demanda de Produção continuam na fila.
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="font-bold text-zinc-700" htmlFor="motivo-limpar-fila">Por quê?</label>
              <input
                id="motivo-limpar-fila"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && motivo.trim() && !salvando) confirmar();
                }}
                placeholder="Ex.: recomeçar a fila da semana"
                className="px-2 py-1.5 max-md:min-h-11 border border-zinc-200 rounded-lg"
              />
              <span className="text-[10px] text-zinc-500">Limpar não registra &quot;não quero este produto&quot;; só esvazia a fila manual e fica na auditoria.</span>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
