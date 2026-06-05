import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { parseCSVContent, parseBrazilianNumber } from '../../lib/csvParser';
import { Upload, FileText, CheckCircle, AlertTriangle, ArrowRight, Package, BarChart, Info, Settings2, Table as TableIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import * as XLSX from 'xlsx';

type ImportType = 'stock' | 'consumption' | 'invoices';

interface ColumnMapping {
  field: string;
  label: string;
  required: boolean;
  mappedIndex: number;
}

const FIELD_DEFINITIONS: Record<ImportType, { field: string, label: string, required: boolean, keywords: string[] }[]> = {
  stock: [
    { field: 'itemCode', label: 'Código/Referência', required: true, keywords: ['referência', 'código', 'cod', 'ref', 'referencia', 'codigo'] },
    { field: 'description', label: 'Descrição', required: true, keywords: ['descrição', 'nome', 'item', 'descricao'] },
    { field: 'unit', label: 'Unidade', required: true, keywords: ['unidade', 'un', 'medida'] },
    { field: 'stockQty', label: 'Estoque Atual', required: true, keywords: ['estoque', 'atual', 'qtd', 'quantidade'] },
    { field: 'reservedQty', label: 'Qtd Reservada', required: false, keywords: ['reservada', 'reserva'] },
    { field: 'inProduction', label: 'Em Produção', required: false, keywords: ['produção', 'prod', 'producao'] },
    { field: 'inOrders', label: 'Em Pedidos', required: false, keywords: ['pedidos', 'compras', 'em pedidos'] },
    { field: 'line', label: 'Linha', required: false, keywords: ['linha'] },
    { field: 'typeCode', label: 'Tipo/Grupo', required: false, keywords: ['tipo', 'grupo'] },
  ],
  consumption: [
    { field: 'itemCode', label: 'Código', required: true, keywords: ['código', 'referência', 'cod', 'ref', 'codigo', 'referencia'] },
    { field: 'description', label: 'Descrição/Fornecedor', required: false, keywords: ['descrição', 'fornecedor', 'nome', 'descricao'] },
    { field: 'totalQty', label: 'Quantidade Total', required: true, keywords: ['quantidade', 'total', 'soma', 'consumo'] },
    { field: 'monthlyAvg', label: 'Média Mensal', required: false, keywords: ['média', 'avg', 'media'] },
  ],
  invoices: [
    { field: 'itemCode', label: 'Código Produto', required: true, keywords: ['código', 'referência', 'cod', 'ref', 'produto', 'codigo', 'referencia'] },
    { field: 'invoiceNumber', label: 'Nº Nota Fiscal', required: true, keywords: ['nota', 'nf', 'número', 'doc', 'numero', 'nº'] },
    { field: 'description', label: 'Descrição', required: false, keywords: ['descrição', 'item', 'descricao'] },
    { field: 'unit', label: 'Unidade', required: false, keywords: ['unidade', 'un'] },
    { field: 'invoiceDate', label: 'Data Emissão', required: true, keywords: ['data', 'emissão', 'data_emissao', 'emissao'] },
    { field: 'quantity', label: 'Quantidade', required: true, keywords: ['quantidade', 'qtd'] },
    { field: 'unitPrice', label: 'Valor Unitário', required: true, keywords: ['unitário', 'preço', 'valor_unit', 'unitario', 'preco'] },
    { field: 'totalValue', label: 'Valor Total', required: false, keywords: ['total', 'valor_total'] },
    { field: 'supplierName', label: 'Fornecedor', required: true, keywords: ['fornecedor', 'nome_fornecedor', 'emitente'] },
  ]
};

export function ImportWizard() {
  const [importType, setImportType] = useState<ImportType>('stock');
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[][]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [step, setStep] = useState<'upload' | 'mapping' | 'result'>('upload');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [lastNfPeriod, setLastNfPeriod] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    api.getNfImportControl().then(data => {
      if (data) setLastNfPeriod(data.lastPeriodEnd);
    }).catch(console.error);
  }, []);

  const autoMapColumns = (headers: string[], type: ImportType) => {
    const definitions = FIELD_DEFINITIONS[type];
    return definitions.map(def => {
      let foundIndex = -1;
      for (let i = 0; i < headers.length; i++) {
        const h = String(headers[i] || '').toLowerCase().trim();
        if (def.keywords.some(k => h === k || h.includes(k))) {
          foundIndex = i;
          break;
        }
      }
      return {
        field: def.field,
        label: def.label,
        required: def.required,
        mappedIndex: foundIndex
      };
    });
  };

  const handleFileLoad = (selectedFile: File) => {
    setFile(selectedFile);
    setResult(null);
    const extension = selectedFile.name.split('.').pop()?.toLowerCase();

    const reader = new FileReader();
    reader.onload = (ev) => {
      let parsed: any[][] = [];
      
      if (extension === 'xlsx' || extension === 'xls') {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        parsed = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      } else {
        const text = ev.target?.result as string;
        parsed = parseCSVContent(text);
      }

      if (parsed.length > 0) {
        setCsvData(parsed);
        const headers = parsed[0].map(h => String(h || ''));
        const autoMappings = autoMapColumns(headers, importType);
        setMappings(autoMappings);
        setStep('mapping');
      }
    };

    if (extension === 'xlsx' || extension === 'xls') {
      reader.readAsArrayBuffer(selectedFile);
    } else {
      reader.readAsText(selectedFile, 'ISO-8859-1');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) handleFileLoad(e.target.files[0]);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragOver(false), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const f = e.dataTransfer.files[0];
      const ext = f.name.split('.').pop()?.toLowerCase();
      if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') handleFileLoad(f);
      else alert('Apenas arquivos .csv, .xlsx ou .xls são aceitos');
    }
  }, [importType]);

  const updateMapping = (field: string, index: number) => {
    setMappings(prev => prev.map(m => m.field === field ? { ...m, mappedIndex: index } : m));
  };

  const handleImport = async () => {
    const missingRequired = mappings.filter(m => m.required && m.mappedIndex === -1);
    if (missingRequired.length > 0) {
      alert(`Por favor, mapeie as colunas obrigatórias: ${missingRequired.map(m => m.label).join(', ')}`);
      return;
    }

    setLoading(true);
    try {
      const rows = csvData.slice(1);
      const getRaw = (row: any[], field: string) => {
        const idx = mappings.find(m => m.field === field)?.mappedIndex;
        return (idx !== undefined && idx !== -1) ? row[idx] : undefined;
      };

      let finalResult;
      if (importType === 'stock') {
        const parsedRows = rows.map(row => ({
          itemCode: String(getRaw(row, 'itemCode') || ''),
          description: String(getRaw(row, 'description') || ''),
          unit: String(getRaw(row, 'unit') || ''),
          stockQty: parseBrazilianNumber(getRaw(row, 'stockQty')),
          reservedQty: parseBrazilianNumber(getRaw(row, 'reservedQty')),
          inProduction: parseBrazilianNumber(getRaw(row, 'inProduction')),
          inOrders: parseBrazilianNumber(getRaw(row, 'inOrders')),
          line: String(getRaw(row, 'line') || ''),
          typeCode: String(getRaw(row, 'typeCode') || ''),
        })).filter(r => r.itemCode);
        finalResult = await api.importStock(parsedRows, file?.name || 'unknown.xlsx');
      } 
      else if (importType === 'consumption') {
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        const parsedRows = rows.map(row => {
          const totalQty = parseBrazilianNumber(getRaw(row, 'totalQty'));
          const mappedAvg = getRaw(row, 'monthlyAvg');
          
          let monthlyAvg;
          if (mappedAvg !== undefined && mappedAvg !== null && String(mappedAvg).trim() !== '') {
            monthlyAvg = parseBrazilianNumber(mappedAvg);
          } else {
            // Se for o ano atual, divide pelos meses passados. Se for ano anterior, divide por 12.
            const divisor = (year === currentYear) ? currentMonth : 12;
            monthlyAvg = totalQty / divisor;
          }
          
          return {
            itemCode: String(getRaw(row, 'itemCode') || ''),
            description: String(getRaw(row, 'description') || ''),
            totalQty,
            monthlyAvg
          };
        }).filter(r => r.itemCode);
        finalResult = await api.importConsumption(parsedRows, year, file?.name || 'unknown.xlsx');
      } 
      else if (importType === 'invoices') {
        const parsedRows = rows.map(row => ({
          itemCode: String(getRaw(row, 'itemCode') || ''),
          invoiceNumber: String(getRaw(row, 'invoiceNumber') || ''),
          description: String(getRaw(row, 'description') || ''),
          unit: String(getRaw(row, 'unit') || ''),
          invoiceDate: String(getRaw(row, 'invoiceDate') || ''),
          quantity: parseBrazilianNumber(getRaw(row, 'quantity')),
          unitPrice: parseBrazilianNumber(getRaw(row, 'unitPrice')),
          totalValue: parseBrazilianNumber(getRaw(row, 'totalValue')),
          supplierName: String(getRaw(row, 'supplierName') || ''),
        })).filter(r => r.itemCode && r.invoiceNumber);
        finalResult = await api.importInvoices(parsedRows, file?.name || 'unknown.xlsx');
      }
      setResult(finalResult);
      setStep('result');
    } catch (err: any) {
      alert('Erro na importação: ' + err);
    } finally {
      setLoading(false);
    }
  };

  const headers = csvData.length > 0 ? csvData[0] : [];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6 flex flex-col h-[calc(100vh-12rem)] overflow-hidden">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-900">
          <Upload className="h-6 w-6" />
          Importação de Dados
        </h2>
        {step !== 'upload' && (
          <button 
            onClick={() => { setStep('upload'); setFile(null); setCsvData([]); setResult(null); }}
            className="text-sm text-zinc-500 hover:text-zinc-900 font-medium"
          >
            Reiniciar
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto min-h-0 pr-1">
        {step === 'upload' && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {[
                { id: 'stock', label: 'Estoque Atual', icon: Package, desc: 'Ex: Insumos.xlsx' },
                { id: 'consumption', label: 'Consumo Histórico', icon: BarChart, desc: 'Ex: 2024.xlsx' },
                { id: 'invoices', label: 'Notas Fiscais', icon: FileText, desc: 'NFs emitidas' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setImportType(t.id as ImportType)}
                  className={cn(
                    "p-5 rounded-xl border-2 flex flex-col items-center gap-3 transition-all",
                    importType === t.id ? "border-zinc-900 bg-zinc-50 shadow-sm" : "border-zinc-100 hover:border-zinc-200"
                  )}
                >
                  <t.icon className={cn("h-10 w-10", importType === t.id ? "text-zinc-900" : "text-zinc-300")} />
                  <div className="text-center">
                    <div className="font-bold text-sm text-zinc-900">{t.label}</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            {importType === 'invoices' && lastNfPeriod && (
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                <div className="text-sm">
                  <span className="font-semibold text-blue-900">Última importação até: {lastNfPeriod}</span>
                  <p className="text-blue-700">O app ignorará automaticamente NFs que já existam no banco.</p>
                </div>
              </div>
            )}

            <div
              className={cn(
                "p-12 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer",
                isDragOver ? "border-zinc-900 bg-zinc-100" : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100/50"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <input type="file" id="file-upload" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
              <Upload className="h-12 w-12 text-zinc-300 mb-4" />
              <div className="text-lg font-semibold text-zinc-900">Arraste a Planilha aqui</div>
              <p className="text-sm text-zinc-500 mt-1">Excel (.xlsx, .xls) ou CSV</p>
              <div className="text-[10px] text-zinc-400 mt-4 uppercase tracking-widest font-bold">XLSX · XLS · CSV</div>
            </div>
          </div>
        )}

        {step === 'mapping' && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 lg:col-span-5 flex flex-col bg-zinc-50 rounded-xl border border-zinc-200 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Settings2 className="h-4 w-4 text-zinc-500" />
                  <h3 className="font-bold text-zinc-900 text-sm">Mapeamento de Colunas</h3>
                </div>
                
                {importType === 'consumption' && (
                  <div className="mb-6 p-3 bg-white rounded-lg border border-zinc-200 shadow-sm">
                    <label className="text-xs font-bold text-zinc-500 uppercase block mb-1.5">Ano Base</label>
                    <input 
                      type="number" value={year} onChange={e => setYear(parseInt(e.target.value))}
                      className="w-full text-sm font-bold border border-zinc-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                    />
                  </div>
                )}

                <div className="space-y-3">
                  {mappings.map(m => (
                    <div key={m.field} className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1.5">
                        {m.label} {m.required && <span className="text-red-500">*</span>}
                      </label>
                      <select
                        value={m.mappedIndex}
                        onChange={e => updateMapping(m.field, parseInt(e.target.value))}
                        className={cn(
                          "w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-900 bg-white",
                          m.mappedIndex === -1 ? "border-amber-300 text-amber-700 bg-amber-50" : "border-zinc-200"
                        )}
                      >
                        <option value={-1}>-- Selecione a coluna --</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>{String(h || `Coluna ${i + 1}`)}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="col-span-12 lg:col-span-7 flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <TableIcon className="h-4 w-4 text-zinc-500" />
                  <h3 className="font-bold text-zinc-900 text-sm">Prévia dos Dados</h3>
                </div>
                <div className="border border-zinc-200 rounded-xl overflow-auto bg-white max-h-[400px]">
                  <table className="w-full text-[10px] text-left border-collapse">
                    <thead className="sticky top-0 bg-zinc-100 z-10 border-b border-zinc-200">
                      <tr>
                        {headers.map((h, i) => (
                          <th key={i} className="px-3 py-2 font-bold text-zinc-600 whitespace-nowrap border-r border-zinc-200">
                            <div className="text-[9px] text-zinc-400 mb-0.5">Col {i+1}</div>
                            {String(h || `Col ${i + 1}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {csvData.slice(1, 11).map((row, ri) => (
                        <tr key={ri} className="hover:bg-zinc-50">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-3 py-1.5 text-zinc-500 whitespace-nowrap max-w-48 truncate border-r border-zinc-100">
                              {String(cell || '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="shrink-0 flex justify-end pt-4 border-t border-zinc-100">
              <button
                onClick={handleImport}
                disabled={loading}
                className="bg-zinc-900 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-zinc-800 disabled:opacity-50 transition-all shadow-md active:scale-95"
              >
                {loading ? 'Processando...' : 'Iniciar Importação'}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div className="flex flex-col items-center justify-center text-center py-8">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="h-10 w-10 text-emerald-600" />
            </div>
            <h3 className="text-2xl font-bold text-zinc-900 mb-2">Importação Concluída</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mb-12">
              {[
                { label: 'Total Linhas', val: result.totalRows, color: 'text-zinc-900' },
                { label: 'Novos', val: result.newItems, color: 'text-emerald-600' },
                { label: 'Atualizados', val: result.updatedItems, color: 'text-blue-600' },
                { label: 'Ignorados', val: result.skippedDuplicates, color: 'text-amber-500' }
              ].map(r => (
                <div key={r.label} className="bg-zinc-50 rounded-xl p-4 border border-zinc-100">
                  <div className={cn("text-2xl font-black mb-1", r.color)}>{r.val}</div>
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{r.label}</div>
                </div>
              ))}
            </div>

            <button 
              onClick={() => { setStep('upload'); setFile(null); setCsvData([]); setResult(null); }}
              className="bg-zinc-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-zinc-800 transition-all shadow-md"
            >
              Importar Próxima Planilha
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
