import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, Package, Palette, Calendar as CalendarIcon, History, Plus, RefreshCw, Tag } from 'lucide-react';
import AppLayout, { type SidebarItem } from '../../geral/components/layout/AppLayout';
import { BotaoAcao, FilterBar, ReportHeader, ReportTabs, StatusBadge, TabelaPainel, type AbaRelatorio } from '../../geral/components/ui/ReportKit';
import { pedirMotivoExclusao } from '../../producao/lib/useMotivoExclusao';
import LabelsCalendarTab from './components/LabelsCalendarTab';
import LotesTab from './components/LotesTab';
import ModeloCard from './components/ModeloCard';
import ModeloDrawer from './components/ModeloDrawer';
import PrintModal from './components/PrintModal';
import PrintWithSystemDataModal from './components/PrintWithSystemDataModal';
import { labelsApi, type LabelPrintHistoryItem } from './lib/labelsApi';
import { DEFAULT_LABEL_TEMPLATES } from './lib/defaultTemplates';
import { FAMILIAS, familiaDe } from './lib/familias';
import type { LabelTemplate } from './lib/types';

interface EtiquetasViewProps {
  onBackToHub: () => void;
  onNavigateToEditor?: (template?: LabelTemplate) => void;
}

type Secao = 'modelos' | 'lotes' | 'kits' | 'coloracao' | 'calendario' | 'historico';

const MODELO_LOTE = 'Etiqueta de Lote (ERP)';
const MODELO_KIT = 'Etiqueta de Kit (ERP)';
const MODELO_COLORACAO = 'Etiqueta de Coloração (ERP)';

const muted = { color: 'hsl(var(--text-secondary-hsl))' } as const;

/**
 * Catálogo dos modelos de etiqueta: organizar, conferir e padronizar. Editar o desenho é no Editor;
 * imprimir é pelo painel lateral do modelo. Padrão visual: tabela + abas + busca + badges + Drawer.
 */
export default function EtiquetasView({ onBackToHub, onNavigateToEditor }: EtiquetasViewProps) {
  const [secao, setSecao] = useState<Secao>('modelos');
  const [familia, setFamilia] = useState<string>('todos');
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
      const lista = await labelsApi.listTemplates();
      if (lista.length > 0) {
        const juntos = [...DEFAULT_LABEL_TEMPLATES];
        for (const t of lista) {
          const i = juntos.findIndex((m) => m.id === t.id);
          if (i >= 0) juntos[i] = t;
          else juntos.push(t);
        }
        setModelos(juntos);
      }
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

  const abas: AbaRelatorio[] = useMemo(() => {
    const cont: Record<string, number> = {};
    for (const t of modelos) cont[familiaDe(t)] = (cont[familiaDe(t)] ?? 0) + 1;
    return [
      { id: 'todos', label: 'Todos', contagem: modelos.length },
      ...Object.entries(FAMILIAS)
        .filter(([id]) => cont[id])
        .map(([id, label]) => ({ id, label, contagem: cont[id] })),
    ];
  }, [modelos]);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return modelos.filter((t) => {
      if (familia !== 'todos' && familiaDe(t) !== familia) return false;
      return !q || `${t.name} ${t.description ?? ''} ${FAMILIAS[familiaDe(t)]}`.toLowerCase().includes(q);
    });
  }, [modelos, familia, busca]);

  const excluir = (t: LabelTemplate) => {
    pedirMotivoExclusao({
      titulo: 'Excluir modelo de etiqueta',
      alvo: `Modelo "${t.name}"`,
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
    { id: 'lotes', label: 'Lotes', icon: Boxes },
    { id: 'kits', label: 'Kits', icon: Package },
    { id: 'coloracao', label: 'Coloração', icon: Palette },
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
      <div className="view-container" style={{ padding: '1.5rem', paddingBottom: 30 }}>
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
            <ReportTabs abas={abas} ativa={familia} onChange={setFamilia} />
            <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar modelo..." />
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
            modelo={modelos.find((t) => t.name === MODELO_LOTE) ?? DEFAULT_LABEL_TEMPLATES.find((t) => t.name === MODELO_LOTE)}
            onImpresso={carregarHistorico}
          />
        )}

        {secao === 'kits' && (
          <LotesTab
            tipo="kits"
            modelo={modelos.find((t) => t.name === MODELO_KIT) ?? DEFAULT_LABEL_TEMPLATES.find((t) => t.name === MODELO_KIT)}
            onImpresso={carregarHistorico}
          />
        )}

        {secao === 'coloracao' && (
          <LotesTab
            tipo="coloracoes"
            modelo={modelos.find((t) => t.name === MODELO_COLORACAO) ?? DEFAULT_LABEL_TEMPLATES.find((t) => t.name === MODELO_COLORACAO)}
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
          onExcluir={aberto.is_default ? undefined : () => excluir(aberto)}
        />
      )}

      {imprimirCom && (
        <PrintWithSystemDataModal template={imprimirCom} isOpen onClose={() => setImprimirCom(null)} onPrintSuccess={carregarHistorico} />
      )}
      {imprimirRapido && <PrintModal template={imprimirRapido} isOpen onClose={() => setImprimirRapido(null)} />}
    </AppLayout>
  );
}
