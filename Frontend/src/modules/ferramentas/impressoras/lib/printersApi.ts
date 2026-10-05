import { apiJson } from '../../../geral/lib/http';
import type {
  HubPrinter,
  CreatePrinterPayload,
  UpdatePrinterPayload,
  SystemPrinterInfo,
  HubPrintJob,
  CreatePrintJobPayload,
} from './types';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export const printersApi = {
  async listPrinters(): Promise<HubPrinter[]> {
    const res = await apiJson<ApiResponse<HubPrinter[]>>('/api/ferramentas/impressoras');
    if (!res.success && res.error) throw new Error(res.error);
    return res.data || [];
  },

  async getPrinter(id: string): Promise<HubPrinter> {
    const res = await apiJson<ApiResponse<HubPrinter>>(`/api/ferramentas/impressoras/${id}`);
    if (!res.success && res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Impressora não encontrada');
    return res.data;
  },

  async createPrinter(payload: CreatePrinterPayload): Promise<HubPrinter> {
    const res = await apiJson<ApiResponse<HubPrinter>>('/api/ferramentas/impressoras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.success && res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Erro ao criar impressora');
    return res.data;
  },

  async updatePrinter(id: string, payload: UpdatePrinterPayload): Promise<HubPrinter> {
    const res = await apiJson<ApiResponse<HubPrinter>>(`/api/ferramentas/impressoras/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.success && res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Erro ao atualizar impressora');
    return res.data;
  },

  async deletePrinter(id: string): Promise<void> {
    const res = await apiJson<ApiResponse<{ deleted: boolean }>>(`/api/ferramentas/impressoras/${id}`, {
      method: 'DELETE',
    });
    if (!res.success && res.error) throw new Error(res.error);
  },

  async scanSystemPrinters(): Promise<SystemPrinterInfo[]> {
    const res = await apiJson<ApiResponse<SystemPrinterInfo[]>>('/api/ferramentas/impressoras/system-scan');
    if (!res.success && res.error) throw new Error(res.error);
    return res.data || [];
  },

  async listPrintJobs(limit = 50): Promise<HubPrintJob[]> {
    const res = await apiJson<ApiResponse<HubPrintJob[]>>(`/api/ferramentas/impressoras/jobs?limit=${limit}`);
    if (!res.success && res.error) throw new Error(res.error);
    return res.data || [];
  },

  async createPrintJob(payload: CreatePrintJobPayload): Promise<HubPrintJob> {
    const res = await apiJson<ApiResponse<HubPrintJob>>('/api/ferramentas/impressoras/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.success && res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Erro ao enfileirar impressão');
    return res.data;
  },

  async printDirect(payload: {
    printer_name: string;
    width_mm: number;
    height_mm: number;
    copies: number;
    landscape: boolean;
    fill_scale: number;
    pages_png_base64: string[];
  }): Promise<void> {
    const res = await apiJson<ApiResponse<{ printed: boolean }>>('/api/ferramentas/impressoras/direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.success && res.error) throw new Error(res.error);
  },

  async cancelPrintJob(id: string): Promise<void> {
    const res = await apiJson<ApiResponse<{ cancelled: boolean }>>(`/api/ferramentas/impressoras/jobs/${id}/cancel`, {
      method: 'POST',
    });
    if (!res.success && res.error) throw new Error(res.error);
  },
};
