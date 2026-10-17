import React, { useState, useEffect, useMemo } from 'react';
import {
  Printer,
  X,
  Search,
  Check,
  Calendar,
  Layers,
  Package,
  Barcode,
  Hash,
  Copy,
  Sparkles,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import type { LabelTemplate, LabelElement } from '../lib/types';
import { labelsApi, type CatalogProduct } from '../lib/labelsApi';
import PrintModal from './PrintModal';

interface PrintWithSystemDataModalProps {
  template: LabelTemplate;
  isOpen: boolean;
  onClose: () => void;
  onPrintSuccess?: () => void;
}

export default function PrintWithSystemDataModal({
  template,
  isOpen,
  onClose,
  onPrintSuccess,
}: PrintWithSystemDataModalProps) {
  // Product Search & Selection
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);

  // Dynamic Data Fields
  const [lotNumber, setLotNumber] = useState<string>(() => {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `L${yy}${mm}${dd}-01`;
  });

  const [manufacturingDate, setManufacturingDate] = useState<string>(() => {
    const d = new Date();
    return d.toLocaleDateString('pt-BR');
  });

  const [expiryDate, setExpiryDate] = useState<string>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 2); // Default 2 years shelf life
    return d.toLocaleDateString('pt-BR');
  });

  const [boxQuantity, setBoxQuantity] = useState<number>(12);
  const [copies, setCopies] = useState<number>(1);
  const [enableBoxSequence, setEnableBoxSequence] = useState<boolean>(true);
  const [sequenceStart, setSequenceStart] = useState<number>(1);
  const [sequenceTotal, setSequenceTotal] = useState<number>(10);
  const [previewTemplate, setPreviewTemplate] = useState<LabelTemplate | null>(null);

  // Fetch products
  useEffect(() => {
    if (isOpen) {
      setLoadingProducts(true);
      labelsApi
        .listCatalogProducts()
        .then((data) => {
          const items = Array.isArray(data) ? data : [];
          setProducts(items);
          if (items.length > 0 && !selectedProduct) {
            // Pick first product by default
            const first = items[0];
            setSelectedProduct(first);
            if (first.quantidade_caixa) setBoxQuantity(first.quantidade_caixa);
          }
        })
        .catch((err) => console.error('Erro ao buscar produtos para etiquetas:', err))
        .finally(() => setLoadingProducts(false));
    }
  }, [isOpen]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 30);
    const q = productSearch.toLowerCase();
    return products
      .filter(
        (p) =>
          p.codigo.toLowerCase().includes(q) ||
          p.descricao.toLowerCase().includes(q) ||
          (p.codigo_barras && p.codigo_barras.includes(q))
      )
      .slice(0, 30);
  }, [products, productSearch]);

  if (!isOpen) return null;

  // Handle select product
  const handleSelectProduct = (prod: CatalogProduct) => {
    setSelectedProduct(prod);
    if (prod.quantidade_caixa) {
      setBoxQuantity(prod.quantidade_caixa);
    }
  };

  // Build the hydrated template with replaced variables
  const buildHydratedTemplate = (): LabelTemplate => {
    const pCode = selectedProduct?.codigo || '1.00.001';
    const pName = selectedProduct?.descricao || 'PRODUTO NÁTUM COSMÉTICOS';
    const pEan = selectedProduct?.codigo_barras || '7898912345678';
    const pDun = selectedProduct?.codigo_barras_caixa || (pEan.length === 13 ? `1${pEan.slice(0, 12)}` : pEan);
    const pLine = selectedProduct?.linha || 'Linha Profissional';

    const hydratedElements: LabelElement[] = template.elements_json.map((el) => {
      const cloned = JSON.parse(JSON.stringify(el)) as LabelElement;

      // Text and Badge elements
      if (cloned.type === 'text' || cloned.type === 'badge') {
        let text = (cloned.props.text || '') as string;
        text = text
          .replace(/{product_code}/g, pCode)
          .replace(/{product_name}/g, pName)
          .replace(/{barcode}/g, pEan)
          .replace(/{box_barcode}/g, pDun)
          .replace(/{box_qty}/g, `${boxQuantity} un.`)
          .replace(/{lot}/g, lotNumber)
          .replace(/{manufacturing_date}/g, manufacturingDate)
          .replace(/{expiry_date}/g, expiryDate)
          .replace(/{line}/g, pLine);

        // Also replace generic sample strings if present
        if (text.includes('1.30.139') || text.includes('03.13.011') || text.includes('01.01.001')) {
          text = text.replace(/1\.30\.139|03\.13\.011|01\.01\.001/g, pCode);
        }
        if (text.includes('NÁTUM') && (text.includes('300ML') || text.includes('250 ML') || text.includes('SHAMPOO'))) {
          text = pName;
        }

        cloned.props.text = text;
      }

      // Barcode elements
      if (cloned.type === 'barcode') {
        let val = (cloned.props.value || '') as string;
        if (val.includes('{barcode}') || val.includes('78989') || val.includes('79087')) {
          val = pEan;
        } else if (val.includes('{box_barcode}') || val.includes('178989') || val.includes('DUN')) {
          val = pDun;
        } else if (val.includes('{product_code}')) {
          val = pCode;
        } else if (val.includes('{lot}')) {
          val = lotNumber;
        } else if (pEan) {
          // If it's a barcode element on a product or box label, use the product/box barcode
          val = template.category === 'expedicao' || template.name.toLowerCase().includes('caixa') ? pDun : pEan;
        }
        cloned.props.value = val;
      }

      // QR Code elements
      if (cloned.type === 'qrcode') {
        let val = (cloned.props.value || '') as string;
        val = val
          .replace(/{product_code}/g, pCode)
          .replace(/{lot}/g, lotNumber)
          .replace(/{barcode}/g, pEan);
        cloned.props.value = val;
      }

      return cloned;
    });

    return {
      ...template,
      elements_json: hydratedElements,
    };
  };

  const openPreview = () => {
    setPreviewTemplate(buildHydratedTemplate());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="p-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900">
                  Impressão com Auto-Preenchimento do Sistema
                </h2>
                <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-mono">
                  {template.width_mm}x{template.height_mm}mm
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Modelo: <strong>{template.name}</strong> · Os dados do produto e lote são carregados automaticamente
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Columns: Product Selector (Left) & Lot/Quantity Fields (Right) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Left Column: Product Search & List */}
          <div className="md:col-span-5 border-r border-zinc-200 p-4 flex flex-col bg-zinc-50/50 space-y-3 overflow-hidden">
            <label className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
              <Package className="h-4 w-4 text-zinc-600" />
              <span>1. Selecione o Produto do Cadastro:</span>
            </label>

            <div className="relative">
              <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por código ou nome..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-900"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {loadingProducts ? (
                <div className="py-12 text-center flex flex-col items-center justify-center gap-2 text-zinc-400">
                  <Loader2 className="h-5 w-5 animate-spin text-zinc-900" />
                  <span className="text-xs">Carregando catálogo...</span>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-400">Nenhum produto encontrado.</div>
              ) : (
                filteredProducts.map((p) => {
                  const isSelected = selectedProduct?.codigo === p.codigo;
                  return (
                    <button
                      key={p.codigo}
                      type="button"
                      onClick={() => handleSelectProduct(p)}
                      className={`w-full p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                          : 'bg-white text-zinc-800 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100/60'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-mono text-[11px] font-bold ${
                              isSelected ? 'text-blue-300' : 'text-blue-600'
                            }`}
                          >
                            {p.codigo}
                          </span>
                          {p.codigo_barras && (
                            <span
                              className={`text-[9px] font-mono px-1 py-0.2 rounded ${
                                isSelected ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-100 text-zinc-500'
                              }`}
                            >
                              EAN
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold truncate mt-0.5">{p.descricao}</p>
                      </div>

                      {isSelected && <Check className="h-4 w-4 text-white shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Dynamic Parameters & Previews */}
          <div className="md:col-span-7 p-5 overflow-y-auto space-y-4 text-xs text-zinc-700">
            {/* Selected Product Summary Box */}
            {selectedProduct && (
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-blue-700">
                      Produto Selecionado
                    </span>
                    <h4 className="text-xs font-black text-blue-950 mt-0.5">{selectedProduct.descricao}</h4>
                  </div>
                  <span className="font-mono text-xs font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-md">
                    Cód: {selectedProduct.codigo}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] pt-1 text-blue-900 font-mono">
                  <div>
                    <span className="text-[10px] text-blue-600 block">EAN-13 (Produto):</span>
                    <strong>{selectedProduct.codigo_barras || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-blue-600 block">DUN-14 (Caixa):</span>
                    <strong>{selectedProduct.codigo_barras_caixa || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-blue-600 block">Padrão Caixa:</span>
                    <strong>{boxQuantity} un.</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Lote & Dates */}
            <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 space-y-3">
              <label className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                <Barcode className="h-4 w-4 text-zinc-600" />
                <span>2. Dados do Lote & Validade:</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[11px] text-zinc-600 block mb-1 font-semibold">Número do Lote:</label>
                  <input
                    type="text"
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value.toUpperCase())}
                    className="w-full p-2 border border-zinc-300 rounded-xl bg-white font-mono font-bold text-zinc-900 uppercase"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-zinc-600 block mb-1 font-semibold">Fabricação:</label>
                  <input
                    type="text"
                    value={manufacturingDate}
                    onChange={(e) => setManufacturingDate(e.target.value)}
                    className="w-full p-2 border border-zinc-300 rounded-xl bg-white font-mono text-center font-bold"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-zinc-600 block mb-1 font-semibold">Validade:</label>
                  <input
                    type="text"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full p-2 border border-zinc-300 rounded-xl bg-white font-mono text-center font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-zinc-600 block mb-1 font-semibold">
                  Quantidade de Unidades por Caixa:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={boxQuantity}
                    onChange={(e) => setBoxQuantity(parseInt(e.target.value, 10) || 1)}
                    className="w-24 p-2 border border-zinc-300 rounded-xl bg-white font-mono text-center font-bold text-xs"
                  />
                  <span className="text-zinc-500 text-xs">unidades / frascos por volume</span>
                </div>
              </div>
            </div>

            {/* Quantity / Box Sequence */}
            <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <Copy className="h-4 w-4 text-zinc-600" />
                  <span>3. Quantidade de Volumes / Etiquetas:</span>
                </label>

                <div className="flex items-center gap-1 bg-zinc-200/80 p-0.5 rounded-lg text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setEnableBoxSequence(true)}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      enableBoxSequence ? 'bg-white text-zinc-900 shadow-xs font-bold' : 'text-zinc-600'
                    }`}
                  >
                    Caixas (Sequência)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnableBoxSequence(false)}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      !enableBoxSequence ? 'bg-white text-zinc-900 shadow-xs font-bold' : 'text-zinc-600'
                    }`}
                  >
                    Cópias Iguais
                  </button>
                </div>
              </div>

              {enableBoxSequence ? (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-[11px] text-zinc-600 block mb-1 font-semibold">Caixa Inicial:</span>
                    <input
                      type="number"
                      min="1"
                      value={sequenceStart}
                      onChange={(e) => setSequenceStart(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full p-2 border border-zinc-300 rounded-xl bg-white text-center font-mono font-bold text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-600 block mb-1 font-semibold">Total de Caixas do Lote:</span>
                    <input
                      type="number"
                      min={sequenceStart}
                      value={sequenceTotal}
                      onChange={(e) => setSequenceTotal(Math.max(sequenceStart, parseInt(e.target.value, 10) || sequenceStart))}
                      className="w-full p-2 border border-zinc-300 rounded-xl bg-white text-center font-mono font-bold text-xs"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-24 p-2 border border-zinc-300 rounded-xl bg-white text-center font-mono font-bold text-xs"
                  />
                  <span className="text-zinc-500 text-xs">etiquetas idênticas</span>
                </div>
              )}
            </div>

          </div>
        </div>

        <div className="p-4 border-t border-zinc-100 bg-zinc-50 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 rounded-xl cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={openPreview}
            className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span>Visualizar e imprimir</span>
          </button>
        </div>
      </div>

      {previewTemplate && (
        <PrintModal
          template={previewTemplate}
          isOpen
          onClose={() => setPreviewTemplate(null)}
          onPrintSuccess={() => {
            setPreviewTemplate(null);
            if (onPrintSuccess) onPrintSuccess();
            onClose();
          }}
          initialCopies={copies}
          initialEnableSequence={enableBoxSequence}
          initialSequenceStart={sequenceStart}
          initialSequenceTotal={sequenceTotal}
          history={{
            product_code: selectedProduct?.codigo,
            product_name: selectedProduct?.descricao,
            lot_number: lotNumber,
          }}
        />
      )}
    </div>
  );
}
