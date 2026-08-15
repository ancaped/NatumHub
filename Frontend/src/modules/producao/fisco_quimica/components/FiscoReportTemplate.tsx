import React from 'react';
import { FiscoQuimicaAnalysis, FiscoQuimicaPattern, FiscoQuimicaAgent, Product, FiscoTemplateConfig } from '../../../geral/lib/types';
import { DEFAULT_FISCO_TEMPLATE, DENSITY_CUP_VOLUME, checkAnalysisCompliance } from '../lib/fiscoUtils';

interface FiscoReportTemplateProps {
  analysis: FiscoQuimicaAnalysis;
  pattern: FiscoQuimicaPattern | null;
  product?: Product;
  agent?: FiscoQuimicaAgent | null;
  config?: FiscoTemplateConfig;
}

export const FiscoReportTemplate: React.FC<FiscoReportTemplateProps> = ({
  analysis,
  pattern,
  product,
  agent,
  config
}) => {
  const cfg = { ...DEFAULT_FISCO_TEMPLATE, ...(config || {}) };
  const compliance = checkAnalysisCompliance(analysis, pattern);

  const rawDate = analysis.analysisDate || '';
  const dateFormatted = rawDate.includes('-')
    ? rawDate.split('-').reverse().join('/')
    : rawDate;

  const phSpec = pattern ? `${pattern.phMin.toFixed(2)} – ${pattern.phMax.toFixed(2)}` : '5.50 – 7.00';
  const viscSpec = pattern ? `${pattern.viscosityMin.toLocaleString('pt-BR')} – ${pattern.viscosityMax.toLocaleString('pt-BR')} cps` : 'Conforme Padrão';
  const densSpec = pattern ? `${pattern.densityTarget.toFixed(3)} ± ${pattern.densityTolerance.toFixed(3)} g/mL` : '1.000 ± 0.020 g/mL';

  const isAspectFail = (analysis.notes || '').includes('[Aspecto Não Conforme');
  const isColorOdorFail = (analysis.notes || '').includes('[Cor/Odor Não Conforme');

  const aspectMatch = (analysis.notes || '').match(/\[Aspecto Não Conforme: ([^\]]+)\]/);
  const colorOdorMatch = (analysis.notes || '').match(/\[Cor\/Odor Não Conforme: ([^\]]+)\]/);

  const displayedAspect = aspectMatch ? aspectMatch[1] : (cfg.defaultAspect || 'CONFORME');
  const displayedColorOdor = colorOdorMatch ? colorOdorMatch[1] : (cfg.defaultColorOdor || 'CONFORME');

  return (
    <div
      className="report-page bg-white text-black"
      style={{
        width: '210mm',
        minHeight: '297mm',
        padding: '14mm 16mm 12mm 16mm',
        margin: '0 auto',
        boxSizing: 'border-box',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '10.5px',
        lineHeight: '1.3',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
      }}
    >
      {/* Header Oficial */}
      <div style={{ textAlign: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'inline-block', borderBottom: '1.5px solid #000000', paddingBottom: '2px', paddingLeft: '14px', paddingRight: '14px' }}>
          <h1 style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '19pt', fontWeight: 'bold', textTransform: 'uppercase', margin: 0, letterSpacing: '0.02em' }}>
            {cfg.labName}
          </h1>
        </div>
        <div style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '9pt', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.38em', marginTop: '4px' }}>
          {cfg.deptName}
        </div>
      </div>

      {/* Título do Relatório */}
      <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '10pt', fontWeight: 'bold', textTransform: 'uppercase', fontFamily: "'Times New Roman', Times, serif" }}>
            LAUDO DE ANÁLISE FÍSICO-QUÍMICA
          </div>
          <div style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '14pt', fontWeight: 'bold', fontStyle: 'italic', marginTop: '1px' }}>
            LOTE Nº {analysis.batch}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '8.5pt' }}>
          <span style={{ fontWeight: 'bold' }}>DATA DE EMISSÃO:</span> {dateFormatted}
        </div>
      </div>

      <div style={{ borderTop: '1px solid #000000', margin: '3px 0 7px 0' }} />

      {/* Dados da Empresa */}
      <div style={{ display: 'flex', borderBottom: '1px solid #000000', paddingBottom: '5px', marginBottom: '8px', fontSize: '8.5pt' }}>
        <div style={{ width: '60%', paddingRight: '10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div><strong style={{ width: '85px', display: 'inline-block' }}>EMPRESA:</strong> {cfg.companyName}</div>
          <div><strong style={{ width: '85px', display: 'inline-block' }}>ENDEREÇO:</strong> {cfg.companyAddress}</div>
          <div><strong style={{ width: '85px', display: 'inline-block' }}>E-MAIL:</strong> {cfg.companyEmail}</div>
        </div>
        <div style={{ width: '40%', borderLeft: '1px solid #000000', paddingLeft: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div><strong style={{ width: '80px', display: 'inline-block' }}>CONTATO:</strong> {cfg.companyContact}</div>
          <div><strong style={{ width: '80px', display: 'inline-block' }}>AMOSTRA:</strong> {cfg.sampleType}</div>
          <div><strong style={{ width: '80px', display: 'inline-block' }}>ANALISTA:</strong> <span style={{ textTransform: 'uppercase' }}>{analysis.technician}</span></div>
        </div>
      </div>

      {/* Identificação do Produto e Lote */}
      <div style={{ border: '1px solid #000000', padding: '6px 10px', marginBottom: '8px', fontSize: '8.5pt', display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: '65%' }}><strong>PRODUTO:</strong> <span style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{analysis.productName}</span></div>
          <div style={{ width: '35%', textAlign: 'right' }}><strong>CÓDIGO:</strong> {analysis.productCode}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: '65%' }}><strong>EMBALAGEM:</strong> <span style={{ textTransform: 'uppercase' }}>{packagingInfo}</span></div>
          <div style={{ width: '35%', textAlign: 'right' }}><strong>VALIDADE:</strong> {product?.validity || '3 anos'}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: '65%' }}><strong>FABRICANTE:</strong> NATUM BIO COSMÉTICOS LTDA</div>
          <div style={{ width: '35%', textAlign: 'right' }}><strong>DATA ANÁLISE:</strong> {dateFormatted}</div>
        </div>
      </div>

      {/* Tabela de Ensaios Físico-Químicos */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000000', fontSize: '8pt', marginBottom: '8px' }}>
        <thead>
          <tr style={{ background: '#f4f4f5' }}>
            <th style={{ border: '1px solid #000000', padding: '4px 5px', fontWeight: 'bold', textAlign: 'left', textTransform: 'uppercase', width: '26%' }}>
              ENSAIO
            </th>
            <th style={{ border: '1px solid #000000', padding: '4px 5px', fontWeight: 'bold', textAlign: 'left', textTransform: 'uppercase', width: '28%' }}>
              ESPECIFICAÇÃO
            </th>
            <th style={{ border: '1px solid #000000', padding: '4px 5px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', width: '18%' }}>
              RESULTADO OBTIDO
            </th>
            <th style={{ border: '1px solid #000000', padding: '4px 5px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', width: '16%' }}>
              MÉTODO
            </th>
            <th style={{ border: '1px solid #000000', padding: '4px 5px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', width: '12%' }}>
              AVALIAÇÃO
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', fontWeight: 'bold' }}>ASPECTO</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px' }}>{cfg.defaultAspect || 'Líquido / Emulsão Homogênea'}</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold' }}>{displayedAspect}</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center' }}>ORGANOLÉPTICO</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', color: !isAspectFail ? '#047857' : '#b91c1c' }}>
              {!isAspectFail ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', fontWeight: 'bold' }}>COR E ODOR</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px' }}>{cfg.defaultColorOdor || 'Característico'}</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold' }}>{displayedColorOdor}</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center' }}>ORGANOLÉPTICO</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', color: !isColorOdorFail ? '#047857' : '#b91c1c' }}>
              {!isColorOdorFail ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', fontWeight: 'bold' }}>POTENCIAL HIDROGENIÔNICO (pH a 25°C)</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px' }}>{phSpec}</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', fontSize: '8.5pt' }}>
              {analysis.phMeasured.toFixed(2)}
            </td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center' }}>POTENCIOMETRIA</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', color: compliance.phOk ? '#047857' : '#b91c1c' }}>
              {compliance.phOk ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', fontWeight: 'bold' }}>VISCOSIDADE DINÂMICA (25°C)</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px' }}>{viscSpec}</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', fontSize: '8.5pt' }}>
              {analysis.viscosityMeasured.toLocaleString('pt-BR')} cps
            </td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center' }}>VISCOSIMETRIA</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', color: compliance.viscOk ? '#047857' : '#b91c1c' }}>
              {compliance.viscOk ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', fontWeight: 'bold' }}>DENSIDADE RELATIVA (20°C)</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px' }}>{densSpec}</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', fontSize: '8.5pt' }}>
              {analysis.densityMeasured.toFixed(3)} g/mL
            </td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center' }}>PICNOMETRIA</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', color: compliance.densityOk ? '#047857' : '#b91c1c' }}>
              {compliance.densityOk ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Bloco de Calibração / Meta de Envase */}
      <div style={{ border: '1px solid #000000', padding: '5px 8px', marginBottom: '6px', fontSize: '8pt', background: '#fafafa' }}>
        <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '3px' }}>PARÂMETROS DE ENVASE E CALIBRAÇÃO:</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7.5pt' }}>
          <div>Volume do Copo Padrão: <strong>{DENSITY_CUP_VOLUME} mL</strong> | Peso da Fração: <strong>{analysis.fractionWeight.toFixed(3)} g</strong></div>
          <div>Peso Alvo de Envase: <strong>{analysis.envaseTargetWeight} {analysis.envaseTargetUnit}</strong></div>
        </div>
      </div>

      {/* Registro de Ajuste (se houver) */}
      {analysis.hasAdjustment && (
        <div style={{ border: '1px solid #000000', padding: '5px 8px', marginBottom: '6px', fontSize: '7.5pt', background: '#fffbeb' }}>
          <strong style={{ textTransform: 'uppercase', color: '#92400e' }}>REGISTRO DE AJUSTE CORRETIVO NO LOTE:</strong>
          <div style={{ marginTop: '2px' }}>
            Agente Corretivo: <strong>{agent?.name || analysis.correctiveAgentId || 'Corretivo'}</strong> |
            Visc. Inicial: <strong>{(analysis.initialViscosity || 0).toLocaleString('pt-BR')} cps</strong> |
            Dose Teste em 1L: <strong>{(analysis.trialAgentQty || 0).toFixed(2)} g</strong> |
            Visc. no Teste: <strong>{(analysis.trialViscosity || 0).toLocaleString('pt-BR')} cps</strong> |
            Dose Total Adicionada ao Lote: <strong>{analysis.totalAgentRequired ? `${(analysis.totalAgentRequired / 1000).toFixed(3)} kg` : 'Conforme Ensaio'}</strong>
          </div>
        </div>
      )}

      {/* Parecer Técnico / Conclusão */}
      <div style={{ border: '1.5px solid #000000', padding: '6px 8px', marginBottom: '6px', background: '#ffffff' }}>
        <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '8.5pt', marginBottom: '2px' }}>
          CONCLUSÃO DOS ENSAIOS (PARECER TÉCNICO):
        </div>
        <p style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '8pt', margin: 0, lineHeight: '1.3' }}>
          {compliance.overallStatus === 'FORA_PADRAO'
            ? 'AMOSTRA NÃO CONFORME COM OS PARÂMETROS ANALISADOS. LOTE RETIDO PARA REAVALIAÇÃO.'
            : (analysis.hasAdjustment
                ? 'AMOSTRA CONFORME COM AS ESPECIFICAÇÕES TÉCNICAS DO CONTROLE DE QUALIDADE APÓS AJUSTE CORRETIVO REALIZADO E APROVADO.'
                : 'AMOSTRA CONFORME COM AS ESPECIFICAÇÕES TÉCNICAS ESTABELECIDAS PELO CONTROLE DE QUALIDADE PARA OS ENSAIOS DESCRITOS.')}
        </p>
      </div>

      {/* Observações adicionais */}
      {analysis.notes && (
        <div style={{ fontSize: '7.5pt', fontStyle: 'italic', marginBottom: '8px' }}>
          <strong>OBSERVAÇÕES:</strong> {analysis.notes}
        </div>
      )}

      {/* Assinatura e Encerramento */}
      <div style={{ marginTop: 'auto', paddingTop: '14px', textAlign: 'center' }}>
        <div style={{ fontWeight: 'bold', fontSize: '9.5pt', marginBottom: '24px' }}>
          Carangola-MG, {dateFormatted}
        </div>

        <div style={{ display: 'inline-block', borderTop: '1px solid #000000', paddingTop: '3px', paddingLeft: '30px', paddingRight: '30px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '12pt', fontWeight: 'bold', fontStyle: 'italic' }}>
            {cfg.technicianSignName}
          </div>
          <div style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '8pt', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.35em', marginTop: '2px' }}>
            {cfg.technicianSignTitle}
          </div>
        </div>
      </div>
    </div>
  );
};
