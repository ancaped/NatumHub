import React, { useEffect, useState } from 'react';
import { Edit3, Printer, Trash2 } from 'lucide-react';
import Drawer from '../../../geral/components/ui/Drawer';
import { BotaoAcao } from '../../../geral/components/ui/ReportKit';
import { renderLabelPngDataUrl } from '../lib/printCanvasRenderer';
import type { LabelTemplate } from '../lib/types';
import { FAMILIAS, familiaDe } from '../lib/familias';

interface ModeloDrawerProps {
  modelo: LabelTemplate;
  onClose: () => void;
  onImprimir: () => void;
  onImprimirComLote: () => void;
  onAbrirEditor: () => void;
  /** Ausente nos modelos padrão: eles não se excluem. */
  onExcluir?: () => void;
}

const muted = { color: 'hsl(var(--text-secondary-hsl))' } as const;

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid hsl(var(--card-border-hsl))', fontSize: '0.78rem' }}>
      <span style={muted}>{rotulo}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{valor}</span>
    </div>
  );
}

/** Ficha do modelo: prévia fiel (mesmo desenho que vai para a impressora), dados e ações. */
export default function ModeloDrawer({ modelo, onClose, onImprimir, onImprimirComLote, onAbrirEditor, onExcluir }: ModeloDrawerProps) {
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    setPrevia(null);
    setErro(false);
    renderLabelPngDataUrl(modelo, 0, 1, 1, 3, 300)
      .then((url) => vivo && setPrevia(url))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [modelo]);

  const elementos = Array.isArray(modelo.elements_json) ? modelo.elements_json.length : 0;
  const atualizado = modelo.updated_at || modelo.created_at;

  return (
    <Drawer
      onClose={onClose}
      title={modelo.name}
      subtitle={`${modelo.width_mm}×${modelo.height_mm} mm · ${modelo.orientation === 'portrait' ? 'em pé' : 'deitada'}`}
      badge={FAMILIAS[familiaDe(modelo)]}
      size="md"
      footer={
        <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', padding: 12 }}>
          <div>
            {onExcluir && (
              <BotaoAcao onClick={onExcluir} title="Excluir modelo">
                <Trash2 size={14} /> Excluir
              </BotaoAcao>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <BotaoAcao onClick={onAbrirEditor}>
              <Edit3 size={14} /> Abrir no editor
            </BotaoAcao>
            <BotaoAcao onClick={onImprimir}>
              <Printer size={14} /> Imprimir
            </BotaoAcao>
            <BotaoAcao primario onClick={onImprimirComLote} title="Preenche produto, lote e códigos de barras do sistema">
              <Printer size={14} /> Imprimir com lote
            </BotaoAcao>
          </div>
        </div>
      }
    >
      <div style={{ padding: 16 }}>
        <div className="panel-card" style={{ padding: 16, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 160, background: 'hsl(var(--background-hsl))' }}>
          {previa ? (
            <img src={previa} alt={`Prévia de ${modelo.name}`} style={{ maxWidth: '100%', border: '1px solid hsl(var(--card-border-hsl))', background: '#fff' }} />
          ) : (
            <span style={{ fontSize: '0.75rem', ...muted }}>{erro ? 'Não foi possível desenhar a prévia.' : 'Desenhando prévia...'}</span>
          )}
        </div>

        {modelo.description && <p style={{ fontSize: '0.78rem', margin: '14px 0 4px', ...muted }}>{modelo.description}</p>}

        <div style={{ marginTop: 10 }}>
          <Linha rotulo="Família" valor={FAMILIAS[familiaDe(modelo)]} />
          <Linha rotulo="Tamanho" valor={`${modelo.width_mm} × ${modelo.height_mm} mm`} />
          <Linha rotulo="Elementos no desenho" valor={elementos} />
          <Linha rotulo="Origem" valor={modelo.is_default ? 'Modelo padrão do sistema' : 'Criado no editor'} />
          <Linha rotulo="Atualizado" valor={atualizado ? new Date(atualizado).toLocaleDateString('pt-BR') : '—'} />
        </div>
      </div>
    </Drawer>
  );
}
