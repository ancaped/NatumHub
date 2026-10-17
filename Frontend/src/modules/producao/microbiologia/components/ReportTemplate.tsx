import React from 'react';
import { Report, Product, TemplateConfig } from '../../../geral/lib/types';
import { LAB_NAME, DEPT_NAME, COMPANY_INFO, DEFAULT_TESTS } from '../../../geral/lib/microbioUtils';

function escapeHtml(s: string | undefined | null) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface ReportTemplateProps {
  report: Report;
  product: Product;
  config?: TemplateConfig;
}

export const ReportTemplate: React.FC<ReportTemplateProps> = ({ report, product, config }) => {
  const labName = config?.labName || LAB_NAME;
  const deptName = config?.deptName || DEPT_NAME;
  const companyName = config?.companyName || COMPANY_INFO.name;
  const companyAddress = config?.companyAddress || COMPANY_INFO.address;
  const companyEmail = config?.companyEmail || COMPANY_INFO.email;
  const companyContact = config?.companyContact || COMPANY_INFO.contact;
  const sampleType = config?.sampleType || COMPANY_INFO.sampleType;
  const signName = config?.technicianSignName || "Rafael Marinho de Melo";
  const signTitle = config?.technicianSignTitle || "Responsável Técnico";
  const tests = config?.defaultTests || DEFAULT_TESTS;

  return (
    <div
      className="report-page bg-white text-black"
      style={{
        width: '210mm',
        minHeight: '297mm',
        padding: '16mm 18mm 12mm 18mm',
        margin: '0 auto',
        boxSizing: 'border-box',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '11px',
        lineHeight: '1.3',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
      }}
    >
      {/* Header - Centered Company Title */}
      <div style={{ textAlign: 'center', marginBottom: '14px' }}>
        <div style={{ display: 'inline-block', borderBottom: '1.5px solid #000000', paddingBottom: '2px', paddingLeft: '14px', paddingRight: '14px' }}>
          <h1 style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '20pt', fontWeight: 'bold', textTransform: 'uppercase', margin: 0, letterSpacing: '0.02em' }}>
            {labName}
          </h1>
        </div>
        <div style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '9.5pt', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.42em', marginTop: '4px' }}>
          {deptName}
        </div>
      </div>

      {/* Relatório de Ensaios & Número */}
      <div style={{ marginBottom: '6px' }}>
        <div style={{ fontSize: '10.5pt', fontWeight: 'bold', textTransform: 'uppercase', fontFamily: "'Times New Roman', Times, serif" }}>
          RELATÓRIO DE ENSAIOS {labName} :
        </div>
        <div style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '16pt', fontWeight: 'bold', fontStyle: 'italic', marginTop: '2px' }}>
          Nº {report.reportId}
        </div>
      </div>

      <div style={{ borderTop: '1px solid #000000', margin: '4px 0 8px 0' }} />

      {/* Bloco Empresa / Contato */}
      <div style={{ display: 'flex', borderBottom: '1px solid #000000', paddingBottom: '6px', marginBottom: '10px', fontSize: '8.5pt' }}>
        {/* Coluna Esquerda */}
        <div style={{ width: '58%', paddingRight: '10px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ display: 'flex' }}>
            <span style={{ fontWeight: 'bold', width: '90px', flexShrink: 0 }}>EMPRESA :</span>
            <span style={{ textTransform: 'uppercase' }}>{companyName}</span>
          </div>
          <div style={{ display: 'flex' }}>
            <span style={{ fontWeight: 'bold', width: '90px', flexShrink: 0 }}>ENDEREÇO :</span>
            <span style={{ textTransform: 'uppercase' }}>{companyAddress}</span>
          </div>
          <div style={{ display: 'flex' }}>
            <span style={{ fontWeight: 'bold', width: '90px', flexShrink: 0 }}>E-MAIL :</span>
            <span>{companyEmail}</span>
          </div>
          <div style={{ display: 'flex' }}>
            <span style={{ fontWeight: 'bold', width: '90px', flexShrink: 0 }}>AMOSTRA :</span>
            <span style={{ textTransform: 'uppercase' }}>{sampleType}</span>
          </div>
        </div>

        {/* Coluna Direita */}
        <div style={{ width: '42%', borderLeft: '1px solid #000000', paddingLeft: '14px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ display: 'flex' }}>
            <span style={{ fontWeight: 'bold', width: '90px', flexShrink: 0 }}>CONTATO :</span>
            <span>{companyContact}</span>
          </div>
          <div style={{ display: 'flex' }}>
            <span style={{ fontWeight: 'bold', width: '90px', flexShrink: 0 }}>FAX :</span>
            <span>---</span>
          </div>
          <div style={{ display: 'flex' }}>
            <span style={{ fontWeight: 'bold', width: '90px', flexShrink: 0 }}>RECEPÇÃO :</span>
            <span>---</span>
          </div>
          <div style={{ display: 'flex' }}>
            <span style={{ fontWeight: 'bold', width: '90px', flexShrink: 0 }}>LAUDO :</span>
            <span style={{ fontWeight: 'bold' }}>{report.reportId.split('/')[0]}</span>
          </div>
        </div>
      </div>

      {/* Caixa de detalhes da Amostra / Produto */}
      <div style={{ border: '1px solid #000000', padding: '8px 10px', marginBottom: '10px', fontSize: '8.5pt', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: '60%', display: 'flex' }}>
            <span style={{ fontWeight: 'bold', flexShrink: 0, marginRight: '4px' }}>AMOSTRA :</span>
            <span style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{report.productName}</span>
          </div>
          <div style={{ width: '40%', display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{ fontWeight: 'bold', flexShrink: 0, marginRight: '4px' }}>CODIGO :</span>
            <span style={{ fontWeight: 'bold' }}>{report.productCode}</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: '60%', display: 'flex' }}>
            <span style={{ fontWeight: 'bold', flexShrink: 0, marginRight: '4px' }}>FORNECEDOR :</span>
            <span style={{ textTransform: 'uppercase' }}>NATUM COSMETICOS</span>
          </div>
          <div style={{ width: '40%', display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{ fontWeight: 'bold', flexShrink: 0, marginRight: '4px' }}>LOTE :</span>
            <span style={{ fontWeight: 'bold', borderBottom: '1px solid #000000', padding: '0 6px' }}>{report.batch}</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: '60%', display: 'flex' }}>
            <span style={{ fontWeight: 'bold', flexShrink: 0, marginRight: '4px' }}>EMBALAGEM DE ORIGEM :</span>
            <span style={{ textTransform: 'uppercase' }}>{product.packaging || 'POTE'}</span>
          </div>
          <div style={{ width: '40%', display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{ fontWeight: 'bold', flexShrink: 0, marginRight: '4px' }}>COLETA :</span>
            <span style={{ borderBottom: '1px solid #000000', padding: '0 6px' }}>{report.collectionDate}</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: '60%', display: 'flex' }}>
            <span style={{ fontWeight: 'bold', flexShrink: 0, marginRight: '4px' }}>DATA DE FABRICAÇÃO :</span>
            <span>{report.manufacturingDate || '---'}</span>
          </div>
          <div style={{ width: '40%', display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{ fontWeight: 'bold', flexShrink: 0, marginRight: '4px' }}>QUANTIDADE DE AMOSTRA :</span>
            <span>---</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: '60%', display: 'flex' }}>
            <span style={{ fontWeight: 'bold', flexShrink: 0, marginRight: '4px' }}>CONDIÇÕES/APRESENTAÇÃO :</span>
            <span style={{ fontStyle: 'italic', fontWeight: 'bold', textTransform: 'uppercase' }}>CONFORME PADRÃO</span>
          </div>
          <div style={{ width: '40%', display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{ fontWeight: 'bold', flexShrink: 0, marginRight: '4px' }}>DATA DE VALIDADE :</span>
            <span style={{ fontWeight: 'bold' }}>{product.validity || '3 anos'}</span>
          </div>
        </div>
      </div>

      {/* Tabela de Ensaios Microbiológicos */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000000', fontSize: '8pt', marginBottom: '8px' }}>
        <thead>
          <tr style={{ background: '#ffffff' }}>
            <th style={{ border: '1px solid #000000', padding: '4px 2px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', width: '23%' }}>
              ENSAIO
            </th>
            <th style={{ border: '1px solid #000000', padding: '4px 2px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', width: '12%' }}>
              RESULTADO
            </th>
            <th style={{ border: '1px solid #000000', padding: '4px 2px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', width: '11%' }}>
              UNIDADE
            </th>
            <th style={{ border: '1px solid #000000', padding: '4px 2px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', width: '25%' }}>
              LIMITE ACEITAVEL
            </th>
            <th style={{ border: '1px solid #000000', padding: '4px 2px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', width: '7%' }}>
              LQ
            </th>
            <th style={{ border: '1px solid #000000', padding: '4px 2px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', width: '13%' }}>
              MÉTODO
            </th>
            <th style={{ border: '1px solid #000000', padding: '4px 2px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', width: '9%' }}>
              DATA DO<br />ENSAIO
            </th>
          </tr>
        </thead>
        <tbody>
          {tests.map((test, i) => (
            <tr key={i} style={{ background: '#ffffff' }}>
              <td style={{ border: '1px solid #000000', padding: '3px 5px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'left' }}>
                {test.name || 'ANÁLISE MICROBIOLÓGICA'}
              </td>
              <td style={{ border: '1px solid #000000', padding: '3px 4px', textAlign: 'center', fontWeight: 'bold' }}>
                {test.result}
              </td>
              <td style={{ border: '1px solid #000000', padding: '3px 4px', textAlign: 'center' }}>
                {test.unit}
              </td>
              <td style={{ border: '1px solid #000000', padding: '3px 5px', textAlign: 'left', fontSize: '7.5pt', fontStyle: 'italic', lineHeight: '1.2' }}>
                {test.limit}
              </td>
              <td style={{ border: '1px solid #000000', padding: '3px 2px', textAlign: 'center', fontSize: '7.5pt', lineHeight: '1.1' }}>
                {test.lq.includes(' ') ? (
                  <>
                    <div>{test.lq.split(' ')[0]}</div>
                    <div>{test.lq.split(' ').slice(1).join(' ')}</div>
                  </>
                ) : (
                  test.lq
                )}
              </td>
              <td style={{ border: '1px solid #000000', padding: '3px 4px', textAlign: 'center' }}>
                {test.method}
              </td>
              <td style={{ border: '1px solid #000000', padding: '3px 4px', textAlign: 'center', fontWeight: 'bold' }}>
                {report.collectionDate}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Ensaios Realizados Por */}
      <div style={{ fontSize: '9pt', margin: '6px 0 8px 0' }}>
        <span style={{ fontWeight: 'bold' }}>ENSAIOS REALIZADOS POR :</span>{' '}
        <span style={{ fontWeight: 'bold', textTransform: 'uppercase', marginLeft: '6px' }}>
          {(report.technician || 'EDSON FERRARI').toUpperCase()}
        </span>
      </div>

      {/* Conclusão dos Ensaios (Parecer Técnico) */}
      <div style={{ border: '1px solid #000000', padding: '6px 8px', marginBottom: '8px', background: '#ffffff' }}>
        <p style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '8pt', lineHeight: '1.3', margin: 0 }}>
          CONCLUSÃO DOS ENSAIOS (PARECER TÉCNICO): AMOSTRA DE ACORDO COM O PADRÃO LEGAL VIGENTE PARA OS ENSAIOS ACIMA DESCRITOS, CONFORME PARÂMETROS ANALISADOS.
        </p>
      </div>

      {/* Legenda & Informações Adicionais */}
      <div style={{ display: 'flex', fontSize: '7.5pt', marginBottom: '14px' }}>
        <div style={{ width: '54%', paddingRight: '10px' }}>
          <div style={{ fontWeight: 'bold', textTransform: 'uppercase', textDecoration: 'underline', marginBottom: '2px' }}>LEGENDA</div>
          <div><span style={{ fontWeight: 'bold' }}>UFC:</span> UNIDADE FORMADORA DE COLONIA. <span style={{ fontWeight: 'bold' }}>NA:</span> NÃO SE APLICA.</div>

          <div style={{ fontWeight: 'bold', textTransform: 'uppercase', textDecoration: 'underline', marginTop: '5px', marginBottom: '2px' }}>PARECER TÉCNICO:</div>
          <div style={{ fontStyle: 'italic', lineHeight: '1.25' }}>
            OS PARECERES, INTERPRETAÇÕES E OPINIÕES EXPRESSOS NÃO FAZEM PARTE DO ESCOPO DO SISTEMA DE QUALIDADE DESTE LABORATÓRIO.
          </div>
        </div>

        <div style={{ width: '46%', borderLeft: '1px solid #000000', paddingLeft: '12px' }}>
          <div style={{ fontStyle: 'italic', lineHeight: '1.35' }}>
            <span style={{ fontWeight: 'bold', fontStyle: 'normal' }}>INFORMAÇÕES ADICIONAIS :</span> Qualidade aferida em frasco de escolha aleatória do produto em quarentena conforme POP-012.
          </div>
        </div>
      </div>

      {/* Assinatura e Data */}
      <div style={{ marginTop: 'auto', paddingTop: '20px', paddingBottom: '10px', textAlign: 'center' }}>
        <div style={{ fontWeight: 'bold', fontSize: '10.5pt', marginBottom: '32px' }}>
          Carangola-MG, {report.collectionDate}
        </div>

        <div style={{ display: 'inline-block', borderTop: '1px solid #000000', paddingTop: '4px', paddingLeft: '30px', paddingRight: '30px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '12.5pt', fontWeight: 'bold', fontStyle: 'italic' }}>
            {signName}
          </div>
          <div style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '8pt', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.35em', marginTop: '2px' }}>
            {signTitle}
          </div>
        </div>
      </div>
    </div>
  );
};

export function renderReportHtml(report: Report, product: Product, config?: TemplateConfig): string {
  const labName = config?.labName || LAB_NAME;
  const deptName = config?.deptName || DEPT_NAME;
  const companyName = config?.companyName || COMPANY_INFO.name;
  const companyAddress = config?.companyAddress || COMPANY_INFO.address;
  const companyEmail = config?.companyEmail || COMPANY_INFO.email;
  const companyContact = config?.companyContact || COMPANY_INFO.contact;
  const sampleType = config?.sampleType || COMPANY_INFO.sampleType;
  const signName = config?.technicianSignName || "Rafael Marinho de Melo";
  const signTitle = config?.technicianSignTitle || "Responsável Técnico";
  const tests = config?.defaultTests || DEFAULT_TESTS;

  const testRows = tests.map(test => `
    <tr style="background: #ffffff;">
      <td style="border: 1px solid #000000; padding: 3px 5px; font-weight: bold; text-transform: uppercase; text-align: left;">
        ${escapeHtml(test.name || 'ANÁLISE MICROBIOLÓGICA')}
      </td>
      <td style="border: 1px solid #000000; padding: 3px 4px; text-align: center; font-weight: bold;">
        ${escapeHtml(test.result)}
      </td>
      <td style="border: 1px solid #000000; padding: 3px 4px; text-align: center;">
        ${escapeHtml(test.unit)}
      </td>
      <td style="border: 1px solid #000000; padding: 3px 5px; text-align: left; font-size: 7.5pt; font-style: italic; line-height: 1.2;">
        ${escapeHtml(test.limit)}
      </td>
      <td style="border: 1px solid #000000; padding: 3px 2px; text-align: center; font-size: 7.5pt; line-height: 1.1;">
        ${test.lq.includes(' ') ? `<div>${escapeHtml(test.lq.split(' ')[0])}</div><div>${escapeHtml(test.lq.split(' ').slice(1).join(' '))}</div>` : escapeHtml(test.lq)}
      </td>
      <td style="border: 1px solid #000000; padding: 3px 4px; text-align: center;">
        ${escapeHtml(test.method)}
      </td>
      <td style="border: 1px solid #000000; padding: 3px 4px; text-align: center; font-weight: bold;">
        ${escapeHtml(report.collectionDate)}
      </td>
    </tr>
  `).join('');

  return `
    <div class="report-page" style="width: 210mm; min-height: 297mm; max-height: 297mm; padding: 16mm 18mm 12mm 18mm; margin: 0 auto; box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.3; display: flex; flex-direction: column; justify-content: flex-start; background: #ffffff; color: #000000; page-break-after: always; break-after: page;">
      <div style="text-align: center; margin-bottom: 14px;">
        <div style="display: inline-block; border-bottom: 1.5px solid #000000; padding-bottom: 2px; padding-left: 14px; padding-right: 14px;">
          <h1 style="font-family: 'Times New Roman', Times, serif; font-size: 20pt; font-weight: bold; text-transform: uppercase; margin: 0; letter-spacing: 0.02em;">
            ${escapeHtml(labName)}
          </h1>
        </div>
        <div style="font-family: 'Times New Roman', Times, serif; font-size: 9.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.42em; margin-top: 4px;">
          ${escapeHtml(deptName)}
        </div>
      </div>

      <div style="margin-bottom: 6px;">
        <div style="font-size: 10.5pt; font-weight: bold; text-transform: uppercase; font-family: 'Times New Roman', Times, serif;">
          RELATÓRIO DE ENSAIOS ${escapeHtml(labName)} :
        </div>
        <div style="font-family: 'Times New Roman', Times, serif; font-size: 16pt; font-weight: bold; font-style: italic; margin-top: 2px;">
          Nº ${escapeHtml(report.reportId)}
        </div>
      </div>

      <div style="border-top: 1px solid #000000; margin: 4px 0 8px 0;"></div>

      <div style="display: flex; border-bottom: 1px solid #000000; padding-bottom: 6px; margin-bottom: 10px; font-size: 8.5pt;">
        <div style="width: 58%; padding-right: 10px; display: flex; flex-direction: column; gap: 3px;">
          <div style="display: flex;">
            <span style="font-weight: bold; width: 90px; flex-shrink: 0;">EMPRESA :</span>
            <span style="text-transform: uppercase;">${escapeHtml(companyName)}</span>
          </div>
          <div style="display: flex;">
            <span style="font-weight: bold; width: 90px; flex-shrink: 0;">ENDEREÇO :</span>
            <span style="text-transform: uppercase;">${escapeHtml(companyAddress)}</span>
          </div>
          <div style="display: flex;">
            <span style="font-weight: bold; width: 90px; flex-shrink: 0;">E-MAIL :</span>
            <span>${escapeHtml(companyEmail)}</span>
          </div>
          <div style="display: flex;">
            <span style="font-weight: bold; width: 90px; flex-shrink: 0;">AMOSTRA :</span>
            <span style="text-transform: uppercase;">${escapeHtml(sampleType)}</span>
          </div>
        </div>

        <div style="width: 42%; border-left: 1px solid #000000; padding-left: 14px; display: flex; flex-direction: column; gap: 3px;">
          <div style="display: flex;">
            <span style="font-weight: bold; width: 90px; flex-shrink: 0;">CONTATO :</span>
            <span>${escapeHtml(companyContact)}</span>
          </div>
          <div style="display: flex;">
            <span style="font-weight: bold; width: 90px; flex-shrink: 0;">FAX :</span>
            <span>---</span>
          </div>
          <div style="display: flex;">
            <span style="font-weight: bold; width: 90px; flex-shrink: 0;">RECEPÇÃO :</span>
            <span>---</span>
          </div>
          <div style="display: flex;">
            <span style="font-weight: bold; width: 90px; flex-shrink: 0;">LAUDO :</span>
            <span style="font-weight: bold;">${escapeHtml(report.reportId.split('/')[0])}</span>
          </div>
        </div>
      </div>

      <div style="border: 1px solid #000000; padding: 8px 10px; margin-bottom: 10px; font-size: 8.5pt; display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between;">
          <div style="width: 60%; display: flex;">
            <span style="font-weight: bold; flex-shrink: 0; margin-right: 4px;">AMOSTRA :</span>
            <span style="font-weight: bold; text-transform: uppercase;">${escapeHtml(report.productName)}</span>
          </div>
          <div style="width: 40%; display: flex; justify-content: flex-end;">
            <span style="font-weight: bold; flex-shrink: 0; margin-right: 4px;">CODIGO :</span>
            <span style="font-weight: bold;">${escapeHtml(report.productCode)}</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between;">
          <div style="width: 60%; display: flex;">
            <span style="font-weight: bold; flex-shrink: 0; margin-right: 4px;">FORNECEDOR :</span>
            <span style="text-transform: uppercase;">NATUM COSMETICOS</span>
          </div>
          <div style="width: 40%; display: flex; justify-content: flex-end;">
            <span style="font-weight: bold; flex-shrink: 0; margin-right: 4px;">LOTE :</span>
            <span style="font-weight: bold; border-bottom: 1px solid #000000; padding: 0 6px;">${escapeHtml(report.batch)}</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between;">
          <div style="width: 60%; display: flex;">
            <span style="font-weight: bold; flex-shrink: 0; margin-right: 4px;">EMBALAGEM DE ORIGEM :</span>
            <span style="text-transform: uppercase;">${escapeHtml(product.packaging || 'POTE')}</span>
          </div>
          <div style="width: 40%; display: flex; justify-content: flex-end;">
            <span style="font-weight: bold; flex-shrink: 0; margin-right: 4px;">COLETA :</span>
            <span style="border-bottom: 1px solid #000000; padding: 0 6px;">${escapeHtml(report.collectionDate)}</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between;">
          <div style="width: 60%; display: flex;">
            <span style="font-weight: bold; flex-shrink: 0; margin-right: 4px;">DATA DE FABRICAÇÃO :</span>
            <span>${escapeHtml(report.manufacturingDate || '---')}</span>
          </div>
          <div style="width: 40%; display: flex; justify-content: flex-end;">
            <span style="font-weight: bold; flex-shrink: 0; margin-right: 4px;">QUANTIDADE DE AMOSTRA :</span>
            <span>---</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between;">
          <div style="width: 60%; display: flex;">
            <span style="font-weight: bold; flex-shrink: 0; margin-right: 4px;">CONDIÇÕES/APRESENTAÇÃO :</span>
            <span style="font-style: italic; font-weight: bold; text-transform: uppercase;">CONFORME PADRÃO</span>
          </div>
          <div style="width: 40%; display: flex; justify-content: flex-end;">
            <span style="font-weight: bold; flex-shrink: 0; margin-right: 4px;">DATA DE VALIDADE :</span>
            <span style="font-weight: bold;">${escapeHtml(product.validity || '3 anos')}</span>
          </div>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; border: 1px solid #000000; font-size: 8pt; margin-bottom: 8px;">
        <thead>
          <tr style="background: #ffffff;">
            <th style="border: 1px solid #000000; padding: 4px 2px; font-weight: bold; text-align: center; text-transform: uppercase; width: 23%;">ENSAIO</th>
            <th style="border: 1px solid #000000; padding: 4px 2px; font-weight: bold; text-align: center; text-transform: uppercase; width: 12%;">RESULTADO</th>
            <th style="border: 1px solid #000000; padding: 4px 2px; font-weight: bold; text-align: center; text-transform: uppercase; width: 11%;">UNIDADE</th>
            <th style="border: 1px solid #000000; padding: 4px 2px; font-weight: bold; text-align: center; text-transform: uppercase; width: 25%;">LIMITE ACEITAVEL</th>
            <th style="border: 1px solid #000000; padding: 4px 2px; font-weight: bold; text-align: center; text-transform: uppercase; width: 7%;">LQ</th>
            <th style="border: 1px solid #000000; padding: 4px 2px; font-weight: bold; text-align: center; text-transform: uppercase; width: 13%;">MÉTODO</th>
            <th style="border: 1px solid #000000; padding: 4px 2px; font-weight: bold; text-align: center; text-transform: uppercase; width: 9%;">DATA DO<br />ENSAIO</th>
          </tr>
        </thead>
        <tbody>
          ${testRows}
        </tbody>
      </table>

      <div style="font-size: 9pt; margin: 6px 0 8px 0;">
        <span style="font-weight: bold;">ENSAIOS REALIZADOS POR :</span>
        <span style="font-weight: bold; text-transform: uppercase; margin-left: 6px;">
          ${escapeHtml((report.technician || 'EDSON FERRARI').toUpperCase())}
        </span>
      </div>

      <div style="border: 1px solid #000000; padding: 6px 8px; margin-bottom: 8px; background: #ffffff;">
        <p style="font-weight: bold; text-transform: uppercase; font-size: 8pt; line-height: 1.3; margin: 0;">
          CONCLUSÃO DOS ENSAIOS (PARECER TÉCNICO): AMOSTRA DE ACORDO COM O PADRÃO LEGAL VIGENTE PARA OS ENSAIOS ACIMA DESCRITOS, CONFORME PARÂMETROS ANALISADOS.
        </p>
      </div>

      <div style="display: flex; font-size: 7.5pt; margin-bottom: 14px;">
        <div style="width: 54%; padding-right: 10px;">
          <div style="font-weight: bold; text-transform: uppercase; text-decoration: underline; margin-bottom: 2px;">LEGENDA</div>
          <div><span style="font-weight: bold;">UFC:</span> UNIDADE FORMADORA DE COLONIA. <span style="font-weight: bold;">NA:</span> NÃO SE APLICA.</div>

          <div style="font-weight: bold; text-transform: uppercase; text-decoration: underline; margin-top: 5px; margin-bottom: 2px;">PARECER TÉCNICO:</div>
          <div style="font-style: italic; line-height: 1.25;">
            OS PARECERES, INTERPRETAÇÕES E OPINIÕES EXPRESSOS NÃO FAZEM PARTE DO ESCOPO DO SISTEMA DE QUALIDADE DESTE LABORATÓRIO.
          </div>
        </div>

        <div style="width: 46%; border-left: 1px solid #000000; padding-left: 12px;">
          <div style="font-style: italic; line-height: 1.35;">
            <span style="font-weight: bold; font-style: normal;">INFORMAÇÕES ADICIONAIS :</span> Qualidade aferida em frasco de escolha aleatória do produto em quarentena conforme POP-012.
          </div>
        </div>
      </div>

      <div style="margin-top: auto; padding-top: 20px; padding-bottom: 10px; text-align: center;">
        <div style="font-weight: bold; font-size: 10.5pt; margin-bottom: 32px;">
          Carangola-MG, ${escapeHtml(report.collectionDate)}
        </div>

        <div style="display: inline-block; border-top: 1px solid #000000; padding-top: 4px; padding-left: 30px; padding-right: 30px; text-align: center;">
          <div style="font-family: 'Times New Roman', Times, serif; font-size: 12.5pt; font-weight: bold; font-style: italic;">
            ${escapeHtml(signName)}
          </div>
          <div style="font-family: 'Times New Roman', Times, serif; font-size: 8pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.35em; margin-top: 2px;">
            ${escapeHtml(signTitle)}
          </div>
        </div>
      </div>
    </div>
  `;
}

export function printMicrobioReports(reports: Report | Report[], products: Product[], config?: TemplateConfig) {
  const list = Array.isArray(reports) ? reports : [reports];
  if (list.length === 0) return;

  const pagesHtml = list
    .map((report) => {
      const product = products.find((p) => p.code === report.productCode) || {
        code: report.productCode,
        name: report.productName,
        packaging: 'POTE',
        validity: '3 anos',
      };
      return renderReportHtml(report, product, config);
    })
    .join('\n');

  try {
    if (document.activeElement instanceof HTMLIFrameElement) {
      document.activeElement.blur();
    }
    window.focus();
    document.querySelectorAll('iframe[data-natum-print="1"]').forEach((el) => {
      try {
        (el as HTMLIFrameElement).src = 'about:blank';
        el.remove();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('data-natum-print', '1');
  iframe.src = 'about:blank';
  document.body.appendChild(iframe);

  let cleaned = false;
  let started = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      if (document.activeElement === iframe) iframe.blur();
      window.focus();
      iframe.src = 'about:blank';
      iframe.remove();
    } catch {
      try {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch {
        /* ignore */
      }
    }
  };

  const runPrint = () => {
    if (started || cleaned) return;
    started = true;
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument || win?.document;
    if (!doc || !win) {
      cleanup();
      return;
    }

    try {
      doc.open();
      doc.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Laudo Microbiológico - ${escapeHtml(list[0]?.reportId || '')}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: Arial, Helvetica, sans-serif;
    }
    .page-break {
      page-break-after: always;
      break-after: page;
    }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`);
      doc.close();
    } catch {
      cleanup();
      return;
    }

    setTimeout(() => {
      try {
        win.addEventListener('afterprint', cleanup, { once: true });
        win.focus();
        win.print();
        setTimeout(cleanup, 60_000);
      } catch {
        cleanup();
      }
    }, 200);
  };

  iframe.onload = () => runPrint();
  if (iframe.contentDocument?.readyState === 'complete') {
    runPrint();
  }
}
