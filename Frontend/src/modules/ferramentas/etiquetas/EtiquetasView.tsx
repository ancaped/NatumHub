import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, Package, Palette, FlaskConical, Calendar as CalendarIcon, History, Plus, RefreshCw, Tag } from 'lucide-react';
import AppLayout, { type SidebarItem } from '../../geral/components/layout/AppLayout';
import { BotaoAcao, FilterBar, ReportHeader, ReportTabs, StatusBadge, TabelaPainel, type AbaRelatorio } from '../../geral/components/ui/ReportKit';
import { pedirMotivoExclusao } from '../../producao/lib/useMotivoExclusao';
import LabelsCalendarTab from './components/LabelsCalendarTab';
import AprovacaoTab from './components/AprovacaoTab';
import LotesTab from './components/LotesTab';
import ModeloCard from './components/ModeloCard';
import ModeloDrawer from './components/ModeloDrawer';
import PrintModal from './components/PrintModal';
import PrintWithSystemDataModal from './components/PrintWithSystemDataModal';
import { labelsApi, type LabelPrintHistoryItem } from './lib/labelsApi';
import { DEFAULT_LABEL_TEMPLATES } from './lib/defaultTemplates';
import { FAMILIAS, familiaDe } from './lib/familias';
import { ehDoSistema, foiEditado, mesclarModelos } from './lib/modelos';
import type { LabelTemplate } from './lib/types';

interface EtiquetasViewProps {
  onBackToHub: () => void;
  onNavigateToEditor?: (template?: LabelTemplate) => void;
}

type Secao = 'modelos' | 'lotes' | 'kits' | 'coloracao' | 'aprovacao' | 'calendario' | 'historico';


const muted = { color: 'hsl(var(--text-secondary-hsl))' } as const;

/**
 * Catálogo dos modelos de etiqueta: organizar, conferir e padronizar. Editar o desenho é no Editor;
 * imprimir é pelo painel lateral do modelo. Padrão visual: tabela + abas + busca + badges + Drawer.
 */
export default function EtiquetasView({ onBackToHub, onNavigateToEditor }: EtiquetasViewProps) {
  const [secao, setSecao] = useState<Secao>('modelos');
  const [familia, setFamilia] = useState<string>('todos');
  /** Do sistema: modelos que os módulos usam pela chave. Editáveis: livres, do usuário. */
  const [origem, setOrigem] = useState<'sistema' | 'editaveis'>('sistema');
  const [busca, setBusca] = useState('');

  const [modelos, setModelos] = useState<LabelTemplate[]>(DEFAULT_LABEL_TEMPLATES);
  const [carregando, setCarregando] = useState(true);
  const [historico, setHistorico] = useState<LabelPrintHistoryItem[]>([]);
  const [carregandoHist, setCarregandoHist] = useState(false);

  const [aberto, setAberto] = useState<LabelTemplate | null>(null);
  const [imprimirCom, setImprimirCom] = useState<LabelTemplate | null>(null);
  const [imprimirRapido, setImprimirRapido] = useState<LabelTemplate | null>(null);

  const carregarModelos = useCallback(async () => {
    setCarregando(true);
    try {
      setModelos(mesclarModelos(await labelsApi.listTemplates()));
    } catch (e) {
      console.warn('Erro ao carregar modelos da API:', e);
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarHistorico = useCallback(async () => {
    setCarregandoHist(true);
    try {
      setHistorico(await labelsApi.listHistory(200));
    } catch (e) {
      console.warn('Erro ao carregar histórico de impressão:', e);
    } finally {
      setCarregandoHist(false);
    }
  }, []);

  useEffect(() => {
    carregarModelos();
    carregarHistorico();
  }, [carregarModelos, carregarHistorico]);

  const abasOrigem: AbaRelatorio[] = useMemo(
    () => [
      { id: 'sistema', label: 'Do sistema', contagem: modelos.filter(ehDoSistema).length },
      { id: 'editaveis', label: 'Editáveis', contagem: modelos.filter((t) => !ehDoSistema(t)).length },
    ],
    [modelos],
  );

  const daOrigem = useMemo(() => modelos.filter((t) => (origem === 'sistema' ? ehDoSistema(t) : !ehDoSistema(t))), [modelos, origem]);

  const familiasDaOrigem = useMemo(() => {
    const cont: Record<string, number> = {};
    for (const t of daOrigem) cont[familiaDe(t)] = (cont[familiaDe(t)] ?? 0) + 1;
    return Object.entries(FAMILIAS).filter(([id]) => cont[id]);
  }, [daOrigem]);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return daOrigem.filter((t) => {
      if (familia !== 'todos' && familiaDe(t) !== familia) return false;
      return !q || `${t.name} ${t.description ?? ''} ${FAMILIAS[familiaDe(t)]}`.toLowerCase().includes(q);
    });
  }, [daOrigem, familia, busca]);

  const excluir = (t: LabelTemplate) => {
    pedirMotivoExclusao({
      titulo: foiEditado(t) ? 'Restaurar modelo do sistema' : 'Excluir modelo de etiqueta',
      alvo: foiEditado(t) ? `Volta o modelo "${t.name}" ao padrão do sistema (a versão editada é apagada)` : `Modelo "${t.name}"`,
      executar: async (motivo) => {
        await labelsApi.deleteTemplate(t.id, motivo);
        setAberto(null);
        await carregarModelos();
      },
    });
  };

  const reimprimir = (item: LabelPrintHistoryItem) => {
    const modelo = modelos.find((t) => t.id === item.template_id || t.name === item.template_name);
    if (modelo) setImprimirCom(modelo);
  };

  const sidebarItems: SidebarItem[] = [
    { id: 'modelos', label: 'Modelos', icon: Tag, badge: modelos.length },
    { id: 'lotes', label: 'Caixas', icon: Boxes },
    { id: 'kits', label: 'Kits', icon: Package },
    { id: 'coloracao', label: 'Coloração', icon: Palette },
    { id: 'aprovacao', label: 'Aprovação', icon: FlaskConical },
    { id: 'calendario', label: 'Calendário', icon: CalendarIcon },
    { id: 'historico', label: 'Histórico', icon: History },
  ];

  return (
    <AppLayout
      moduleTitle="Etiquetas"
      moduleSubtitle="Catálogo de modelos"
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={secao}
      onTabChange={(id) => setSecao(id as Secao)}
    >
      <div className="view-container ferr-view">
        {secao === 'modelos' && (
          <>
            <ReportHeader
              titulo="Modelos de etiqueta"
              subtitulo="Clique num modelo para ver, imprimir ou abrir no editor"
              acoes={
                <BotaoAcao primario onClick={() => onNavigateToEditor?.()}>
                  <Plus size={15} /> Novo modelo
                </BotaoAcao>
              }
            />
            <ReportTabs
              abas={abasOrigem}
              ativa={origem}
              onChange={(id) => {
                setOrigem(id as 'sistema' | 'editaveis');
                setFamilia('todos');
              }}
            />
            <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar modelo...">
              <select
                value={familia}
                onChange={(e) => setFamilia(e.target.value)}
                aria-label="Família"
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid hsl(var(--card-border-hsl))', background: 'transparent', fontSize: '0.78rem' }}
              >
                <option value="todos">Todas as famílias</option>
                {familiasDaOrigem.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </FilterBar>
            {carregando && linhas.length === 0 && <div className="lote-vazio">Carregando...</div>}
            {!carregando && linhas.length === 0 && <div className="lote-vazio">Nenhum modelo com este filtro.</div>}
            <div className="modelo-grid">
              {linhas.map((t) => (
                <ModeloCard key={t.id} modelo={t} onAbrir={() => setAberto(t)} />
              ))}
            </div>
          </>
        )}

        {secao === 'lotes' && (
          <LotesTab
            modelo={modelos.find((t) => t.chave === 'lote_erp')}
            onImpresso={carregarHistorico}
          />
        )}

        {secao === 'kits' && (
          <LotesTab
            tipo="kits"
            modelo={modelos.find((t) => t.chave === 'kit_erp')}
            onImpresso={carregarHistorico}
          />
        )}

        {secao === 'coloracao' && (
          <LotesTab
            tipo="coloracoes"
            modelo={modelos.find((t) => t.chave === 'coloracao_erp')}
            onImpresso={carregarHistorico}
          />
        )}

        {secao === 'aprovacao' && (
          <AprovacaoTab
            modelo={modelos.find((t) => t.chave === 'fisco_lote')}
            onImpresso={carregarHistorico}
          />
        )}

        {secao === 'calendario' && (
          <>
            <ReportHeader titulo="Calendário" subtitulo="Etiquetas impressas por dia" />
            <LabelsCalendarTab history={historico} templates={modelos} onReprint={reimprimir} />
          </>
        )}

        {secao === 'historico' && (
          <>
            <ReportHeader
              titulo="Histórico de impressão"
              subtitulo="Últimas 200 impressões"
              acoes={
                <BotaoAcao onClick={carregarHistorico} disabled={carregandoHist}>
                  <RefreshCw size={15} className={carregandoHist ? 'animate-spin' : ''} /> Atualizar
                </BotaoAcao>
              }
            />
            <div className="ferr-cartoes">
            <TabelaPainel>
              <thead>
                <tr>
                  <th style={{ width: 130 }}>Data</th>
                  <th>Modelo</th>
                  <th>Produto</th>
                  <th style={{ width: 90 }}>Lote</th>
                  <th style={{ width: 60, textAlign: 'center' }}>Cópias</th>
                  <th style={{ width: 130 }}>Impressora</th>
                  <th style={{ width: 110 }}>Operador</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {!carregandoHist && historico.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 20, textAlign: 'center', ...muted }}>Nenhuma impressão registrada.</td>
                  </tr>
                )}
                {historico.map((h) => (
                  <tr key={h.id}>
                    <td style={{ fontSize: '0.72rem', ...muted }}>{new Date(h.printed_at).toLocaleString('pt-BR')}</td>
                    <td style={{ fontWeight: 600 }}>{h.template_name}</td>
                    <td>
                      <div>{h.product_name || '—'}</div>
                      {h.product_code && <span className="product-code" style={{ fontSize: '0.65rem' }}>{h.product_code}</span>}
                    </td>
                    <td style={{ fontWeight: 700 }}>{h.lot_number || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{h.copies}</td>
                    <td style={{ fontSize: '0.72rem', ...muted }}>{h.printer_name || '—'}</td>
                    <td style={{ fontSize: '0.72rem', ...muted }}>{h.operator_name || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <BotaoAcao onClick={() => reimprimir(h)}>Reimprimir</BotaoAcao>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TabelaPainel>
            </div>
          </>
        )}
      </div>

      {aberto && (
        <ModeloDrawer
          modelo={aberto}
          onClose={() => setAberto(null)}
          onImprimir={() => setImprimirRapido(aberto)}
          onImprimirComLote={() => setImprimirCom(aberto)}
          onAbrirEditor={() => onNavigateToEditor?.(aberto)}
          rotuloExcluir={foiEditado(aberto) ? 'Restaurar padrão' : 'Excluir'}
          onExcluir={aberto.is_default && !foiEditado(aberto) ? undefined : () => excluir(aberto)}
        />
      )}

      {imprimirCom && (
        <PrintWithSystemDataModal template={imprimirCom} isOpen onClose={() => setImprimirCom(null)} onPrintSuccess={carregarHistorico} />
      )}
      {imprimirRapido && <PrintModal template={imprimirRapido} isOpen onClose={() => setImprimirRapido(null)} />}
    </AppLayout>
  );
}
