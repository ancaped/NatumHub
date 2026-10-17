import { apiJson } from '../../../geral/lib/http';
import type { LabelTemplate } from './types';

export interface LabelPrintHistoryItem {
  id: string;
  template_id?: string | null;
  template_name: string;
  product_code?: string | null;
  product_name?: string | null;
  lot_number?: string | null;
  operator_id?: string | null;
  operator_name?: string | null;
  copies: number;
  printer_name?: string | null;
  printed_at: string;
}

export interface CatalogProduct {
  codigo: string;
  descricao: string;
  codigo_barras?: string | null;
  codigo_barras_caixa?: string | null;
  quantidade_caixa?: number | null;
  linha?: string | null;
  categoria?: string | null;
}

export interface ProductionLot {
  id: number;
  codigo: string;
  descricao: string;
  lote: string;
  quantidade: number;
  data_producao?: string | null;
  codigo_barras?: string | null;
  codigo_barras_caixa?: string | null;
}

export interface RecordPrintPayload {
  template_id?: string;
  template_name: string;
  product_code?: string;
  product_name?: string;
  lot_number?: string;
  copies?: number;
  printer_name?: string;
}

export const labelsApi = {
  async listTemplates(): Promise<LabelTemplate[]> {
    try {
      const data = await apiJson<any[]>('/api/ferramentas/etiquetas/templates');
      if (!Array.isArray(data)) return [];
      return data.map((t) => ({
        id: String(t.id),
        name: t.name,
        description: t.description || undefined,
        category: t.category || 'custom',
        width_mm: Number(t.width_mm || t.widthMm || 100),
        height_mm: Number(t.height_mm || t.heightMm || 50),
        orientation: t.orientation || 'landscape',
        elements_json: Array.isArray(t.elements_json)
          ? t.elements_json
          : Array.isArray(t.elementsJson)
          ? t.elementsJson
          : [],
        is_default: Boolean(t.is_default || t.isDefault),
        created_at: t.created_at || t.createdAt,
        updated_at: t.updated_at || t.updatedAt,
      }));
    } catch {
      return [];
    }
  },

  async saveTemplate(template: Partial<LabelTemplate>): Promise<LabelTemplate> {
    if (template.id && !template.id.startsWith('template_') && !template.id.startsWith('custom_')) {
      return apiJson<LabelTemplate>(`/api/ferramentas/etiquetas/templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      });
    }
    return apiJson<LabelTemplate>('/api/ferramentas/etiquetas/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
  },

  async deleteTemplate(id: string): Promise<void> {
    await apiJson(`/api/ferramentas/etiquetas/templates/${id}`, {
      method: 'DELETE',
    });
  },

  async listHistory(limit = 200): Promise<LabelPrintHistoryItem[]> {
    try {
      const data = await apiJson<LabelPrintHistoryItem[]>(`/api/ferramentas/etiquetas/history?limit=${limit}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  async recordPrint(payload: RecordPrintPayload): Promise<LabelPrintHistoryItem> {
    return apiJson<LabelPrintHistoryItem>('/api/ferramentas/etiquetas/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async listCatalogProducts(): Promise<CatalogProduct[]> {
    try {
      const data = await apiJson<CatalogProduct[]>('/api/ferramentas/etiquetas/catalog-products');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  async listProductionLots(): Promise<ProductionLot[]> {
    try {
      const data = await apiJson<ProductionLot[]>('/api/ferramentas/etiquetas/production-lots');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },
};
