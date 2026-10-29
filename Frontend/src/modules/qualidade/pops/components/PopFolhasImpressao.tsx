import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { distribuirEmPaginas, quebrarTextoPorPalavras } from '../paginacaoPop';

/**
 * Impressão do POP: cada folha A4 é um modelo pronto e igual (moldura, cabeçalho, rodapé com assinaturas e
 * "Página X de Y") com um corpo de altura fixa no meio. Só o texto do procedimento muda: o que não cabe
 * segue para a próxima folha, que repete o modelo. A última folha mantém o mesmo tamanho.
 */

// Medidas em mm (A4 210×297; margens 10/12/12 mm; folha 1 mm menor que a página para não gerar folha em branco).
const FOLHA_ALTURA_MM = 296;
const MOLDURA_ALTURA_MM = FOLHA_ALTURA_MM - 10 - 12; // 274
const CABECALHO_MM = 24;
const RODAPE_MM = 26;
const CORPO_MM = MOLDURA_ALTURA_MM - CABECALHO_MM - RODAPE_MM; // 224
const MOLDURA_LARGURA_MM = 210 - 24; // 186
const CORPO_PAD_V = 14;
const CORPO_PAD_H = 16;
const FONTE_CORPO = 'Georgia, "Times New Roman", Times, serif';

export interface PopFolhasDados {
  logoSrc: string | null;
  titulo: string;
  codigo: string;
  revisao: string;
  data: string;
  setor: string;
  corpo: string;
  elaboradoPor: string;
  elaboradoEm: string;
  revisadoPor: string;
  revisadoEm: string;
  aprovadoPor: string;
  aprovadoEm: string;
}

const estiloCorpoTexto: React.CSSProperties = {
  fontSize: 11,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontFamily: FONTE_CORPO,
};

const borda = '1px solid #000';

export default function PopFolhasImpressao({ dados }: { dados: PopFolhasDados }) {
  const medidorRef = useRef<HTMLDivElement>(null);
  const sondaRef = useRef<HTMLDivElement>(null);
  const [paginas, setPaginas] = useState<string[][] | null>(null);

  const linhas = useMemo(() => (dados.corpo || '—').split('\n'), [dados.corpo]);

  useLayoutEffect(() => {
    const medidor = medidorRef.current;
    const sonda = sondaRef.current;
    if (!medidor || !sonda) return;
    const alturaUtil = sonda.getBoundingClientRect().height - 2 * CORPO_PAD_V;
    const altura = (texto: string) => {
      medidor.textContent = texto === '' ? ' ' : texto;
      return medidor.getBoundingClientRect().height;
    };
    // Linha maior que o corpo de uma folha: quebra por palavras em pedaços que cabem.
    const blocos: string[] = [];
    for (const l of linhas) {
      if (altura(l) > alturaUtil) {
        blocos.push(...quebrarTextoPorPalavras(l, (p) => altura(p) <= alturaUtil));
      } else {
        blocos.push(l);
      }
    }
    const alturas = blocos.map(altura);
    medidor.textContent = '';
    const grupos = distribuirEmPaginas(alturas, alturaUtil);
    setPaginas(grupos.map((g) => g.map((i) => blocos[i])));
  }, [linhas]);

  const folhas = paginas ?? [linhas];
  const total = folhas.length;

  return (
    <>
      <style>{`
        @media screen {
          .pop-print-root { display: none !important; }
        }
        .pop-medidor-wrap {
          position: absolute; left: -10000px; top: 0; visibility: hidden; pointer-events: none;
          width: ${MOLDURA_LARGURA_MM}mm;
        }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body {
            background: #fff !important; color: #000 !important;
            font-family: "Times New Roman", Times, Georgia, serif !important;
            margin: 0 !important; padding: 0 !important; width: 100% !important;
            height: auto !important; overflow: visible !important;
          }
          body > *:not(.pop-print-root) { display: none !important; }
          .pop-print-root {
            display: block !important; position: relative !important; left: 0 !important; top: 0 !important;
            width: 210mm !important; margin: 0 !important; padding: 0 !important;
            background: #fff !important; color: #000 !important;
          }
          .pop-folha { break-after: page; page-break-after: always; }
          .pop-folha:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>

      {/* Medidor invisível: mesma largura e mesma fonte do corpo impresso */}
      <div className="pop-medidor-wrap" aria-hidden>
        <div
          ref={medidorRef}
          style={{ ...estiloCorpoTexto, width: `calc(${MOLDURA_LARGURA_MM}mm - 2px - ${2 * CORPO_PAD_H}px)` }}
        />
        <div ref={sondaRef} style={{ height: `calc(${CORPO_MM}mm - 2px)`, boxSizing: 'border-box' }} />
      </div>

      <div className="pop-print-root">
        {folhas.map((blocos, idx) => (
          <div
            key={idx}
            className="pop-folha"
            style={{
              width: '210mm',
              height: `${FOLHA_ALTURA_MM}mm`,
              boxSizing: 'border-box',
              padding: '10mm 12mm 12mm 12mm',
              overflow: 'hidden',
              background: '#fff',
              color: '#000',
            }}
          >
            <div
              style={{
                height: `${MOLDURA_ALTURA_MM}mm`,
                boxSizing: 'border-box',
                border: borda,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Cabeçalho (altura fixa) */}
              <div style={{ height: `${CABECALHO_MM}mm`, flex: 'none', display: 'flex', borderBottom: borda, boxSizing: 'border-box' }}>
                <div style={{ width: '22%', borderRight: borda, padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
                  {dados.logoSrc ? (
                    <img src={dados.logoSrc} alt="Logo" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 'bold' }}>NÁTUM BIO</span>
                  )}
                </div>
                <div style={{ flex: 1, borderRight: borda, padding: 6, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase' }}>Procedimento Operacional Padrão</div>
                  <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3 }}>{dados.titulo}</div>
                </div>
                <div style={{ width: '28%', padding: 6, fontSize: 10, lineHeight: 1.3, boxSizing: 'border-box', overflow: 'hidden' }}>
                  <div><strong>Código:</strong> {dados.codigo}</div>
                  <div><strong>Revisão:</strong> {dados.revisao}</div>
                  <div><strong>Data:</strong> {dados.data}</div>
                  <div><strong>Setor:</strong> {dados.setor}</div>
                </div>
              </div>

              {/* Corpo (altura fixa; só o texto muda) */}
              <div
                style={{
                  height: `calc(${CORPO_MM}mm - 2px)`,
                  flex: 'none',
                  boxSizing: 'border-box',
                  padding: `${CORPO_PAD_V}px ${CORPO_PAD_H}px`,
                  overflow: 'hidden',
                  ...estiloCorpoTexto,
                }}
              >
                {blocos.map((b, i) => (
                  <div key={i}>{b === '' ? ' ' : b}</div>
                ))}
              </div>

              {/* Rodapé (altura fixa): assinaturas + página */}
              <div style={{ height: `${RODAPE_MM}mm`, flex: 'none', display: 'flex', flexDirection: 'column', borderTop: borda, boxSizing: 'border-box', fontSize: 10 }}>
                <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                  {[
                    ['Elaborado:', '33%'],
                    ['Revisado:', '33%'],
                    ['Aprovado:', '34%'],
                  ].map(([rotulo, larg], i) => (
                    <div key={rotulo} style={{ width: larg, padding: '6px 8px', boxSizing: 'border-box', borderRight: i < 2 ? borda : undefined, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 700, marginBottom: 10 }}>{rotulo}</div>
                      <div style={{ borderBottom: '1px solid #000', height: 14 }} />
                      <div style={{ marginTop: 6, fontSize: 9 }}>Data: ____/____/________</div>
                    </div>
                  ))}
                </div>
                <div style={{ height: '6mm', flex: 'none', borderTop: borda, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px', fontSize: 9 }}>
                  Página {idx + 1} de {total}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
