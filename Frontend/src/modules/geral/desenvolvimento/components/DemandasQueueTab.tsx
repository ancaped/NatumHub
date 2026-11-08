import { useState, useMemo } from 'react';
import { Image as ImageIcon, Terminal } from 'lucide-react';
import type { Feedback, FilaSubTab } from '../types';
import { BotaoAcao, FilterBar, FiltroSelect, ReportTabs, StatusBadge, TabelaPainel } from '../../components/ui/ReportKit';
import { statusChamado, tipoChamado } from '../rotulos';

interface DemandasQueueTabProps {
  feedbacks: Feedback[];
  loading: boolean;
  selectedId: string | null;
  onSelectFeedback: (f: Feedback) => void;
  onRefresh: () => void;
  onBatchStatus?: (ids: string[], status: string) => Promise<void>;
  nomeModulo: (key?: string | null) => string;
}

const SUB_TAB_CONFIG: { id: FilaSubTab; label: string }[] = [
  { id: 'triagem', label: 'Triagem' },
  { id: 'execucao', label: 'Fila' },
  { id: 'homologacao', label: 'Homologação' },
  { id: 'finalizados', label: 'Finalizados' },
];

function idade(raw?: string): string {
  if (!raw) return '';
  const d = raw.includes('T') ? new Date(raw) : new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  const minutos = Math.max(0, Date.now() - d.getTime()) / 60000;
  if (minutos < 60) return `${Math.max(1, Math.floor(minutos))} min`;
  const horas = minutos / 60;
  if (horas < 48) return `${Math.floor(horas)} h`;
  return `${Math.floor(horas / 24)} d`;
}

export default function DemandasQueueTab({
  feedbacks,
  loading,
  selectedId,
  onSelectFeedback,
  onBatchStatus,
  nomeModulo,
}: DemandasQueueTabProps) {
  const [subTab, setSubTab] = useState<FilaSubTab>('homologacao');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'bug' | 'feedback'>('all');
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [loteOcupado, setLoteOcupado] = useState(false);

  const counts = useMemo(() => {
    return {
      triagem: feedbacks.filter((f) => f.status === 'pending').length,
      execucao: feedbacks.filter((f) => f.status === 'queued' || f.status === 'in_progress' || f.status === 'planned').length,
      homologacao: feedbacks.filter((f) => f.status === 'awaiting_review').length,
      finalizados: feedbacks.filter((f) => f.status === 'resolved' || f.status === 'wont_fix').length,
    };
  }, [feedbacks]);

  const filteredItems = useMemo(() => {
    return feedbacks.filter((f) => {
      if (subTab === 'triagem' && f.status !== 'pending') return false;
      if (subTab === 'execucao' && !['queued', 'in_progress', 'planned'].includes(f.status)) return false;
      if (subTab === 'homologacao' && f.status !== 'awaiting_review') return false;
      if (subTab === 'finalizados' && !['resolved', 'wont_fix'].includes(f.status)) return false;
      if (typeFilter !== 'all' && f.feedbackType !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const desc = (f.description || '').toLowerCase();
        const req = (f.requestedBy || '').toLowerCase();
        const page = (f.page || '').toLowerCase();
        const id = f.id.toLowerCase();
        const modulo = (f.moduleKey || '').toLowerCase();
        if (!desc.includes(q) && !req.includes(q) && !page.includes(q) && !id.includes(q) && !modulo.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [feedbacks, subTab, typeFilter, search]);


  return (
    <div className="flex-1 flex flex-col min-h-0">
      <ReportTabs
        abas={SUB_TAB_CONFIG.map((t) => ({ id: t.id, label: t.label, contagem: counts[t.id] }))}
        ativa={subTab}
        onChange={(id) => setSubTab(id as FilaSubTab)}
      />
      <FilterBar busca={search} onBusca={setSearch} placeholder="Buscar chamado, módulo...">
        <FiltroSelect
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as 'all' | 'bug' | 'feedback')}
          opcoes={[
            { valor: 'all', rotulo: 'Todos os tipos' },
            { valor: 'bug', rotulo: 'Bugs' },
            { valor: 'feedback', rotulo: 'Sugestões' },
          ]}
        />
        {subTab === 'homologacao' && selecionados.length > 0 && onBatchStatus && (
          <>
            <BotaoAcao
              primario
              disabled={loteOcupado}
              onClick={() => {
                setLoteOcupado(true);
                void onBatchStatus(selecionados, 'resolved')
                  .then(() => setSelecionados([]))
                  .finally(() => setLoteOcupado(false));
              }}
            >
              Aprovar {selecionados.length}
            </BotaoAcao>
            <BotaoAcao
              disabled={loteOcupado}
              onClick={() => {
                setLoteOcupado(true);
                void onBatchStatus(selecionados, 'queued')
                  .then(() => setSelecionados([]))
                  .finally(() => setLoteOcupado(false));
              }}
            >
              Devolver para a fila
            </BotaoAcao>
          </>
        )}
      </FilterBar>

      {filteredItems.length === 0 && !loading ? (
        <div className="panel-card py-16 text-center text-sm text-zinc-500">Nenhum chamado nesta etapa.</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          {/* Celular: cartões com alvo de toque de 44 px. */}
          <ul className="md:hidden flex flex-col gap-2">
            {filteredItems.map((f) => {
              const hasShot = Boolean(f.hasScreenshot || f.screenshot);
              const hasLogs = Boolean(f.hasLogs || f.logs?.trim());
              const marcado = selecionados.includes(f.id);
              const frase = (f.description || '').replace(/\s+/g, ' ').trim();
              return (
                <li
                  key={f.id}
                  className={`flex items-stretch rounded-xl border bg-white ${selectedId === f.id ? 'border-zinc-900' : 'border-zinc-200'}`}
                >
                  {subTab === 'homologacao' && (
                    <label className="flex items-center justify-center w-11 shrink-0 border-r border-zinc-100 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={marcado}
                        onChange={() => {
                          setSelecionados((prev) => (
                            prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                          ));
                        }}
                        aria-label={`Selecionar ${f.id}`}
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectFeedback(f)}
                    className="flex-1 min-w-0 min-h-[44px] text-left px-3 py-2.5 flex flex-col gap-1"
                  >
                    <span className="flex items-center gap-2 text-xs text-zinc-500">
                      <StatusBadge variante={tipoChamado(f.feedbackType).variante}>
                        {f.feedbackType === 'bug' ? 'Bug' : 'Sugestão'}
                      </StatusBadge>
                      <span className="truncate">{f.moduleKey ? nomeModulo(f.moduleKey) : f.page || '—'}</span>
                      <span className="ml-auto shrink-0">{idade(f.createdAt) || '—'}</span>
                    </span>
                    <span className="text-sm text-zinc-900 line-clamp-2">{frase}</span>
                    <span className="flex items-center gap-2 text-xs text-zinc-500">
                      {statusChamado(f.status)}
                      {hasShot && <ImageIcon className="h-3.5 w-3.5 text-zinc-400 shrink-0" />}
                      {hasLogs && <Terminal className="h-3.5 w-3.5 text-zinc-400 shrink-0" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block">
          <TabelaPainel>
            <thead>
              <tr>
                {subTab === 'homologacao' && <th style={{ width: 36 }} />}
                <th>Tipo</th>
                <th>Módulo</th>
                <th>Chamado</th>
                <th>Quando</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((f) => {
                const hasShot = Boolean(f.hasScreenshot || f.screenshot);
                const hasLogs = Boolean(f.hasLogs || f.logs?.trim());
                const marcado = selecionados.includes(f.id);
                const frase = (f.description || '').replace(/\s+/g, ' ').trim();
                return (
                  <tr
                    key={f.id}
                    onClick={() => onSelectFeedback(f)}
                    style={{ cursor: 'pointer', background: selectedId === f.id ? 'hsl(var(--background-hsl))' : undefined }}
                  >
                    {subTab === 'homologacao' && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => {
                            setSelecionados((prev) => (
                              prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                            ));
                          }}
                          aria-label={`Selecionar ${f.id}`}
                        />
                      </td>
                    )}
                    <td>
                      <StatusBadge variante={tipoChamado(f.feedbackType).variante}>
                        {f.feedbackType === 'bug' ? 'Bug' : 'Sugestão'}
                      </StatusBadge>
                    </td>
                    <td>{f.moduleKey ? nomeModulo(f.moduleKey) : f.page || '—'}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {frase}
                        {hasShot && <ImageIcon className="h-3.5 w-3.5 text-zinc-400 shrink-0" />}
                        {hasLogs && <Terminal className="h-3.5 w-3.5 text-zinc-400 shrink-0" />}
                      </span>
                    </td>
                    <td>{idade(f.createdAt) || '—'}</td>
                    <td>{statusChamado(f.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </TabelaPainel>
          </div>
        </div>
      )}
    </div>
  );
}
