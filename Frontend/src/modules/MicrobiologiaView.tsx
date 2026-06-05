/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { api, localAuth } from '../lib/api';
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
import { Product, Report, MicrobioAppConfig as AppConfig } from '../types';
import { LAB_NAME, DEPT_NAME, COMPANY_INFO, DEFAULT_TESTS, cn } from '../lib/microbioUtils';
import { motion, AnimatePresence } from 'motion/react';
import { ReportTemplate } from '../components/microbiologia/ReportTemplate';

// Import modular sub-components
import { ReportCreationFlow } from '../components/microbiologia/ReportCreationFlow';
import { ProductManager } from '../components/microbiologia/ProductManager';
import { ReportHistory } from '../components/microbiologia/ReportHistory';
import { SettingsTab } from '../components/microbiologia/SettingsTab';

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
  const [operatorInputName, setOperatorInputName] = useState('');

  useEffect(() => {
    const u = localAuth.getUser();
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
        <div className="bg-white p-8 rounded-2xl border border-zinc-200 w-full max-w-md shadow-md space-y-6">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="bg-zinc-950 text-white p-3 rounded-xl shadow-sm">
              <FlaskConical className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900 tracking-tight">{LAB_NAME}</h1>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">{DEPT_NAME}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1.5 tracking-wider">
                Nome do Operador
              </label>
              <input
                type="text"
                value={operatorInputName}
                onChange={(e) => setOperatorInputName(e.target.value)}
                placeholder="Ex: João Silva"
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 text-sm bg-zinc-50/50 focus:bg-white transition-all font-medium text-zinc-900"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') localAuth.signIn(operatorInputName.trim() || 'Operador');
                }}
              />
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => localAuth.signIn(operatorInputName.trim() || 'Operador')}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-white text-sm font-semibold hover:bg-zinc-800 active:scale-98 transition-all shadow-sm cursor-pointer"
              >
                Acessar Sistema
              </button>

              <button
                onClick={onBackToHub}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-zinc-600 text-sm font-medium hover:bg-zinc-50 hover:text-zinc-900 active:scale-98 transition-all cursor-pointer"
              >
                Voltar ao Hub
              </button>
            </div>
          </div>
        </div>
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

  return (
    <div className="flex flex-col h-screen bg-zinc-50 font-sans overflow-hidden">
      {/* Header - Minimalist */}
      <header className="no-print bg-white border-b border-zinc-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-zinc-900 text-white p-1.5 rounded-md">
            <LayoutDashboard className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-zinc-900 leading-tight">AnaliseMicrobiologica</h1>
            <p className="text-[10px] text-zinc-500 font-medium leading-tight">NATUM-PRD-01</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end mr-4">
            <span className="text-[9px] text-zinc-500 uppercase font-semibold">Nº Relatório</span>
            <span className="text-xs font-bold text-zinc-900">
              {config ? `${config.nextReportNumber}/${config.currentYear % 100}` : '...'}
            </span>
          </div>

          <div className="flex items-center gap-2 border-l border-zinc-200 pl-4">
            <span className="text-xs font-medium text-zinc-700 hidden sm:block">{user.displayName}</span>
            <button onClick={localAuth.signOut} className="text-zinc-500 hover:text-zinc-900 transition-colors p-1 cursor-pointer" title="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden relative pb-14 md:pb-0">
        {/* Desktop Sidebar */}
        <aside className="no-print hidden md:flex w-56 bg-white border-r border-zinc-200 p-4 flex-col gap-1 shrink-0 z-10">
          <SidebarLink icon={<ArrowLeft className="h-4 w-4" />} label="Voltar ao Hub" active={false} onClick={onBackToHub} />
          <div className="h-px bg-zinc-200 my-1"></div>
          <SidebarLink icon={<FilePlus className="h-4 w-4" />} label="Gerar Lote" active={activeTab === 'new'} onClick={() => setActiveTab('new')} />
          <SidebarLink icon={<History className="h-4 w-4" />} label="Histórico" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
          <SidebarLink icon={<Database className="h-4 w-4" />} label="Biblioteca" active={activeTab === 'products'} onClick={() => setActiveTab('products')} />
          <SidebarLink icon={<Settings className="h-4 w-4" />} label="Configurações" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto p-4 md:p-6 bg-zinc-50 relative">
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
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="no-print md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 flex justify-around items-center px-2 py-1 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <MobileNavLink icon={<FilePlus className="h-5 w-5" />} label="Lote" active={activeTab === 'new'} onClick={() => setActiveTab('new')} />
          <MobileNavLink icon={<History className="h-5 w-5" />} label="Histórico" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
          <MobileNavLink icon={<Database className="h-5 w-5" />} label="Biblioteca" active={activeTab === 'products'} onClick={() => setActiveTab('products')} />
          <MobileNavLink icon={<Settings className="h-5 w-5" />} label="Config" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>

      </div>
    </div>
  );
}

function MobileNavLink({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center w-full py-2 gap-1 rounded-md transition-colors cursor-pointer',
        active ? 'text-zinc-900' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50'
      )}
    >
      {icon}
      <span className={cn('text-[10px] font-medium', active ? 'font-bold' : '')}>{label}</span>
    </button>
  );
}

function SidebarLink({ icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center w-full gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors border cursor-pointer',
        active
          ? 'bg-zinc-100 text-zinc-900 border-zinc-200'
          : 'text-zinc-600 border-transparent hover:bg-zinc-50 hover:text-zinc-900'
      )}
    >
      {icon}
      {label}
    </button>
  );
}
