import { useState, useMemo } from 'react';
import { Image as ImageIcon, Terminal } from 'lucide-react';
import type { Feedback, FilaSubTab } from '../types';
import { BotaoAcao, FilterBar, FiltroSelect, ReportTabs, StatusBadge, TabelaPainel, type VarianteBadge } from '../../components/ui/ReportKit';

interface DemandasQueueTabProps {
  feedbacks: Feedback[];
  loading: boolean;
  selectedId: string | null;
  onSelectFeedback: (f: Feedback) => void;
  onRefresh: () => void;
  onBatchStatus?: (ids: string[], status: string) => Promise<void>;
}

const SUB_TAB_CONFIG: { id: FilaSubTab; label: string }[] = [
  { id: 'triagem', label: 'Triagem' },
  { id: 'execucao', label: 'Fila' },
  { id: 'homologacao', label: 'Homologação' },
  { id: 'finalizados', label: 'Finalizados' },
];

const STATUS_LABEL: Record<string, string> = {
  pending: 'Triagem',
  queued: 'Fila',
  in_progress: 'Em andamento',
  planned: 'Planejado',
  awaiting_review: 'Homologação',
  resolved: 'Finalizado',
  wont_fix: 'Recusado',
};

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

  const varianteTipo = (tipo: string): VarianteBadge => (tipo === 'bug' ? 'critico' : 'aguardando');

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
                      <StatusBadge variante={varianteTipo(f.feedbackType)}>
                        {f.feedbackType === 'bug' ? 'Bug' : 'Sugestão'}
                      </StatusBadge>
                    </td>
                    <td>{f.moduleKey || f.page || '—'}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {frase}
                        {hasShot && <ImageIcon className="h-3.5 w-3.5 text-zinc-400 shrink-0" />}
                        {hasLogs && <Terminal className="h-3.5 w-3.5 text-zinc-400 shrink-0" />}
                      </span>
                    </td>
                    <td>{idade(f.createdAt) || '—'}</td>
                    <td>{STATUS_LABEL[f.status] || f.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </TabelaPainel>
        </div>
      )}
    </div>
  );
}
