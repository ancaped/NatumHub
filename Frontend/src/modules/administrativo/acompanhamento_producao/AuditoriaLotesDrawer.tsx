import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import Drawer from '../../geral/components/ui/Drawer';
import { apiJson } from '../../geral/lib/http';

interface ParPlanErp {
  loteErp?: string | null;
  planningId?: string | null;
  codigoProduto?: string | null;
  descricao?: string | null;
  dataPlanejada?: string | null;
  dataLote?: string | null;
  kg?: number | null;
}

interface LoteInexistente {
  planningId?: string | null;
  loteErp?: string | null;
  codigoProduto?: string | null;
  descricao?: string | null;
  dataPlanejada?: string | null;
}

interface LoteRepetido {
  loteErp?: string | null;
  codigoProduto?: string | null;
  ordens?: number | null;
  planningIds?: string[] | null;
  kgTotal?: number | null;
}

interface AuditoriaLotes {
  paresPlanErp?: ParPlanErp[] | null;
  loteErpInexistente?: LoteInexistente[] | null;
  loteRepetido?: LoteRepetido[] | null;
  total?: number | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const fmtData = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const fmtKg = (v?: number | null) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`);

/**
 * Auditoria somente leitura dos lotes dos quadros: aponta possíveis duplicatas e vínculos suspeitos.
 * Não corrige nada; para vincular um lote use "Vincular lote ERP" no Planejamento Semanal.
 */
export default function AuditoriaLotesDrawer({ isOpen, onClose }: Props) {
  const [dados, setDados] = useState<AuditoriaLotes | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const data = await apiJson<AuditoriaLotes>('/api/administrativo/acompanhamento-producao/auditoria');
      setDados(data ?? null);
    } catch (e) {
      console.error('Erro ao carregar a auditoria de lotes:', e);
      setErro('Não foi possível carregar a auditoria de lotes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) carregar();
  }, [isOpen, carregar]);

  if (!isOpen) return null;

  const pares = dados?.paresPlanErp ?? [];
  const inexistentes = dados?.loteErpInexistente ?? [];
  const repetidos = dados?.loteRepetido ?? [];
  const total = Number(dados?.total ?? 0);

  return (
    <Drawer
      onClose={onClose}
      title="Auditoria de lotes"
      subtitle="Somente leitura: onde o mesmo lote pode estar aparecendo duas vezes"
      badge={total > 0 ? String(total) : undefined}
      size="xl"
      loading={loading && !dados}
      loadingText="Analisando lotes..."
      headerActions={
        <button
          type="button"
          onClick={carregar}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          Atualizar
        </button>
      }
    >
      <div className="space-y-6 p-4">
        {erro && <p className="text-xs font-semibold text-rose-700">{erro}</p>}

        {!erro && dados && total === 0 && (
          <p className="text-xs text-zinc-600">Nenhuma inconsistência encontrada nos lotes.</p>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-bold text-zinc-900">
            Possível duplicata: ordem sem lote ERP perto de um lote ERP já usado ({pares.length})
          </h3>
          <p className="text-[11px] text-zinc-500">
            O lote ERP já foi mexido nos quadros, mas existe uma ordem do mesmo produto no planejamento sem lote vinculado
            (data até 7 dias de diferença). Se for a mesma produção, vincule o lote na ordem do planejamento.
          </p>
          {pares.length === 0 ? (
            <p className="text-[11px] text-zinc-400">Nenhum caso.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl bg-white">
              {pares.map((p) => (
                <li key={`${p.loteErp}__${p.planningId}`} className="p-3 text-[11px] text-zinc-700">
                  <div className="font-bold text-zinc-900">
                    Lote ERP #{p.loteErp} ↔ ordem {p.planningId}
                  </div>
                  <div>
                    {p.codigoProduto} — {p.descricao || 'sem descrição'}
                  </div>
                  <div className="text-zinc-500">
                    Planejada em {fmtData(p.dataPlanejada)} ({fmtKg(p.kg)}) · lote mexido em {fmtData(p.dataLote)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-bold text-zinc-900">
            Lote ERP digitado que não foi encontrado ({inexistentes.length})
          </h3>
          <p className="text-[11px] text-zinc-500">
            Ordens com mais de 6 horas cujo lote não existe nas entradas do ERP nem nos laudos. Pode ser erro de digitação
            ou sincronização pendente.
          </p>
          {inexistentes.length === 0 ? (
            <p className="text-[11px] text-zinc-400">Nenhum caso.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl bg-white">
              {inexistentes.map((p) => (
                <li key={`${p.planningId}`} className="p-3 text-[11px] text-zinc-700">
                  <div className="font-bold text-zinc-900">
                    Ordem {p.planningId} → lote digitado “{p.loteErp}”
                  </div>
                  <div>
                    {p.codigoProduto} — {p.descricao || 'sem descrição'}
                  </div>
                  <div className="text-zinc-500">Planejada em {fmtData(p.dataPlanejada)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-bold text-zinc-900">
            Mesmo lote e produto em mais de uma ordem ({repetidos.length})
          </h3>
          <p className="text-[11px] text-zinc-500">
            Os quadros mostram uma só linha por lote e produto, então a massa de uma das ordens pode ficar escondida.
          </p>
          {repetidos.length === 0 ? (
            <p className="text-[11px] text-zinc-400">Nenhum caso.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl bg-white">
              {repetidos.map((r) => (
                <li key={`${r.loteErp}__${r.codigoProduto}`} className="p-3 text-[11px] text-zinc-700">
                  <div className="font-bold text-zinc-900">
                    Lote #{r.loteErp} · produto {r.codigoProduto} · {Number(r.ordens ?? 0)} ordens
                  </div>
                  <div className="text-zinc-500">
                    Massa somada: {fmtKg(r.kgTotal)} · ordens: {(r.planningIds ?? []).join(', ')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}
