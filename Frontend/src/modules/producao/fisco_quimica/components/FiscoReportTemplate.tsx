import React from 'react';
import { FiscoQuimicaAnalysis, FiscoQuimicaPattern, FiscoQuimicaAgent, Product, FiscoTemplateConfig } from '../../../geral/lib/types';
import { DEFAULT_FISCO_TEMPLATE, DENSITY_CUP_VOLUME, checkAnalysisCompliance, formatViscosity, viscosityParameterParts, laudoAdjustmentParts, laudoNotes, calculateFillingTargets } from '../lib/fiscoUtils';

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
  const released = analysis.status !== 'EM_CORRECAO' && analysis.status !== 'FORA_PADRAO';
  const viscMethod = 'VISCOSIMETRIA';
  const viscParameterParts = viscosityParameterParts(analysis);
  const legacySheet = viscParameterParts.length === 0;
  const adjustmentParts = laudoAdjustmentParts(analysis, agent?.name || analysis.correctiveAgentId || 'Corretivo', pattern);
  const notesText = laudoNotes(analysis.notes);
  const compliance = checkAnalysisCompliance(analysis, pattern);
  const phApproved = legacySheet ? compliance.phOk : (released || compliance.phOk);
  const viscApproved = legacySheet ? compliance.viscOk : (released || compliance.viscOk);
  const densityApproved = legacySheet ? compliance.densityOk : (released || compliance.densityOk);

  const rawDate = analysis.analysisDate || '';
  const dateFormatted = rawDate.includes('-')
    ? rawDate.split('-').reverse().join('/')
    : rawDate;

  const phSpec = pattern ? `${pattern.phMin.toFixed(2)} – ${pattern.phMax.toFixed(2)}` : '5.50 – 7.00';
  const viscSpec = pattern ? `${formatViscosity(pattern.viscosityMin, pattern)} – ${formatViscosity(pattern.viscosityMax, pattern)} cps` : 'Conforme Padrão';
  const densSpec = pattern ? `${pattern.densityTarget.toFixed(3)} ± ${pattern.densityTolerance.toFixed(3)} g/mL` : '1.000 ± 0.020 g/mL';

  const isAspectFail = analysis.aspectOk === false || (analysis.notes || '').includes('[Aspecto Não Conforme');
  const isColorFail = analysis.colorOk === false || (analysis.notes || '').includes('[Cor Não Conforme');
  const isOdorFail = analysis.odorOk === false || (analysis.notes || '').includes('[Odor Não Conforme');
  const isLegacyColorOdorFail = (analysis.notes || '').includes('[Cor/Odor Não Conforme');

  const aspectMatch = (analysis.notes || '').match(/\[Aspecto Não Conforme: ([^\]]+)\]/);
  const colorMatch = (analysis.notes || '').match(/\[Cor Não Conforme: ([^\]]+)\]/);
  const odorMatch = (analysis.notes || '').match(/\[Odor Não Conforme: ([^\]]+)\]/);
  const legacyColorOdorMatch = (analysis.notes || '').match(/\[Cor\/Odor Não Conforme: ([^\]]+)\]/);

  const aspectSpec = pattern?.aspect || cfg.defaultAspect || 'Líquido / Emulsão Homogênea';
  const colorSpec = pattern?.color || 'Conforme Padrão';
  const odorSpec = pattern?.odor || cfg.defaultColorOdor || 'Característico';

  const displayedAspect = aspectMatch ? aspectMatch[1] : (analysis.aspectResult || (pattern?.aspect || 'CONFORME'));
  const displayedColor = colorMatch ? colorMatch[1] : (analysis.colorResult || (pattern?.color || 'CONFORME'));
  const displayedOdor = odorMatch ? odorMatch[1] : (legacyColorOdorMatch ? legacyColorOdorMatch[1] : (analysis.odorResult || (pattern?.odor || 'CARACTERÍSTICO')));

  const aspectOk = !isAspectFail;
  const colorOk = !isColorFail;
  const odorOk = !isOdorFail && !isLegacyColorOdorFail;

  const fillingTargets = calculateFillingTargets(pattern, analysis.densityMeasured, analysis.productName);
  const packagingInfo = pattern && pattern.packageVolume > 0
    ? `${pattern.packageVolume} ${pattern.packageUnit}`
    : (fillingTargets.volume.value > 0
        ? `${fillingTargets.volume.value} ${fillingTargets.volume.unit}`
        : (product?.packaging || 'FRASCO/POTE'));
  const envaseWeightDisplay = analysis.envaseTargetWeight > 0
    ? `${analysis.envaseTargetWeight} ${analysis.envaseTargetUnit || 'g'}`
    : (fillingTargets.weight.value > 0 ? `${fillingTargets.weight.value} ${fillingTargets.weight.unit}` : '—');
  const fractionWeightVal = analysis.fractionWeight > 0
    ? analysis.fractionWeight
    : (analysis.densityMeasured > 0 ? analysis.densityMeasured * DENSITY_CUP_VOLUME : 0);
  const fractionWeightDisplay = fractionWeightVal > 0 ? `${fractionWeightVal.toFixed(3)} g` : '—';

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
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, border: '1px solid #000000', fontSize: '8pt', marginBottom: '8px' }}>
        <thead>
          <tr style={{ background: '#f4f4f5' }}>
            <th style={{ border: '1px solid #000000', padding: '4px 5px', fontWeight: 'bold', textAlign: 'left', textTransform: 'uppercase', width: '34%' }}>
              ENSAIO
            </th>
            <th style={{ border: '1px solid #000000', padding: '4px 5px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', width: '26%' }}>
              RESULTADO OBTIDO
            </th>
            <th style={{ border: '1px solid #000000', padding: '4px 5px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', width: '24%' }}>
              MÉTODO
            </th>
            <th style={{ border: '1px solid #000000', padding: '4px 5px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', width: '16%' }}>
              AVALIAÇÃO
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', fontWeight: 'bold' }}>ASPECTO</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold' }}>{displayedAspect}</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center' }}>ORGANOLÉPTICO</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', color: aspectOk ? '#047857' : '#b91c1c' }}>
              {aspectOk ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', fontWeight: 'bold' }}>COR</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold' }}>{displayedColor}</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center' }}>ORGANOLÉPTICO</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', color: colorOk ? '#047857' : '#b91c1c' }}>
              {colorOk ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', fontWeight: 'bold', borderTop: '1px solid #000000' }}>ODOR</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', borderTop: '1px solid #000000' }}>{displayedOdor}</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', borderTop: '1px solid #000000' }}>ORGANOLÉPTICO</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', borderTop: '1px solid #000000', color: odorOk ? '#047857' : '#b91c1c' }}>
              {odorOk ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', fontWeight: 'bold' }}>POTENCIAL HIDROGENIÔNICO (pH a 25°C)</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', fontSize: '8.5pt' }}>
              {analysis.phMeasured.toFixed(2)}
            </td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center' }}>POTENCIOMETRIA</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', color: phApproved ? '#047857' : '#b91c1c' }}>
              {phApproved ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', fontWeight: 'bold' }}>VISCOSIDADE DINÂMICA (25°C)</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', fontSize: '8.5pt' }}>
              {formatViscosity(analysis.viscosityMeasured, pattern)} cps
            </td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center' }}>{viscMethod}</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', color: viscApproved ? '#047857' : '#b91c1c' }}>
              {viscApproved ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', fontWeight: 'bold' }}>DENSIDADE RELATIVA (20°C)</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', fontSize: '8.5pt' }}>
              {analysis.densityMeasured.toFixed(3)} g/mL
            </td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center' }}>GRAVIMETRIA (BALANÇA DE PRECISÃO)</td>
            <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold', color: densityApproved ? '#047857' : '#b91c1c' }}>
              {densityApproved ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
        </tbody>
      </table>

      {viscParameterParts.length > 0 && (
        <div style={{ border: '1px solid #000000', padding: '5px 8px', marginBottom: '6px', fontSize: '8pt', background: '#fafafa' }}>
          <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '3px' }}>PARÂMETROS DE VISCOSIDADE:</div>
          <div style={{ fontSize: '7.5pt' }}>
            {viscParameterParts.map((part, index) => (
              <span key={part.label}>
                {index > 0 ? ' | ' : ''}
                {part.label}: <strong>{part.value}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bloco de Calibração / Meta de Envase */}
      <div style={{ border: '1px solid #000000', padding: '5px 8px', marginBottom: '6px', fontSize: '8pt', background: '#fafafa' }}>
        <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '3px' }}>PARÂMETROS DE ENVASE E CALIBRAÇÃO:</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7.5pt' }}>
          <div>Volume do Copo Padrão: <strong>{DENSITY_CUP_VOLUME} mL</strong> | Peso da Fração: <strong>{fractionWeightDisplay}</strong></div>
          <div>Peso Alvo na Balança de Envase: <strong>{envaseWeightDisplay}</strong></div>
        </div>
      </div>

      {/* Registro de Ajuste (se houver) */}
      {analysis.hasAdjustment && (
        <div style={{ border: '1px solid #000000', padding: '5px 8px', marginBottom: '6px', fontSize: '7.5pt', background: '#fffbeb' }}>
          <strong style={{ textTransform: 'uppercase', color: '#92400e' }}>REGISTRO DE AJUSTE CORRETIVO NO LOTE:</strong>
          <div style={{ marginTop: '2px' }}>
            {adjustmentParts.map((part, index) => (
              <span key={part.label}>
                {index > 0 ? ' | ' : ''}
                {part.label}: <strong>{part.value}</strong>
              </span>
            ))}
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
      {notesText && (
        <div style={{ fontSize: '7.5pt', fontStyle: 'italic', marginBottom: '8px' }}>
          <strong>OBSERVAÇÕES:</strong> {notesText}
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
