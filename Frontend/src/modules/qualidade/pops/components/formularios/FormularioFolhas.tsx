import React from 'react';
import { createPortal } from 'react-dom';
import type { Formulario } from './tipos';
import {
  deitado,
  fmtData,
  largurasColunas,
  linhasPorFolha,
  linhasQueCabem,
  montarFolhas,
  rev2,
  TEXTO_MARCA,
  type MarcaFolha,
} from './montagem';

/**
 * Folha do formulário: A4 fixo (em pé, ou deitado quando o formulário é horizontal), uma folha por área.
 * Cabeçalho e rodapé iguais em todas as folhas; o corpo é a tabela de registro com linhas em branco.
 * Assinaturas à caneta (campos em branco). Rascunho/obsoleto/revisão substituída saem com faixa diagonal.
 */

const BORDA = '1.5px solid #000';

export interface FolhaProps {
  f: Formulario;
  area: string | null;
  pagina: number;
  total: number;
  logoSrc?: string | null;
  marca?: MarcaFolha;
}

export function Folha({ f, area, pagina, total, logoSrc, marca }: FolhaProps) {
  const paisagem = deitado(f);
  const linhas = linhasPorFolha(f);
  // Mais linhas que cabem: as linhas encolhem; senão a tabela estica e a última linha encosta no rodapé.
  const cabem = linhasQueCabem(paisagem, !!f.limits?.trim());
  const alturaLinha = Math.min(7.2, (cabem * 7.2) / Math.max(linhas, 1));
  const larguras = largurasColunas(f.fields.map((c) => c.kind));
  const vigencia = fmtData(f.effectiveDate) || '__/__/____';
  return (
    <div
      className="for-folha"
      style={{
        position: 'relative',
        width: paisagem ? '297mm' : '210mm',
        height: paisagem ? '209mm' : '296mm',
        boxSizing: 'border-box',
        padding: '8mm',
        background: '#fff',
        color: '#000',
        overflow: 'hidden',
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      {marca && (
        <div
          className="for-marca"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            textAlign: 'center',
            transform: 'translateY(-50%) rotate(-30deg)',
            fontSize: paisagem ? '40pt' : '34pt',
            fontWeight: 900,
            letterSpacing: '.04em',
            whiteSpace: 'nowrap',
            color: 'rgba(0,0,0,.10)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          {TEXTO_MARCA[marca]}
        </div>
      )}
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', border: BORDA, boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '32mm 1fr 52mm', borderBottom: BORDA }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: BORDA, padding: 4 }}>
            {logoSrc ? (
              <img src={logoSrc} alt="Logo" style={{ maxHeight: 36, maxWidth: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontWeight: 800, fontSize: 11 }}>NÁTUM</span>
            )}
          </div>
          <div style={{ textAlign: 'center', padding: '4px 8px', borderRight: BORDA }}>
            <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase' }}>{f.title}</div>
            <div style={{ fontSize: 9, marginTop: 2 }}>POP vinculado: {f.popCode}{f.popTitle ? ` — ${f.popTitle}` : ''}</div>
          </div>
          <div style={{ fontSize: 9, lineHeight: 1.45, padding: '4px 8px' }}>
            <div><b>Código:</b> {f.code}</div>
            <div><b>Revisão:</b> {rev2(f.revision)} &nbsp; <b>Folha:</b> {pagina}/{total}</div>
            <div><b>Vigência:</b> {vigencia}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 9, padding: '3px 8px', borderBottom: BORDA }}>
          <span><b>Mês/Ano:</b> ____/______</span>
          <span><b>{area ? 'Área:' : 'Setor/Área:'}</b> {area || '________________'}</span>
          <span><b>Equipamento/ID:</b> ____________</span>
        </div>
        {f.limits && (
          <div style={{ fontSize: 8.5, padding: '3px 8px', borderBottom: BORDA, background: '#f4f4f5' }}>
            <b>Limites de aceitação:</b> {f.limits}
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <table style={{ width: '100%', flex: 1, borderCollapse: 'collapse', fontSize: 8, tableLayout: 'fixed' }}>
            <colgroup>
              {larguras.map((l, i) => <col key={i} style={{ width: `${l}%` }} />)}
            </colgroup>
            <thead>
              <tr>
                {f.fields.map((c, i) => (
                  <th key={i} style={{ border: '1px solid #000', padding: '2px 3px', background: '#e5e7eb', textAlign: 'center', lineHeight: 1.15, overflowWrap: 'anywhere' }}>
                    {c.label}
                    {c.limit ? <small style={{ display: 'block', fontWeight: 400 }}>{c.limit}</small> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: linhas }, (_, r) => (
                <tr key={r}>
                  {f.fields.map((_c, i) => (
                    <td key={i} style={{ border: '1px solid #000', height: `${alturaLinha}mm` }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ borderTop: BORDA, fontSize: 8 }}>
          <div style={{ padding: '3px 8px', borderBottom: BORDA, lineHeight: 1.35 }}>
            <b>Instruções:</b> caneta azul ou preta. Sem corretivo. Erro = um traço + valor correto + rubrica + data + motivo. Campo não aplicável = N/A. Fora do limite → abrir Não Conformidade (POP-CQL-081). Usar só a revisão vigente.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 40mm' }}>
            <div style={{ padding: '4px 8px', borderRight: BORDA }}><b>Elaborado:</b><br />________________</div>
            <div style={{ padding: '4px 8px', borderRight: BORDA }}><b>Aprovado (CQ):</b><br />________________</div>
            <div style={{ padding: '4px 8px', borderRight: BORDA }}><b>Data aprovação:</b><br />__/__/____</div>
            <div style={{ padding: '3px 6px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ border: '1px solid #000', padding: '1px 3px', fontWeight: 700, fontSize: 7.5 }}>{f.code} · Rev. {rev2(f.revision)}</span>
              <span style={{ marginTop: 2 }}>Página {pagina} de {total}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface ImpressaoDados {
  form: Formulario;
  marca: MarcaFolha;
  logoSrc?: string | null;
}

/** Todas as folhas do formulário (uma por área) num portal que só aparece no `@media print`. */
export function FolhasImpressao({ dados }: { dados: ImpressaoDados }) {
  const { form, marca, logoSrc } = dados;
  const areas = montarFolhas(form.areas);
  const pagina = deitado(form) ? 'A4 landscape' : 'A4 portrait';
  return createPortal(
    <>
      <style>{`
        @media screen { .for-print-root { display: none !important; } }
        @media print {
          @page { size: ${pagina}; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body > *:not(.for-print-root) { display: none !important; }
          .for-print-root { display: block !important; background: #fff !important; }
          .for-folha { break-after: page; page-break-after: always; }
          .for-folha:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
      <div className="for-print-root">
        {areas.map((area, i) => (
          <Folha key={`${form.code}-${i}`} f={form} area={area} pagina={i + 1} total={areas.length} logoSrc={logoSrc} marca={marca} />
        ))}
      </div>
    </>,
    document.body,
  );
}
