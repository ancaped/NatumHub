import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, Printer, Trash2 } from 'lucide-react';
import Drawer from '../../../geral/components/ui/Drawer';
import { BotaoAcao } from '../../../geral/components/ui/ReportKit';
import { renderLabelPngDataUrl } from '../lib/printCanvasRenderer';
import { comExemplo } from '../lib/previaExemplo';
import { preencherModelo } from '../lib/modelos';
import { camposDoModelo, rotuloDoCampo, usaDadosDoSistema } from '../lib/campos';
import { dadosIniciais, hidratarModelo, type DadosDoSistema } from '../lib/hidratar';
import DadosSistemaForm, { type QuantidadeEtiquetas } from './DadosSistemaForm';
import CampoComSugestao from './CampoComSugestao';
import type { LabelTemplate } from '../lib/types';
import { FAMILIAS, familiaDe } from '../lib/familias';

/** O que o Drawer entrega para imprimir: o modelo já preenchido e como imprimir. */
export interface PedidoImpressao {
  modelo: LabelTemplate;
  /** Valores dos campos de texto (só os preenchidos), para virarem sugestão depois de imprimir. */
  valores: Record<string, string>;
  sequencia: boolean;
  copias: number;
  inicio: number;
  total: number;
  history?: { product_code?: string; product_name?: string; lot_number?: string };
}

interface ModeloDrawerProps {
  modelo: LabelTemplate;
  onClose: () => void;
  onImprimir: (pedido: PedidoImpressao) => void;
  onAbrirEditor: () => void;
  /** Ausente nos modelos padrão: eles não se excluem. */
  onExcluir?: () => void;
  /** Texto do botão: "Restaurar padrão" quando é um modelo do sistema já editado. */
  rotuloExcluir?: string;
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
export default function ModeloDrawer({ modelo, onClose, onImprimir, onAbrirEditor, onExcluir, rotuloExcluir = 'Excluir' }: ModeloDrawerProps) {
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const campos = useMemo(() => camposDoModelo(modelo), [modelo]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const preenchidos = useMemo(() => Object.fromEntries(Object.entries(valores).filter(([, v]) => v.trim())), [valores]);

  const usaSistema = useMemo(() => usaDadosDoSistema(modelo), [modelo]);
  const [dados, setDados] = useState<DadosDoSistema>(dadosIniciais);
  const [qtd, setQtd] = useState<QuantidadeEtiquetas>({ sequencia: true, copias: 1, inicio: 1, total: 10 });

  useEffect(() => {
    setValores({});
    setDados(dadosIniciais());
    setQtd({ sequencia: true, copias: 1, inicio: 1, total: 10 });
  }, [modelo.id]);

  /** Modelo com os dados do sistema e os campos de texto já no lugar. */
  const preparado = useMemo(() => preencherModelo(usaSistema ? hidratarModelo(modelo, dados) : modelo, preenchidos), [modelo, usaSistema, dados, preenchidos]);
  const faltaProduto = usaSistema && !dados.produto;

  const imprimir = () =>
    onImprimir({
      modelo: preparado,
      valores: preenchidos,
      sequencia: usaSistema && qtd.sequencia,
      copias: qtd.copias,
      inicio: qtd.inicio,
      total: qtd.total,
      history: usaSistema ? { product_code: dados.produto?.codigo, product_name: dados.produto?.descricao, lot_number: dados.lote } : undefined,
    });

  useEffect(() => {
    let vivo = true;
    setPrevia(null);
    setErro(false);
    renderLabelPngDataUrl(comExemplo(preparado), 0, 1, 1, 3, 300)
      .then((url) => vivo && setPrevia(url))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [preparado]);

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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between', padding: 12 }}>
          <div>
            {onExcluir && (
              <BotaoAcao onClick={onExcluir} title="Excluir modelo">
                <Trash2 size={14} /> {rotuloExcluir}
              </BotaoAcao>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <BotaoAcao onClick={onAbrirEditor}>
              <Edit3 size={14} /> Abrir no editor
            </BotaoAcao>
            <BotaoAcao primario disabled={faltaProduto} onClick={imprimir} title={faltaProduto ? 'Escolha o produto para imprimir' : undefined}>
              <Printer size={14} /> Imprimir
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

        {usaSistema && <DadosSistemaForm dados={dados} onDados={setDados} qtd={qtd} onQtd={setQtd} />}

        {campos.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>Campos do texto</span>
            {campos.map((c) => (
              <CampoComSugestao key={c} campo={c} rotulo={rotuloDoCampo(modelo, c)} valor={valores[c] ?? ''} onChange={(v) => setValores((a) => ({ ...a, [c]: v }))} />
            ))}
          </div>
        )}

        {modelo.description && <p style={{ fontSize: '0.78rem', margin: '14px 0 4px', ...muted }}>{modelo.description}</p>}

        <div style={{ marginTop: 10 }}>
          <Linha rotulo="Família" valor={FAMILIAS[familiaDe(modelo)]} />
          <Linha rotulo="Tamanho" valor={`${modelo.width_mm} × ${modelo.height_mm} mm`} />
          <Linha rotulo="Elementos no desenho" valor={elementos} />
          <Linha rotulo="Origem" valor={modelo.chave ? (modelo.id.startsWith('template_') ? 'Do sistema (padrão)' : 'Do sistema (editado)') : modelo.is_default ? 'Modelo padrão' : 'Criado no editor'} />
          <Linha rotulo="Atualizado" valor={atualizado ? new Date(atualizado).toLocaleDateString('pt-BR') : '—'} />
        </div>
      </div>
    </Drawer>
  );
}
