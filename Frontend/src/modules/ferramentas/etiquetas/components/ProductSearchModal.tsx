import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, Check, Loader2, Package, FlaskConical, Box, Warehouse } from 'lucide-react';
import { apiJson, hubJson } from '../../../geral/lib/http';
import type { CatalogSearchItem } from '../lib/types';

interface ProductSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (item: CatalogSearchItem) => void;
}

export default function ProductSearchModal({
  isOpen,
  onClose,
  onSelectProduct,
}: ProductSearchModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CatalogSearchItem[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'produto' | 'materia_prima' | 'embalagem' | 'item'>('all');

  useEffect(() => {
    if (!isOpen) return;

    const fetchCatalog = async () => {
      setLoading(true);
      try {
        const fetchedItems: CatalogSearchItem[] = [];
        const seenCodes = new Set<string>();

        // 1. Fetch Finished Products from /api/products
        try {
          const prodsRes = await apiJson<any>('/products?limit=5000');
          const prodsList = Array.isArray(prodsRes)
            ? prodsRes
            : Array.isArray(prodsRes?.items)
            ? prodsRes.items
            : [];

          prodsList.forEach((p: any) => {
            const code = String(p.codigo || p.code || '').trim();
            const name = String(p.descricao || p.name || p.description || '').trim();
            if (!code && !name) return;

            const barcode = p.gtin || p.barcode || (code.length >= 8 ? code : undefined);

            if (!seenCodes.has(`prod_${code}`)) {
              seenCodes.add(`prod_${code}`);
              fetchedItems.push({
                id: `prod_${code || name}`,
                code: code || '-',
                name: name || code,
                type: 'produto',
                barcode,
                unit: 'UN',
                category: p.categoria_produto || p.linha || 'Produto Acabado',
              });
            }
          });
        } catch (e) {
          console.warn('Não foi possível carregar produtos acabados:', e);
        }

        // 2. Fetch Raw Materials, Packagings, Support from Compras / Items
        try {
          const itemsRes = await hubJson<any>('compras/items');
          const itemsList = Array.isArray(itemsRes)
            ? itemsRes
            : Array.isArray(itemsRes?.items)
            ? itemsRes.items
            : [];

          itemsList.forEach((item: any) => {
            const code = String(item.code || item.codigo || '').trim();
            const name = String(item.description || item.descricao || item.name || '').trim();
            if (!code && !name) return;

            const catId = (item.category_id || item.categoryId || item.category || '').toLowerCase();
            let itemType: 'materia_prima' | 'embalagem' | 'item' = 'materia_prima';

            if (catId.includes('emb') || catId.includes('frasco') || catId.includes('tampa') || catId.includes('rotulo') || catId.includes('caixa')) {
              itemType = 'embalagem';
            } else if (catId.includes('mp') || catId.includes('materia') || catId.includes('quimic') || catId.includes('essencia') || catId.includes('oleo') || catId.includes('ativo')) {
              itemType = 'materia_prima';
            } else if (catId.includes('coloracao')) {
              itemType = 'materia_prima';
            } else if (catId.includes('apoio')) {
              itemType = 'embalagem';
            }

            if (!seenCodes.has(`item_${code}`)) {
              seenCodes.add(`item_${code}`);
              fetchedItems.push({
                id: `item_${code || name}`,
                code: code || '-',
                name: name || code,
                type: itemType,
                barcode: item.barcode || (code.length >= 8 ? code : undefined),
                unit: item.unit || 'KG',
                category: item.category_id || item.line || undefined,
              });
            }
          });
        } catch (e) {
          console.warn('Não foi possível carregar itens de compras/insumos:', e);
        }

        // 3. Fetch Almoxarifado items from /api/almox/items
        try {
          const almoxRes = await apiJson<any>('/almox/items');
          const almoxList = Array.isArray(almoxRes)
            ? almoxRes
            : Array.isArray(almoxRes?.items)
            ? almoxRes.items
            : [];

          almoxList.forEach((item: any) => {
            const code = String(item.code || item.codigo || item.sku || '').trim();
            const name = String(item.description || item.descricao || item.name || '').trim();
            if (!code && !name) return;

            if (!seenCodes.has(`item_${code}`) && !seenCodes.has(`almox_${code}`)) {
              seenCodes.add(`almox_${code}`);
              fetchedItems.push({
                id: `almox_${code || name}`,
                code: code || '-',
                name: name || code,
                type: 'item',
                barcode: item.barcode || undefined,
                unit: item.unit || 'UN',
                category: item.section || item.category || 'Almoxarifado',
              });
            }
          });
        } catch (e) {
          console.warn('Não foi possível carregar itens do almoxarifado:', e);
        }

        setItems(fetchedItems);
      } catch (err) {
        console.error('Erro geral ao carregar catálogo para etiquetas:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCatalog();
  }, [isOpen]);

  // Tab counts
  const counts = useMemo(() => {
    return {
      all: items.length,
      produto: items.filter((i) => i.type === 'produto').length,
      materia_prima: items.filter((i) => i.type === 'materia_prima').length,
      embalagem: items.filter((i) => i.type === 'embalagem').length,
      item: items.filter((i) => i.type === 'item').length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (activeTab !== 'all' && item.type !== activeTab) return false;
      if (!searchTerm.trim()) return true;

      const term = searchTerm.trim().toLowerCase();
      return (
        item.name.toLowerCase().includes(term) ||
        item.code.toLowerCase().includes(term) ||
        (item.category && item.category.toLowerCase().includes(term)) ||
        (item.barcode && item.barcode.toLowerCase().includes(term))
      );
    });
  }, [items, activeTab, searchTerm]);

  if (!isOpen) return null;

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'produto':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
            <Package className="h-3 w-3" /> PRODUTO ACABADO
          </span>
        );
      case 'materia_prima':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
            <FlaskConical className="h-3 w-3" /> MATÉRIA-PRIMA
          </span>
        );
      case 'embalagem':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
            <Box className="h-3 w-3" /> EMBALAGEM
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-100 text-zinc-600 border border-zinc-200 flex items-center gap-1">
            <Warehouse className="h-3 w-3" /> ALMOXARIFADO
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-xl">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900">Buscar do Catálogo NatumHub</h2>
              <p className="text-xs text-zinc-500">
                Selecione um item do sistema para preencher os dados da etiqueta automaticamente
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search Bar & Filter Tabs */}
        <div className="p-4 border-b border-zinc-100 space-y-3 bg-white">
          <div className="relative">
            <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              placeholder="Digite o nome, código SKU, insumo ou código de barras..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:border-zinc-900 bg-zinc-50/50"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold pb-1">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'all' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Todos ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('produto')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'produto'
                  ? 'bg-purple-700 text-white'
                  : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
              }`}
            >
              Produtos Acabados ({counts.produto})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('materia_prima')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'materia_prima'
                  ? 'bg-blue-700 text-white'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              Matérias-Primas ({counts.materia_prima})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('embalagem')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'embalagem'
                  ? 'bg-amber-700 text-white'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              Embalagens ({counts.embalagem})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('item')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'item' ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Almoxarifado ({counts.item})
            </button>
          </div>
        </div>

        {/* List of Results */}
        <div className="flex-1 overflow-y-auto p-4 divide-y divide-zinc-100">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-zinc-400 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="text-xs font-semibold">Carregando catálogo de produtos e insumos...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center text-zinc-400 text-xs space-y-1">
              <p className="font-semibold text-zinc-600">Nenhum item encontrado.</p>
              {searchTerm && <p>Nenhum resultado corresponde a "{searchTerm}".</p>}
            </div>
          ) : (
            filteredItems.slice(0, 100).map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onSelectProduct(item);
                  onClose();
                }}
                className="w-full py-3 px-3 flex items-center justify-between text-left hover:bg-blue-50/50 transition-colors rounded-xl group cursor-pointer"
              >
                <div className="space-y-1.5 max-w-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-900 group-hover:text-blue-700 transition-colors">
                      {item.name}
                    </span>
                    {getTypeBadge(item.type)}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-mono">
                    <span>CÓDIGO: <strong className="text-zinc-700">{item.code}</strong></span>
                    {item.unit && <span>UN: {item.unit}</span>}
                    {item.barcode && <span>EAN/BARRAS: {item.barcode}</span>}
                    {item.category && <span className="text-zinc-400">({item.category})</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 group-hover:bg-blue-600 group-hover:text-white px-3 py-1.5 rounded-lg transition-all shadow-2xs">
                  <span>Selecionar</span>
                  <Check className="h-3.5 w-3.5" />
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-100 bg-zinc-50 text-[11px] text-zinc-500 flex items-center justify-between px-4">
          <span>Exibindo {Math.min(filteredItems.length, 100)} de {filteredItems.length} itens encontrados</span>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-800 font-semibold cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
