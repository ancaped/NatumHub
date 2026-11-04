import React, { useState, useEffect, useMemo } from 'react';
import { Search, Check, Loader2, Package, FlaskConical, Box, Warehouse } from 'lucide-react';
import { apiJson, hubJson } from '../../../geral/lib/http';
import type { CatalogSearchItem } from '../lib/types';
import Drawer from '../../../geral/components/ui/Drawer';

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
    const base =
      'px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200 inline-flex items-center gap-1';
    switch (type) {
      case 'produto':
        return (
          <span className={base}>
            <Package className="h-3 w-3" /> Produto acabado
          </span>
        );
      case 'materia_prima':
        return (
          <span className={base}>
            <FlaskConical className="h-3 w-3" /> Matéria-prima
          </span>
        );
      case 'embalagem':
        return (
          <span className={base}>
            <Box className="h-3 w-3" /> Embalagem
          </span>
        );
      default:
        return (
          <span className={base}>
            <Warehouse className="h-3 w-3" /> Almoxarifado
          </span>
        );
    }
  };

  return (
    <Drawer
      onClose={onClose}
      title="Buscar do Catálogo Nexus"
      subtitle="Selecione um item do sistema para preencher os dados da etiqueta automaticamente"
      size="md"
      tabs={[
        { id: 'all', label: 'Todos', badge: counts.all },
        { id: 'produto', label: 'Produtos Acabados', badge: counts.produto },
        { id: 'materia_prima', label: 'Matérias-Primas', badge: counts.materia_prima },
        { id: 'embalagem', label: 'Embalagens', badge: counts.embalagem },
        { id: 'item', label: 'Almoxarifado', badge: counts.item },
      ]}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as typeof activeTab)}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-xs text-zinc-500">
            Exibindo {Math.min(filteredItems.length, 100)} de {filteredItems.length} itens encontrados
          </span>
          <button
            type="button"
            onClick={onClose}
            className="border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 rounded-lg text-xs h-8 px-2.5 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      }
    >
      <div className="space-y-3 -mt-2">
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            autoFocus
            placeholder="Digite o nome, código SKU, insumo ou código de barras..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-8 pl-8 pr-3 border border-zinc-200 rounded-lg text-xs focus:outline-none focus:border-zinc-900 bg-white"
          />
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-zinc-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            <span className="text-xs">Carregando catálogo de produtos e insumos...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center text-zinc-400 text-xs space-y-1">
            <p className="font-semibold text-zinc-600">Nenhum item encontrado.</p>
            {searchTerm && <p>Nenhum resultado corresponde a "{searchTerm}".</p>}
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden">
            {filteredItems.slice(0, 100).map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  onSelectProduct(item);
                  onClose();
                }}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-zinc-900">{item.name}</span>
                    {getTypeBadge(item.type)}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-[11px] text-zinc-500 font-mono">
                    <span>Código: <strong className="text-zinc-700">{item.code}</strong></span>
                    {item.unit && <span>UN: {item.unit}</span>}
                    {item.barcode && <span>EAN/Barras: {item.barcode}</span>}
                    {item.category && <span className="text-zinc-400">({item.category})</span>}
                  </div>
                </div>

                <span className="inline-flex items-center gap-1.5 border border-zinc-200 bg-white text-zinc-700 rounded-lg text-xs h-8 px-2.5 shrink-0">
                  <span>Selecionar</span>
                  <Check className="h-3.5 w-3.5" />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
