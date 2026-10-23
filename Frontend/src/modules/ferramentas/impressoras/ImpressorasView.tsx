import React, { useState, useEffect, useMemo } from 'react';
import {
  Printer,
  Plus,
  RefreshCw,
  Search,
  Clock,
  Settings,
  Trash2,
  Edit2,
  Loader2,
  X,
  Check,
  Play,
  RotateCw,
  Network,
  Monitor,
  AlertCircle,
  CheckCircle2,
  Terminal,
} from 'lucide-react';
import AppLayout, { type SidebarItem } from '../../geral/components/layout/AppLayout';
import { printersApi } from './lib/printersApi';
import type {
  HubPrinter,
  CreatePrinterPayload,
  UpdatePrinterPayload,
  SystemPrinterInfo,
  HubPrintJob,
  PrinterType,
  ConnectionType,
  RawProtocol,
  NetworkComputerInfo,
  RemoteDiscoveredPrinter,
} from './lib/types';
import { printLabelDirect } from '../etiquetas/lib/directPrint';
import type { LabelTemplate } from '../etiquetas/lib/types';

interface ImpressorasViewProps {
  onBackToHub?: () => void;
}

export default function ImpressorasView({ onBackToHub }: ImpressorasViewProps) {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [printers, setPrinters] = useState<HubPrinter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modals & Panels
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<HubPrinter | null>(null);
  const [systemPrinters, setSystemPrinters] = useState<SystemPrinterInfo[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [printJobs, setPrintJobs] = useState<HubPrintJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Remote / Network discovery state
  const [networkComputers, setNetworkComputers] = useState<NetworkComputerInfo[]>([]);
  const [loadingComputers, setLoadingComputers] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState('');
  const [remotePrinters, setRemotePrinters] = useState<RemoteDiscoveredPrinter[]>([]);
  const [isRemoteScanning, setIsRemoteScanning] = useState(false);
  const [remoteScanError, setRemoteScanError] = useState<string | null>(null);
  const [connectingPrinter, setConnectingPrinter] = useState<string | null>(null);
  const [remoteConnectSuccess, setRemoteConnectSuccess] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<CreatePrinterPayload>({
    name: '',
    system_printer_name: '',
    printer_type: 'thermal_label',
    connection_type: 'local_spooler',
    ip_address: '',
    default_width_mm: 100,
    default_height_mm: 50,
    default_orientation: 'landscape',
    dpi: 300,
    location: '',
    is_default: false,
    raw_protocol: 'spooler_native',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  // Fetch printers
  const fetchPrinters = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await printersApi.listPrinters();
      setPrinters(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar impressoras.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch system scanner
  const handleScanSystem = async () => {
    try {
      setIsScanning(true);
      const data = await printersApi.scanSystemPrinters();
      setSystemPrinters(data);
    } catch (err: any) {
      console.warn('Erro ao escanear impressoras do sistema:', err);
    } finally {
      setIsScanning(false);
    }
  };

  // Fetch jobs
  const fetchJobs = async () => {
    try {
      setLoadingJobs(true);
      const jobs = await printersApi.listPrintJobs(100);
      setPrintJobs(jobs);
    } catch (err: any) {
      console.warn('Erro ao carregar fila de impressão:', err);
    } finally {
      setLoadingJobs(false);
    }
  };

  // Fetch network computers
  const handleFetchComputers = async () => {
    try {
      setLoadingComputers(true);
      const list = await printersApi.listNetworkComputers();
      setNetworkComputers(list);
    } catch (err: any) {
      console.warn('Erro ao listar computadores da rede:', err);
    } finally {
      setLoadingComputers(false);
    }
  };

  // Scan remote computer
  const handleScanRemote = async (target: string) => {
    if (!target.trim()) return;
    try {
      setIsRemoteScanning(true);
      setRemoteScanError(null);
      setRemotePrinters([]);
      setRemoteConnectSuccess(null);
      const list = await printersApi.scanRemotePrinters(target.trim());
      setRemotePrinters(list);
      if (list.length === 0) {
        setRemoteScanError(
          `Nenhuma impressora compartilhada foi encontrada em "${target}". Certifique-se de executar o script "scripts\\preparar_compartilhamento_impressoras.bat" no computador onde a impressora USB está conectada para liberar o compartilhamento.`
        );
      }
    } catch (err: any) {
      setRemoteScanError(err.message || `Erro ao consultar computador "${target}".`);
    } finally {
      setIsRemoteScanning(false);
    }
  };

  // Connect remote printer
  const handleConnectRemote = async (p: RemoteDiscoveredPrinter) => {
    try {
      setConnectingPrinter(p.unc_path);
      setRemoteScanError(null);
      const created = await printersApi.connectRemotePrinter({
        unc_path: p.unc_path,
        display_name: p.name,
        printer_type: p.is_thermal ? 'thermal_label' : 'laser_a4',
        default_width_mm: p.is_thermal ? 100 : 210,
        default_height_mm: p.is_thermal ? 50 : 297,
      });
      setRemoteConnectSuccess(`Impressora "${created.name}" conectada e cadastrada com sucesso!`);
      await fetchPrinters();
    } catch (err: any) {
      setRemoteScanError(err.message || 'Falha ao conectar impressora remota.');
    } finally {
      setConnectingPrinter(null);
    }
  };

  useEffect(() => {
    fetchPrinters();
    handleScanSystem();
    fetchJobs();
    handleFetchComputers();
  }, []);

  // Counts for Sidebar
  const counts = useMemo(() => {
    const total = printers.length;
    const online = printers.filter((p) => p.status === 'online').length;
    const offline = printers.filter((p) => p.status === 'offline').length;
    const thermal = printers.filter((p) => p.printer_type === 'thermal_label').length;
    const laser = printers.filter((p) => p.printer_type === 'laser_a4' || p.printer_type === 'inkjet').length;
    const jobs = printJobs.filter((j) => j.status === 'pending' || j.status === 'printing').length;
    const scanned = systemPrinters.length;
    return { total, online, offline, thermal, laser, jobs, scanned };
  }, [printers, printJobs, systemPrinters]);

  // Sidebar Items
  const sidebarItems: SidebarItem[] = [
    { id: 'all', label: 'Cadastradas', icon: Printer, badge: counts.total },
    { id: 'network', label: 'Outros PCs (USB/Rede)', icon: Network, badge: networkComputers.length > 0 ? networkComputers.length : undefined },
    { id: 'scan', label: 'Spooler Servidor', icon: RefreshCw, badge: counts.scanned },
    { id: 'jobs', label: 'Histórico', icon: Clock, badge: counts.jobs },
  ];

  // Filtered printers list
  const filteredPrinters = useMemo(() => {
    return printers.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.system_printer_name && p.system_printer_name.toLowerCase().includes(search.toLowerCase())) ||
        (p.location && p.location.toLowerCase().includes(search.toLowerCase()));

      let matchCategory = true;
      if (activeTab === 'online') matchCategory = p.status === 'online';
      else if (activeTab === 'offline') matchCategory = p.status === 'offline';
      else if (activeTab === 'thermal') matchCategory = p.printer_type === 'thermal_label';
      else if (activeTab === 'laser') matchCategory = p.printer_type === 'laser_a4' || p.printer_type === 'inkjet';

      return matchSearch && matchCategory;
    });
  }, [printers, search, activeTab]);

  // Handle open add modal
  const handleOpenAdd = (preset?: Partial<CreatePrinterPayload>) => {
    setEditingPrinter(null);
    setFormData({
      name: preset?.name || '',
      system_printer_name: preset?.system_printer_name || '',
      printer_type: preset?.printer_type || 'thermal_label',
      connection_type: preset?.connection_type || 'local_spooler',
      ip_address: preset?.ip_address || '',
      default_width_mm: preset?.default_width_mm || 100,
      default_height_mm: preset?.default_height_mm || 50,
      default_orientation: preset?.default_orientation || 'landscape',
      dpi: preset?.dpi || 300,
      location: preset?.location || '',
      is_default: preset?.is_default || false,
      raw_protocol: preset?.raw_protocol || 'spooler_native',
      notes: preset?.notes || '',
    });
    setIsEditModalOpen(true);
  };

  // Handle open edit modal
  const handleOpenEdit = (printer: HubPrinter) => {
    setEditingPrinter(printer);
    setFormData({
      name: printer.name,
      system_printer_name: printer.system_printer_name || '',
      printer_type: printer.printer_type,
      connection_type: printer.connection_type,
      ip_address: printer.ip_address || '',
      default_width_mm: printer.default_width_mm,
      default_height_mm: printer.default_height_mm,
      default_orientation: printer.default_orientation,
      dpi: printer.dpi,
      location: printer.location || '',
      is_default: printer.is_default,
      raw_protocol: printer.raw_protocol,
      notes: printer.notes || '',
    });
    setIsEditModalOpen(true);
  };

  // Handle save printer
  const handleSavePrinter = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      if (editingPrinter) {
        await printersApi.updatePrinter(editingPrinter.id, formData);
      } else {
        await printersApi.createPrinter(formData);
      }
      setIsEditModalOpen(false);
      await fetchPrinters();
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar impressora.');
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja remover a impressora "${name}"?`)) return;
    try {
      await printersApi.deletePrinter(id);
      await fetchPrinters();
    } catch (err: any) {
      alert(err.message || 'Erro ao remover impressora.');
    }
  };

  // Run test calibration print
  const handleTestPrint = (printer: HubPrinter) => {
    const testTemplate: LabelTemplate = {
      id: `test_${printer.id}`,
      name: `Teste de Calibração - ${printer.name}`,
      category: 'custom',
      width_mm: printer.default_width_mm || 100,
      height_mm: printer.default_height_mm || 50,
      orientation: printer.default_orientation || 'landscape',
      elements_json: [
        {
          id: 'test_box',
          type: 'box',
          x_mm: 0,
          y_mm: 0,
          width_mm: printer.default_width_mm || 100,
          height_mm: printer.default_height_mm || 50,
          zIndex: 1,
          props: {
            borderWidth: 0.4,
            borderColor: '#000000',
            backgroundColor: 'transparent',
            borderRadius: 0,
          },
        },
        {
          id: 'test_title',
          type: 'text',
          x_mm: 4,
          y_mm: 4,
          width_mm: (printer.default_width_mm || 100) - 8,
          height_mm: 8,
          zIndex: 2,
          props: {
            text: 'NÁTUM COSMÉTICOS · TESTE 100% OK',
            fontSize: 12,
            fontWeight: 'bold',
            textAlign: 'center',
          },
        },
        {
          id: 'test_sub',
          type: 'text',
          x_mm: 4,
          y_mm: 12,
          width_mm: (printer.default_width_mm || 100) - 8,
          height_mm: 6,
          zIndex: 2,
          props: {
            text: `Dispositivo: ${printer.name} (${printer.default_width_mm}x${printer.default_height_mm}mm)`,
            fontSize: 9,
            textAlign: 'center',
          },
        },
        {
          id: 'test_bar',
          type: 'barcode',
          x_mm: 15,
          y_mm: 20,
          width_mm: (printer.default_width_mm || 100) - 30,
          height_mm: 16,
          zIndex: 2,
          props: { value: '7898553231964', barcodeType: 'CODE128', showText: true },
        },
        {
          id: 'test_footer',
          type: 'text',
          x_mm: 4,
          y_mm: (printer.default_height_mm || 50) - 8,
          width_mm: (printer.default_width_mm || 100) - 8,
          height_mm: 5,
          zIndex: 2,
          props: {
            text: `Data: ${new Date().toLocaleString('pt-BR')} · DPI: ${printer.dpi}`,
            fontSize: 8,
            textAlign: 'center',
          },
        },
      ],
      is_default: false,
    };

    void printLabelDirect(
      testTemplate,
      { copies: 1, enableSequence: false, sequenceStart: 1, sequenceTotal: 1, sequencePadding: 2 },
      printer
    ).catch((err: any) => alert(err?.message || 'Não foi possível imprimir o teste.'));
  };

  return (
    <AppLayout
      moduleTitle="Impressoras"
      onBackToHub={onBackToHub || (() => {})}
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={(id: string) => setActiveTab(id)}
    >
      <div className="flex-1 p-6 overflow-y-auto font-sans">
        {/* TABS: PRINTERS LIST (all, online, offline, thermal, laser) */}
        {activeTab !== 'jobs' && activeTab !== 'scan' && activeTab !== 'network' && (
          <div className="space-y-4">
            {/* Top Control Bar */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="relative w-full sm:w-80">
                <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar impressora na lista..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                <button
                  type="button"
                  onClick={fetchPrinters}
                  className="p-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl transition-colors cursor-pointer"
                  title="Atualizar lista"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('network');
                    handleFetchComputers();
                  }}
                  className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold px-3.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer shadow-2xs"
                >
                  <Network className="h-3.5 w-3.5 text-blue-600" />
                  <span>Outros PCs (USB/Rede)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('scan')}
                  className="flex items-center gap-1.5 bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 font-bold px-3.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer shadow-2xs"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-zinc-600" />
                  <span>Spooler Servidor</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenAdd()}
                  className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-3.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer shadow-2xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Adicionar Impressora</span>
                </button>
              </div>
            </div>

            {/* Printers Table List */}
            <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-600 font-bold uppercase text-[10px] tracking-wider">
                    <th className="p-3.5">Nome da Impressora</th>
                    <th className="p-3.5">Fila do Windows / IP</th>
                    <th className="p-3.5">Tipo & Conexão</th>
                    <th className="p-3.5">Local / Setor</th>
                    <th className="p-3.5 text-center">Tamanho Padrão</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-700">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-zinc-400">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-900" />
                        <span className="text-xs block mt-2">Carregando impressoras...</span>
                      </td>
                    </tr>
                  ) : filteredPrinters.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-zinc-400 text-xs">
                        Nenhuma impressora encontrada neste filtro.
                      </td>
                    </tr>
                  ) : (
                    filteredPrinters.map((p) => (
                      <tr key={p.id} className="hover:bg-zinc-50/80 transition-colors">
                        {/* Name & Badge */}
                        <td className="p-3.5">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-zinc-100 text-zinc-700 rounded-lg shrink-0">
                              <Printer className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-zinc-900">{p.name}</span>
                                {p.is_default && (
                                  <span className="text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded">
                                    Padrão
                                  </span>
                                )}
                              </div>
                              {p.notes && <span className="text-[10px] text-zinc-400 block">{p.notes}</span>}
                            </div>
                          </div>
                        </td>

                        {/* Windows System Name / IP */}
                        <td className="p-3.5 font-mono text-[11px] text-zinc-600">
                          {p.system_printer_name || p.ip_address || 'Spooler Padrão'}
                        </td>

                        {/* Type & Connection */}
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5">
                            {p.printer_type === 'thermal_label' ? (
                              <span className="text-[10px] font-bold bg-zinc-100 text-zinc-800 border border-zinc-200 px-2 py-0.5 rounded-full">
                                Térmica
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold bg-zinc-100 text-zinc-700 border border-zinc-200 px-2 py-0.5 rounded-full">
                                Documentos
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-zinc-500">
                              {p.connection_type === 'local_spooler' ? 'USB / Spooler' : 'Rede TCP'}
                            </span>
                          </div>
                        </td>

                        {/* Location */}
                        <td className="p-3.5 text-zinc-600 font-medium">{p.location || 'Almoxarifado'}</td>

                        {/* Default Size */}
                        <td className="p-3.5 text-center font-mono text-[11px] font-bold text-zinc-800">
                          {p.default_width_mm}x{p.default_height_mm}mm
                        </td>

                        {/* Status */}
                        <td className="p-3.5 text-center">
                          {(() => {
                            const known = systemPrinters.some(
                              (item) => item.name.toLowerCase() === (p.system_printer_name || '').toLowerCase()
                            );
                            const label = systemPrinters.length === 0
                              ? 'Sem varredura'
                              : known
                                ? 'No Windows'
                                : 'Fora do Windows';
                            const ok = known;
                            return (
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  ok
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}
                              >
                                {label}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Actions */}
                        <td className="p-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleTestPrint(p)}
                              className="flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs active:scale-98"
                              title="Imprimir etiqueta de calibração milimétrica"
                            >
                              <Play className="h-3 w-3 text-emerald-400" />
                              <span>Teste</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenEdit(p)}
                              className="p-1.5 bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-lg cursor-pointer transition-colors"
                              title="Editar configurações"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(p.id, p.name)}
                              className="p-1.5 bg-white hover:bg-red-50 text-zinc-400 hover:text-red-600 border border-zinc-200 rounded-lg cursor-pointer transition-colors"
                              title="Remover impressora"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: PRINT JOBS QUEUE */}
        {activeTab === 'jobs' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900">Fila de Impressão Remota</h3>
                <p className="text-xs text-zinc-500">Monitoramento e status de trabalhos de impressão enviados</p>
              </div>
              <button
                type="button"
                onClick={fetchJobs}
                className="px-3.5 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Atualizar Fila
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-600 font-bold uppercase text-[10px] tracking-wider">
                    <th className="p-3.5">Data / Hora</th>
                    <th className="p-3.5">Trabalho / Título</th>
                    <th className="p-3.5">Impressora</th>
                    <th className="p-3.5 text-center">Cópias</th>
                    <th className="p-3.5">Operador</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-700">
                  {loadingJobs ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-zinc-400">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-900" />
                        <span className="text-xs block mt-2">Carregando fila...</span>
                      </td>
                    </tr>
                  ) : printJobs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-zinc-400 text-xs">
                        Nenhum trabalho de impressão na fila.
                      </td>
                    </tr>
                  ) : (
                    printJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-zinc-50/70 transition-colors">
                        <td className="p-3.5 font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                          {new Date(job.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-3.5 font-bold text-zinc-900">{job.title}</td>
                        <td className="p-3.5 font-medium text-zinc-700">{job.printer_name}</td>
                        <td className="p-3.5 text-center font-bold text-zinc-900">{job.copies} un.</td>
                        <td className="p-3.5 text-zinc-600">{job.operator_name || 'Operador'}</td>
                        <td className="p-3.5 text-center">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              job.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : job.status === 'failed'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {job.status === 'completed'
                              ? 'Concluído'
                              : job.status === 'failed'
                              ? 'Falhou'
                              : 'Pendente'}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          {job.status === 'pending' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await printersApi.cancelPrintJob(job.id);
                                fetchJobs();
                              }}
                              className="px-2.5 py-1 bg-white hover:bg-red-50 text-red-600 border border-zinc-200 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                            >
                              Cancelar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: WINDOWS SYSTEM SCANNER */}
        {activeTab === 'scan' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900">Impressoras Detectadas no Windows</h3>
                <p className="text-xs text-zinc-500">Dispositivos encontrados no spooler do sistema operacional</p>
              </div>
              <button
                type="button"
                onClick={handleScanSystem}
                disabled={isScanning}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'Escaneando...' : 'Reescanear Windows'}</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-600 font-bold uppercase text-[10px] tracking-wider">
                    <th className="p-3.5">Nome no Spooler</th>
                    <th className="p-3.5">Driver / Fabricante</th>
                    <th className="p-3.5">Porta</th>
                    <th className="p-3.5 text-center">Tipo</th>
                    <th className="p-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-700">
                  {isScanning ? (
                    <tr>
                      <td colSpan={5} className="py-16 text-center text-zinc-400">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-900" />
                        <span className="text-xs block mt-2">Consultando spooler do Windows via PowerShell...</span>
                      </td>
                    </tr>
                  ) : systemPrinters.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-zinc-400 text-xs">
                        Nenhuma impressora retornada pelo spooler.
                      </td>
                    </tr>
                  ) : (
                    systemPrinters.map((sys, idx) => {
                      const alreadyImported = printers.some((p) => p.system_printer_name === sys.name);

                      return (
                        <tr key={idx} className="hover:bg-zinc-50/70 transition-colors">
                          <td className="p-3.5">
                            <div className="flex items-center gap-2">
                              <Printer className="h-4 w-4 text-zinc-500" />
                              <span className="font-bold text-zinc-900">{sys.name}</span>
                              {sys.is_default && (
                                <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.2 rounded font-bold">
                                  Padrão Windows
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 text-zinc-600 font-mono text-[11px]">{sys.driver_name || '-'}</td>
                          <td className="p-3.5 text-zinc-600 font-mono text-[11px]">{sys.port_name || '-'}</td>
                          <td className="p-3.5 text-center">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700">
                              {sys.is_network ? '🌐 Rede' : '🔌 USB / Local'}
                            </span>
                          </td>
                          <td className="p-3.5 text-right">
                            {alreadyImported ? (
                              <span className="text-[11px] font-bold text-emerald-600 flex items-center justify-end gap-1">
                                <Check className="h-3.5 w-3.5" />
                                <span>Cadastrada</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenAdd({
                                    name: sys.name,
                                    system_printer_name: sys.name,
                                    connection_type: sys.is_network ? 'network_tcp' : 'local_spooler',
                                    printer_type: sys.name.toLowerCase().includes('zebra') || sys.name.toLowerCase().includes('thermal') || sys.name.toLowerCase().includes('elgin') || sys.name.toLowerCase().includes('label')
                                      ? 'thermal_label'
                                      : 'laser_a4',
                                  })
                                }
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer shadow-2xs"
                              >
                                + Importar para o Hub
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: NETWORK / OTHER PCS PRINTERS (USB SHARED) */}
        {activeTab === 'network' && (
          <div className="space-y-4">
            {/* Header Card */}
            <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <Network className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-900">Buscar Impressoras USB em Outros Computadores</h3>
                    <p className="text-xs text-zinc-500">
                      Localize e conecte impressoras USB instaladas em outras estações de trabalho da empresa.
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleFetchComputers}
                disabled={loadingComputers}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold rounded-xl transition-colors cursor-pointer self-start md:self-auto disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingComputers ? 'animate-spin' : ''}`} />
                <span>Atualizar Lista de PCs</span>
              </button>
            </div>

            {/* Script Helper Card */}
            <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 text-xs text-blue-900 flex flex-col sm:flex-row items-start gap-3 shadow-2xs">
              <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0 mt-0.5">
                <Terminal className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-blue-950">
                  <span>Como liberar a impressora USB no outro computador:</span>
                </div>
                <p className="text-blue-800 leading-relaxed text-[11px]">
                  No computador onde a impressora USB está fisicamente plugada, execute o arquivo{' '}
                  <code className="px-1.5 py-0.5 bg-blue-100/90 rounded font-mono font-bold text-blue-900 border border-blue-200">
                    C:\api\scripts\preparar_compartilhamento_impressoras.bat
                  </code>
                  . Ele libera o compartilhamento, abre o firewall e destrava a permissão do Windows (PrintNightmare) automaticamente em 1 clique.
                </p>
              </div>
            </div>

            {/* Search & Device Selection */}
            <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-800 block mb-1.5">
                  Informe o Nome ou IP do Computador com a Impressora USB:
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Monitor className="h-4 w-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Ex: 192.168.101.114 ou PC-EXPEDICAO"
                      value={selectedTarget}
                      onChange={(e) => setSelectedTarget(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleScanRemote(selectedTarget);
                      }}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-50 border border-zinc-300 rounded-xl focus:outline-none focus:border-blue-600 font-mono font-medium"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleScanRemote(selectedTarget)}
                    disabled={isRemoteScanning || !selectedTarget.trim()}
                    className="flex items-center justify-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                  >
                    {isRemoteScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    <span>{isRemoteScanning ? 'Consultando...' : 'Buscar Impressoras'}</span>
                  </button>
                </div>
              </div>

              {/* Discovered Machines Pills */}
              {networkComputers.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-2">
                    Computadores ativos detectados na rede local (Clique para selecionar):
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                    {networkComputers.map((comp, idx) => {
                      const target = comp.hostname || comp.ip;
                      const isSel = selectedTarget === comp.ip || selectedTarget === comp.hostname;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setSelectedTarget(target);
                            handleScanRemote(target);
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition-colors cursor-pointer ${
                            isSel
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200'
                          }`}
                        >
                          <Monitor className="h-3 w-3" />
                          <span>{comp.hostname ? `${comp.hostname} (${comp.ip})` : comp.ip}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Alerts / Feedback */}
              {remoteConnectSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{remoteConnectSuccess}</span>
                </div>
              )}

              {remoteScanError && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold block">Aviso na busca:</span>
                    <span className="text-[11px]">{remoteScanError}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Discovered Printers Results */}
            {remotePrinters.length > 0 && (
              <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-zinc-100 bg-zinc-50/80 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-zinc-900">
                    Impressoras Compartilhadas em {selectedTarget} ({remotePrinters.length} encontrada{remotePrinters.length > 1 ? 's' : ''}):
                  </h4>
                </div>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50/50 text-zinc-600 font-bold uppercase text-[10px] tracking-wider">
                      <th className="p-3.5">Nome / Compartilhamento</th>
                      <th className="p-3.5">Caminho de Rede (UNC)</th>
                      <th className="p-3.5 text-center">Tipo Estimado</th>
                      <th className="p-3.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-zinc-700">
                    {remotePrinters.map((rp, idx) => {
                      const already = printers.some(
                        (p) => (p.system_printer_name || '').toLowerCase() === rp.unc_path.toLowerCase()
                      );
                      const isConnecting = connectingPrinter === rp.unc_path;

                      return (
                        <tr key={idx} className="hover:bg-zinc-50/70 transition-colors">
                          <td className="p-3.5">
                            <div className="flex items-center gap-2">
                              <Printer className="h-4 w-4 text-zinc-600" />
                              <span className="font-bold text-zinc-900">{rp.name}</span>
                            </div>
                          </td>
                          <td className="p-3.5 font-mono text-[11px] text-zinc-600">{rp.unc_path}</td>
                          <td className="p-3.5 text-center">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700">
                              {rp.is_thermal ? '🏷️ Térmica de Etiquetas' : '📄 Documentos A4'}
                            </span>
                          </td>
                          <td className="p-3.5 text-right">
                            {already ? (
                              <span className="text-[11px] font-bold text-emerald-600 inline-flex items-center gap-1">
                                <Check className="h-3.5 w-3.5" />
                                <span>Já Cadastrada</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleConnectRemote(rp)}
                                disabled={isConnecting}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer shadow-2xs disabled:opacity-50 ml-auto"
                              >
                                {isConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                <span>{isConnecting ? 'Conectando...' : 'Conectar e Cadastrar no Nexus'}</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/80 shrink-0">
              <div className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-zinc-800" />
                <h3 className="text-sm font-bold text-zinc-900">
                  {editingPrinter ? 'Editar Impressora' : 'Cadastrar Nova Impressora'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSavePrinter} className="p-5 overflow-y-auto space-y-4 text-xs text-zinc-700">
              <div>
                <label className="text-xs font-bold text-zinc-900 block mb-1">Nome no Nexus:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Zebra Térmica Expedição (100x50mm)"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 border border-zinc-300 rounded-xl bg-zinc-50 focus:bg-white font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-900 block mb-1">
                  Nome do Dispositivo no Windows (Spooler):
                </label>
                <input
                  type="text"
                  placeholder="Ex: ZDesigner ZD220-203dpi ZPL"
                  value={formData.system_printer_name || ''}
                  onChange={(e) => setFormData({ ...formData, system_printer_name: e.target.value })}
                  className="w-full p-2.5 border border-zinc-300 rounded-xl font-mono text-zinc-800 bg-zinc-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-900 block mb-1">Tipo de Impressora:</label>
                  <select
                    value={formData.printer_type}
                    onChange={(e) => setFormData({ ...formData, printer_type: e.target.value as PrinterType })}
                    className="w-full p-2.5 border border-zinc-300 rounded-xl bg-zinc-50 font-medium"
                  >
                    <option value="thermal_label">🏷️ Térmica de Etiquetas</option>
                    <option value="laser_a4">📄 Laser / Jato A4</option>
                    <option value="network_raw">🌐 Rede Direta RAW</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-900 block mb-1">Tipo de Conexão:</label>
                  <select
                    value={formData.connection_type}
                    onChange={(e) => setFormData({ ...formData, connection_type: e.target.value as ConnectionType })}
                    className="w-full p-2.5 border border-zinc-300 rounded-xl bg-zinc-50 font-medium"
                  >
                    <option value="local_spooler">🔌 USB / Spooler Windows</option>
                    <option value="network_tcp">🌐 IP / TCP Direto</option>
                    <option value="server_shared">🖥️ Compartilhada Servidor</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-700 block mb-1">Largura (mm):</label>
                  <input
                    type="number"
                    value={formData.default_width_mm}
                    onChange={(e) => setFormData({ ...formData, default_width_mm: parseInt(e.target.value, 10) || 100 })}
                    className="w-full p-2 border border-zinc-300 rounded-xl font-mono font-bold text-center bg-zinc-50"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-zinc-700 block mb-1">Altura (mm):</label>
                  <input
                    type="number"
                    value={formData.default_height_mm}
                    onChange={(e) => setFormData({ ...formData, default_height_mm: parseInt(e.target.value, 10) || 50 })}
                    className="w-full p-2 border border-zinc-300 rounded-xl font-mono font-bold text-center bg-zinc-50"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-zinc-700 block mb-1">DPI:</label>
                  <input
                    type="number"
                    value={formData.dpi}
                    onChange={(e) => setFormData({ ...formData, dpi: parseInt(e.target.value, 10) || 203 })}
                    className="w-full p-2 border border-zinc-300 rounded-xl font-mono font-bold text-center bg-zinc-50"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-900 block mb-1">Setor / Localização:</label>
                <input
                  type="text"
                  placeholder="Ex: Bancada de Expedição 01"
                  value={formData.location || ''}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full p-2.5 border border-zinc-300 rounded-xl bg-zinc-50"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_default_check"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <label htmlFor="is_default_check" className="text-xs font-bold text-zinc-900 cursor-pointer">
                  Definir como impressora padrão do Nexus
                </label>
              </div>

              <div className="p-4 border-t border-zinc-100 flex items-center justify-end gap-2 pt-4 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar Impressora'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
