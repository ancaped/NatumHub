import { useEffect, useState } from 'react';
import '../etiquetas.css';
import { renderLabelPngDataUrl } from '../lib/printCanvasRenderer';
import { comExemplo } from '../lib/previaExemplo';
import { FAMILIAS, familiaDe } from '../lib/familias';
import { StatusBadge } from '../../../geral/components/ui/ReportKit';
import type { LabelTemplate } from '../lib/types';

/** Cartão do catálogo: prévia real da etiqueta em cima, nome e dados embaixo. */
export default function ModeloCard({ modelo, onAbrir }: { modelo: LabelTemplate; onAbrir: () => void }) {
  const [previa, setPrevia] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    renderLabelPngDataUrl(comExemplo(modelo), 0, 1, 1, 2, 150)
      .then((u) => vivo && setPrevia(u))
      .catch(() => vivo && setPrevia(null));
    return () => {
      vivo = false;
    };
  }, [modelo]);

  return (
    <button type="button" className="modelo-card" onClick={onAbrir}>
      <div className="modelo-card-previa">
        {previa ? (
          <img src={previa} alt={modelo.name} />
        ) : (
          <div className="modelo-card-vazio" style={{ aspectRatio: `${modelo.width_mm} / ${modelo.height_mm}` }} />
        )}
      </div>
      <div className="modelo-card-corpo">
        <div className="modelo-card-nome" title={modelo.name}>{modelo.name}</div>
        <div className="modelo-card-meta">
          <span>{FAMILIAS[familiaDe(modelo)]}</span>
          <span aria-hidden>·</span>
          <span>{modelo.width_mm}×{modelo.height_mm} mm</span>
          <span style={{ marginLeft: 'auto' }}>
            <StatusBadge variante={modelo.chave && !modelo.id.startsWith('template_') ? 'saudavel' : modelo.is_default ? 'descontinuado' : 'saudavel'}>
              {modelo.chave ? (modelo.id.startsWith('template_') ? 'Padrão' : 'Editado') : modelo.is_default ? 'Padrão' : 'Criado'}
            </StatusBadge>
          </span>
        </div>
      </div>
    </button>
  );
}
