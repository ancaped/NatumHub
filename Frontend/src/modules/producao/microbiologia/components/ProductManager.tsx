import React, { useState } from 'react';
import { api } from '../../../geral/lib/api';
import { Product } from '../../../geral/lib/types';
import { Plus, Trash2, Loader2, Database } from 'lucide-react';

interface ProductManagerProps {
  products: Product[];
  onRefresh?: () => void;
}

export function ProductManager({ products, onRefresh }: ProductManagerProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [newP, setNewP] = useState<Product>({ code: '', name: '', packaging: 'Pote', validity: '3 anos', isEa: false });
  const [showConfirmDeleteAll, setShowConfirmDeleteAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleBulkImport = async () => {
    try {
      const lines = importText.split('\n').filter((l) => l.trim());
      const productsToSave: Product[] = [];
      lines.forEach((line) => {
        const [code, name, packaging, validity, isEaStr] = line.split('\t').map((s) => s.trim());
        if (code && name) {
          productsToSave.push({
            code,
            name,
            packaging: packaging || 'Pote',
            validity: validity || '3 anos',
            isEa: isEaStr ? isEaStr.toLowerCase() === 'ea' || isEaStr.toLowerCase() === 'true' || isEaStr === '1' : false
          });
        }
      });
      for (const p of productsToSave) {
        await api.saveProduct(p);
      }
      setShowImport(false);
      setImportText('');
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error(e);
      alert('Erro na importação em lote.');
    }
  };

  const handleSave = async () => {
    if (!newP.code || !newP.name) return;
    try {
      await api.saveProduct(newP);
      setNewP({ code: '', name: '', packaging: 'Pote', validity: '3 anos', isEa: false });
      setShowAdd(false);
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar produto.');
    }
  };

  const handleDeleteProduct = async (code: string) => {
    try {
      await api.deleteProduct(code);
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error(e);
      alert('Erro ao excluir produto.');
    }
  };

  const handleDeleteAll = async () => {
    setSaving(true);
    try {
      await api.deleteAllProducts();
      setShowConfirmDeleteAll(false);
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error(e);
      alert('Erro ao excluir todos os produtos.');
    } finally {
      setSaving(false);
    }
  };

  const seedData = async () => {
    const data = [
      { code: '5.11.011', name: 'SHAMPOO CACHOS 500 ML BIO OZONIO', packaging: 'Pote', validity: '3 anos' },
      { code: '1.11.008', name: 'SH PESSEGO 300 ML NATUM BIO PROFESSIONAL', packaging: 'Pote', validity: '3 anos' },
      { code: '1.11.023', name: 'SH THERMO RESTORE 250 ML NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '5.11.029', name: 'SHAMPOO AMAZING 1000 ML BIO OZONIO', packaging: 'Pote', validity: '3 anos' },
      { code: '2.12.027', name: 'COND LISONESE 300 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '1.14.010', name: 'FINALIZ THERMO RESTORE 250 ML NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '2.14.014', name: 'LEAVE-IN ARGAN 250 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '1.12.019', name: 'COND KERATRIX 5 L  NATUM BIO PROFESSIONAL', packaging: 'Pote', validity: '3 anos' },
      { code: '1.14.009', name: 'FINALIZ KERATRIX 250ML NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '1.12.022', name: 'COND KERATRIX 250 ML NATUM PROFESSIONAL', packaging: 'Pote', validity: '3 anos' },
      { code: '1.33.004', name: 'AOX 40 VOLUMES 900ML NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '1.33.003', name: 'AOX 30 VOLUMES 900ML NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '1.11.045', name: 'SH DESINTOX NANO OIL 1 L NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '2.13.062', name: 'SELANTE MAGICA DO LISO 1 L HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '1.13.050', name: 'PLASTICA CAPILAR LISS PROTEIN 1 KG NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '1.13.024', name: 'MASCARA KERATRIX FIBER MASK 250 G NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '1.11.003', name: 'SH NEUTRO 5 L NATUM BIO PROFESSIONAL', packaging: 'Pote', validity: '3 anos' },
      { code: '2.12.029', name: 'AMPOLA BB CREAM 13 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '1.13.047', name: 'MASC RECONST POWER PROTEIN 2 KG NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '1.33.001', name: 'AOX 10 VOLUMES 900ML NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '1.11.020', name: 'SH KERATRIX 5 L NATUM BIO PROFESSIONAL', packaging: 'Pote', validity: '3 anos' },
      { code: '20.11.001', name: 'SH NEUTRO SPECIALIST 5 L PIETREE PROFESSIONAL', packaging: 'Pote', validity: '3 anos' },
      { code: '1.11.016', name: 'SH JABORANDI 1 L NATUM BIO PROFESSIONAL', packaging: 'Pote', validity: '3 anos' },
      { code: '1.13.022', name: 'MASCARA RECONST TIOGLIC 500 G NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '23.33.001', name: 'AOX 10 VOLUMES 900ML TONYGLAN', packaging: 'Pote', validity: '3 anos' },
      { code: '20.12.001', name: 'COND NEUTRO SPECIALIST 5 L PIETREE PROFESSIONAL', packaging: 'Pote', validity: '3 anos' },
      { code: '2.11.028', name: 'SH MATIZER PLATINUM BLACK 300 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '1.12.003', name: 'COND NEUTRO 5 L NATUM BIO PROFESSIONAL', packaging: 'Pote', validity: '3 anos' },
      { code: '14.13.008', name: 'MASCARA CAPILAR PERFECT CULRS NUTRICAO 500 GR NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '2.13.073', name: 'ALISANTE DEFINITIVA JAPONESA 150 GR HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '2.13.036', name: 'BOTTOX VINTAGE 150 GR HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '2.13.035', name: 'BOTTOX VINTAGE 1 KG HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '1.32.007', name: 'CREME RELAX TIOGL AMONIA CLASSIC 1 KG NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '23.33.003', name: 'AOX 20 VOLUMES 900ML TONYGLAN', packaging: 'Pote', validity: '3 anos' },
      { code: '2.13.081', name: 'SUPER MASC MAIS LISO 1000ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '10.12.004', name: 'TRATAMENTO SELANTE MEGA LISAO 900ML LISS SHINE', packaging: 'Pote', validity: '3 anos' },
      { code: '10.11.004', name: 'SHAMPOO PRE LISO MEGA LISAO 900 ML LISS SHINE', packaging: 'Pote', validity: '3 anos' },
      { code: '2.13.101', name: 'MASC PISTACHE HIDRANUTRI 250 GR HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '1.13.049', name: 'MASC RECONST POWER PROTEIN 1 KG NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '2.13.084', name: 'SUPER MASC DESMAIA FIOS 1000ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '2.13.063', name: 'SELANTE MAGICA DO LISO 300 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '1.33.002', name: 'AOX 20 VOLUMES 900ML NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '1.31.008', name: 'SPRAY DE REGENERACAO REVERSION 500 ML NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '1.11.036', name: 'SH POST COLOUR 1 L NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '1.11.033', name: 'SH POST COLOUR 250 ML NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '1.14.023', name: 'LEAVE-IN NANO OIL 1 L NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '2.13.034', name: 'MASC MATIZER PLATINUM BLACK 250 GR HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '2.13.023', name: 'MASC MATIZER BLOND 250 GR HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '5.12.008', name: 'SELAGEM TERMICA 1000ML FRANCIS', packaging: 'Pote', validity: '3 anos' },
      { code: '5.12.009', name: 'SELAGEM TERMICA 300ML FRANCIS', packaging: 'Pote', validity: '3 anos' },
      { code: '1.11.018', name: 'SH PESSEGO 1 L NATUM BIO PROFESSIONAL', packaging: 'Pote', validity: '3 anos' },
      { code: '1.13.064', name: 'MASCARA REVIVAL REPAIR 250 GR NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '1.13.026', name: 'MASCARA RECONST. NANO OIL REPAIR 2,1 KG NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '2.12.012', name: 'COND PESSEGO 300 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '1.14.046', name: 'LUMINI SPA 60ML ROMANTIC NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '1.14.043', name: 'LUMINI SPA 200ML ROMANTIC NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '2.12.022', name: 'COND MATIZER PLATINUM BLACK 300 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '2.11.051', name: 'SHAMPOO SOS ENCORPA FIOS 900 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '2.11.049', name: 'SHAMPOO CRESCE FIOS 900 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '2.11.050', name: 'SHAMPOO EFEITO SALAO 900 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '2.12.062', name: 'CONDICIONADOR EFEITO SALAO 800 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '2.12.063', name: 'CONDICIONADOR SOS ENCORPA FIOS 800 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '2.11.052', name: 'SHAMPOO SUPER CACHOS 900 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '1.13.069', name: 'INSTANT LISS 1000 ML NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '2.13.029', name: 'MASC POS PROGRESSIVA 250 GR HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '2.33.007', name: 'AOX 30 VOLUMES 900ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '1.13.006', name: 'MASC NEUTRO 250 G NATUM BIO PROFESSIONAL', packaging: 'Pote', validity: '3 anos' },
      { code: '5.31.002', name: 'TRIDMENSION BLOND 1000 ML BIO OZONIO', packaging: 'Pote', validity: '3 anos' },
      { code: '1.12.016', name: 'COND NEUTRO 1 L NATUM BIO PROFESSIONAL', packaging: 'Pote', validity: '3 anos' },
      { code: '2.12.013', name: 'COND MANDIOCA 300 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '1.12.035', name: 'COND MEN 250 ML NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '5.13.030', name: 'Masc Coco Expertise 300ml Francis', packaging: 'Pote', validity: '3 anos' },
      { code: '5.12.012', name: 'CONDICIONADOR JABORANDI 300ML FRANCIS', packaging: 'Pote', validity: '3 anos' },
      { code: '5.11.005', name: 'SH EXPERTISE ALECRIM 1 L FRANCIS', packaging: 'Pote', validity: '3 anos' },
      { code: '2.33.006', name: 'AOX 20 VOLUMES 900ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '1.13.041', name: 'MASC REVITAL TIOGL AMONIO CLASSIC 500 ML NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '1.11.061', name: 'SHAMPOO REVERSION REPOSITOR CARBONO 1 L NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '5.13.022', name: 'MASC BLOND MATIZ 300GR FRANCIS', packaging: 'Pote', validity: '3 anos' },
      { code: '14.12.004', name: 'CONDICIONADOR CAPILAR PERFECT CULRS 1000 ML NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '14.12.003', name: 'CONDICIONADOR CAPILAR PERFECT CULRS 300 ML NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '10.13.004', name: 'SELANTE MAGICA DO LISO 1 L LISS SHINE', packaging: 'Pote', validity: '3 anos' },
      { code: '5.12.006', name: 'COND CACHOS 300 ML FRANCIS', packaging: 'Pote', validity: '3 anos' },
      { code: '2.14.034', name: 'LEAVE-IN MANDIOCA 250 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '5.11.030', name: 'SH EXPERTISE COCO 300ML FRANCIS', packaging: 'Pote', validity: '3 anos' },
      { code: '1.13.001', name: 'MASC PESSEGO 1 KG NATUM BIO PROFESSIONAL', packaging: 'Pote', validity: '3 anos' },
      { code: '2.11.033', name: 'SH ANTIRRES BOTTOX VINTAGE 300 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
      { code: '1.11.037', name: 'SHAMPOO BOTTOX  PREMIUM 1 L NATUM', packaging: 'Pote', validity: '3 anos' },
      { code: '2.14.031', name: 'LEAVE-IN PESSEGO 250 ML HAIR EXTRATTUS', packaging: 'Pote', validity: '3 anos' },
    ];
    try {
      for (const p of data) {
        await api.saveProduct({
          ...p,
          isEa: p.code.startsWith('5.') || p.code.startsWith('20.')
        });
      }
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error(e);
      alert('Erro ao realizar carga rápida.');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 lg:px-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-800">Biblioteca de Itens</h1>
          <p className="text-xs text-zinc-500 font-medium">{products.length} produtos registrados no laboratório.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {showConfirmDeleteAll ? (
            <div className="flex items-center gap-2 bg-red-50 p-2 rounded-md border border-red-200">
              <span className="text-[10px] font-black text-red-700 uppercase px-2">Excluir Tudo?</span>
              <button
                onClick={handleDeleteAll}
                disabled={saving}
                className="text-[10px] bg-red-600 text-white px-3 py-1.5 rounded-md font-bold cursor-pointer"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'SIM'}
              </button>
              <button
                onClick={() => setShowConfirmDeleteAll(false)}
                className="text-[10px] bg-white border border-zinc-200 text-zinc-600 px-3 py-1.5 rounded-md font-bold hover:bg-zinc-50 cursor-pointer"
              >
                NÃO
              </button>
            </div>
          ) : (
            products.length > 0 && (
              <button
                onClick={() => setShowConfirmDeleteAll(true)}
                className="flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                Excluir Tudo
              </button>
            )
          )}
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            Importar
          </button>
          <button
            onClick={seedData}
            className="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            Carga Rápida
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <Plus className="h-3 w-3" /> Novo
          </button>
        </div>
      </div>

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 no-print">
          <div className="w-full max-w-2xl bg-white rounded-md p-6 shadow-sm border border-zinc-200">
            <h3 className="text-lg font-bold text-zinc-900 mb-1">Importação Massiva</h3>
            <p className="text-xs text-zinc-500 mb-4">Cole os dados da planilha (Código, Descrição, Embalagem, Validade):</p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="5.11.011	SHAMPOO CACHOS...	Pote	3 anos"
              className="w-full h-48 bg-white border border-zinc-300 rounded-md p-3 font-mono text-xs focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800 outline-none mb-4 text-zinc-900"
            />
            <div className="flex gap-2">
              <button
                onClick={handleBulkImport}
                className="flex-1 bg-zinc-900 text-white py-2 rounded-md text-sm font-medium hover:bg-zinc-800 cursor-pointer"
              >
                Processar Importação
              </button>
              <button
                onClick={() => setShowImport(false)}
                className="px-4 border border-zinc-300 rounded-md text-sm font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="rounded-md border border-zinc-200 bg-white p-6 space-y-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="col-span-4 flex flex-col">
              <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Código</label>
              <input
                value={newP.code}
                onChange={(e) => setNewP({ ...newP, code: e.target.value })}
                placeholder="X.XX.XXX"
                className="bg-white border border-zinc-300 rounded-md px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800 outline-none text-zinc-900 font-bold"
              />
            </div>
            <div className="col-span-8 flex flex-col">
              <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Descrição Completa</label>
              <input
                value={newP.name}
                onChange={(e) => setNewP({ ...newP, name: e.target.value })}
                className="bg-white border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800 outline-none text-zinc-900 font-semibold"
              />
            </div>
            <div className="col-span-6 flex flex-col">
              <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Embalagem</label>
              <input
                value={newP.packaging}
                onChange={(e) => setNewP({ ...newP, packaging: e.target.value })}
                className="bg-white border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800 outline-none text-zinc-900"
              />
            </div>
            <div className="col-span-6 flex flex-col">
              <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Validade</label>
              <input
                value={newP.validity}
                onChange={(e) => setNewP({ ...newP, validity: e.target.value })}
                className="bg-white border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800 outline-none text-zinc-900"
              />
            </div>
            <div className="col-span-12 flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="new-product-is-ea"
                checked={newP.isEa || false}
                onChange={(e) => setNewP({ ...newP, isEa: e.target.checked })}
                className="rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="new-product-is-ea" className="text-xs font-bold uppercase text-zinc-650 select-none cursor-pointer">
                Classificar como EA (Estética Animal - Requer Teste Microbiológico)
              </label>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              className="flex-1 bg-zinc-900 text-white py-2 rounded-md text-sm font-medium hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Salvar Produto
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-6 border border-zinc-300 rounded-md text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-md border border-zinc-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left w-32">Código</th>
              <th className="px-4 py-3 text-left">Descrição</th>
              <th className="px-4 py-3 text-center">Embalagem</th>
              <th className="px-4 py-3 text-center">Validade</th>
              <th className="px-4 py-3 text-center w-28">Tipo (EA)</th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {products.map((p) => (
              <tr key={p.code} className="hover:bg-zinc-50 transition-colors group">
                <td className="px-4 py-2 font-mono text-zinc-900 text-xs font-bold">{p.code}</td>
                <td className="px-4 py-2 text-zinc-900 font-medium truncate max-w-xs">{p.name}</td>
                <td className="px-4 py-2 text-zinc-500 text-xs text-center">{p.packaging}</td>
                <td className="px-4 py-2 text-zinc-500 text-xs text-center">{p.validity}</td>
                <td className="px-4 py-2 text-center">
                  {p.isEa ? (
                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      EA
                    </span>
                  ) : (
                    <span className="bg-zinc-100 text-zinc-400 border border-zinc-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      Não EA
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleDeleteProduct(p.code)}
                    className="text-zinc-400 hover:text-red-600 transition-colors p-1 cursor-pointer"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
