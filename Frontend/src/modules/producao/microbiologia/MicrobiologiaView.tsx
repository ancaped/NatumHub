/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../geral/lib/api';
import { getAuthUser } from '../../geral/lib/auth';
import { format } from 'date-fns';
import {
  FilePlus,
  Calendar as CalendarIcon,
  History,
  Loader2,
  Settings,
} from 'lucide-react';
import { Report, Product, MicrobioAppConfig as AppConfig } from '../../geral/lib/types';
import { LAB_NAME, DEPT_NAME, COMPANY_INFO, DEFAULT_TESTS } from '../../geral/lib/microbioUtils';
import { motion, AnimatePresence } from 'motion/react';
import { printMicrobioReports } from './components/ReportTemplate';

// Import modular sub-components
import { ReportCreationFlow } from './components/ReportCreationFlow';
import { CalendarTab } from './components/CalendarTab';
import AppLayout from '../../geral/components/layout/AppLayout';
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
  const [activeTab, setActiveTab] = useState<'new' | 'calendar' | 'history' | 'settings'>('new');
  const [selectedReportIds, setSelectedReportIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const tabLabels: Record<string, string> = {
      new: 'Gerar Lote',
      calendar: 'Calendário de Produção',
      history: 'Histórico de Laudos',
      settings: 'Configurações'
    };
    (window as any).__current_page__ = tabLabels[activeTab] || activeTab;
  }, [activeTab]);

  // Data State
  const [reports, setReports] = useState<Report[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);

  const [technicianName, setTechnicianName] = useState(() => {
    return localStorage.getItem('natum_hub_microbio_technician') || '';
  });

  const handleTechnicianChange = (name: string) => {
    setTechnicianName(name);
    try {
      localStorage.setItem('natum_hub_microbio_technician', name);
    } catch (_) {}
  };

  const [dailyDate, setDailyDate] = useState(() => {
    return localStorage.getItem('natum_hub_microbio_daily_date') || format(new Date(), 'yyyy-MM-dd');
  });

  const handleDailyDateChange = (d: string) => {
    setDailyDate(d);
    try {
      localStorage.setItem('natum_hub_microbio_daily_date', d);
    } catch (_) {}
  };

  useEffect(() => {
    const u = getAuthUser();
    setUser(u);
    const saved = localStorage.getItem('natum_hub_microbio_technician');
    if (!saved && u?.displayName) {
      handleTechnicianChange(u.displayName);
    }
    setLoading(false);
  }, []);

  const fetchData = async () => {
    if (!user) return;
    try {
      const [reps, conf, prods] = await Promise.all([
        api.getReports(),
        api.getMicrobioConfig(),
        api.getProducts().catch(() => []),
      ]);
      setReports(reps);
      if (prods) setProducts(prods);

      if (conf) {
        setConfig(conf);
        const saved = localStorage.getItem('natum_hub_microbio_technician');
        if (!saved && conf.template?.defaultTechnician) {
          handleTechnicianChange(conf.template.defaultTechnician);
        }
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
            defaultTechnician: 'EDSON FERRARI',
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
    if (user) fetchData();
  }, [user]);

  const handlePrint = async (reportOrReports: Report | Report[]) => {
    printMicrobioReports(reportOrReports, products, config?.template);
    const list = Array.isArray(reportOrReports) ? reportOrReports : [reportOrReports];
    const ids = list.map((r) => r.id).filter(Boolean) as string[];
    if (ids.length > 0) {
      try {
        await api.markReportsPrinted(ids, true);
        fetchData();
      } catch (e) {
        console.error('Error marking reports as printed:', e);
      }
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

  const sidebarItems = [
    { id: 'new', label: 'Gerar Lote', icon: FilePlus },
    { id: 'calendar', label: 'Calendário', icon: CalendarIcon },
    { id: 'history', label: 'Histórico', icon: History },
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
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={(id: any) => setActiveTab(id)}
      headerActions={headerActions}
    >
      <AnimatePresence mode="wait">
        {activeTab === 'new' && (
          <motion.div key="new" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <ReportCreationFlow
              existingReports={reports}
              config={config}
              technicianName={technicianName}
              setTechnicianName={handleTechnicianChange}
              dailyDate={dailyDate}
              setDailyDate={handleDailyDateChange}
              onReportGenerated={handlePrint}
              onSaved={fetchData}
            />
          </motion.div>
        )}
        {activeTab === 'calendar' && (
          <motion.div key="calendar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <CalendarTab
              reports={reports}
              products={products}
              templateConfig={config?.template}
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
        {activeTab === 'settings' && (
          <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <SettingsTab config={config} reports={reports} onRefresh={fetchData} />
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
