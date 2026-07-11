/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../geral/lib/api';
import { getAuthUser, logoutOperator } from '../../geral/lib/auth';
import { format } from 'date-fns';
import {
  LayoutDashboard,
  FilePlus,
  Database,
  History,
  LogOut,
  Printer,
  Loader2,
  ListChecks,
  Settings,
  ArrowLeft,
  X,
  FlaskConical
} from 'lucide-react';
import { Product, Report, MicrobioAppConfig as AppConfig } from '../../geral/lib/types';
import { LAB_NAME, DEPT_NAME, COMPANY_INFO, DEFAULT_TESTS, cn } from '../../geral/lib/microbioUtils';
import { motion, AnimatePresence } from 'motion/react';
import { ReportTemplate } from './components/ReportTemplate';

// Import modular sub-components
import { ReportCreationFlow } from './components/ReportCreationFlow';
import AppLayout from '../../geral/components/layout/AppLayout';
import { ProductManager } from './components/ProductManager';
import { ReportHistory } from './components/ReportHistory';
import { SettingsTab } from './components/SettingsTab';

interface LocalUser {
  displayName: string;
  photoURL: string;
}

interface MicrobiologiaViewProps {
  onBackToHub: () => void;
}

export default function MicrobiologiaView({ onBackToHub }: MicrobiologiaViewProps) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'new' | 'history' | 'products' | 'settings'>('new');
  const [printingReports, setPrintingReports] = useState<Report[] | null>(null);
  const [selectedReportIds, setSelectedReportIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const tabLabels: Record<string, string> = {
      new: 'Gerar Lote',
      history: 'Histórico de Laudos',
      products: 'Cadastro de Produtos',
      settings: 'Configurações'
    };
    (window as any).__current_page__ = tabLabels[activeTab] || activeTab;
  }, [activeTab]);

  // Data State
  const [products, setProducts] = useState<Product[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);

  const [dailyDate, setDailyDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [technicianName, setTechnicianName] = useState('');

  useEffect(() => {
    const u = getAuthUser();
    setUser(u);
    if (u) {
      setTechnicianName(u.displayName || '');
    }
    setLoading(false);
  }, []);

  const fetchData = async () => {
    if (!user) return;
    try {
      const [prods, reps, conf] = await Promise.all([
        api.getProducts(),
        api.getReports(),
        api.getMicrobioConfig()
      ]);
      setProducts(prods);
      setReports(reps);

      if (conf) {
        setConfig(conf);
      } else {
        const initialConfig: AppConfig = {
          nextReportNumber: 6833,
          currentYear: 2026,
          template: {
            labName: LAB_NAME,
            deptName: DEPT_NAME,
            companyName: COMPANY_INFO.name,
            companyAddress: COMPANY_INFO.address,
            companyEmail: COMPANY_INFO.email,
            companyContact: COMPANY_INFO.contact,
            sampleType: COMPANY_INFO.sampleType,
            technicianSignName: 'Rafael Marinho de Melo',
            technicianSignTitle: 'Responsável Técnico',
            defaultTests: DEFAULT_TESTS
          }
        };
        await api.saveMicrobioConfig(initialConfig);
        setConfig(initialConfig);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh data every 10 seconds to mimic real-time
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (printingReports && printingReports.length > 0) {
      const timer = setTimeout(() => {
        try {
          window.focus();
          window.print();
        } catch (e) {
          console.error('Print failed:', e);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [printingReports]);

  const handlePrint = (reportOrReports: Report | Report[]) => {
    if (Array.isArray(reportOrReports)) {
      setPrintingReports(reportOrReports);
    } else {
      setPrintingReports([reportOrReports]);
    }
  };

  const toggleReportSelection = (id: string, isShift: boolean = false, isCtrl: boolean = false) => {
    const next = new Set(selectedReportIds);

    if (isCtrl) {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    } else if (isShift && reports.length > 0) {
      const lastSelectedId = Array.from(selectedReportIds).pop();
      if (lastSelectedId) {
        const lastIdx = reports.findIndex((r) => r.id === lastSelectedId);
        const currentIdx = reports.findIndex((r) => r.id === id);
        if (lastIdx !== -1 && currentIdx !== -1) {
          const start = Math.min(lastIdx, currentIdx);
          const end = Math.max(lastIdx, currentIdx);
          for (let i = start; i <= end; i++) {
            next.add(reports[i].id || '');
          }
        }
      } else {
        next.add(id);
      }
    } else {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }

    setSelectedReportIds(next);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-800" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-50 font-sans p-4">
        <p className="text-sm text-zinc-500">Sessão expirada. Volte ao hub e faça login novamente.</p>
        <button onClick={onBackToHub} className="mt-4 text-sm font-bold text-zinc-900 underline">Voltar ao Hub</button>
      </div>
    );
  }

  if (printingReports && printingReports.length > 0) {
    return (
      <div className="relative bg-white min-h-screen">
        <div className="no-print fixed top-4 right-4 flex flex-col gap-2 z-50">
          <div className="bg-zinc-900/90 text-white p-4 rounded-2xl shadow-2xl border border-zinc-700 backdrop-blur-sm animate-in fade-in slide-in-from-top-4 duration-300">
            <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
              <Printer className="h-4 w-4 text-zinc-500" /> Pré-visualização de Impressão
            </h3>
            <p className="text-[10px] text-zinc-300 mb-4 font-medium uppercase tracking-wider">
              Laudos carregados: {printingReports.length}
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  window.focus();
                  window.print();
                }}
                className="w-full bg-zinc-800 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-zinc-900 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                <Printer className="h-4 w-4" /> IMPRIMIR AGORA
              </button>

              <button
                onClick={() => {
                  const printWindow = window.open('', '_blank');
                  if (printWindow) {
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Impressão de Laudos</title>
                          <script src="https://cdn.tailwindcss.com"></script>
                          <style>
                            @media print { .no-print { display: none !important; } .page-break { break-after: page; page-break-after: always; } }
                            body { background: white; margin: 0; padding: 0; }
                          </style>
                        </head>
                        <body>
                          ${document.querySelector('.print-container')?.innerHTML || 'Erro ao carregar conteúdo'}
                          <script>
                            setTimeout(() => { window.print(); window.close(); }, 500);
                          </script>
                        </body>
                      </html>
                    `);
                    printWindow.document.close();
                  } else {
                    alert('Pop-up bloqueado! Por favor, autorize pop-ups para este site.');
                  }
                }}
                className="w-full bg-zinc-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-zinc-600 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <ListChecks className="h-4 w-4" /> ABRIR EM NOVA ABA
              </button>

              <button
                onClick={() => setPrintingReports(null)}
                className="w-full bg-zinc-200 text-zinc-700 px-6 py-3 rounded-xl font-bold hover:bg-zinc-300 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <X className="h-4 w-4" /> CANCELAR / VOLTAR
              </button>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-[10px] text-amber-800 font-medium max-w-[200px]">
            DICA: Se a janela de impressão não abriu automaticamente, use o botão "IMPRIMIR AGORA".
          </div>
        </div>

        <div className="print:block print-container">
          {printingReports.map((report, idx) => {
            const product = products.find((p) => p.code === report.productCode) || {
              code: report.productCode,
              name: report.productName,
              packaging: 'Pote',
              validity: '3 anos'
            };
            return (
              <div key={report.id || idx} className={`${idx < printingReports.length - 1 ? 'page-break' : ''}`}>
                <ReportTemplate report={report} product={product} config={config?.template} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const sidebarItems = [
    { id: 'new', label: 'Gerar Lote', icon: FilePlus },
    { id: 'history', label: 'Histórico', icon: History },
    { id: 'products', label: 'Biblioteca', icon: Database },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  const headerActions = config ? (
    <div className="flex flex-col items-end shrink-0">
      <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Nº Relatório</span>
      <span className="text-xs font-black text-zinc-900">
        {`${config.nextReportNumber}/${config.currentYear % 100}`}
      </span>
    </div>
  ) : null;

  return (
    <AppLayout
      moduleTitle="Análise Microbiológica"
      moduleSubtitle="NATUM-PRD-01"
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={(id: any) => setActiveTab(id)}
      headerActions={headerActions}
      currentUser={user}
      onLogout={() => logoutOperator().then(() => window.location.reload())}
    >
      <AnimatePresence mode="wait">
        {activeTab === 'new' && (
          <motion.div key="new" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <ReportCreationFlow
              products={products}
              config={config}
              technicianName={technicianName}
              setTechnicianName={setTechnicianName}
              dailyDate={dailyDate}
              setDailyDate={setDailyDate}
              onReportGenerated={handlePrint}
            />
          </motion.div>
        )}
        {activeTab === 'history' && (
          <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <ReportHistory
              reports={reports}
              onPrint={handlePrint}
              selectedIds={selectedReportIds}
              onToggle={toggleReportSelection}
              onRefresh={fetchData}
            />
          </motion.div>
        )}
        {activeTab === 'products' && (
          <motion.div key="products" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <ProductManager products={products} onRefresh={fetchData} />
          </motion.div>
        )}
        {activeTab === 'settings' && (
          <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <SettingsTab config={config} onRefresh={fetchData} />
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
