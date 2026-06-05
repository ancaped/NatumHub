import React from 'react';
import { Report, Product, TemplateConfig } from '../../types';
import { LAB_NAME, DEPT_NAME, COMPANY_INFO, DEFAULT_TESTS, TEST_TABLE_HEADERS } from '../../lib/microbioUtils';

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
    <div className="mx-auto w-full max-w-[210mm] bg-white p-[8mm] text-black print:m-0 print:p-0 font-serif">
      {/* Header - Centered Company Title */}
      <div className="text-center mb-6">
        <h1 className="text-xl font-black tracking-tight border-b border-black inline-block px-4">{labName}</h1>
        <p className="text-[10px] font-bold uppercase tracking-[0.4em] mt-1">{deptName}</p>
      </div>

      <div className="flex justify-between items-end mb-4">
          <div className="flex-1">
            <p className="text-[11px] font-bold uppercase">Relatório de Ensaios {labName} :</p>
            <p className="text-lg font-bold border-b border-black inline-block pr-8 italic">Nº {report.reportId}</p>
          </div>
          <div className="w-56 text-right">
             {/* No Logo as requested */}
          </div>
      </div>

      <div className="border-t border-black pt-3 grid grid-cols-12 text-[10px] leading-relaxed mb-4 font-sans">
        <div className="col-span-8 grid grid-cols-12 gap-y-0.5">
            <div className="col-span-3 font-bold">EMPRESA :</div><div className="col-span-9 uppercase">{companyName}</div>
            <div className="col-span-3 font-bold">ENDEREÇO :</div><div className="col-span-9 uppercase">{companyAddress}</div>
            <div className="col-span-3 font-bold">E-MAIL :</div><div className="col-span-9">{companyEmail}</div>
            <div className="col-span-3 font-bold">AMOSTRA :</div><div className="col-span-9 uppercase">{sampleType}</div>
        </div>
        <div className="col-span-4 grid grid-cols-12 gap-y-0.5 border-l border-black pl-6">
            <div className="col-span-5 font-bold">CONTATO :</div><div className="col-span-7">{companyContact}</div>
            <div className="col-span-5 font-bold">FAX :</div><div className="col-span-7">---</div>
            <div className="col-span-5 font-bold">RECEPÇÃO :</div><div className="col-span-7">---</div>
            <div className="col-span-5 font-bold">LAUDO :</div><div className="col-span-7 font-bold">{report.reportId.split('/')[0]}</div>
        </div>
      </div>

      <div className="border border-black p-3 grid grid-cols-12 text-[10px] gap-y-2 mb-4 font-sans">
          <div className="col-span-6 flex gap-2"><span className="font-bold">AMOSTRA :</span> <span className="uppercase font-semibold">{report.productName}</span></div>
          <div className="col-span-6 flex gap-2 justify-end"><span className="font-bold">CODIGO :</span> <span className="font-mono">{report.productCode}</span></div>
          
          <div className="col-span-6 flex gap-2"><span className="font-bold">FORNECEDOR :</span> <span className="uppercase">NATUM COSMETICOS</span></div>
          <div className="col-span-6 flex gap-2 justify-end"><span className="font-bold">LOTE :</span> <span className="font-bold border-b border-black px-2">{report.batch}</span></div>
          
          <div className="col-span-6 flex gap-2"><span className="font-bold">EMBALAGEM DE ORIGEM :</span> <span className="uppercase">{product.packaging}</span></div>
          <div className="col-span-6 flex gap-2 justify-end"><span className="font-bold">COLETA :</span> <span className="border-b border-black px-2">{report.collectionDate}</span></div>
          
          <div className="col-span-6 flex gap-2"><span className="font-bold">DATA DE FABRICAÇÃO :</span> <span className="text-black">---</span></div>
          <div className="col-span-6 flex gap-2 justify-end"><span className="font-bold">QUANTIDADE DE AMOSTRA :</span> <span className="text-black">---</span></div>
          
          <div className="col-span-6 flex gap-2"><span className="font-bold uppercase">Condições/Apresentação :</span> <span className="uppercase italic">CONFORME PADRÃO</span></div>
          <div className="col-span-6 flex gap-2 justify-end"><span className="font-bold">DATA DE VALIDADE :</span> <span className="font-bold">{product.validity}</span></div>
      </div>

      <table className="w-full text-[9px] mb-6 border border-black font-sans">
        <thead>
          <tr className="bg-white divide-x divide-black border-b border-black">
            {TEST_TABLE_HEADERS.map(h => (
              <th key={h} className="p-1.5 font-black text-center uppercase tracking-tighter">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black">
          {tests.map((test, i) => (
            <tr key={i} className="divide-x divide-black bg-white">
              <td className="p-1 font-bold uppercase whitespace-nowrap bg-white">{test.name || 'ANÁLISE MICROBIOLÓGICA'}</td>
              <td className="p-1 text-center font-semibold">{test.result}</td>
              <td className="p-1 text-center">{test.unit}</td>
              <td className="p-1 text-[8px] leading-tight max-w-[50mm] italic">{test.limit}</td>
              <td className="p-1 text-center">{test.lq}</td>
              <td className="p-1 text-center whitespace-nowrap">{test.method}</td>
              <td className="p-1 text-center font-bold bg-white whitespace-nowrap">{report.collectionDate}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-4 text-[10px] font-sans">
        <p className="font-bold">ENSAIOS REALIZADOS POR : <span className="font-black border-b border-black px-6 uppercase italic">{(report.technician || 'SISTEMA').toUpperCase()}</span></p>

        <div className="border border-black p-3 bg-white relative">
          <p className="font-black leading-snug uppercase text-[9px] italic">
            CONCLUSÃO DOS ENSAIOS (PARECER TÉCNICO): AMOSTRA DE ACORDO COM O PADRÃO LEGAL VIGENTE PARA OS ENSAIOS ACIMA DESCRITOS, CONFORME PARÂMETROS ANALISADOS.
          </p>
        </div>

        <div className="space-y-4 pt-4 border-t border-black">
          <div className="grid grid-cols-2 gap-8 text-[9px] leading-snug">
            <div className="space-y-2">
              <p className="font-bold uppercase underline">Legenda</p>
              <p><span className="font-bold">UFC:</span> UNIDADE FORMADORA DE COLONIA. <span className="font-bold">NA:</span> NÃO SE APLICA.</p>
              
              <p className="font-bold uppercase underline pt-2">Parecer Técnico:</p>
              <p className="italic">OS PARECERES, INTERPRETAÇÕES E OPINIÕES EXPRESSOS NÃO FAZEM PARTE DO ESCOPO DO SISTEMA DE QUALIDADE DESTE LABORATÓRIO.</p>
            </div>
            
            <div className="border-l border-black pl-6">
              <p className="italic">
                <span className="font-bold uppercase underline not-italic">Informações Adicionais :</span> Qualidade aferida em frasco de escolha aleatória do produto em quarentena conforme POP-012.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-6 text-center space-y-12">
          <p className="font-bold text-xs">Carangola-MG, {report.collectionDate}</p>
          
          <div className="mx-auto w-[80mm] border-t border-black pt-2 text-center">
            <p className="font-black text-sm tracking-tight italic">{signName}</p>
            <p className="text-[9px] uppercase tracking-[0.3em] font-bold mt-1">{signTitle}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
