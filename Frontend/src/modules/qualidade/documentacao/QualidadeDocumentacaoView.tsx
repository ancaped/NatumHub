import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FolderOpen, Layers } from 'lucide-react';
import AppLayout from '../../geral/components/layout/AppLayout';
import { apiJson } from '../../geral/lib/http';
import DocumentsTab from './components/DocumentsTab';
import PendingTab from './components/PendingTab';
import FamiliesTab from './components/FamiliesTab';
import DocumentDrawer from './components/DocumentDrawer';
import { isPendingDoc, type DocFamily, type DocRecord, type DocType } from './types';

interface Props {
  onBackToHub: () => void;
}

type TabId = 'documentos' | 'pendencias' | 'familias';

export default function QualidadeDocumentacaoView({ onBackToHub }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('documentos');
  const [families, setFamilies] = useState<DocFamily[]>([]);
  const [types, setTypes] = useState<DocType[]>([]);
  const [documents, setDocuments] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<DocRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fams, typs, docs] = await Promise.all([
        apiJson<DocFamily[]>('/qualidade/documentacao/families'),
        apiJson<DocType[]>('/qualidade/documentacao/types'),
        apiJson<DocRecord[]>('/qualidade/documentacao/documents'),
      ]);
      setFamilies(Array.isArray(fams) ? fams : []);
      setTypes(Array.isArray(typs) ? typs : []);
      setDocuments(Array.isArray(docs) ? docs : []);
      void apiJson('/qualidade/documentacao/check-alerts', { method: 'POST' }).catch(() => undefined);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar documentação');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    const fresh = documents.find((d) => d.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [documents, selected?.id]);

  useEffect(() => {
    (window as unknown as { __current_page__?: string }).__current_page__ =
      activeTab === 'documentos'
        ? 'Documentos'
        : activeTab === 'pendencias'
          ? 'Pendências'
          : 'Famílias';
  }, [activeTab]);

  const pendingCount = useMemo(
    () =>
      documents.filter((d) => isPendingDoc(d, families.find((f) => f.id === d.familyId))).length,
    [documents, families]
  );

  const sidebarItems = [
    { id: 'documentos', label: 'Documentos', icon: FolderOpen },
    { id: 'pendencias', label: 'Pendências', icon: AlertTriangle, badge: pendingCount || undefined },
    { id: 'familias', label: 'Famílias', icon: Layers },
  ];

  const openNew = () => {
    setSelected(null);
    setDrawerOpen(true);
  };

  const openDoc = (doc: DocRecord) => {
    setSelected(doc);
    setDrawerOpen(true);
  };

  return (
    <AppLayout
      moduleTitle="Documentação"
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as TabId)}
    >
      <div className="flex flex-col h-full p-4 md:p-6 gap-3">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {activeTab === 'documentos' && (
          <DocumentsTab
            documents={documents}
            families={families}
            loading={loading}
            onNew={openNew}
            onOpen={openDoc}
          />
        )}
        {activeTab === 'pendencias' && (
          <PendingTab documents={documents} families={families} onOpen={openDoc} />
        )}
        {activeTab === 'familias' && (
          <FamiliesTab families={families} types={types} onChanged={() => void load()} />
        )}
      </div>

      <DocumentDrawer
        open={drawerOpen}
        families={families}
        types={types}
        document={selected}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => void load()}
      />
    </AppLayout>
  );
}
