import React, { useState, useEffect, useMemo } from 'react';
import {
  Printer,
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
  Factory,
  ChevronRight,
  RefreshCw,
  Box,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import type { LabelTemplate, LabelElement } from '../lib/types';
import { labelsApi, type CatalogProduct, type ProductionLot } from '../lib/labelsApi';
import { DEFAULT_LABEL_TEMPLATES } from '../lib/defaultTemplates';
import PrintModal from './PrintModal';

interface GerarEtiquetasFlowProps {
  templates: LabelTemplate[];
  onPrintSuccess?: () => void;
}

export function GerarEtiquetasFlow({ templates, onPrintSuccess }: GerarEtiquetasFlowProps) {
  // Source Mode: 'lot' (Lote de Produção) | 'product' (Produto do Catálogo) | 'manual' (Manual)
  const [sourceMode, setSourceMode] = useState<'lot' | 'product' | 'manual'>('lot');

  // Data lists
  const [productionLots, setProductionLots] = useState<ProductionLot[]>([]);
  const [loadingLots, setLoadingLots] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Searches
  const [lotSearch, setLotSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');

  // Selected entities
  const [selectedLot, setSelectedLot] = useState<ProductionLot | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);

  // Selected Template
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    return templates.find((t) => t.category === 'expedicao' || t.name.toLowerCase().includes('caixa'))?.id || templates[0]?.id || DEFAULT_LABEL_TEMPLATES[4].id;
  });

  // Dynamic Form Fields
  const [productCode, setProductCode] = useState('1.13.035');
  const [productName, setProductName] = useState('MASCARA THERMO RESTORE 250G NATUM.');
  const [barcodeEan, setBarcodeEan] = useState('7898553231964');
  const [barcodeDun, setBarcodeDun] = useState('17898553231961');
  const [lotNumber, setLotNumber] = useState('15527');
  const [manufacturingDate, setManufacturingDate] = useState(() => new Date().toLocaleDateString('pt-BR'));
  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 2);
    return d.toLocaleDateString('pt-BR');
  });
  const [boxQuantity, setBoxQuantity] = useState(12);

  // Print Volumes & Sequence
  const [enableSequence, setEnableSequence] = useState(true);
  const [sequenceStart, setSequenceStart] = useState(1);
  const [sequenceTotal, setSequenceTotal] = useState(10);
  const [copies, setCopies] = useState(1);
  const [previewTemplate, setPreviewTemplate] = useState<LabelTemplate | null>(null);

  // Load production lots and products on mount
  useEffect(() => {
    setLoadingLots(true);
    labelsApi
      .listProductionLots()
      .then((lots) => {
        const safeLots = Array.isArray(lots) ? lots : [];
        setProductionLots(safeLots);
        if (safeLots.length > 0) {
          handleSelectLot(safeLots[0]);
        }
      })
      .catch((err) => console.error('Erro ao buscar lotes:', err))
      .finally(() => setLoadingLots(false));

    setLoadingProducts(true);
    labelsApi
      .listCatalogProducts()
      .then((prods) => setCatalogProducts(Array.isArray(prods) ? prods : []))
      .catch((err) => console.error('Erro ao buscar produtos:', err))
      .finally(() => setLoadingProducts(false));
  }, []);

  // Filtered lots
  const filteredLots = useMemo(() => {
    if (!lotSearch.trim()) return productionLots;
    const q = lotSearch.toLowerCase();
    return productionLots.filter(
      (l) =>
        l.lote.toLowerCase().includes(q) ||
        l.codigo.toLowerCase().includes(q) ||
        l.descricao.toLowerCase().includes(q)
    );
  }, [productionLots, lotSearch]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return catalogProducts.slice(0, 30);
    const q = productSearch.toLowerCase();
    return catalogProducts
      .filter(
        (p) =>
          p.codigo.toLowerCase().includes(q) ||
          p.descricao.toLowerCase().includes(q) ||
          (p.codigo_barras && p.codigo_barras.includes(q))
      )
      .slice(0, 30);
  }, [catalogProducts, productSearch]);

  // Handle select lot
  const handleSelectLot = (lot: ProductionLot) => {
    setSelectedLot(lot);
    setProductCode(lot.codigo);
    setProductName(lot.descricao);
    setLotNumber(lot.lote);

    const ean = lot.codigo_barras || '7898912345678';
    setBarcodeEan(ean);
    setBarcodeDun(lot.codigo_barras_caixa || (ean.length === 13 ? `1${ean.slice(0, 12)}` : ean));

    if (lot.data_producao) {
      try {
        const parts = lot.data_producao.split('-');
        if (parts.length === 3) {
          setManufacturingDate(`${parts[2]}/${parts[1]}/${parts[0]}`);
          const expYear = parseInt(parts[0], 10) + 2;
          setExpiryDate(`${parts[2]}/${parts[1]}/${expYear}`);
        }
      } catch (_) {}
    }

    // Auto-calculate boxes
    const qtyPerBox = 12;
    setBoxQuantity(qtyPerBox);
    const calculatedBoxes = Math.max(1, Math.ceil(lot.quantidade / qtyPerBox));
    setSequenceStart(1);
    setSequenceTotal(calculatedBoxes);
  };

  // Handle select product
  const handleSelectProduct = (prod: CatalogProduct) => {
    setSelectedProduct(prod);
    setProductCode(prod.codigo);
    setProductName(prod.descricao);

    const ean = prod.codigo_barras || '7898912345678';
    setBarcodeEan(ean);
    setBarcodeDun(prod.codigo_barras_caixa || (ean.length === 13 ? `1${ean.slice(0, 12)}` : ean));

    const qty = prod.quantidade_caixa || 12;
    setBoxQuantity(qty);
  };

  // Active template object
  const activeTemplate = useMemo(() => {
    return (
      templates.find((t) => t.id === selectedTemplateId) ||
      templates[0] ||
      DEFAULT_LABEL_TEMPLATES[0]
    );
  }, [templates, selectedTemplateId]);

  // Build hydrated template for print & preview
  const buildHydratedTemplate = (): LabelTemplate => {
    const hydratedElements: LabelElement[] = activeTemplate.elements_json.map((el) => {
      const cloned = JSON.parse(JSON.stringify(el)) as LabelElement;

      // Text and Badge elements
      if (cloned.type === 'text' || cloned.type === 'badge') {
        let text = (cloned.props.text || '') as string;
        text = text
          .replace(/{product_code}/g, productCode)
          .replace(/{product_name}/g, productName)
          .replace(/{barcode}/g, barcodeEan)
          .replace(/{box_barcode}/g, barcodeDun)
          .replace(/{box_qty}/g, `${boxQuantity} un.`)
          .replace(/{lot}/g, lotNumber)
          .replace(/{manufacturing_date}/g, manufacturingDate)
          .replace(/{expiry_date}/g, expiryDate);

        // Fallback for mock strings
        if (text.includes('1.30.139') || text.includes('03.13.011') || text.includes('01.01.001')) {
          text = text.replace(/1\.30\.139|03\.13\.011|01\.01\.001/g, productCode);
        }
        if (text.includes('NÁTUM') && (text.includes('300ML') || text.includes('250 ML') || text.includes('250G') || text.includes('SHAMPOO'))) {
          text = productName;
        }

        cloned.props.text = text;
      }

      // Barcode elements
      if (cloned.type === 'barcode') {
        let val = (cloned.props.value || '') as string;
        if (val.includes('{barcode}') || val.includes('78989') || val.includes('79087') || val.includes('78985')) {
          val = barcodeEan;
        } else if (val.includes('{box_barcode}') || val.includes('178989') || val.includes('178985') || val.includes('DUN')) {
          val = barcodeDun;
        } else if (val.includes('{lot}')) {
          val = lotNumber;
        } else {
          val = activeTemplate.category === 'expedicao' || activeTemplate.name.toLowerCase().includes('caixa') ? barcodeDun : barcodeEan;
        }
        cloned.props.value = val;
      }

      // QR Code elements
      if (cloned.type === 'qrcode') {
        let val = (cloned.props.value || '') as string;
        val = val
          .replace(/{product_code}/g, productCode)
          .replace(/{lot}/g, lotNumber)
          .replace(/{barcode}/g, barcodeEan);
        cloned.props.value = val;
      }

      return cloned;
    });

    return {
      ...activeTemplate,
      elements_json: hydratedElements,
    };
  };

  const openPreview = () => {
    setPreviewTemplate(buildHydratedTemplate());
  };

  return (
    <div className="space-y-6">
      {/* Top Source Mode Selector */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
            <span>Gerar e Imprimir Etiquetas</span>
            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-mono">
              Auto-Preenchimento Ativo
            </span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Selecione a origem dos dados para preencher código, descrição, lote e códigos de barras automaticamente
          </p>
        </div>

        {/* Source Toggle */}
        <div className="flex items-center bg-zinc-100 p-1 rounded-xl border border-zinc-200">
          <button
            type="button"
            onClick={() => setSourceMode('lot')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              sourceMode === 'lot'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Factory className="h-3.5 w-3.5 text-blue-600" />
            <span>Por Lote de Produção</span>
          </button>

          <button
            type="button"
            onClick={() => setSourceMode('product')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              sourceMode === 'product'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Package className="h-3.5 w-3.5 text-emerald-600" />
            <span>Por Produto do Cadastro</span>
          </button>

          <button
            type="button"
            onClick={() => setSourceMode('manual')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              sourceMode === 'manual'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Sliders className="h-3.5 w-3.5 text-zinc-600" />
            <span>Digitação Livre</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Data Selection (Left) & Template Form + Print (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Lot or Product Selector */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-zinc-200/80 shadow-xs p-4 flex flex-col max-h-[680px]">
          {sourceMode === 'lot' && (
            <div className="space-y-3 flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <Factory className="h-4 w-4 text-blue-600" />
                  <span>Lotes de Produção Recentes:</span>
                </label>
                <span className="text-[11px] font-mono text-zinc-500">
                  {productionLots.length} lotes
                </span>
              </div>

              <div className="relative">
                <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por lote, código ou produto..."
                  value={lotSearch}
                  onChange={(e) => setLotSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {loadingLots ? (
                  <div className="py-16 text-center text-zinc-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-900" />
                    <span className="text-xs block mt-2">Carregando lotes de produção...</span>
                  </div>
                ) : filteredLots.length === 0 ? (
                  <div className="py-12 text-center text-xs text-zinc-400">Nenhum lote encontrado.</div>
                ) : (
                  filteredLots.map((lot) => {
                    const isSelected = selectedLot?.id === lot.id;
                    const calculatedBoxes = Math.ceil(lot.quantidade / 12);

                    return (
                      <button
                        key={lot.id}
                        type="button"
                        onClick={() => handleSelectLot(lot)}
                        className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20'
                            : 'bg-white border-zinc-200/80 hover:border-zinc-300 hover:bg-zinc-50/70'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-black text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded">
                              LOTE: {lot.lote}
                            </span>
                            <span className="font-mono text-[11px] text-zinc-500 font-bold">
                              {lot.codigo}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-zinc-900 truncate mt-1">{lot.descricao}</h4>
                          <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-mono mt-1">
                            <span>Produção: <strong>{lot.quantidade} un.</strong></span>
                            <span>📦 <strong>~{calculatedBoxes} caixas</strong></span>
                            {lot.data_producao && <span>Data: {lot.data_producao}</span>}
                          </div>
                        </div>

                        {isSelected && <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {sourceMode === 'product' && (
            <div className="space-y-3 flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <Package className="h-4 w-4 text-emerald-600" />
                  <span>Catálogo de Produtos:</span>
                </label>
                <span className="text-[11px] font-mono text-zinc-500">
                  {catalogProducts.length} itens
                </span>
              </div>

              <div className="relative">
                <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por código, descrição ou EAN..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {loadingProducts ? (
                  <div className="py-16 text-center text-zinc-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-900" />
                    <span className="text-xs block mt-2">Carregando catálogo...</span>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="py-12 text-center text-xs text-zinc-400">Nenhum produto encontrado.</div>
                ) : (
                  filteredProducts.map((prod) => {
                    const isSelected = selectedProduct?.codigo === prod.codigo;
                    return (
                      <button
                        key={prod.codigo}
                        type="button"
                        onClick={() => handleSelectProduct(prod)}
                        className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20'
                            : 'bg-white border-zinc-200/80 hover:border-zinc-300 hover:bg-zinc-50/70'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                              {prod.codigo}
                            </span>
                            {prod.codigo_barras && (
                              <span className="text-[10px] font-mono text-zinc-500">
                                EAN: {prod.codigo_barras}
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs font-bold text-zinc-900 truncate mt-1">{prod.descricao}</h4>
                        </div>

                        {isSelected && <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {sourceMode === 'manual' && (
            <div className="p-6 text-center text-zinc-500 text-xs space-y-2 my-auto">
              <Sliders className="h-8 w-8 mx-auto text-zinc-400 stroke-[1.5]" />
              <p className="font-bold text-zinc-800">Modo de Digitação Livre Ativado</p>
              <p className="leading-relaxed">
                Você pode preencher e alterar os campos de código, descrição, lote e código de barras diretamente no formulário ao lado.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Parameters & Template Selection */}
        <div className="lg:col-span-7 space-y-5">
          {/* Template Selector Card */}
          <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-900 block">
                1. Modelo de Etiqueta:
              </label>
              <span className="text-[11px] font-mono text-zinc-500 font-bold">
                {activeTemplate.width_mm}x{activeTemplate.height_mm}mm ({activeTemplate.orientation === 'landscape' ? 'Paisagem' : 'Retrato'})
              </span>
            </div>

            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full p-2.5 border border-zinc-300 rounded-xl bg-zinc-50 font-bold text-xs text-zinc-900 focus:outline-none focus:border-zinc-900"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} — {tpl.width_mm}x{tpl.height_mm}mm ({tpl.category})
                </option>
              ))}
            </select>
          </div>

          {/* Form Fields: Product, Lote, Barcode */}
          <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs space-y-4 text-xs text-zinc-700">
            <label className="text-xs font-bold text-zinc-900 block">
              2. Dados do Produto e Códigos:
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-zinc-600 block mb-1">Cód. Produto:</label>
                <input
                  type="text"
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  className="w-full p-2 border border-zinc-300 rounded-xl font-mono font-bold text-zinc-900 bg-zinc-50"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] font-semibold text-zinc-600 block mb-1">Descrição do Produto:</label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full p-2 border border-zinc-300 rounded-xl font-bold text-zinc-900 bg-zinc-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-zinc-600 block mb-1">Lote:</label>
                <input
                  type="text"
                  value={lotNumber}
                  onChange={(e) => setLotNumber(e.target.value.toUpperCase())}
                  className="w-full p-2 border border-zinc-300 rounded-xl font-mono font-bold text-blue-700 bg-zinc-50 uppercase"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-600 block mb-1">Fabricação:</label>
                <input
                  type="text"
                  value={manufacturingDate}
                  onChange={(e) => setManufacturingDate(e.target.value)}
                  className="w-full p-2 border border-zinc-300 rounded-xl font-mono text-center font-bold bg-zinc-50"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-600 block mb-1">Validade:</label>
                <input
                  type="text"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full p-2 border border-zinc-300 rounded-xl font-mono text-center font-bold bg-zinc-50"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-600 block mb-1">Qtd / Caixa:</label>
                <input
                  type="number"
                  min="1"
                  value={boxQuantity}
                  onChange={(e) => setBoxQuantity(parseInt(e.target.value, 10) || 1)}
                  className="w-full p-2 border border-zinc-300 rounded-xl font-mono text-center font-bold bg-zinc-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-zinc-600 block mb-1">EAN-13 (Produto):</label>
                <input
                  type="text"
                  value={barcodeEan}
                  onChange={(e) => setBarcodeEan(e.target.value)}
                  className="w-full p-2 border border-zinc-300 rounded-xl font-mono font-bold bg-zinc-50"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-600 block mb-1">DUN-14 (Caixa / Volume):</label>
                <input
                  type="text"
                  value={barcodeDun}
                  onChange={(e) => setBarcodeDun(e.target.value)}
                  className="w-full p-2 border border-zinc-300 rounded-xl font-mono font-bold bg-zinc-50"
                />
              </div>
            </div>
          </div>

          {/* Volume Sequencing and Print Button */}
          <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-900 block">
                3. Quantidade e Numeração de Caixas:
              </label>

              <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setEnableSequence(true)}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    enableSequence ? 'bg-white text-zinc-900 shadow-xs font-bold' : 'text-zinc-600'
                  }`}
                >
                  Caixas (Sequência)
                </button>
                <button
                  type="button"
                  onClick={() => setEnableSequence(false)}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    !enableSequence ? 'bg-white text-zinc-900 shadow-xs font-bold' : 'text-zinc-600'
                  }`}
                >
                  Cópias Iguais
                </button>
              </div>
            </div>

            {enableSequence ? (
              <div className="grid grid-cols-2 gap-3 bg-zinc-50 p-3.5 rounded-xl border border-zinc-200">
                <div>
                  <span className="text-[11px] font-semibold text-zinc-600 block mb-1">Caixa Inicial:</span>
                  <input
                    type="number"
                    min="1"
                    value={sequenceStart}
                    onChange={(e) => setSequenceStart(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full p-2 border border-zinc-300 rounded-xl font-mono font-bold text-center bg-white text-xs"
                  />
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-zinc-600 block mb-1">Total de Caixas:</span>
                  <input
                    type="number"
                    min={sequenceStart}
                    value={sequenceTotal}
                    onChange={(e) => setSequenceTotal(Math.max(sequenceStart, parseInt(e.target.value, 10) || sequenceStart))}
                    className="w-full p-2 border border-zinc-300 rounded-xl font-mono font-bold text-center bg-white text-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-zinc-50 p-3.5 rounded-xl border border-zinc-200">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-24 p-2 border border-zinc-300 rounded-xl font-mono font-bold text-center bg-white text-xs"
                />
                <span className="text-zinc-600 text-xs">etiquetas térmicas idênticas</span>
              </div>
            )}

            <button
              type="button"
              onClick={openPreview}
              className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-3 px-6 rounded-xl text-sm cursor-pointer"
            >
              <Printer className="h-5 w-5" />
              <span>Visualizar e imprimir</span>
            </button>
          </div>
        </div>
      </div>

      {previewTemplate && (
        <PrintModal
          template={previewTemplate}
          isOpen
          onClose={() => setPreviewTemplate(null)}
          onPrintSuccess={onPrintSuccess}
          initialCopies={copies}
          initialEnableSequence={enableSequence}
          initialSequenceStart={sequenceStart}
          initialSequenceTotal={sequenceTotal}
          history={{
            product_code: productCode,
            product_name: productName,
            lot_number: lotNumber,
          }}
        />
      )}
    </div>
  );
}
