import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  DollarSign,
  Download,
  ExternalLink,
  Eye,
  FileText,
  History,
  Image as ImageIcon,
  Layers,
  Loader2,
  MessageSquare,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  Scissors,
  Share2,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Trash2,
  TrendingDown,
  Truck,
  Upload,
  Wrench,
  X,
  Zap,
  ZoomIn,
} from 'lucide-react';
import { apiFetch, apiJson } from '../../geral/lib/http';
import AppLayout from '../../geral/components/layout/AppLayout';
import Modal from '../../geral/components/ui/Modal';
import type {
  AlmoxOpsItem,
  Demand,
  DemandQuote,
  Equipment,
  ItemPurchaseHistory,
} from '../../estoque/ops/types';

interface Props {
  onBackToHub: () => void;
}

type TabMode = 'solicitacoes' | 'taloes' | 'manutencoes';
type SolicitacaoFiltro = 'todas' | 'pendentes' | 'cotacao' | 'comprar' | 'compradas' | 'recebidas' | 'canceladas';
type TalaoFiltro = 'todos' | 'impressos' | 'pendentes' | 'cotacao' | 'comprar' | 'compradas' | 'recebidas' | 'canceladas';
type ManutencaoFiltro = 'todas' | 'eletrica' | 'predial' | 'hidraulica' | 'climatizacao' | 'ti' | 'outras';

function labelOf(d: Demand) {
  const it = d.items?.[0];
  return d.title || it?.itemDescription || it?.description || it?.itemCode || 'Item de Almoxarifado';
}

function qtyOf(d: Demand) {
  if (d.qty != null) return d.qty;
  return d.items?.[0]?.qtyRequested ?? 1;
}

function isRecebida(d: Demand) {
  return d.status === 'recebida';
}

function isComprada(d: Demand) {
  return d.status === 'comprada' || (d.purchasedAt != null && d.status !== 'recebida' && d.status !== 'cancelada');
}

function parseQuotes(d: Demand): DemandQuote[] {
  if (d.quotes && Array.isArray(d.quotes) && d.quotes.length > 0) return d.quotes;
  if (!d.quotesJson) return [];
  try {
    const parsed = JSON.parse(d.quotesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isEmCotacao(d: Demand) {
  const q = parseQuotes(d);
  return (
    !isComprada(d) &&
    !isRecebida(d) &&
    d.status !== 'cancelada' &&
    (q.length > 0 || d.quotedValue != null || d.status === 'cotacao')
  );
}

function isTalao(d: Demand) {
  return d.origin === 'talao' || Boolean(d.trackingCode?.startsWith('SOL-'));
}

function isManutencao(d: Demand) {
  return (
    d.origin === 'manutencao_avulsa' ||
    d.origin === 'manutencao' ||
    Boolean(d.equipmentId) ||
    Boolean(d.equipmentName?.toLowerCase().includes('manutenção') || d.equipmentName?.toLowerCase().includes('manutencao'))
  );
}

function detectMaintCategory(d: Demand): 'eletrica' | 'predial' | 'hidraulica' | 'climatizacao' | 'ti' | 'outras' {
  const text = `${d.title || ''} ${d.equipmentName || ''} ${d.notes || ''} ${d.items?.map((i) => i.description || i.itemDescription || '').join(' ') || ''}`.toLowerCase();
  if (text.includes('elétr') || text.includes('eletri') || text.includes('fiação') || text.includes('disjuntor') || text.includes('quadro') || text.includes('lâmpada') || text.includes('tomada') || text.includes('cabo de força') || text.includes('rele') || text.includes('relé')) return 'eletrica';
  if (text.includes('predial') || text.includes('civil') || text.includes('parede') || text.includes('porta') || text.includes('piso') || text.includes('telhado') || text.includes('pintura') || text.includes('cimento') || text.includes('argamassa') || text.includes('fechadura')) return 'predial';
  if (text.includes('hidrául') || text.includes('hidraul') || text.includes('cano') || text.includes('vazamento') || text.includes('tubula') || text.includes('água') || text.includes('registro') || text.includes('torneira') || text.includes('válvula') || text.includes('valvula')) return 'hidraulica';
  if (text.includes('clima') || text.includes('ar-condicionado') || text.includes('ar condicionado') || text.includes('ventilador') || text.includes('exaustor') || text.includes('filtro de ar')) return 'climatizacao';
  if (text.includes('ti') || text.includes('rede') || text.includes('switch') || text.includes('roteador') || text.includes('computador') || text.includes('servidor') || text.includes('patch cord') || text.includes('internet')) return 'ti';
  return 'outras';
}

function maintCategoryBadge(cat: 'eletrica' | 'predial' | 'hidraulica' | 'climatizacao' | 'ti' | 'outras') {
  switch (cat) {
    case 'eletrica':
      return { label: 'Elétrica', cls: 'bg-amber-100 text-amber-900 border-amber-300 font-bold', emoji: '⚡' };
    case 'predial':
      return { label: 'Predial / Civil', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold', emoji: '🏢' };
    case 'hidraulica':
      return { label: 'Hidráulica', cls: 'bg-blue-100 text-blue-900 border-blue-300 font-bold', emoji: '💧' };
    case 'climatizacao':
      return { label: 'Climatização', cls: 'bg-cyan-100 text-cyan-900 border-cyan-300 font-bold', emoji: '❄️' };
    case 'ti':
      return { label: 'TI & Redes', cls: 'bg-purple-100 text-purple-900 border-purple-300 font-bold', emoji: '🌐' };
    default:
      return { label: 'Geral / Outras', cls: 'bg-zinc-100 text-zinc-800 border-zinc-300 font-bold', emoji: '🔧' };
  }
}

function isProntaComprar(d: Demand) {
  if (isComprada(d) || isRecebida(d) || d.status === 'cancelada') return false;
  const quotes = parseQuotes(d);
  return quotes.some((q) => q.selected) || d.quotedValue != null || d.status === 'comprando';
}

function formatMoney(v?: number | null) {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataBr(iso?: string | null) {
  if (!iso) return '—';
  const clean = iso.slice(0, 10);
  const [y, m, d] = clean.split('-');
  if (!y || !m || !d) return clean;
  return `${d}/${m}/${y}`;
}

function origemMeta(origin?: string | null) {
  if (origin === 'manutencao_avulsa') {
    return { label: 'Manutenção Avulsa', cls: 'bg-amber-100 text-amber-900 border-amber-300 font-bold' };
  }
  if (origin === 'talao') {
    return { label: 'Talão Físico', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold' };
  }
  if (origin === 'minimo') {
    return { label: 'Estoque Mínimo', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
  }
  if (origin === 'manutencao') {
    return { label: 'Manutenção / O.S.', cls: 'bg-blue-50 text-blue-800 border-blue-200' };
  }
  return { label: 'Manual / Avulso', cls: 'bg-zinc-100 text-zinc-700 border-zinc-200' };
}

function urgencyMeta(urgency?: string | null) {
  if (urgency === 'critica') {
    return { label: 'Crítica (Máq. Parada)', cls: 'bg-rose-100 text-rose-800 border-rose-300 font-bold' };
  }
  if (urgency === 'alta') {
    return { label: 'Alta Urgência', cls: 'bg-amber-100 text-amber-800 border-amber-300 font-semibold' };
  }
  if (urgency === 'baixa') {
    return { label: 'Baixa', cls: 'bg-zinc-100 text-zinc-600 border-zinc-200' };
  }
  return { label: 'Normal', cls: 'bg-zinc-100 text-zinc-700 border-zinc-200' };
}

function statusMeta(d: Demand) {
  if (d.status === 'cancelada') {
    return { label: 'Cancelada', cls: 'bg-zinc-100 text-zinc-500 border-zinc-200' };
  }
  if (d.status === 'impresso') {
    return { label: 'Talão Impresso (Aguardando Fábrica)', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold' };
  }
  if (isRecebida(d)) {
    return { label: 'Recebida no Almoxarifado', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold' };
  }
  if (isComprada(d)) {
    return { label: 'Comprada (Em Trânsito)', cls: 'bg-blue-50 text-blue-700 border-blue-200 font-semibold' };
  }
  const quotes = parseQuotes(d);
  const metrics = calcQuoteMetrics(quotes);
  if (metrics.winner && metrics.winner.totalPrice) {
    return { label: `Aprovado: ${metrics.winner.supplier || 'Loja'}`, cls: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold' };
  }
  if (quotes.length >= 3) {
    return { label: 'Cotação Concluída (3+)', cls: 'bg-indigo-50 text-indigo-800 border-indigo-300 font-bold' };
  }
  if (quotes.length > 0) {
    return { label: `Em Cotação (${quotes.length})`, cls: 'bg-amber-50 text-amber-800 border-amber-300 font-bold' };
  }
  return { label: 'Pendente de Cotação', cls: 'bg-zinc-100 text-zinc-700 border-zinc-300' };
}

function extractStoreNameFromUrl(url: string): string {
  try {
    let clean = url.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    const parsed = new URL(clean);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host.includes('mercadolivre')) return 'Mercado Livre';
    if (host.includes('amazon')) return 'Amazon';
    if (host.includes('magazineluiza') || host.includes('magalu')) return 'Magazine Luiza';
    if (host.includes('shopee')) return 'Shopee';
    if (host.includes('lojadomecanico')) return 'Loja do Mecânico';
    if (host.includes('kalunga')) return 'Kalunga';
    if (host.includes('leroymerlin')) return 'Leroy Merlin';
    if (host.includes('ferramentaskennedy')) return 'Ferramentas Kennedy';
    if (host.includes('aliexpress')) return 'AliExpress';
    if (host.includes('dutramaquinas')) return 'Dutra Máquinas';
    if (host.includes('casasbahia')) return 'Casas Bahia';
    if (host.includes('americanas')) return 'Americanas';
    if (host.includes('kabum')) return 'KaBuM!';
    if (host.includes('pichau')) return 'Pichau';
    if (host.includes('terabyteshop')) return 'Terabyte';
    if (host.includes('dell')) return 'Dell';
    const parts = host.split('.');
    if (parts.length >= 2) {
      const main = parts[0];
      return main.charAt(0).toUpperCase() + main.slice(1);
    }
    return host;
  } catch {
    return '';
  }
}

async function compressImage(fileOrBlob: Blob, maxDim = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve('');
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(String(reader.result || ''));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(fileOrBlob);
  });
}

function calcQuoteMetrics(quotes: DemandQuote[]) {
  const validQuotes = quotes.filter(
    (q) => (q.totalPrice != null && q.totalPrice > 0) || q.supplier.trim() || (q.url && q.url.trim()),
  );
  const quotesWithPrice = validQuotes.filter((q) => q.totalPrice != null && q.totalPrice > 0);
  const minPrice = quotesWithPrice.length > 0 ? Math.min(...quotesWithPrice.map((q) => q.totalPrice!)) : null;
  const maxPrice = quotesWithPrice.length > 0 ? Math.max(...quotesWithPrice.map((q) => q.totalPrice!)) : null;
  const winner = quotes.find((q) => q.selected) || (minPrice != null ? quotes.find((q) => q.totalPrice === minPrice) : null);
  const savings = minPrice != null && maxPrice != null && maxPrice > minPrice ? maxPrice - minPrice : 0;
  const savingsPct = maxPrice && maxPrice > 0 ? Math.round((savings / maxPrice) * 100) : 0;

  return {
    validQuotes,
    quotesWithPrice,
    minPrice,
    maxPrice,
    winner,
    savings,
    savingsPct,
  };
}

function generateWhatsAppText(demand: Demand, quotes: DemandQuote[]): string {
  const { validQuotes, minPrice, winner, savings, savingsPct } = calcQuoteMetrics(quotes);

  let text = `📋 *COTAÇÃO DE PREÇOS — NATUMIX*\n`;
  if (demand.trackingCode) text += `🏷️ *Talão / Cód:* ${demand.trackingCode}\n`;
  text += `📦 *Item:* ${labelOf(demand)}\n`;
  text += `🔢 *Qtd:* ${qtyOf(demand)} un\n`;
  if (demand.requestedBy) text += `👤 *Solicitante:* ${demand.requestedBy}${demand.sector ? ` (${demand.sector})` : ''}\n`;
  if (demand.equipmentName) text += `⚙️ *Máquina:* ${demand.equipmentName}\n`;
  text += `\n*COMPARATIVO DE PREÇOS:* \n`;

  if (validQuotes.length === 0) {
    text += `(Nenhum fornecedor registrado ainda)\n`;
  } else {
    validQuotes.forEach((q, idx) => {
      const isWinner = (winner && winner.id === q.id) || (minPrice != null && q.totalPrice === minPrice);
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹';
      text += `${medal} *${q.supplier || `Opção ${idx + 1}`}:* ${formatMoney(q.totalPrice)}`;
      if (isWinner) text += ` 🏆 _(Menor Preço)_`;
      text += `\n`;
      if (q.leadTime) text += `   ⏱️ Prazo: ${q.leadTime}\n`;
      if (q.url) text += `   🔗 ${q.url}\n`;
    });
  }

  if (savings > 0) {
    text += `\n💰 *Economia Identificada:* ${formatMoney(savings)} (${savingsPct}%)\n`;
  }

  if (winner && winner.totalPrice) {
    text += `\n✅ *Aprovado p/ Compra:* ${winner.supplier || 'Vencedor'} (${formatMoney(winner.totalPrice)})\n`;
  }

  text += `\n_Gerado pelo Almoxarifado Natumix em ${new Date().toLocaleDateString('pt-BR')}_`;
  return text;
}

export default function ComprasAlmoxarifadoView({ onBackToHub }: Props) {
  const [rows, setRows] = useState<Demand[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>('solicitacoes');
  const [statusFiltro, setStatusFiltro] = useState<SolicitacaoFiltro>('todas');
  const [talaoStatusFiltro, setTalaoStatusFiltro] = useState<TalaoFiltro>('todos');
  const [manutencaoFiltro, setManutencaoFiltro] = useState<ManutencaoFiltro>('todas');
  const [showCanceladas, setShowCanceladas] = useState(false);
  const [q, setQ] = useState('');

  // Sequência contínua de talhões
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [nextSequence, setNextSequence] = useState<number>(5);
  const [lastSequence, setLastSequence] = useState<number>(4);

  // Modais
  const [addOpen, setAddOpen] = useState(false);
  const [talaoOpen, setTalaoOpen] = useState(false);
  const [selectedTalaoCode, setSelectedTalaoCode] = useState<string | null>(null);
  const [maintOpen, setMaintOpen] = useState(false);
  const [edit, setEdit] = useState<Demand | null>(null);
  const [buy, setBuy] = useState<Demand | null>(null);
  const [receipt, setReceipt] = useState<{
    name?: string | null;
    data: string;
    attachments?: { id: string; type: string; label: string; name: string; data: string }[];
  } | null>(null);
  const [quotesModal, setQuotesModal] = useState<Demand | null>(null);
  const [printSlipsConfig, setPrintSlipsConfig] = useState<{
    open: boolean;
    initialMode?: 'branco' | 'preenchidos';
    selectedId?: string;
  }>({ open: false });
  const [whatsAppModal, setWhatsAppModal] = useState<Demand | null>(null);
  const [zoomImage, setZoomImage] = useState<{ title: string; src: string } | null>(null);

  const fetchSequence = useCallback(async () => {
    try {
      const data = await apiJson<{ nextSequence?: number; lastSequence?: number }>('/almox/print-sequence');
      if (data && typeof data.nextSequence === 'number') {
        setNextSequence(data.nextSequence);
        if (typeof data.lastSequence === 'number') {
          setLastSequence(data.lastSequence);
        }
      }
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resDemands, resEq] = await Promise.all([
        apiJson<{ demands: Demand[] }>('/almox/demands'),
        apiJson<{ equipments: Equipment[] }>('/almox/equipments').catch(() => ({ equipments: [] })),
      ]);
      setRows(resDemands.demands ?? []);
      setEquipments(resEq.equipments ?? []);
      void fetchSequence();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as compras do almoxarifado.');
    } finally {
      setLoading(false);
    }
  }, [fetchSequence]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReceipt = async (id: string) => {
    try {
      const res = await apiJson<{
        receiptData?: string | null;
        receiptName?: string | null;
        receiptsJson?: string | null;
      }>(`/almox/demands/${encodeURIComponent(id)}/receipt`);

      let attachments: { id: string; type: string; label: string; name: string; data: string }[] = [];
      if (res.receiptsJson) {
        try {
          const parsed = JSON.parse(res.receiptsJson);
          if (Array.isArray(parsed)) {
            attachments = parsed.filter((a) => a && typeof a.data === 'string' && a.data.length > 0);
          }
        } catch {}
      }

      if (attachments.length === 0 && res.receiptData) {
        attachments.push({
          id: 'comprovante',
          type: 'comprovante',
          label: 'Comprovante Fiscal',
          name: res.receiptName || 'comprovante.jpg',
          data: res.receiptData,
        });
      }

      if (attachments.length === 0) {
        setError('Este comprovante não está disponível.');
        return;
      }

      setReceipt({
        name: attachments[0].name,
        data: attachments[0].data,
        attachments,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o comprovante.');
    }
  };

  const taloesRows = useMemo(() => rows.filter(isTalao), [rows]);

  // Contagens de solicitações (excluindo canceladas e talhões impressos em branco por padrão)
  const totalSolicitacoesAtivas = useMemo(
    () => rows.filter((d) => d.status !== 'cancelada' && d.status !== 'impresso').length,
    [rows],
  );
  const pendentesCount = useMemo(
    () => rows.filter((d) => d.status !== 'impresso' && !isRecebida(d) && !isComprada(d) && d.status !== 'cancelada' && parseQuotes(d).length === 0 && d.quotedValue == null).length,
    [rows],
  );
  const emCotacaoCount = useMemo(() => rows.filter((d) => d.status !== 'impresso' && isEmCotacao(d)).length, [rows]);
  const prontaComprarCount = useMemo(() => rows.filter((d) => d.status !== 'impresso' && isProntaComprar(d)).length, [rows]);
  const compradasCount = useMemo(() => rows.filter((d) => isComprada(d)).length, [rows]);
  const recebidasCount = useMemo(() => rows.filter((d) => isRecebida(d)).length, [rows]);
  const canceladasCount = useMemo(() => rows.filter((d) => d.status === 'cancelada').length, [rows]);

  // Contagens específicas de talhões
  const taloesAtivosCount = useMemo(
    () => taloesRows.filter((d) => d.status !== 'cancelada').length,
    [taloesRows],
  );
  const taloesImpressosCount = useMemo(
    () => taloesRows.filter((d) => d.status === 'impresso').length,
    [taloesRows],
  );
  const taloesPendentesCount = useMemo(
    () => taloesRows.filter((d) => d.status !== 'impresso' && !isRecebida(d) && !isComprada(d) && d.status !== 'cancelada' && parseQuotes(d).length === 0 && d.quotedValue == null).length,
    [taloesRows],
  );
  const taloesCotacaoCount = useMemo(() => taloesRows.filter((d) => d.status !== 'impresso' && isEmCotacao(d)).length, [taloesRows]);
  const taloesComprarCount = useMemo(() => taloesRows.filter((d) => d.status !== 'impresso' && isProntaComprar(d)).length, [taloesRows]);
  const taloesCompradosCount = useMemo(() => taloesRows.filter(isComprada).length, [taloesRows]);
  const taloesRecebidosCount = useMemo(() => taloesRows.filter(isRecebida).length, [taloesRows]);
  // Contagens específicas de manutenções avulsas
  const manutencoesRows = useMemo(() => rows.filter(isManutencao), [rows]);
  const manutencoesAtivasCount = useMemo(
    () => manutencoesRows.filter((d) => d.status !== 'cancelada').length,
    [manutencoesRows],
  );
  const totalGastoManutencoes = useMemo(
    () => manutencoesRows.reduce((acc, d) => acc + (d.purchaseValue || 0), 0),
    [manutencoesRows],
  );
  const manutencoesEletrica = useMemo(
    () => manutencoesRows.filter((d) => detectMaintCategory(d) === 'eletrica'),
    [manutencoesRows],
  );
  const manutencoesPredial = useMemo(
    () => manutencoesRows.filter((d) => detectMaintCategory(d) === 'predial'),
    [manutencoesRows],
  );
  const manutencoesHidraulica = useMemo(
    () => manutencoesRows.filter((d) => detectMaintCategory(d) === 'hidraulica'),
    [manutencoesRows],
  );
  const manutencoesClimatizacao = useMemo(
    () => manutencoesRows.filter((d) => detectMaintCategory(d) === 'climatizacao'),
    [manutencoesRows],
  );
  const manutencoesTi = useMemo(
    () => manutencoesRows.filter((d) => detectMaintCategory(d) === 'ti'),
    [manutencoesRows],
  );
  const manutencoesOutras = useMemo(
    () => manutencoesRows.filter((d) => detectMaintCategory(d) === 'outras'),
    [manutencoesRows],
  );

  const totalGasto = useMemo(() => rows.reduce((acc, d) => acc + (d.purchaseValue || 0), 0), [rows]);

  const totalEconomizado = useMemo(() => {
    return rows.reduce((acc, d) => {
      const q = parseQuotes(d);
      const metrics = calcQuoteMetrics(q);
      return acc + metrics.savings;
    }, 0);
  }, [rows]);

  const visiveis = useMemo(() => {
    const term = q.trim().toLowerCase();

    if (activeTab === 'taloes') {
      return taloesRows.filter((d) => {
        const isCancelada = d.status === 'cancelada';

        if (talaoStatusFiltro === 'canceladas') {
          if (!isCancelada) return false;
        } else {
          if (isCancelada && !showCanceladas) return false;

          if (talaoStatusFiltro === 'impressos') {
            if (d.status !== 'impresso') return false;
          } else if (talaoStatusFiltro === 'pendentes') {
            if (d.status === 'impresso' || isRecebida(d) || isComprada(d) || parseQuotes(d).length > 0 || d.quotedValue != null) return false;
          } else if (talaoStatusFiltro === 'cotacao') {
            if (d.status === 'impresso' || !isEmCotacao(d)) return false;
          } else if (talaoStatusFiltro === 'comprar') {
            if (d.status === 'impresso' || !isProntaComprar(d)) return false;
          } else if (talaoStatusFiltro === 'compradas') {
            if (!isComprada(d)) return false;
          } else if (talaoStatusFiltro === 'recebidas') {
            if (!isRecebida(d)) return false;
          }
        }

        if (!term) return true;
        return [
          d.trackingCode,
          labelOf(d),
          d.requestedBy,
          d.storeName,
          d.sector,
          d.equipmentName,
          d.notes,
          d.items?.[0]?.itemCode,
          d.items?.[0]?.description,
        ]
          .map((v) => (v || '').toLowerCase())
          .some((v) => v.includes(term));
      });
    }

    if (activeTab === 'manutencoes') {
      return manutencoesRows.filter((d) => {
        const isCancelada = d.status === 'cancelada';
        if (isCancelada && !showCanceladas) return false;

        if (manutencaoFiltro !== 'todas') {
          const cat = detectMaintCategory(d);
          if (cat !== manutencaoFiltro) return false;
        }

        if (!term) return true;
        return [
          d.trackingCode,
          labelOf(d),
          d.storeName,
          d.equipmentName,
          d.requestedBy,
          d.sector,
          d.notes,
          ...(d.items || []).map((i) => i.description || i.itemDescription || i.itemCode || ''),
        ]
          .map((v) => (v || '').toLowerCase())
          .some((v) => v.includes(term));
      });
    }

    // activeTab === 'solicitacoes'
    return rows.filter((d) => {
      if (d.status === 'impresso') return false;
      const isCancelada = d.status === 'cancelada';

      if (statusFiltro === 'canceladas') {
        if (!isCancelada) return false;
      } else {
        if (isCancelada && !showCanceladas) return false;

        if (statusFiltro === 'pendentes') {
          if (isRecebida(d) || isComprada(d) || parseQuotes(d).length > 0 || d.quotedValue != null) return false;
        } else if (statusFiltro === 'cotacao') {
          if (!isEmCotacao(d)) return false;
        } else if (statusFiltro === 'comprar') {
          if (!isProntaComprar(d)) return false;
        } else if (statusFiltro === 'compradas') {
          if (!isComprada(d)) return false;
        } else if (statusFiltro === 'recebidas') {
          if (!isRecebida(d)) return false;
        }
      }

      if (!term) return true;
      return [
        d.trackingCode,
        labelOf(d),
        d.requestedBy,
        d.storeName,
        d.sector,
        d.equipmentName,
        d.notes,
        d.items?.[0]?.itemCode,
        d.items?.[0]?.description,
      ]
        .map((v) => (v || '').toLowerCase())
        .some((v) => v.includes(term));
    });
  }, [rows, taloesRows, manutencoesRows, activeTab, statusFiltro, talaoStatusFiltro, manutencaoFiltro, showCanceladas, q]);

  const cancel = async (id: string) => {
    if (!confirm('Deseja realmente cancelar esta solicitação de compra?')) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/almox/demands/${encodeURIComponent(id)}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'cancelada' }),
      });
      setAviso('Solicitação cancelada.');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Não foi possível cancelar a solicitação.');
    } finally {
      setBusy(false);
    }
  };

  const marcarRecebida = async (d: Demand) => {
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      await apiJson(`/almox/demands/${encodeURIComponent(d.id)}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'recebida' }),
      });
      setAviso(`Item "${labelOf(d)}" confirmado como recebido no almoxarifado!`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Não foi possível confirmar o recebimento.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppLayout
      moduleTitle="Compras do Almoxarifado"
      onBackToHub={onBackToHub}
      sidebarItems={[
        { id: 'solicitacoes', label: 'Solicitações', icon: Layers, badge: totalSolicitacoesAtivas || undefined },
        { id: 'taloes', label: 'Talhões', icon: ClipboardList, badge: taloesAtivosCount || undefined },
        { id: 'manutencoes', label: 'Manutenções Avulsas', icon: Wrench, badge: manutencoesAtivasCount || undefined },
      ]}
      activeTab={activeTab}
      onTabChange={(id) => {
        setActiveTab(id as TabMode);
        setAviso(null);
      }}
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMaintOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white cursor-pointer shadow-xs transition-all hover:shadow-md"
            title="Registrar compra avulsa para manutenção (Elétrica, Predial, Hidráulica...)"
          >
            <Wrench className="h-4 w-4" />
            <span>+ Compra Manutenção</span>
          </button>
          <button
            type="button"
            onClick={() => setTalaoOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-xs transition-all hover:shadow-md"
            title="Lançar talão de papel preenchido na fábrica"
          >
            <ClipboardList className="h-4 w-4" />
            <span>Lançar Talão Físico</span>
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer shadow-xs"
            title="Criar nova solicitação avulsa vinculada à sequência contínua de talões"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nova Solicitação Avulsa</span>
            <span className="sm:hidden">Nova Solicitação</span>
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 cursor-pointer shadow-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold p-3.5 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {aviso && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold p-3.5 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{aviso}</span>
          </div>
        )}

        {/* Visão da Aba SOLICITAÇÕES */}
        {activeTab === 'solicitacoes' && (
          <>
            {/* KPI Cards Estilo Físico-Químico com clique rápido para filtrar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <button
                type="button"
                onClick={() => setStatusFiltro('pendentes')}
                className={`text-left rounded-2xl p-3.5 sm:p-4 border shadow-xs space-y-1 transition-all cursor-pointer ${
                  statusFiltro === 'pendentes'
                    ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500'
                    : 'bg-white border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider block">Pendentes de Cotação</span>
                  <Clock className="h-4 w-4 text-indigo-500" />
                </div>
                <span className={`text-xl sm:text-2xl font-black ${pendentesCount > 0 ? 'text-indigo-600' : 'text-zinc-900'}`}>
                  {pendentesCount}
                </span>
                <span className="text-[11px] text-zinc-400 block font-medium">Aguardando cotação</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFiltro('cotacao')}
                className={`text-left rounded-2xl p-3.5 sm:p-4 border shadow-xs space-y-1 transition-all cursor-pointer ${
                  statusFiltro === 'cotacao'
                    ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-500'
                    : 'bg-white border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider block">Em Cotação</span>
                  <DollarSign className="h-4 w-4 text-amber-500" />
                </div>
                <span className="text-xl sm:text-2xl font-black text-amber-600">{emCotacaoCount}</span>
                <span className="text-[11px] text-zinc-400 block font-medium">Pesquisando preços</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFiltro('comprar')}
                className={`text-left rounded-2xl p-3.5 sm:p-4 border shadow-xs space-y-1 transition-all cursor-pointer ${
                  statusFiltro === 'comprar'
                    ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500'
                    : 'bg-white border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider block">Prontas p/ Comprar</span>
                  <ShoppingCart className="h-4 w-4 text-emerald-500" />
                </div>
                <span className="text-xl sm:text-2xl font-black text-emerald-600">{prontaComprarCount}</span>
                <span className="text-[11px] text-zinc-400 block font-medium">Cotação aprovada</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFiltro('compradas')}
                className={`text-left rounded-2xl p-3.5 sm:p-4 border shadow-xs space-y-1 transition-all cursor-pointer ${
                  statusFiltro === 'compradas'
                    ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-500'
                    : 'bg-white border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider block">Em Trânsito</span>
                  <Truck className="h-4 w-4 text-blue-500" />
                </div>
                <span className="text-xl sm:text-2xl font-black text-blue-600">{compradasCount}</span>
                <span className="text-[11px] text-zinc-400 block font-medium">Aguardando entrega</span>
              </button>

              <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200 shadow-xs space-y-1 col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider block">Economia em Cotações</span>
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                </div>
                <span className="text-xl sm:text-2xl font-black text-emerald-700">
                  {formatMoney(totalEconomizado)}
                </span>
                <span className="text-[11px] text-zinc-400 block font-medium">Gasto: {formatMoney(totalGasto)}</span>
              </div>
            </div>

            {/* Barra de Filtros Integrados e Busca de Solicitações */}
            <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-zinc-200 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Pills de Status */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'todas', label: 'Todas', count: totalSolicitacoesAtivas },
                    { id: 'pendentes', label: 'Pendentes', count: pendentesCount },
                    { id: 'cotacao', label: 'Em Cotação', count: emCotacaoCount },
                    { id: 'comprar', label: 'Prontas p/ Comprar', count: prontaComprarCount },
                    { id: 'compradas', label: 'Compradas (Trânsito)', count: compradasCount },
                    { id: 'recebidas', label: 'Recebidas', count: recebidasCount },
                    { id: 'canceladas', label: 'Canceladas', count: canceladasCount },
                  ].map((tab) => {
                    const active = statusFiltro === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setStatusFiltro(tab.id as SolicitacaoFiltro)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                          active
                            ? 'bg-zinc-900 text-white shadow-xs'
                            : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                            active ? 'bg-white/20 text-white' : 'bg-zinc-200 text-zinc-600'
                          }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Checkbox de Canceladas */}
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showCanceladas || statusFiltro === 'canceladas'}
                    onChange={(e) => setShowCanceladas(e.target.checked)}
                    className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 h-4 w-4"
                  />
                  <span>Exibir canceladas</span>
                </label>
              </div>

              {/* Input de Busca */}
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por código de talão (ex: SOL-2026-0005), item, solicitante, máquina, setor..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 text-sm bg-zinc-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
                />
              </div>
            </div>
          </>
        )}

        {/* Visão da Aba TALHÕES (Gerenciamento, Impressão e Registro) */}
        {activeTab === 'taloes' && (
          <>
            {/* Barra Compacta de Gestão e Ações de Talhões */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-zinc-200 shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
                  <ClipboardList className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-zinc-900">
                      Central de Talhões da Fábrica
                    </h3>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg">
                      Próxima Sequência: SOL-{currentYear}-{String(nextSequence).padStart(4, '0')}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Emissão contínua sequencial e controle de requisições físicas de compras.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPrintSlipsConfig({ open: true, initialMode: 'branco' })}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 cursor-pointer shadow-xs transition-all"
                  title="Imprimir talões contínuos em folhas A4 recortáveis (4 por folha)"
                >
                  <Printer className="h-3.5 w-3.5 text-indigo-700" />
                  <span>Imprimir Talhões A4</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedTalaoCode(null);
                    setTalaoOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-xs transition-all"
                  title="Lançar talão de papel preenchido na fábrica"
                >
                  <Plus className="h-4 w-4" />
                  <span>+ Lançar Talão Físico</span>
                </button>
              </div>
            </div>

            {/* Barra de Filtros e Busca de Talhões */}
            <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-zinc-200 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Pills de Status dos Talhões */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'todos', label: 'Todos os Talhões', count: taloesAtivosCount },
                    { id: 'impressos', label: 'Talhões Impressos', count: taloesImpressosCount },
                    { id: 'pendentes', label: 'Aguardando Cotação', count: taloesPendentesCount },
                    { id: 'cotacao', label: 'Em Cotação', count: taloesCotacaoCount },
                    { id: 'comprar', label: 'Prontos p/ Comprar', count: taloesComprarCount },
                    { id: 'compradas', label: 'Comprados', count: taloesCompradosCount },
                    { id: 'recebidas', label: 'Recebidos', count: taloesRecebidosCount },
                    { id: 'canceladas', label: 'Cancelados', count: taloesCanceladosCount },
                  ].map((tab) => {
                    const active = talaoStatusFiltro === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setTalaoStatusFiltro(tab.id as TalaoFiltro)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                          active
                            ? 'bg-indigo-900 text-white shadow-xs'
                            : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                            active ? 'bg-white/20 text-white' : 'bg-zinc-200 text-zinc-600'
                          }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Checkbox de Cancelados */}
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showCanceladas || talaoStatusFiltro === 'canceladas'}
                    onChange={(e) => setShowCanceladas(e.target.checked)}
                    className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 h-4 w-4"
                  />
                  <span>Exibir cancelados</span>
                </label>
              </div>

              {/* Input de Busca */}
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar talão por código (ex: SOL-2026-0005), item, solicitante, máquina..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 text-sm bg-zinc-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 min-h-11"
                />
              </div>
            </div>
          </>
        )}

        {/* Visão da Aba MANUTENÇÕES AVULSAS */}
        {activeTab === 'manutencoes' && (
          <>
            {/* Banner Moderno de Compras para Manutenções Avulsas */}
            <div className="bg-gradient-to-r from-amber-950 via-zinc-900 to-amber-900 rounded-2xl p-4 sm:p-5 text-white shadow-sm border border-amber-800/40 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/30 px-2.5 py-0.5 rounded-full text-xs font-bold text-amber-200">
                    <Wrench className="h-3.5 w-3.5 text-amber-300" />
                    <span>Compras de Manutenções & Reparos Avulsos</span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
                    Gestão de Compras de Materiais & Serviços Avulsos
                  </h3>
                  <p className="text-xs sm:text-sm text-amber-100/80 max-w-2xl leading-relaxed">
                    Lançamento ágil de materiais elétricos, prediais, hidráulicos e reparos avulsos comprados no comércio local (ex: Elétrica Rocha, Casa da Borracha), integrados diretamente à ordem de manutenção e comprovantes.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-xl px-3.5 py-2 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200 block">
                      Total Gasto em Manutenções
                    </span>
                    <span className="font-mono text-base font-black text-emerald-300">
                      {formatMoney(totalGastoManutencoes)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMaintOpen(true)}
                    className="inline-flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 cursor-pointer shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                    title="Adicionar nova compra avulsa para manutenção elétrica, predial, hidráulica..."
                  >
                    <Plus className="h-4 w-4" />
                    <span>+ Registrar Compra de Manutenção</span>
                  </button>
                </div>
              </div>
            </div>

            {/* KPI Cards de Manutenções Avulsas */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <button
                type="button"
                onClick={() => setManutencaoFiltro('todas')}
                className={`text-left rounded-2xl p-3.5 sm:p-4 border shadow-xs space-y-1 transition-all cursor-pointer ${
                  manutencaoFiltro === 'todas'
                    ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-500'
                    : 'bg-white border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider block">Todas as Manutenções</span>
                  <Wrench className="h-4 w-4 text-amber-500" />
                </div>
                <span className="text-xl sm:text-2xl font-black text-zinc-900">{manutencoesAtivasCount}</span>
                <span className="text-[11px] text-zinc-400 block font-medium">Gasto: {formatMoney(totalGastoManutencoes)}</span>
              </button>

              <button
                type="button"
                onClick={() => setManutencaoFiltro('eletrica')}
                className={`text-left rounded-2xl p-3.5 sm:p-4 border shadow-xs space-y-1 transition-all cursor-pointer ${
                  manutencaoFiltro === 'eletrica'
                    ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-500'
                    : 'bg-white border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider block">⚡ Elétrica</span>
                  <Zap className="h-4 w-4 text-amber-500" />
                </div>
                <span className="text-xl sm:text-2xl font-black text-amber-600">{manutencoesEletrica.length}</span>
                <span className="text-[11px] text-zinc-400 block font-medium">
                  {formatMoney(manutencoesEletrica.reduce((a, b) => a + (b.purchaseValue || 0), 0))}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setManutencaoFiltro('predial')}
                className={`text-left rounded-2xl p-3.5 sm:p-4 border shadow-xs space-y-1 transition-all cursor-pointer ${
                  manutencaoFiltro === 'predial'
                    ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500'
                    : 'bg-white border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider block">🏢 Predial / Civil</span>
                  <Store className="h-4 w-4 text-emerald-500" />
                </div>
                <span className="text-xl sm:text-2xl font-black text-emerald-600">{manutencoesPredial.length}</span>
                <span className="text-[11px] text-zinc-400 block font-medium">
                  {formatMoney(manutencoesPredial.reduce((a, b) => a + (b.purchaseValue || 0), 0))}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setManutencaoFiltro('hidraulica')}
                className={`text-left rounded-2xl p-3.5 sm:p-4 border shadow-xs space-y-1 transition-all cursor-pointer ${
                  manutencaoFiltro === 'hidraulica'
                    ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-500'
                    : 'bg-white border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider block">💧 Hidráulica</span>
                  <Truck className="h-4 w-4 text-blue-500" />
                </div>
                <span className="text-xl sm:text-2xl font-black text-blue-600">{manutencoesHidraulica.length}</span>
                <span className="text-[11px] text-zinc-400 block font-medium">
                  {formatMoney(manutencoesHidraulica.reduce((a, b) => a + (b.purchaseValue || 0), 0))}
                </span>
              </button>

              <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200 shadow-xs space-y-1 col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider block">❄️ Clima & TI</span>
                  <Layers className="h-4 w-4 text-cyan-500" />
                </div>
                <span className="text-xl sm:text-2xl font-black text-cyan-700">
                  {manutencoesClimatizacao.length + manutencoesTi.length}
                </span>
                <span className="text-[11px] text-zinc-400 block font-medium">
                  {formatMoney(
                    [...manutencoesClimatizacao, ...manutencoesTi].reduce((a, b) => a + (b.purchaseValue || 0), 0),
                  )}
                </span>
              </div>
            </div>

            {/* Barra de Filtros e Busca de Manutenções Avulsas */}
            <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-zinc-200 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Pills de Categoria */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'todas', label: 'Todas', count: manutencoesAtivasCount },
                    { id: 'eletrica', label: '⚡ Elétrica', count: manutencoesEletrica.length },
                    { id: 'predial', label: '🏢 Predial', count: manutencoesPredial.length },
                    { id: 'hidraulica', label: '💧 Hidráulica', count: manutencoesHidraulica.length },
                    { id: 'climatizacao', label: '❄️ Climatização', count: manutencoesClimatizacao.length },
                    { id: 'ti', label: '🌐 TI & Redes', count: manutencoesTi.length },
                    { id: 'outras', label: '🔧 Outras', count: manutencoesOutras.length },
                  ].map((tab) => {
                    const active = manutencaoFiltro === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setManutencaoFiltro(tab.id as ManutencaoFiltro)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                          active
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                            active ? 'bg-white/20 text-white' : 'bg-zinc-200 text-zinc-600'
                          }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Checkbox de Cancelados */}
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showCanceladas}
                    onChange={(e) => setShowCanceladas(e.target.checked)}
                    className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 h-4 w-4"
                  />
                  <span>Exibir canceladas</span>
                </label>
              </div>

              {/* Input de Busca */}
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por loja (ex: Elétrica Rocha), item comprado, tipo de manutenção, comprador..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 text-sm bg-zinc-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-11"
                />
              </div>
            </div>
          </>
        )}

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 bg-white border border-zinc-200 rounded-2xl">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-700" />
            <span className="text-xs font-semibold text-zinc-500">Carregando solicitações de compra...</span>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Mobile View: High-ergonomics Cards */}
            <div className="block md:hidden space-y-3">
              {visiveis.map((d) => {
                const st = statusMeta(d);
                const og = origemMeta(d.origin);
                const urg = urgencyMeta(d.urgency);
                const finalizada = isRecebida(d);
                const emTransito = isComprada(d);
                const quotes = parseQuotes(d);

                return (
                  <div
                    key={d.id}
                    className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-3 transition-all"
                  >
                    {/* Linha de topo: Código de rastreio e Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-zinc-900 text-white shadow-xs">
                          {d.trackingCode || 'SOL-____'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${st.cls}`}>
                          {st.label}
                        </span>
                        {d.urgency && d.urgency !== 'normal' && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${urg.cls}`}>
                            {urg.label}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono font-bold text-zinc-400">{dataBr(d.createdAt)}</span>
                    </div>

                    <div>
                      <h4 className="font-bold text-base text-zinc-900 leading-snug">{labelOf(d)}</h4>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Qtd: <strong className="text-zinc-800">{qtyOf(d)} un</strong>
                        {d.requestedBy ? ` · Solicitante: ${d.requestedBy}` : ''}
                        {d.sector ? ` · Setor: ${d.sector}` : ''}
                      </p>
                      {d.equipmentName && (
                        <p className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-0.5 mt-1 inline-flex items-center gap-1">
                          <Wrench className="h-3 w-3" /> Máquina: {d.equipmentName}
                        </p>
                      )}
                    </div>

                    {/* Stepper de Rastreamento */}
                    <div className="bg-zinc-50 rounded-xl p-2.5 text-[11px] border border-zinc-100">
                      <div className="flex items-center justify-between text-zinc-400 font-bold mb-1">
                        <span className="text-zinc-700">Fluxo de Rastreio</span>
                        <span>Etapa {finalizada ? '4/4' : emTransito ? '3/4' : quotes.length >= 3 ? '2/4' : '1/4'}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-[9px] font-bold text-center">
                        <div className="bg-zinc-900 text-white py-1 rounded">1. Solicitado</div>
                        <div
                          className={`py-1 rounded ${
                            quotes.length > 0 ? 'bg-indigo-700 text-white' : 'bg-zinc-200 text-zinc-600'
                          }`}
                        >
                          2. Cotação ({quotes.length})
                        </div>
                        <div
                          className={`py-1 rounded ${
                            emTransito || finalizada ? 'bg-blue-600 text-white' : 'bg-zinc-200 text-zinc-600'
                          }`}
                        >
                          3. Comprado
                        </div>
                        <div
                          className={`py-1 rounded ${
                            finalizada ? 'bg-emerald-600 text-white' : 'bg-zinc-200 text-zinc-600'
                          }`}
                        >
                          4. Recebido
                        </div>
                      </div>
                    </div>

                    {/* Valores e Cotações */}
                    <div className="grid grid-cols-2 gap-2 bg-zinc-50 rounded-xl p-2.5 text-xs">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                          Cotação Estimada
                        </span>
                        <span className="font-bold text-zinc-700">{formatMoney(d.quotedValue)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                          Valor Pago
                        </span>
                        <span className="font-black text-zinc-900">{formatMoney(d.purchaseValue)}</span>
                      </div>
                    </div>

                    {(d.storeName || d.purchasedAt || d.notes) && (
                      <div className="text-[11px] text-zinc-500 space-y-0.5 bg-zinc-50/50 p-2 rounded-xl">
                        {d.storeName && (
                          <p>
                            Loja / Fornecedor: <strong>{d.storeName}</strong>
                          </p>
                        )}
                        {d.purchasedAt && (
                          <p>
                            Comprado em: <strong>{dataBr(d.purchasedAt)}</strong>
                          </p>
                        )}
                        {d.notes && <p className="italic text-zinc-600">Obs: {d.notes}</p>}
                      </div>
                    )}

                    {/* Cotação Vencedora / Destaque */}
                    {quotes.length > 0 && (() => {
                      const qMetrics = calcQuoteMetrics(quotes);
                      return (
                        <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-2.5 text-xs flex items-center justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                              <Sparkles className="h-3 w-3 text-emerald-600" />
                              {qMetrics.winner?.supplier ? `Vencedor: ${qMetrics.winner.supplier}` : 'Menor Preço'}
                            </span>
                            <span className="font-black text-emerald-900 text-sm">
                              {formatMoney(qMetrics.winner?.totalPrice ?? qMetrics.minPrice)}
                            </span>
                          </div>
                          {qMetrics.savings > 0 && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-white border border-emerald-200 px-2 py-0.5 rounded-full">
                              Eco: {formatMoney(qMetrics.savings)}
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    {/* Ações */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setQuotesModal(d)}
                          className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 cursor-pointer shadow-xs"
                        >
                          <DollarSign className="h-3.5 w-3.5 text-indigo-600" />
                          <span>{quotes.length > 0 ? `Cotações (${quotes.length})` : '+ Cotar'}</span>
                        </button>

                        {quotes.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setWhatsAppModal(d)}
                            className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 cursor-pointer shadow-xs"
                            title="Ver comprovante e copiar para WhatsApp"
                          >
                            <Share2 className="h-3.5 w-3.5 text-emerald-600" />
                            <span>WhatsApp</span>
                          </button>
                        )}

                        {d.hasReceipt && (
                          <button
                            type="button"
                            onClick={() => void openReceipt(d.id)}
                            className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 cursor-pointer"
                          >
                            <Receipt className="h-3.5 w-3.5 text-zinc-500" />
                            Comprovante
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {d.status === 'impresso' && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTalaoCode(d.trackingCode || null);
                              setTalaoOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer shadow-xs"
                          >
                            <ClipboardList className="h-3.5 w-3.5" />
                            <span>Lançar Talão</span>
                          </button>
                        )}

                        {emTransito && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void marcarRecebida(d)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs cursor-pointer shadow-xs disabled:opacity-50"
                          >
                            <PackageCheck className="h-3.5 w-3.5" />
                            Confirmar Recebimento
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setEdit(d)}
                          className="p-2 rounded-xl border border-zinc-200 hover:border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 cursor-pointer transition-colors shadow-xs"
                          title="Editar ou Cancelar Solicitação"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {visiveis.length === 0 && (
                <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center text-zinc-400 text-sm">
                  Nenhuma solicitação encontrada para o filtro atual.
                </div>
              )}
            </div>

            {/* Desktop View: High-density Table */}
            <div className="hidden md:block bg-white border border-zinc-200 rounded-2xl shadow-xs overflow-hidden">
              {activeTab === 'manutencoes' ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 text-left border-b border-zinc-100 bg-zinc-50/50">
                      <th className="px-4 py-3">Data / Compra</th>
                      <th className="px-4 py-3">Tipo & Categoria</th>
                      <th className="px-4 py-3">Descrição do Serviço</th>
                      <th className="px-4 py-3">Itens Comprados</th>
                      <th className="px-4 py-3">Loja / Fornecedor</th>
                      <th className="px-4 py-3">Solicitante / Setor</th>
                      <th className="px-4 py-3 text-right">Valor Pago</th>
                      <th className="px-4 py-3 text-center">Comprovante</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {visiveis.map((d) => {
                      const cat = detectMaintCategory(d);
                      const catMeta = maintCategoryBadge(cat);

                      return (
                        <tr key={d.id} className="hover:bg-amber-50/30 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs font-bold text-zinc-900 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded block w-fit">
                              {dataBr(d.purchasedAt || d.createdAt)}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-400 block mt-0.5">
                              {d.trackingCode || 'AVULSA'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${catMeta.cls}`}>
                              <span>{catMeta.emoji}</span>
                              <span>{catMeta.label}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-bold text-zinc-900 leading-snug">{labelOf(d)}</p>
                            {d.notes && <p className="text-xs text-zinc-500 italic mt-0.5">Obs: {d.notes}</p>}
                          </td>
                          <td className="px-4 py-3 max-w-sm">
                            <div className="flex flex-col gap-1.5">
                              {(d.items || []).map((it, idx) => {
                                const desc = it.description || it.itemDescription || it.itemCode;
                                const hasUnit = typeof it.unitCost === 'number' && it.unitCost > 0;
                                const itemTotal = hasUnit ? it.unitCost! * it.qtyRequested : null;
                                return (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between gap-2 bg-zinc-50 border border-zinc-200/80 px-2.5 py-1 rounded-lg text-xs"
                                  >
                                    <span className="font-semibold text-zinc-800 truncate max-w-[170px]" title={desc}>
                                      {desc}
                                    </span>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-zinc-500 font-bold">×{it.qtyRequested}</span>
                                      {hasUnit && (
                                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/70 border border-emerald-300 px-1.5 py-0.5 rounded">
                                          {formatMoney(it.unitCost)}
                                        </span>
                                      )}
                                      {itemTotal != null && it.qtyRequested > 1 && (
                                        <span className="text-[10px] font-mono text-zinc-400">
                                          (= {formatMoney(itemTotal)})
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 font-bold text-zinc-900">
                              <Store className="h-4 w-4 text-amber-600 shrink-0" />
                              <span>{d.storeName || 'Loja Local'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-zinc-800 block">{d.requestedBy || 'Manutenção'}</span>
                            <span className="text-xs text-zinc-400 block">{d.sector || 'Fábrica'}</span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <span className="text-sm font-black text-emerald-700 block">
                              {formatMoney(d.purchaseValue)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {d.hasReceipt || d.receiptName ? (() => {
                              let numReceipts = 1;
                              if (d.receiptsJson) {
                                try {
                                  const parsed = JSON.parse(d.receiptsJson);
                                  if (Array.isArray(parsed) && parsed.length > 0) {
                                    numReceipts = parsed.length;
                                  }
                                } catch {}
                              }
                              return (
                                <button
                                  type="button"
                                  onClick={() => void openReceipt(d.id)}
                                  className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 cursor-pointer shadow-xs transition-colors"
                                  title="Ver comprovante e prints da compra"
                                >
                                  <Receipt className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>{numReceipts > 1 ? `${numReceipts} Anexos` : 'Ver Recibo'}</span>
                                </button>
                              );
                            })() : (
                              <button
                                type="button"
                                onClick={() => setBuy(d)}
                                className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg border border-zinc-200 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 cursor-pointer"
                                title="Anexar comprovante"
                              >
                                <Camera className="h-3 w-3" />
                                <span>Anexar</span>
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEdit(d)}
                                className="p-1.5 rounded-lg border border-zinc-200 hover:border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 cursor-pointer transition-colors shadow-xs"
                                title="Editar ou Cancelar Manutenção"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {visiveis.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-zinc-400 text-sm">
                          Nenhuma compra de manutenção avulsa encontrada neste filtro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 text-left border-b border-zinc-100 bg-zinc-50/50">
                      <th className="px-4 py-3">Código / Data</th>
                      <th className="px-4 py-3">Item Solicitado</th>
                      <th className="px-4 py-3">Solicitante / Setor</th>
                      <th className="px-4 py-3">Máquina / Origem</th>
                      <th className="px-4 py-3 text-center">Cotações</th>
                      <th className="px-4 py-3 text-right">Cotação / Pago</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Loja / Compra</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                  {visiveis.map((d) => {
                    const st = statusMeta(d);
                    const og = origemMeta(d.origin);
                    const finalizada = isRecebida(d);
                    const emTransito = isComprada(d);
                    const quotes = parseQuotes(d);

                    return (
                      <tr key={d.id} className="hover:bg-zinc-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-zinc-900 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded block w-fit">
                            {d.trackingCode || 'SOL-____'}
                          </span>
                          <span className="text-[11px] font-mono text-zinc-400 block mt-0.5">
                            {dataBr(d.createdAt)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-zinc-900 leading-snug">
                            {d.status === 'impresso' ? 'Talão Físico Emitido' : labelOf(d)}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {d.status === 'impresso' ? (
                              <span className="italic text-zinc-400">Aguardando preenchimento no chão de fábrica</span>
                            ) : (
                              <>
                                Qtd: <strong className="text-zinc-800">{qtyOf(d)} un</strong>
                                {d.notes ? ` · Obs: ${d.notes}` : ''}
                              </>
                            )}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {d.status === 'impresso' ? (
                            <span className="text-xs text-zinc-400 italic">A preencher</span>
                          ) : (
                            <>
                              <span className="font-medium text-zinc-800 block">{d.requestedBy || '—'}</span>
                              {d.sector && <span className="text-xs text-zinc-400 block">{d.sector}</span>}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {d.equipmentName ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                              <Wrench className="h-3 w-3" /> {d.equipmentName}
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${og.cls}`}>
                              {og.label}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {d.status === 'impresso' ? (
                            <span className="text-xs text-zinc-400 font-mono">—</span>
                          ) : quotes.length > 0 ? (() => {
                            const qMetrics = calcQuoteMetrics(quotes);
                            return (
                              <div className="flex flex-col items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setQuotesModal(d)}
                                  className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                                    quotes.length >= 3
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                      : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                  }`}
                                  title="Ver cotações"
                                >
                                  <DollarSign className="h-3 w-3" />
                                  <span>{quotes.length} Cotação(ões)</span>
                                </button>
                                {qMetrics.winner && (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 truncate max-w-[130px]">
                                    🏆 {qMetrics.winner.supplier || 'Menor'}: {formatMoney(qMetrics.winner.totalPrice)}
                                  </span>
                                )}
                              </div>
                            );
                          })() : (
                            <button
                              type="button"
                              onClick={() => setQuotesModal(d)}
                              className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 cursor-pointer"
                              title="Iniciar cotação"
                            >
                              <Plus className="h-3 w-3" />
                              <span>Cotar</span>
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {d.status === 'impresso' ? (
                            <span className="text-xs text-zinc-400 font-mono">—</span>
                          ) : (
                            <>
                              <span className="text-xs font-bold text-zinc-500 block">
                                Cot: {formatMoney(d.quotedValue)}
                              </span>
                              <span className="text-sm font-black text-zinc-900 block">
                                {formatMoney(d.purchaseValue)}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${st.cls}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {d.storeName ? (
                            <div>
                              <span className="font-semibold text-zinc-800 block">{d.storeName}</span>
                              <span className="text-xs text-zinc-400 font-mono block">{dataBr(d.purchasedAt)}</span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {quotes.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setWhatsAppModal(d)}
                                className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 cursor-pointer shadow-xs"
                                title="Ver comparativo e copiar para WhatsApp"
                              >
                                <Share2 className="h-3.5 w-3.5 text-emerald-600" />
                                <span className="hidden xl:inline">WhatsApp</span>
                              </button>
                            )}

                            {d.hasReceipt && (
                              <button
                                type="button"
                                onClick={() => void openReceipt(d.id)}
                                className="p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 cursor-pointer shadow-xs"
                                title="Ver Comprovante"
                              >
                                <Receipt className="h-4 w-4" />
                              </button>
                            )}

                            {d.status === 'impresso' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTalaoCode(d.trackingCode || null);
                                  setTalaoOpen(true);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer shadow-xs transition-all hover:scale-[1.02]"
                                title="Preencher e lançar os itens deste talão físico"
                              >
                                <ClipboardList className="h-3.5 w-3.5" />
                                <span>Lançar Talão</span>
                              </button>
                            )}

                            {emTransito && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void marcarRecebida(d)}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs cursor-pointer disabled:opacity-50 shadow-xs"
                                title="Confirmar recebimento físico no almoxarifado"
                              >
                                Receber
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setEdit(d)}
                              className="p-1.5 rounded-lg border border-zinc-200 hover:border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 cursor-pointer transition-colors shadow-xs"
                              title="Editar ou Cancelar Solicitação"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {visiveis.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-zinc-400 text-sm">
                        Nenhuma solicitação encontrada neste filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              )}
            </div>
          </div>
        )}

        {/* Modal de Nova Compra de Manutenção Avulsa */}
        {maintOpen && (
          <NovaCompraManutencaoModal
            equipments={equipments}
            onClose={() => setMaintOpen(false)}
            onSaved={() => {
              setMaintOpen(false);
              setAviso('Compra de manutenção avulsa registrada com sucesso!');
              void load();
            }}
          />
        )}

        {/* Modal de Formulário Completo de Solicitação */}
        {addOpen && (
          <DemandFormModal
            equipments={equipments}
            onClose={() => setAddOpen(false)}
            onSaved={() => {
              setAddOpen(false);
              void load();
            }}
          />
        )}

        {/* Modal de Edição */}
        {edit && (
          <DemandFormModal
            demand={edit}
            equipments={equipments}
            onClose={() => setEdit(null)}
            onSaved={() => {
              setEdit(null);
              void load();
            }}
          />
        )}

        {/* Modal Rápido de Cotações */}
        {quotesModal && (
          <QuotesQuickModal
            demand={quotesModal}
            onClose={() => setQuotesModal(null)}
            onSaved={() => {
              setQuotesModal(null);
              void load();
            }}
            onOpenWhatsApp={(dem) => setWhatsAppModal(dem)}
            onOpenZoom={(title, src) => setZoomImage({ title, src })}
          />
        )}

        {/* Modal Lançar Talão Físico */}
        {talaoOpen && (
          <RegistrarTalaoModal
            equipments={equipments}
            initialTrackingCode={selectedTalaoCode}
            taloesImpressos={taloesRows.filter((d) => d.status === 'impresso')}
            onClose={() => {
              setTalaoOpen(false);
              setSelectedTalaoCode(null);
            }}
            onSaved={() => {
              setTalaoOpen(false);
              setSelectedTalaoCode(null);
              setAviso('Talão físico lançado com sucesso na esteira de compras!');
              void load();
            }}
            onOpenQuotes={(dem) => {
              setTalaoOpen(false);
              setSelectedTalaoCode(null);
              setQuotesModal(dem);
              void load();
            }}
          />
        )}

        {/* Modal de Compartilhamento WhatsApp / Relatório Visual Print */}
        {whatsAppModal && (
          <WhatsAppQuoteShareModal
            demand={whatsAppModal}
            onClose={() => setWhatsAppModal(null)}
            onOpenZoom={(title, src) => setZoomImage({ title, src })}
          />
        )}

        {/* Modal Zoom de Imagem */}
        {zoomImage && (
          <ImageZoomModal
            title={zoomImage.title}
            src={zoomImage.src}
            onClose={() => setZoomImage(null)}
          />
        )}

        {/* Modal Registrar Compra Efetivada */}
        {buy && (
          <BuyForm
            demand={buy}
            onClose={() => setBuy(null)}
            onSaved={() => {
              setBuy(null);
              void load();
            }}
          />
        )}

        {/* Modal Visualização de Comprovante */}
        {receipt && (
          <ReceiptView
            receipt={receipt}
            onClose={() => setReceipt(null)}
          />
        )}

        {/* Modal de Impressão de Talões A4 Recortáveis */}
        {printSlipsConfig.open && (
          <PrintSlipsModal
            demands={rows}
            initialMode={printSlipsConfig.initialMode}
            initialSelectedId={printSlipsConfig.selectedId}
            onClose={() => setPrintSlipsConfig({ open: false })}
            onPrinted={() => {
              void fetchSequence();
              void load();
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}

// -------------------------------------------------------------------------------------------------
// Form Modal com Memória de Preços Anteriores e Mínimo de 3 Cotações
// -------------------------------------------------------------------------------------------------
function DemandFormModal({
  demand,
  equipments,
  onClose,
  onSaved,
}: {
  demand?: Demand | null;
  equipments: Equipment[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const comprada = demand ? isComprada(demand) || isRecebida(demand) : false;
  const [title, setTitle] = useState(demand?.title || '');
  const [itemCode, setItemCode] = useState(demand?.items?.[0]?.itemCode || '');
  const [qty, setQty] = useState(String(demand ? qtyOf(demand) : 1));
  const [notes, setNotes] = useState(demand?.notes || '');
  const [requestedBy, setRequestedBy] = useState(demand?.requestedBy || '');
  const [sector, setSector] = useState(demand?.sector || '');
  const [equipmentId, setEquipmentId] = useState(demand?.equipmentId || '');
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [seqNumber, setSeqNumber] = useState<string>('');
  const [trackingCode, setTrackingCode] = useState(demand?.trackingCode || '');
  const [quotedValue, setQuotedValue] = useState(demand?.quotedValue != null ? String(demand.quotedValue) : '');
  const [purchaseValue, setPurchaseValue] = useState(demand?.purchaseValue != null ? String(demand.purchaseValue) : '');
  const [storeName, setStoreName] = useState(demand?.storeName || '');
  const [purchasedAt, setPurchasedAt] = useState((demand?.purchasedAt || '').slice(0, 10));
  const [urgency, setUrgency] = useState(demand?.urgency || 'normal');
  const [cancelBusy, setCancelBusy] = useState(false);

  // Itens individuais da solicitação / compra
  const [demandItems, setDemandItems] = useState<{
    itemCode?: string;
    description: string;
    qtyRequested: number;
    unitCost?: number | '';
  }[]>(() => {
    if (demand?.items && demand.items.length > 0) {
      return demand.items.map((it) => ({
        itemCode: it.itemCode || '',
        description: it.description || it.itemDescription || it.itemCode || '',
        qtyRequested: it.qtyRequested || 1,
        unitCost: typeof it.unitCost === 'number' ? it.unitCost : '',
      }));
    }
    return [];
  });

  // Vincula a solicitação avulsa à sequência contínua de talões de físico
  useEffect(() => {
    if (demand) return;
    let active = true;
    async function fetchNextSeq() {
      try {
        const res = await apiJson<{ nextSequence?: number }>('/almox/print-sequence');
        if (active && res && typeof res.nextSequence === 'number') {
          const num = res.nextSequence;
          setSeqNumber(String(num).padStart(4, '0'));
          setTrackingCode(`SOL-${currentYear}-${String(num).padStart(4, '0')}`);
        } else {
          setSeqNumber('0005');
          setTrackingCode(`SOL-${currentYear}-0005`);
        }
      } catch {
        if (active) {
          setSeqNumber('0005');
          setTrackingCode(`SOL-${currentYear}-0005`);
        }
      }
    }
    void fetchNextSeq();
    return () => {
      active = false;
    };
  }, [demand, currentYear]);

  // Cotações (mínimo de 3 slots por padrão)
  const [quotes, setQuotes] = useState<DemandQuote[]>(() => {
    const existing = demand ? parseQuotes(demand) : [];
    if (existing.length >= 3) return existing;
    const initial: DemandQuote[] = [...existing];
    while (initial.length < 3) {
      initial.push({
        id: `quote-${Date.now()}-${initial.length + 1}`,
        supplier: '',
        unitPrice: null,
        totalPrice: null,
        leadTime: '',
        notes: '',
        contact: '',
        selected: false,
      });
    }
    return initial;
  });

  // Histórico de compras anteriores do item
  const [history, setHistory] = useState<ItemPurchaseHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [catalog, setCatalog] = useState<AlmoxOpsItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiJson<{ items: AlmoxOpsItem[] }>('/almox/items')
      .then((res) => setCatalog(res.items ?? []))
      .catch(() => setCatalog([]));
  }, []);

  // Busca histórico de compras do item
  const fetchHistory = useCallback(async (code?: string, text?: string) => {
    const queryCode = code?.trim() || '';
    const queryText = text?.trim() || '';
    if (!queryCode && queryText.length < 3) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (queryCode) params.set('itemCode', queryCode);
      if (queryText) params.set('q', queryText);
      const res = await apiJson<{ history: ItemPurchaseHistory[] }>(`/almox/demands/history?${params.toString()}`);
      setHistory(res.history ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchHistory(itemCode, title);
    }, 400);
    return () => clearTimeout(timer);
  }, [itemCode, title, fetchHistory]);

  const escolhido = catalog.find((it) => it.code === itemCode);
  const numero = (raw: string) => {
    const n = raw.trim().replace(',', '.');
    if (!n) return null;
    const v = Number(n);
    return Number.isFinite(v) ? v : null;
  };

  const handleSelectQuoteWinner = (idx: number) => {
    setQuotes((prev) =>
      prev.map((q, i) => {
        const isWinner = i === idx;
        return { ...q, selected: isWinner };
      }),
    );
    const chosen = quotes[idx];
    if (chosen) {
      if (chosen.totalPrice != null) {
        setQuotedValue(String(chosen.totalPrice));
      } else if (chosen.unitPrice != null && Number(qty) > 0) {
        setQuotedValue(String(chosen.unitPrice * Number(qty)));
      }
      if (chosen.supplier) {
        setStoreName(chosen.supplier);
      }
    }
  };

  const addQuoteSlot = () => {
    setQuotes((prev) => [
      ...prev,
      {
        id: `quote-${Date.now()}-${prev.length + 1}`,
        supplier: '',
        unitPrice: null,
        totalPrice: null,
        leadTime: '',
        notes: '',
        contact: '',
        selected: false,
      },
    ]);
  };

  const updateQuote = (idx: number, patch: Partial<DemandQuote>) => {
    setQuotes((prev) =>
      prev.map((q, i) => {
        if (i !== idx) return q;
        const updated = { ...q, ...patch };
        // Recalcular total se unitPrice mudar
        if (patch.unitPrice !== undefined && updated.unitPrice != null && Number(qty) > 0) {
          updated.totalPrice = Number((updated.unitPrice * Number(qty)).toFixed(2));
        }
        return updated;
      }),
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const texto = (escolhido?.description || title).trim();
    if (!texto) {
      setError('Escolha um item do catálogo ou informe o que precisa comprar.');
      return;
    }
    if (!requestedBy.trim()) {
      setError('Informe o nome do solicitante.');
      return;
    }
    setBusy(true);
    setError(null);

    // Limpar cotações preenchidas
    const validQuotes = quotes.filter((q) => q.supplier.trim() || q.unitPrice != null || q.totalPrice != null);
    const quotesJsonStr = validQuotes.length > 0 ? JSON.stringify(validQuotes) : null;

    const eqObj = equipments.find((eq) => eq.id === equipmentId);
    const eqName = eqObj ? `${eqObj.code} - ${eqObj.name}` : null;

    const body = {
      title: texto,
      notes: notes || null,
      qty: Number(qty) || 1,
      requestedBy: requestedBy.trim(),
      quotedValue: numero(quotedValue),
      purchaseValue: numero(purchaseValue),
      storeName: storeName || null,
      purchasedAt: purchasedAt || null,
      trackingCode: trackingCode.trim() || null,
      sector: sector.trim() || eqObj?.sector || null,
      equipmentId: equipmentId || null,
      equipmentName: eqName,
      urgency,
      quotesJson: quotesJsonStr,
      items:
        demandItems.length > 0
          ? demandItems.map((it) => ({
              itemCode: it.itemCode || '',
              description: it.description.trim(),
              qtyRequested: Number(it.qtyRequested) || 1,
              unitCost: it.unitCost !== '' && Number(it.unitCost) > 0 ? Number(it.unitCost) : null,
            }))
          : undefined,
    };

    try {
      if (demand) {
        await apiJson(`/almox/demands/${encodeURIComponent(demand.id)}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });

        if (storeName.trim() && !comprada && demand.status !== 'em_transito') {
          await apiJson(`/almox/demands/${encodeURIComponent(demand.id)}/purchase`, {
            method: 'POST',
            body: JSON.stringify({
              storeName: storeName.trim(),
              purchasedAt: purchasedAt || new Date().toISOString().slice(0, 10),
              purchaseValue: numero(purchaseValue),
            }),
          }).catch(() => {});
        }
      } else {
        await apiJson('/almox/demands', {
          method: 'POST',
          body: JSON.stringify({
            ...body,
            origin: equipmentId ? 'manutencao' : 'manual',
            items: escolhido
              ? [{ itemCode: escolhido.code, description: escolhido.description, qtyRequested: Number(qty) || 1 }]
              : [],
          }),
        });

        // Sincroniza a numeração contínua de talão de compra
        const numSeq = parseInt(seqNumber, 10);
        if (!isNaN(numSeq) && numSeq > 0) {
          await apiJson('/almox/print-sequence', {
            method: 'POST',
            body: JSON.stringify({ sequence: numSeq }),
          }).catch(() => {});
        }
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a solicitação.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4">
      <form
        onSubmit={(e) => void save(e)}
        className="bg-white border border-zinc-200 rounded-2xl shadow-2xl w-full max-w-3xl p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div>
            <h3 className="font-black text-base text-zinc-900 tracking-tight">
              {demand ? 'Editar Solicitação / Talão de Compra' : 'Nova Solicitação / Entrada de Talão Físico'}
            </h3>
            <p className="text-xs text-zinc-500">
              Registra demanda, equipamento de destino, memória de preços e cotação de 3 fornecedores.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700">
            ✕
          </button>
        </div>

        {/* 1. Identificação & Rastreabilidade */}
        <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-200 space-y-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> 1. Identificação & Rastreabilidade
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1 block">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Código de Talão / Sequencial *
                </span>
                <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">
                  Sequência do Talão
                </span>
              </div>
              <input
                value={trackingCode}
                onChange={(e) => {
                  setTrackingCode(e.target.value);
                  const clean = e.target.value.replace(/\D/g, '').slice(-4);
                  if (clean) setSeqNumber(clean);
                }}
                placeholder={`Ex: SOL-${currentYear}-0005`}
                className="w-full rounded-xl border border-indigo-200 focus:border-indigo-600 px-3 py-2 text-sm bg-white font-mono font-bold text-indigo-950 min-h-11 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
              <span className="text-[10px] text-zinc-400 block">
                Vinculado à numeração contínua dos talões físicos de papel da fábrica.
              </span>
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Solicitante *
              </span>
              <input
                required
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                placeholder="Nome da pessoa que pediu"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Setor Solicitante
              </span>
              <input
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                placeholder="Ex: Produção, Envase, CQ, TI..."
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                <Wrench className="h-3 w-3" /> Equipamento / Máquina de Destino (Opcional)
              </span>
              <select
                value={equipmentId}
                onChange={(e) => {
                  setEquipmentId(e.target.value);
                  const hit = equipments.find((x) => x.id === e.target.value);
                  if (hit?.sector && !sector) setSector(hit.sector);
                }}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
                <option value="">Nenhum (Uso geral / almoxarifado)</option>
                {equipments.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.code} — {eq.name} {eq.sector ? `(${eq.sector})` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Urgência</span>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-semibold"
              >
                <option value="baixa">🟢 Baixa (Estoque preventivo)</option>
                <option value="normal">🟡 Normal (Reposição regular)</option>
                <option value="alta">🟠 Alta (Risco operacional)</option>
                <option value="critica">🔴 Crítica (MÁQUINA OU LINHA PARADA)</option>
              </select>
            </label>
          </div>
        </div>

        {/* 2. Item Solicitado e Quantidade */}
        <div className="space-y-3">
          {demandItems.length > 0 ? (
            <div className="space-y-2.5 bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-800 block">
                    Itens da Demanda / Pedido ({demandItems.length} itens)
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    Valores unitários e quantidades individuais vinculadas
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDemandItems((prev) => [
                      ...prev,
                      { description: '', qtyRequested: 1, unitCost: '' },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-xs font-bold text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-50 px-2.5 py-1 rounded-xl cursor-pointer shadow-2xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>+ Adicionar Item</span>
                </button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto">
                {demandItems.map((it, idx) => {
                  const q = Number(it.qtyRequested) || 0;
                  const u = typeof it.unitCost === 'number' ? it.unitCost : Number(it.unitCost) || 0;
                  const subtotal = q * u;

                  return (
                    <div
                      key={idx}
                      className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white p-2 rounded-xl border border-zinc-200 shadow-2xs"
                    >
                      <input
                        value={it.description}
                        onChange={(e) =>
                          setDemandItems((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)),
                          )
                        }
                        placeholder="Descrição do item"
                        className="flex-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs bg-white font-medium"
                      />
                      <div className="w-20 shrink-0">
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={it.qtyRequested}
                          onChange={(e) =>
                            setDemandItems((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, qtyRequested: Number(e.target.value) || 1 } : x,
                              ),
                            )
                          }
                          placeholder="Qtd"
                          className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-xs text-center font-bold"
                        />
                      </div>
                      <div className="w-28 shrink-0 relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 font-bold">
                          R$
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={it.unitCost}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : Number(e.target.value);
                            setDemandItems((prev) => {
                              const updated = prev.map((x, i) =>
                                i === idx ? { ...x, unitCost: val } : x,
                              );
                              const sum = updated.reduce(
                                (acc, x) =>
                                  acc + (Number(x.qtyRequested) || 0) * (Number(x.unitCost) || 0),
                                0,
                              );
                              if (sum > 0) setPurchaseValue(sum.toFixed(2));
                              return updated;
                            });
                          }}
                          placeholder="Unitário"
                          className="w-full rounded-lg border border-zinc-300 pl-6 pr-2 py-1.5 text-xs font-bold text-zinc-900"
                        />
                      </div>
                      <div className="w-20 shrink-0 text-right pr-1">
                        <span className="text-[11px] font-bold text-emerald-700 font-mono">
                          {subtotal > 0 ? `R$ ${subtotal.toFixed(2)}` : '—'}
                        </span>
                      </div>
                      {demandItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setDemandItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1.5 text-zinc-400 hover:text-rose-600 rounded cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Totalizador de itens */}
              {demandItems.some((it) => (Number(it.unitCost) || 0) > 0) && (
                <div className="flex items-center justify-between pt-1 px-1 text-xs border-t border-zinc-200">
                  <span className="text-zinc-500 font-medium">Soma dos itens:</span>
                  <span className="font-black text-emerald-800">
                    R${' '}
                    {demandItems
                      .reduce((acc, it) => acc + (Number(it.qtyRequested) || 0) * (Number(it.unitCost) || 0), 0)
                      .toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <>
              {!demand && (
                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Vincular a Item Existente do Catálogo (Opcional)
                  </span>
                  <select
                    value={itemCode}
                    onChange={(e) => {
                      setItemCode(e.target.value);
                      const hit = catalog.find((c) => c.code === e.target.value);
                      if (hit) setTitle(hit.description);
                    }}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    <option value="">Não vincular (Material avulso ou nova peça)</option>
                    {catalog.map((it) => (
                      <option key={it.code} value={it.code}>
                        {it.code} — {it.description} (Saldo: {it.qtyOnHand} {it.unit})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <label className="block space-y-1 sm:col-span-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Descrição do Material / Peça *
                  </span>
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Teclado USB, Fita Adesiva 48mm, Rolamento 6204 DDU..."
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-medium"
                  />
                </label>

                <label className="space-y-1 block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Quantidade *
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-bold"
                  />
                </label>
              </div>
            </>
          )}
        </div>

        {/* 3. Memória de Preços e Histórico Anterior */}
        {(history.length > 0 || historyLoading) && (
          <div className="bg-amber-50/60 rounded-xl p-3 border border-amber-200/80 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Memória de Preços Anteriores ({history.length} compras encontradas)
            </span>

            {historyLoading ? (
              <p className="text-xs text-amber-600">Buscando histórico de compras...</p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {history.slice(0, 3).map((h, i) => (
                  <div
                    key={`${h.demandId}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 rounded-lg text-xs border border-amber-100"
                  >
                    <div>
                      <span className="font-bold text-zinc-800">{h.storeName || 'Fornecedor anterior'}</span>
                      <span className="text-zinc-500 ml-1.5">
                        · Pago: <strong className="text-zinc-900">{formatMoney(h.purchaseValue || h.quotedValue)}</strong>
                      </span>
                      {h.unitCost != null && h.unitCost > 0 && (
                        <span className="text-emerald-700 font-bold ml-1.5 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded text-[11px]">
                          Unit: {formatMoney(h.unitCost)}
                        </span>
                      )}
                      {h.title && (
                        <span className="text-zinc-600 block text-[11px] font-medium mt-0.5">
                          Item: {h.title}
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-zinc-400 ml-1">({dataBr(h.purchasedAt || h.createdAt)})</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (h.storeName) setStoreName(h.storeName);
                        if (h.purchaseValue != null) setQuotedValue(String(h.purchaseValue));
                        else if (h.quotedValue != null) setQuotedValue(String(h.quotedValue));
                      }}
                      className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded hover:bg-indigo-100 cursor-pointer"
                    >
                      Copiar Preço / Loja
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. Cotações de Fornecedores (Mínimo de 3) */}
        <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-200 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-700 block font-bold flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-zinc-700" /> Cotação de Fornecedores (Mínimo de 3)
              </span>
              <p className="text-[11px] text-zinc-500">
                Registre os orçamentos de até 3 ou mais concorrentes e selecione o vencedor.
              </p>
            </div>
            <button
              type="button"
              onClick={addQuoteSlot}
              className="text-xs font-bold text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-100 px-2.5 py-1 rounded-lg cursor-pointer"
            >
              + Adicionar Fornecedor
            </button>
          </div>

          <div className="space-y-2">
            {quotes.map((q, idx) => (
              <div
                key={q.id || idx}
                className={`p-3 rounded-xl border transition-all ${
                  q.selected
                    ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20'
                    : 'bg-white border-zinc-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-black text-zinc-700">
                    Fornecedor #{idx + 1}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleSelectQuoteWinner(idx)}
                    className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg cursor-pointer transition-colors ${
                      q.selected
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    {q.selected ? <Check className="h-3 w-3" /> : <Star className="h-3 w-3" />}
                    {q.selected ? 'Vencedor Escolhido' : 'Marcar como Escolhido'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <label className="block sm:col-span-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block">Razão / Nome da Loja</span>
                    <input
                      value={q.supplier}
                      onChange={(e) => updateQuote(idx, { supplier: e.target.value })}
                      placeholder="Ex: Kalunga, Loja do Mecânico..."
                      className="w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block">Valor Unit. (R$)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={q.unitPrice != null ? String(q.unitPrice) : ''}
                      onChange={(e) => updateQuote(idx, { unitPrice: e.target.value ? Number(e.target.value) : null })}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block">Valor Total (R$)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={q.totalPrice != null ? String(q.totalPrice) : ''}
                      onChange={(e) => updateQuote(idx, { totalPrice: e.target.value ? Number(e.target.value) : null })}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs bg-white font-bold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  <label className="block">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block">Prazo de Entrega</span>
                    <input
                      value={q.leadTime || ''}
                      onChange={(e) => updateQuote(idx, { leadTime: e.target.value })}
                      placeholder="Ex: Pronta entrega, 3 dias úteis..."
                      className="w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block">Contato / Condições</span>
                    <input
                      value={q.contact || ''}
                      onChange={(e) => updateQuote(idx, { contact: e.target.value })}
                      placeholder="Ex: Vendedor João (11 9999-9999), 30 dias boleto..."
                      className="w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 5. Cotação Escolhida & Dados de Compra */}
        <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 block flex items-center gap-1.5 font-bold">
              <Store className="h-3.5 w-3.5 text-zinc-600" /> 5. Cotação Escolhida & Dados de Compra
            </span>
            {demand && !comprada && (
              <span className="text-[10px] text-zinc-400 font-semibold">
                Preencha caso a compra já tenha sido realizada
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Valor Cotado Escolhido (R$)
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={quotedValue}
                onChange={(e) => setQuotedValue(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-bold"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Valor Efetivo Pago (R$)
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={purchaseValue}
                onChange={(e) => setPurchaseValue(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-bold"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Loja / Fornecedor Efetivo
              </span>
              <input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Ex: Kalunga, Leroy Merlin..."
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Data Efetiva da Compra
              </span>
              <input
                type="date"
                value={purchasedAt}
                onChange={(e) => setPurchasedAt(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </label>
          </div>
        </div>

        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Observações / Destino / Justificativa
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Justificativa da compra, aplicação no maquinário, link do produto..."
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </label>

        {error && <p className="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200">{error}</p>}

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-100">
          {demand && demand.status !== 'cancelada' && (
            <button
              type="button"
              disabled={busy || cancelBusy}
              onClick={async () => {
                if (!confirm('Deseja realmente cancelar esta solicitação de compra?')) return;
                setCancelBusy(true);
                setError(null);
                try {
                  await apiJson(`/almox/demands/${encodeURIComponent(demand.id)}/status`, {
                    method: 'PUT',
                    body: JSON.stringify({ status: 'cancelada' }),
                  });
                  onSaved();
                  onClose();
                } catch (err: unknown) {
                  setError(err instanceof Error ? err.message : 'Não foi possível cancelar a solicitação.');
                } finally {
                  setCancelBusy(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl cursor-pointer transition-colors min-h-11"
            >
              <Ban className="h-4 w-4 text-rose-600" />
              <span>Cancelar Solicitação</span>
            </button>
          )}

          {demand && demand.status === 'cancelada' && (
            <button
              type="button"
              disabled={busy || cancelBusy}
              onClick={async () => {
                if (!confirm('Deseja reativar esta solicitação cancelada?')) return;
                setCancelBusy(true);
                setError(null);
                try {
                  await apiJson(`/almox/demands/${encodeURIComponent(demand.id)}/status`, {
                    method: 'PUT',
                    body: JSON.stringify({ status: 'aberta' }),
                  });
                  onSaved();
                  onClose();
                } catch (err: unknown) {
                  setError(err instanceof Error ? err.message : 'Não foi possível reativar a solicitação.');
                } finally {
                  setCancelBusy(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl cursor-pointer transition-colors min-h-11"
            >
              <RefreshCw className="h-4 w-4 text-emerald-600" />
              <span>Reativar Solicitação</span>
            </button>
          )}

          {!demand && <div />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-700 cursor-pointer min-h-11"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={busy || cancelBusy}
              className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 min-h-11 shadow-xs"
            >
              Salvar Solicitação
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// -------------------------------------------------------------------------------------------------
// Modal de Zoom de Imagens e Prints Anexados
// -------------------------------------------------------------------------------------------------
function ImageZoomModal({
  title,
  src,
  onClose,
}: {
  title: string;
  src: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-zinc-50">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-indigo-600" />
            <h4 className="font-bold text-sm text-zinc-900 truncate">{title}</h4>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={src}
              download={`${title.toLowerCase().replace(/\s+/g, '_')}.jpg`}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 transition-colors cursor-pointer"
              title="Baixar imagem"
            >
              <Download className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-200 transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="p-3 bg-zinc-900 flex items-center justify-center flex-1 overflow-auto max-h-[calc(92vh-60px)]">
          <img src={src} alt={title} className="max-w-full max-h-full object-contain rounded-lg shadow-md" />
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// Modal de Compartilhamento Visual para WhatsApp / Print de Comprovação
// -------------------------------------------------------------------------------------------------
function WhatsAppQuoteShareModal({
  demand,
  quotes: initialQuotes,
  onClose,
  onOpenZoom,
}: {
  demand: Demand;
  quotes?: DemandQuote[];
  onClose: () => void;
  onOpenZoom?: (title: string, src: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);

  const quotes = useMemo(() => {
    if (initialQuotes && initialQuotes.length > 0) return initialQuotes;
    return parseQuotes(demand);
  }, [initialQuotes, demand]);

  const metrics = useMemo(() => calcQuoteMetrics(quotes), [quotes]);

  useEffect(() => {
    let active = true;
    let objUrl: string | null = null;
    async function loadLogo() {
      try {
        const res = await apiFetch('/qualidade/pops/settings/logo');
        if (res.ok) {
          const blob = await res.blob();
          if (active && blob.size > 0) {
            objUrl = URL.createObjectURL(blob);
            setLogoSrc(objUrl);
            return;
          }
        }
      } catch {}
      try {
        const res = await apiFetch('/settings/report-logo');
        if (res.ok) {
          const blob = await res.blob();
          if (active && blob.size > 0) {
            objUrl = URL.createObjectURL(blob);
            setLogoSrc(objUrl);
            return;
          }
        }
      } catch {}
      if (active) setLogoSrc('/logo.svg');
    }
    void loadLogo();
    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, []);

  const handleCopyText = async () => {
    const text = generateWhatsAppText(demand, quotes);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      alert('Não foi possível copiar automaticamente para a área de transferência.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl my-auto border border-zinc-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Barra superior de ações */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-900 text-white border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Modo Print & WhatsApp
            </span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
              Comprovante Oficial
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'
              }`}
              title="Copiar texto formatado com emojis para o WhatsApp"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copiado para WhatsApp!' : 'Copiar Texto p/ WhatsApp'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer hidden sm:inline-flex"
              title="Imprimir / Salvar PDF"
            >
              <Printer className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Quadro Visual para Tirar Print */}
        <div className="p-5 sm:p-7 space-y-5 bg-white text-zinc-900" id="whatsapp-quotation-card">
          {/* Cabeçalho com Logo e Título */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
            <div className="flex items-center gap-3.5">
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt="Natumix"
                  className="h-10 sm:h-12 w-auto object-contain max-w-[140px]"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="h-10 w-10 rounded-xl bg-zinc-900 flex items-center justify-center text-white font-black text-lg">
                  N
                </div>
              )}
              <div>
                <h3 className="font-black text-lg sm:text-xl text-zinc-900 tracking-tight leading-none">
                  RELATÓRIO DE COTAÇÃO DE PREÇOS
                </h3>
                <p className="text-xs text-zinc-500 font-semibold mt-1">
                  Almoxarifado & Compras · Natumix Indústria
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <span className="font-mono text-sm font-black bg-zinc-900 text-white px-2.5 py-1 rounded-lg inline-block shadow-xs">
                {demand.trackingCode || 'SOL-2026-____'}
              </span>
              <p className="text-[11px] text-zinc-400 font-mono mt-1">
                Data: {dataBr(demand.createdAt)}
              </p>
            </div>
          </div>

          {/* Dados do Item */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                Item Requisitado
              </span>
              <p className="font-black text-sm text-zinc-900 mt-0.5">{labelOf(demand)}</p>
              <p className="text-zinc-600 mt-0.5">
                Quantidade Requisitada: <strong className="text-zinc-900">{qtyOf(demand)} unidades</strong>
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Solicitante:</span>
                <span className="font-bold text-zinc-800">{demand.requestedBy || 'Operador'}</span>
              </div>
              {demand.sector && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Setor:</span>
                  <span className="font-semibold text-zinc-700">{demand.sector}</span>
                </div>
              )}
              {demand.equipmentName && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Máquina:</span>
                  <span className="font-bold text-indigo-700">{demand.equipmentName}</span>
                </div>
              )}
              {demand.urgency && demand.urgency !== 'normal' && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Urgência:</span>
                  <span className="font-bold uppercase text-rose-700">{urgencyMeta(demand.urgency).label}</span>
                </div>
              )}
            </div>
          </div>

          {/* Comparativo de Cotações */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700 flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-emerald-600" /> Comparativo de Fornecedores Cotados
              </h4>
              <span className="text-[11px] font-semibold text-zinc-500">
                {metrics.validQuotes.length} fornecedor(es) registrado(s)
              </span>
            </div>

            {metrics.validQuotes.length === 0 ? (
              <div className="p-6 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-2xl text-xs">
                Nenhuma cotação foi registrada ainda para este pedido.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {metrics.validQuotes.map((q, idx) => {
                  const isWinner =
                    (metrics.winner && metrics.winner.id === q.id) ||
                    (metrics.minPrice != null && q.totalPrice === metrics.minPrice);

                  return (
                    <div
                      key={q.id || idx}
                      className={`relative rounded-2xl border p-3.5 flex flex-col justify-between transition-all ${
                        isWinner
                          ? 'bg-emerald-50/60 border-emerald-400 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'bg-white border-zinc-200'
                      }`}
                    >
                      {isWinner && (
                        <div className="absolute -top-2.5 left-3 bg-emerald-600 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                          <Check className="h-2.5 w-2.5" />
                          <span>Vencedor / Menor Preço</span>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mt-1 mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                            Opção #{idx + 1}
                          </span>
                          {q.leadTime && (
                            <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                              ⏱️ {q.leadTime}
                            </span>
                          )}
                        </div>

                        <h5 className="font-black text-sm text-zinc-900 leading-snug line-clamp-1">
                          {q.supplier || `Fornecedor #${idx + 1}`}
                        </h5>

                        <div className="mt-2.5 mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                            Valor Total Cotado
                          </span>
                          <span
                            className={`text-lg sm:text-xl font-black ${
                              isWinner ? 'text-emerald-700' : 'text-zinc-900'
                            }`}
                          >
                            {formatMoney(q.totalPrice)}
                          </span>
                        </div>

                        {q.url && (
                          <div className="mt-1">
                            <a
                              href={q.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1 truncate max-w-full"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span className="truncate">Ver anúncio / site</span>
                            </a>
                          </div>
                        )}
                      </div>

                      {q.printData && (
                        <div className="mt-3 pt-2.5 border-t border-zinc-100">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                            Comprovante do Site
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onOpenZoom?.(`Comprovante - ${q.supplier || 'Cotação'}`, q.printData!)
                            }
                            className="relative group w-full h-20 rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100 cursor-pointer block"
                            title="Clique para ampliar o print"
                          >
                            <img
                              src={q.printData}
                              alt={`Print ${q.supplier}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px] font-bold gap-1">
                              <ZoomIn className="h-3.5 w-3.5" /> Ampliar
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Resumo e Economia */}
          {metrics.minPrice != null && (
            <div className="bg-emerald-900 text-white rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block">
                  Decisão Final da Cotação
                </span>
                <p className="font-black text-sm sm:text-base text-white">
                  Fornecedor Escolhido: {metrics.winner?.supplier || 'Menor Preço'} ({formatMoney(metrics.minPrice)})
                </p>
                {metrics.savings > 0 && (
                  <p className="text-xs text-emerald-200 font-semibold">
                    Economia gerada para a empresa: {formatMoney(metrics.savings)} ({metrics.savingsPct}%)
                  </p>
                )}
              </div>

              <div className="text-right shrink-0 bg-emerald-800/80 px-3.5 py-2 rounded-xl border border-emerald-700">
                <span className="text-[10px] uppercase font-bold text-emerald-300 block">Melhor Preço</span>
                <span className="text-xl font-black text-white">{formatMoney(metrics.minPrice)}</span>
              </div>
            </div>
          )}

          {/* Rodapé de autenticidade */}
          <div className="text-[10px] text-zinc-400 text-center pt-2 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-1">
            <span>Natumix Indústria e Comércio Ltda · Sistema de Controle de Almoxarifado</span>
            <span className="font-mono">Rastreabilidade: {demand.trackingCode || demand.id}</span>
          </div>
        </div>

        {/* Rodapé com Dica de Screenshot */}
        <div className="bg-zinc-50 border-t border-zinc-200 px-5 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-zinc-500 font-medium">
            💡 <strong>Dica rápida:</strong> Pressione <kbd className="font-mono bg-white border border-zinc-300 px-1.5 py-0.5 rounded text-[11px] font-bold">Win + Shift + S</kbd> para tirar print deste quadro e colar direto no WhatsApp!
          </p>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyText}
              className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs'
              }`}
            >
              {copied ? '✓ Copiado!' : '📱 Copiar Texto p/ WhatsApp'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-700 hover:bg-zinc-100 text-xs font-bold cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// Modal Dinâmico de Cotação Rápida (Link + Valor + Print com Colagem Ctrl+V + Decisão Automática)
// -------------------------------------------------------------------------------------------------
function QuotesQuickModal({
  demand,
  onClose,
  onSaved,
  onOpenWhatsApp,
  onOpenZoom,
}: {
  demand: Demand;
  onClose: () => void;
  onSaved: () => void;
  onOpenWhatsApp?: (demand: Demand) => void;
  onOpenZoom?: (title: string, src: string) => void;
}) {
  const [quotes, setQuotes] = useState<DemandQuote[]>(() => {
    const existing = parseQuotes(demand);
    if (existing.length >= 3) return existing;
    const initial: DemandQuote[] = [...existing];
    while (initial.length < 3) {
      initial.push({
        id: `quote-${Date.now()}-${initial.length + 1}`,
        supplier: '',
        unitPrice: null,
        totalPrice: null,
        leadTime: '',
        notes: '',
        contact: '',
        url: '',
        printData: null,
        printName: null,
        selected: false,
      });
    }
    return initial;
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  // Métricas automáticas calculadas em tempo real
  const metrics = useMemo(() => calcQuoteMetrics(quotes), [quotes]);

  // Se o menor preço mudar e nenhum estiver marcado como selecionado manualmente, o menor preço vence
  useEffect(() => {
    if (metrics.minPrice != null) {
      setQuotes((prev) => {
        const hasManualWinner = prev.some((q) => q.selected);
        if (hasManualWinner) return prev;
        return prev.map((q) => ({
          ...q,
          selected: q.totalPrice === metrics.minPrice,
        }));
      });
    }
  }, [metrics.minPrice]);

  const handleSelectQuoteWinner = (idx: number) => {
    setQuotes((prev) =>
      prev.map((q, i) => ({
        ...q,
        selected: i === idx,
      })),
    );
  };

  const updateQuote = (idx: number, patch: Partial<DemandQuote>) => {
    setQuotes((prev) =>
      prev.map((q, i) => {
        if (i !== idx) return q;
        const updated = { ...q, ...patch };

        // Se o usuário digitou ou colou um link e o fornecedor estava vazio, auto-detecta a loja
        if (patch.url !== undefined && patch.url && !updated.supplier.trim()) {
          const autoStore = extractStoreNameFromUrl(patch.url);
          if (autoStore) updated.supplier = autoStore;
        }

        const qCount = demand.qty || 1;
        if (patch.unitPrice !== undefined && updated.unitPrice != null) {
          updated.totalPrice = Number((updated.unitPrice * qCount).toFixed(2));
        }
        return updated;
      }),
    );
  };

  const addQuoteSlot = () => {
    setQuotes((prev) => [
      ...prev,
      {
        id: `quote-${Date.now()}-${prev.length + 1}`,
        supplier: '',
        unitPrice: null,
        totalPrice: null,
        leadTime: '',
        notes: '',
        contact: '',
        url: '',
        printData: null,
        printName: null,
        selected: false,
      },
    ]);
  };

  const removeQuoteSlot = (idx: number) => {
    if (quotes.length <= 1) return;
    setQuotes((prev) => prev.filter((_, i) => i !== idx));
  };

  // Captura direta de colagem de imagem (Ctrl+V) no card da cotação
  const handlePasteImage = async (e: React.ClipboardEvent, quoteIdx: number) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          try {
            const base64 = await compressImage(file);
            updateQuote(quoteIdx, {
              printData: base64,
              printName: `print_cotacao_${quoteIdx + 1}.jpg`,
            });
          } catch {
            // falha silenciosa
          }
          break;
        }
      }
    }
  };

  const handleFileUpload = async (file: File, quoteIdx: number) => {
    try {
      const base64 = await compressImage(file);
      updateQuote(quoteIdx, {
        printData: base64,
        printName: file.name,
      });
    } catch {
      alert('Erro ao processar imagem anexada.');
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const validQuotes = quotes.filter(
        (q) => q.supplier.trim() || q.unitPrice != null || q.totalPrice != null || (q.url && q.url.trim()),
      );
      const winner = quotes.find((q) => q.selected) || (metrics.minPrice != null ? quotes.find((q) => q.totalPrice === metrics.minPrice) : null);

      await apiJson(`/almox/demands/${encodeURIComponent(demand.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: demand.title,
          qty: demand.qty || 1,
          requestedBy: demand.requestedBy || 'Operador',
          quotesJson: validQuotes.length > 0 ? JSON.stringify(validQuotes) : '[]',
          quotedValue: winner?.totalPrice ?? demand.quotedValue,
          storeName: winner?.supplier || demand.storeName,
        }),
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar cotações');
    } finally {
      setBusy(false);
    }
  };

  // Aprovação em 1 clique para quando houver apenas 1 cotação
  const approveSingleQuote = async (targetQuote?: DemandQuote) => {
    const q = targetQuote || metrics.quotesWithPrice[0] || quotes[0];
    if (!q || q.totalPrice == null) {
      setError('Informe o valor da cotação antes de aprovar.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updatedQuotes = quotes.map((item) => ({
        ...item,
        selected: item.id === q.id,
      }));
      const valid = updatedQuotes.filter(
        (it) => it.supplier.trim() || it.unitPrice != null || it.totalPrice != null || (it.url && it.url.trim()),
      );

      await apiJson(`/almox/demands/${encodeURIComponent(demand.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: demand.title,
          qty: demand.qty || 1,
          requestedBy: demand.requestedBy || 'Operador',
          quotesJson: JSON.stringify(valid),
          quotedValue: q.totalPrice,
          storeName: q.supplier || 'Fornecedor Único',
        }),
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao aprovar cotação única.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyWhatsApp = async () => {
    const text = generateWhatsAppText(demand, quotes);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 3000);
    } catch {
      alert('Não foi possível copiar texto.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-zinc-200 rounded-3xl shadow-2xl w-full max-w-3xl my-auto p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded">
                {demand.trackingCode || 'SOL'}
              </span>
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                {demand.requestedBy ? `Solicitante: ${demand.requestedBy}` : 'Cotação Dinâmica'}
              </span>
            </div>
            <h3 className="font-black text-lg text-zinc-900 mt-1 leading-snug">
              Cotações de Preço: {labelOf(demand)}
            </h3>
            <p className="text-xs text-zinc-500">
              Cole o link e digite o valor. Cole prints direto com <kbd className="font-mono bg-zinc-100 px-1 rounded text-[10px] font-bold">Ctrl+V</kbd>. O sistema detecta o menor preço!
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyWhatsApp}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all border ${
                copiedText
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
              }`}
              title="Copiar resumo de cotação para enviar no WhatsApp"
            >
              {copiedText ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedText ? 'Copiado!' : 'WhatsApp'}</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenWhatsApp?.(demand)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer shadow-xs"
              title="Abrir quadro visual para tirar print oficial"
            >
              <Share2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>Modo Print</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Banner de Cotação Única (Aprovação em 1 clique) */}
        {metrics.quotesWithPrice.length === 1 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <h5 className="font-bold text-xs text-emerald-950">
                  Cotação Única Registrada ({formatMoney(metrics.minPrice)})
                </h5>
                <p className="text-[11px] text-emerald-700">
                  Fornecedor único ({metrics.quotesWithPrice[0]?.supplier || 'Loja'}). Você pode aprovar agora sem necessidade de outras cotações.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void approveSingleQuote(metrics.quotesWithPrice[0])}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Aprovar Cotação Única</span>
            </button>
          </div>
        )}

        {/* Banner de Economia Detectada */}
        {metrics.savings > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" />
              <span className="text-indigo-900 font-bold">
                🏆 Menor Preço: {formatMoney(metrics.minPrice)} · Economia de {formatMoney(metrics.savings)} ({metrics.savingsPct}%)
              </span>
            </div>
            <span className="text-[11px] font-semibold text-indigo-700">
              {metrics.quotesWithPrice.length} valores comparados
            </span>
          </div>
        )}

        {/* Cards Dinâmicos de Cotação */}
        <div className="space-y-3">
          {quotes.map((q, idx) => {
            const isCheapest = metrics.minPrice != null && q.totalPrice === metrics.minPrice;
            const isWinner = q.selected || isCheapest;

            return (
              <div
                key={q.id || idx}
                onPaste={(e) => void handlePasteImage(e, idx)}
                tabIndex={0}
                className={`p-4 rounded-2xl border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${
                  isWinner
                    ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20'
                    : 'bg-zinc-50/70 border-zinc-200 hover:border-zinc-300'
                }`}
              >
                {/* Linha do topo do Card */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-zinc-800">
                      Fornecedor #{idx + 1}
                    </span>
                    {isCheapest && (
                      <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                        <Check className="h-2.5 w-2.5" /> Menor Preço
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectQuoteWinner(idx)}
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl cursor-pointer transition-all ${
                        q.selected
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      {q.selected ? <Check className="h-3 w-3" /> : <Star className="h-3 w-3" />}
                      <span>{q.selected ? 'Vencedor Selecionado' : 'Selecionar'}</span>
                    </button>

                    {quotes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeQuoteSlot(idx)}
                        className="p-1 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="Remover esta opção de cotação"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 1. Link e Valor (Prioridade Máxima) */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  {/* Link / URL */}
                  <div className="sm:col-span-8">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block mb-0.5">
                      Link / URL do Produto (Preenchimento rápido)
                    </span>
                    <div className="relative flex items-center">
                      <input
                        value={q.url || ''}
                        onChange={(e) => updateQuote(idx, { url: e.target.value })}
                        placeholder="Cole o link aqui (ex: https://mercadolivre.com.br/...)"
                        className="w-full rounded-xl border border-zinc-300 pl-2.5 pr-8 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                      />
                      {q.url && (
                        <a
                          href={q.url}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute right-2 text-zinc-400 hover:text-indigo-600"
                          title="Abrir link em nova aba"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Valor Total */}
                  <div className="sm:col-span-4">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block mb-0.5">
                      Valor Total (R$) *
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={q.totalPrice != null ? String(q.totalPrice) : ''}
                      onChange={(e) =>
                        updateQuote(idx, {
                          totalPrice: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      placeholder="0.00"
                      className="w-full rounded-xl border border-zinc-300 px-2.5 py-2 text-sm font-black text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                </div>

                {/* 2. Nome da Loja e Print Anexado */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 mt-2.5">
                  <div className="sm:col-span-6">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block mb-0.5">
                      Loja / Razão Social
                    </span>
                    <input
                      value={q.supplier}
                      onChange={(e) => updateQuote(idx, { supplier: e.target.value })}
                      placeholder="Ex: Mercado Livre, Loja do Mecânico..."
                      className="w-full rounded-xl border border-zinc-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 font-semibold"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block mb-0.5">
                      Prazo de Entrega
                    </span>
                    <input
                      value={q.leadTime || ''}
                      onChange={(e) => updateQuote(idx, { leadTime: e.target.value })}
                      placeholder="Ex: 2 dias, Imediato"
                      className="w-full rounded-xl border border-zinc-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>

                  {/* Print / Screenshot Anexado */}
                  <div className="sm:col-span-3">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block mb-0.5">
                      Print / Prova do Site
                    </span>
                    {q.printData ? (
                      <div className="flex items-center gap-1.5 bg-white border border-zinc-200 rounded-xl p-1">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenZoom?.(
                              `Comprovante - ${q.supplier || 'Cotação'}`,
                              q.printData!,
                            )
                          }
                          className="h-7 w-10 rounded-lg overflow-hidden border border-zinc-200 bg-zinc-100 cursor-pointer shrink-0"
                          title="Clique para ver o print ampliado"
                        >
                          <img
                            src={q.printData}
                            alt="Print"
                            className="h-full w-full object-cover"
                          />
                        </button>
                        <span className="text-[10px] font-semibold text-zinc-700 truncate flex-1">
                          Print Anexado
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateQuote(idx, { printData: null, printName: null })
                          }
                          className="p-1 text-zinc-400 hover:text-rose-600 rounded cursor-pointer"
                          title="Remover print"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-1 text-[11px] font-bold text-zinc-600 bg-white border border-dashed border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50 rounded-xl py-1.5 px-2 cursor-pointer transition-colors">
                        <Camera className="h-3.5 w-3.5 text-indigo-500" />
                        <span>Anexar Print (Ctrl+V)</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleFileUpload(f, idx);
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Botão Adicionar Mais Fornecedor */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={addQuoteSlot}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 hover:text-zinc-900 bg-white border border-zinc-300 hover:bg-zinc-50 px-3 py-1.5 rounded-xl cursor-pointer shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Adicionar Outro Fornecedor</span>
          </button>

          {metrics.winner && metrics.minPrice != null && (
            <span className="text-xs font-black text-emerald-800">
              Vencedor atual: {metrics.winner.supplier || 'Menor Preço'} ({formatMoney(metrics.minPrice)})
            </span>
          )}
        </div>

        {error && (
          <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
            {error}
          </p>
        )}

        {/* Rodapé com Salvar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-zinc-100">
          <p className="text-[11px] text-zinc-400">
            Pressione <kbd className="font-mono bg-zinc-100 px-1 rounded text-[10px] font-bold">Ctrl+V</kbd> dentro de qualquer card para colar prints de tela diretamente.
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold rounded-xl border border-zinc-200 hover:bg-zinc-50 cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 shadow-xs"
            >
              Salvar Cotações
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// Modal de Lançamento de Talão Físico da Fábrica (Registrar Requisição Retornada em Papel)
// -------------------------------------------------------------------------------------------------
interface TalaoItemDraft {
  description: string;
  qtyRequested: number;
}

function RegistrarTalaoModal({
  equipments,
  initialTrackingCode,
  taloesImpressos = [],
  onClose,
  onSaved,
  onOpenQuotes,
}: {
  equipments: Equipment[];
  initialTrackingCode?: string | null;
  taloesImpressos?: Demand[];
  onClose: () => void;
  onSaved: () => void;
  onOpenQuotes?: (demand: Demand) => void;
}) {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [seqNumber, setSeqNumber] = useState<string>(() => {
    if (initialTrackingCode) {
      const m = initialTrackingCode.match(/SOL-\d{4}-(\d+)/);
      if (m) return m[1];
    }
    return '';
  });
  const [trackingCode, setTrackingCode] = useState<string>(() => initialTrackingCode || '');
  const [requestedAt, setRequestedAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [requestedBy, setRequestedBy] = useState<string>('');
  const [sector, setSector] = useState<string>('Manutenção');
  const [urgency, setUrgency] = useState<string>('normal');
  const [equipmentId, setEquipmentId] = useState<string>('');
  const [justification, setJustification] = useState<string>('');
  const [items, setItems] = useState<TalaoItemDraft[]>([
    { description: '', qtyRequested: 1 },
  ]);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Busca a próxima sequência do servidor ou sugere o primeiro talão impresso pendente se não foi passado código inicial
  useEffect(() => {
    if (initialTrackingCode) return;
    let active = true;
    async function fetchNextSeq() {
      if (taloesImpressos.length > 0) {
        const first = taloesImpressos[0];
        if (first.trackingCode) {
          setTrackingCode(first.trackingCode);
          const m = first.trackingCode.match(/SOL-\d{4}-(\d+)/);
          if (m) setSeqNumber(m[1]);
          return;
        }
      }
      try {
        const res = await apiJson<{ nextSequence?: number }>('/almox/print-sequence');
        if (active && res && typeof res.nextSequence === 'number') {
          const num = res.nextSequence;
          setSeqNumber(String(num).padStart(4, '0'));
          setTrackingCode(`SOL-${currentYear}-${String(num).padStart(4, '0')}`);
        } else {
          setSeqNumber('0005');
          setTrackingCode(`SOL-${currentYear}-0005`);
        }
      } catch {
        if (active) {
          setSeqNumber('0005');
          setTrackingCode(`SOL-${currentYear}-0005`);
        }
      }
    }
    void fetchNextSeq();
    return () => {
      active = false;
    };
  }, [currentYear, initialTrackingCode, taloesImpressos]);

  // Atualiza o código ao mudar o número
  const handleSeqChange = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 5);
    setSeqNumber(clean);
    if (clean) {
      setTrackingCode(`SOL-${currentYear}-${clean.padStart(4, '0')}`);
    }
  };

  const addItemRow = () => {
    if (items.length >= 4) return;
    setItems((prev) => [...prev, { description: '', qtyRequested: 1 }]);
  };

  const removeItemRow = (idx: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItemRow = (idx: number, patch: Partial<TalaoItemDraft>) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  };

  const handlePastePhoto = async (e: React.ClipboardEvent) => {
    const clipItems = e.clipboardData?.items;
    if (!clipItems) return;
    for (let i = 0; i < clipItems.length; i++) {
      if (clipItems[i].type.startsWith('image/')) {
        const f = clipItems[i].getAsFile();
        if (f) {
          e.preventDefault();
          try {
            const b64 = await compressImage(f);
            setPhotoData(b64);
            setPhotoName(`foto_talao_${Date.now()}.jpg`);
          } catch {}
          break;
        }
      }
    }
  };

  const save = async (startQuotesAfter: boolean = false) => {
    if (!requestedBy.trim()) {
      setError('Informe o nome do solicitante.');
      return;
    }
    const validItems = items.filter((it) => it.description.trim());
    if (validItems.length === 0) {
      setError('Informe ao menos 1 item solicitado no talão.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const eq = equipments.find((x) => x.id === equipmentId);

      const payload = {
        title: validItems[0]?.description || 'Talão Físico',
        notes: justification.trim() || null,
        origin: 'talao',
        qty: validItems.reduce((acc, it) => acc + (it.qtyRequested || 1), 0),
        requestedBy: requestedBy.trim(),
        trackingCode: trackingCode.trim() || null,
        equipmentId: equipmentId || null,
        equipmentName: eq ? `${eq.code} - ${eq.name}` : null,
        sector: sector.trim() || null,
        urgency: urgency || 'normal',
        items: validItems.map((it) => ({
          itemCode: '',
          description: it.description.trim(),
          qtyRequested: it.qtyRequested || 1,
        })),
      };

      const res = await apiJson<{ demand: Demand }>('/almox/demands', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Atualiza sequência se for um número válido
      const numSeq = parseInt(seqNumber, 10);
      if (!isNaN(numSeq) && numSeq > 0) {
        await apiJson('/almox/print-sequence', {
          method: 'POST',
          body: JSON.stringify({ sequence: numSeq }),
        }).catch(() => {});
      }

      onSaved();
      if (startQuotesAfter && res.demand && onOpenQuotes) {
        onOpenQuotes(res.demand);
      } else {
        onClose();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao registrar talão.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onPaste={(e) => void handlePastePhoto(e)}
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white border border-zinc-200 rounded-3xl shadow-2xl w-full max-w-2xl my-auto p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg text-zinc-900 leading-snug">
                Lançar Talão Físico da Fábrica
              </h3>
              <p className="text-xs text-zinc-500">
                Registre o comprovante de papel preenchido pelos setores para entrar na esteira de compras.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Seletor rápido de talhões impressos aguardando preenchimento */}
          {taloesImpressos.length > 0 && (
            <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5 text-indigo-700" />
                  Talhões Impressos Aguardando Lançamento ({taloesImpressos.length}):
                </span>
                <span className="text-[10px] text-indigo-600 font-semibold">
                  Clique para selecionar
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {taloesImpressos.map((t) => {
                  const isSel = t.trackingCode === trackingCode;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (t.trackingCode) {
                          setTrackingCode(t.trackingCode);
                          const m = t.trackingCode.match(/SOL-\d{4}-(\d+)/);
                          if (m) setSeqNumber(m[1]);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold cursor-pointer transition-all ${
                        isSel
                          ? 'bg-indigo-700 text-white shadow-xs scale-105'
                          : 'bg-white hover:bg-indigo-100 text-indigo-900 border border-indigo-200'
                      }`}
                    >
                      {t.trackingCode}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Número do Talão e Data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                Número do Talão / Sequência *
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-zinc-500 bg-white border border-zinc-200 px-2.5 py-2 rounded-xl">
                  SOL-{currentYear}-
                </span>
                <input
                  type="text"
                  maxLength={5}
                  value={seqNumber}
                  onChange={(e) => handleSeqChange(e.target.value)}
                  placeholder="0005"
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm font-mono font-black text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <span className="text-[10px] text-zinc-400 mt-1 block">
                Código gerado: <strong className="text-zinc-700 font-mono">{trackingCode}</strong>
              </span>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                Data do Talão
              </span>
              <input
                type="date"
                value={requestedAt}
                onChange={(e) => setRequestedAt(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>

          {/* Solicitante e Setor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                Nome do Solicitante *
              </span>
              <input
                required
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                placeholder="Ex: João Silva, Carlos Manutenção..."
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 font-semibold"
              />
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                Setor
              </span>
              <input
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                placeholder="Ex: Manutenção, Envase..."
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {['Manutenção', 'Envase', 'Produção', 'Laboratório', 'Limpeza', 'Escritório'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSector(st)}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 cursor-pointer"
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Urgência e Máquina */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                Urgência
              </span>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 font-bold"
              >
                <option value="normal">🟡 Normal (Reposição regular)</option>
                <option value="alta">🟠 Alta (Risco operacional)</option>
                <option value="critica">🔴 Crítica (MÁQUINA OU LINHA PARADA)</option>
                <option value="baixa">🟢 Baixa (Previsão futura)</option>
              </select>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                Máquina / Equipamento de Destino (Opcional)
              </span>
              <select
                value={equipmentId}
                onChange={(e) => setEquipmentId(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="">Nenhum (Uso geral / almoxarifado)</option>
                {equipments.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.code} — {eq.name} {eq.sector ? `(${eq.sector})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Itens Solicitados (Linhas do Talão) */}
          <div className="bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-700 block">
                Itens Descritos no Talão *
              </span>
              {items.length < 4 && (
                <button
                  type="button"
                  onClick={addItemRow}
                  className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-white border border-indigo-200 hover:bg-indigo-50 px-2 py-0.5 rounded-lg cursor-pointer"
                >
                  + Linha de Item
                </button>
              )}
            </div>

            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1">
                    <input
                      required
                      value={it.description}
                      onChange={(e) => updateItemRow(idx, { description: e.target.value })}
                      placeholder={`Linha #${idx + 1}: Ex: Rolamento 6204, Veda rosca, Broca...`}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>

                  <div className="w-24 shrink-0">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={it.qtyRequested}
                      onChange={(e) =>
                        updateItemRow(idx, {
                          qtyRequested: Number(e.target.value) || 1,
                        })
                      }
                      placeholder="Qtd"
                      className="w-full rounded-xl border border-zinc-300 px-2.5 py-1.5 text-xs text-center font-bold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>

                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Justificativa */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
              Justificativa / Motivo da Solicitação
            </span>
            <textarea
              rows={2}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Ex: Peça danificada durante o turno de envase, reposição de estoque emergencial..."
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          {/* Anexo de Foto do Talão de Papel */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
              Foto / Digitalização do Talão Físico (Opcional)
            </span>
            {photoData ? (
              <div className="flex items-center gap-2 p-2 bg-zinc-50 border border-zinc-200 rounded-xl">
                <img src={photoData} alt="Talão" className="h-10 w-12 object-cover rounded-lg border border-zinc-200" />
                <span className="text-xs font-semibold text-zinc-700 truncate flex-1">
                  {photoName || 'Foto do talão anexada'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoData(null);
                    setPhotoName(null);
                  }}
                  className="p-1 text-zinc-400 hover:text-rose-600 rounded cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 border border-dashed border-zinc-300 hover:border-zinc-400 bg-zinc-50 hover:bg-zinc-100 rounded-xl p-3 text-xs font-bold text-zinc-600 cursor-pointer transition-colors">
                <Camera className="h-4 w-4 text-indigo-600" />
                <span>Fotografar ou Anexar Imagem do Talão de Papel (ou cole com Ctrl+V)</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const b64 = await compressImage(f);
                      setPhotoData(b64);
                      setPhotoName(f.name);
                    }
                  }}
                />
              </label>
            )}
          </div>
        </div>

        {error && (
          <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
            {error}
          </p>
        )}

        {/* Rodapé */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-3 border-t border-zinc-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs font-bold rounded-xl border border-zinc-200 hover:bg-zinc-50 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(false)}
            className="w-full sm:w-auto px-4 py-2 bg-zinc-800 hover:bg-zinc-900 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50"
          >
            Salvar Talão
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(true)}
            className="w-full sm:w-auto px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 shadow-xs flex items-center justify-center gap-1.5"
          >
            <DollarSign className="h-3.5 w-3.5" />
            <span>Salvar e Iniciar Cotação</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// Modal de Registro de Compra de Manutenção Avulsa
// -------------------------------------------------------------------------------------------------
interface NovaCompraManutencaoModalProps {
  equipments: Equipment[];
  onClose: () => void;
  onSaved: () => void;
}

interface CompraManutencaoItemDraft {
  description: string;
  qtyRequested: number;
  unitCost: number | '';
}

function NovaCompraManutencaoModal({
  equipments,
  onClose,
  onSaved,
}: NovaCompraManutencaoModalProps) {
  const [category, setCategory] = useState<string>('Elétrica');
  const [title, setTitle] = useState('');
  const [storeName, setStoreName] = useState('');
  const [purchaseValue, setPurchaseValue] = useState('');
  const [purchasedAt, setPurchasedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [requestedBy, setRequestedBy] = useState('');
  const [sector, setSector] = useState('Manutenção');
  const [equipmentId, setEquipmentId] = useState('');
  const [notes, setNotes] = useState('');

  // Itens individuais com quantidade e custo unitário
  const [items, setItems] = useState<CompraManutencaoItemDraft[]>([
    { description: '', qtyRequested: 1, unitCost: '' },
  ]);

  // Slot 1: Comprovante de Pagamento / Cupom Fiscal
  const [receipt1Data, setReceipt1Data] = useState<string | null>(null);
  const [receipt1Name, setReceipt1Name] = useState<string | null>(null);

  // Slot 2: Pedido / Print da Tela do E-commerce / Orçamento
  const [receipt2Data, setReceipt2Data] = useState<string | null>(null);
  const [receipt2Name, setReceipt2Name] = useState<string | null>(null);

  // Foco ativo para onde vai o Ctrl+V
  const [activeTargetSlot, setActiveTargetSlot] = useState<'comprovante' | 'pedido'>('comprovante');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recalcular valor total da compra a partir da soma dos itens
  const recalcTotalFromItems = (list: CompraManutencaoItemDraft[]) => {
    const sum = list.reduce((acc, it) => {
      const q = Number(it.qtyRequested) || 0;
      const u = typeof it.unitCost === 'number' ? it.unitCost : Number(it.unitCost) || 0;
      return acc + q * u;
    }, 0);
    if (sum > 0) {
      setPurchaseValue(sum.toFixed(2));
    }
  };

  const addItemRow = () => {
    setItems((prev) => [...prev, { description: '', qtyRequested: 1, unitCost: '' }]);
  };

  const removeItemRow = (idx: number) => {
    if (items.length <= 1) return;
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      recalcTotalFromItems(next);
      return next;
    });
  };

  const updateItemRow = (idx: number, patch: Partial<CompraManutencaoItemDraft>) => {
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, ...patch } : it));
      recalcTotalFromItems(next);
      return next;
    });
  };

  // Suporte a Ctrl+V colando imagem da área de transferência
  const handlePastePhoto = async (e: React.ClipboardEvent) => {
    const clipItems = e.clipboardData?.items;
    if (!clipItems) return;
    for (let i = 0; i < clipItems.length; i++) {
      if (clipItems[i].type.startsWith('image/')) {
        const f = clipItems[i].getAsFile();
        if (f) {
          e.preventDefault();
          try {
            const b64 = await compressImage(f);
            const nowTime = new Date().toLocaleTimeString('pt-BR').replace(/:/g, '-');
            if (activeTargetSlot === 'comprovante') {
              setReceipt1Data(b64);
              setReceipt1Name(`comprovante_${nowTime}.jpg`);
              if (!receipt2Data) {
                setActiveTargetSlot('pedido');
              }
            } else {
              setReceipt2Data(b64);
              setReceipt2Name(`pedido_${nowTime}.jpg`);
            }
          } catch {}
          break;
        }
      }
    }
  };

  // Botão explícito para colar da área de transferência
  const handlePasteFromClipboardBtn = async (slot: 'comprovante' | 'pedido') => {
    setActiveTargetSlot(slot);
    try {
      if (navigator.clipboard?.read) {
        const clipItems = await navigator.clipboard.read();
        for (const item of clipItems) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const b64 = await compressImage(blob);
            const nowTime = new Date().toLocaleTimeString('pt-BR').replace(/:/g, '-');
            if (slot === 'comprovante') {
              setReceipt1Data(b64);
              setReceipt1Name(`comprovante_${nowTime}.jpg`);
              if (!receipt2Data) setActiveTargetSlot('pedido');
            } else {
              setReceipt2Data(b64);
              setReceipt2Name(`pedido_${nowTime}.jpg`);
            }
            return;
          }
        }
      }
    } catch {
      // Caso a permissão do clipboard seja restrita pelo navegador, o foco fica no slot e o usuário usa Ctrl+V
    }
  };

  const save = async () => {
    const val = Number(purchaseValue);
    if (!purchaseValue || Number.isNaN(val) || val <= 0) {
      setError('Informe o valor total pago pela compra.');
      return;
    }
    if (!storeName.trim()) {
      setError('Informe o nome da loja ou fornecedor onde os itens foram comprados.');
      return;
    }
    const validItems = items.filter((it) => it.description.trim());
    if (!title.trim() && validItems.length === 0) {
      setError('Informe o serviço ou ao menos a descrição de um item comprado.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const finalTitle = title.trim() || validItems[0]?.description || `Manutenção ${category}`;
      const payloadItems =
        validItems.length > 0
          ? validItems.map((it) => ({
              itemCode: '',
              description: it.description.trim(),
              qtyRequested: Number(it.qtyRequested) || 1,
              unitCost: it.unitCost !== '' && Number(it.unitCost) > 0 ? Number(it.unitCost) : null,
            }))
          : [{ itemCode: '', description: finalTitle, qtyRequested: 1, unitCost: val }];

      // Montar array de múltiplos anexos
      const attachments: { id: string; type: string; label: string; name: string; data: string }[] = [];
      if (receipt1Data) {
        attachments.push({
          id: 'comprovante',
          type: 'comprovante',
          label: 'Comprovante Fiscal / Pagamento',
          name: receipt1Name || 'comprovante_fiscal.jpg',
          data: receipt1Data,
        });
      }
      if (receipt2Data) {
        attachments.push({
          id: 'pedido',
          type: 'pedido',
          label: 'Pedido / Print E-commerce',
          name: receipt2Name || 'pedido_ecommerce.jpg',
          data: receipt2Data,
        });
      }

      const receiptsJson = attachments.length > 0 ? JSON.stringify(attachments) : null;
      const primaryData = receipt1Data || receipt2Data || null;
      const primaryName = receipt1Name || receipt2Name || null;

      await apiJson('/almox/demands', {
        method: 'POST',
        body: JSON.stringify({
          origin: 'manutencao_avulsa',
          status: 'comprada',
          title: finalTitle,
          equipmentName: `Manutenção ${category}`,
          equipmentId: equipmentId || null,
          storeName: storeName.trim(),
          purchaseValue: val,
          purchasedAt: purchasedAt || new Date().toISOString().slice(0, 10),
          requestedBy: requestedBy.trim() || null,
          sector: sector.trim() || null,
          notes: notes.trim() || null,
          receiptName: primaryName,
          receiptData: primaryData,
          receiptsJson,
          items: payloadItems,
        }),
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Não foi possível registrar a compra.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-150"
      onPaste={(e) => void handlePastePhoto(e)}
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-zinc-200 animate-in zoom-in-95 duration-150">
        {/* Header Moderno com Tema Amber/Zinc */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-xs">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg text-zinc-900 tracking-tight">
                Registrar Compra de Manutenção Avulsa
              </h3>
              <p className="text-xs text-zinc-500">
                Itens com valores individuais, histórico de preços e anexos múltiplos via Ctrl+V
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-xl hover:bg-zinc-100 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo com scroll suave */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-sm">
          {/* Categoria da Manutenção */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">
              Tipo / Categoria da Manutenção *
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { id: 'Elétrica', label: '⚡ Elétrica' },
                { id: 'Predial / Civil', label: '🏢 Predial / Civil' },
                { id: 'Hidráulica', label: '💧 Hidráulica' },
                { id: 'Climatização', label: '❄️ Climatização' },
                { id: 'TI & Redes', label: '🌐 TI & Redes' },
                { id: 'Pintura', label: '🎨 Pintura' },
                { id: 'Mecânica Geral', label: '🔧 Mecânica Geral' },
                { id: 'Geral', label: '📦 Outra' },
              ].map((cat) => {
                const active = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer text-left ${
                      active
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                        : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Descrição do Serviço / Finalidade */}
          <div>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Finalidade / Descrição do Serviço *
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Troca de disjuntores e fiação do quadro de comando do setor de envase"
                className="w-full rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm bg-white font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
          </div>

          {/* Loja e Valor Total */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-amber-50/50 p-3.5 rounded-2xl border border-amber-200/70">
            <div>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
                  Loja / Fornecedor onde comprou *
                </span>
                <div className="relative">
                  <Store className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-amber-700" />
                  <input
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Ex: Elétrica Rocha, Casa da Borracha..."
                    className="w-full rounded-xl border border-amber-300 pl-9 pr-3 py-2 text-sm bg-white font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </label>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {['Elétrica Rocha', 'Casa da Borracha', 'Leroy Merlin', 'Comercial Hidráulica', 'Mercado Livre'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStoreName(s)}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-amber-900 cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block">
                Valor Total Pago da Compra (R$) *
              </span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-zinc-400 text-sm">
                  R$
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchaseValue}
                  onChange={(e) => setPurchaseValue(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-xl border border-amber-300 pl-9 pr-3 py-2 text-base font-black text-emerald-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <span className="text-[10px] text-amber-800 block">
                Calculado automaticamente pela soma dos itens (ou edite com frete)
              </span>
            </div>
          </div>

          {/* Itens e Materiais Comprados com Valores Individuais */}
          <div className="space-y-2.5 bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-800 block">
                  Itens & Peças Compradas (com Valores Individuais)
                </span>
                <span className="text-[10px] text-zinc-500">
                  Informe cada item e seu valor unitário para alimentar o histórico de preços
                </span>
              </div>
              <button
                type="button"
                onClick={addItemRow}
                className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-1.5 rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ Adicionar Item</span>
              </button>
            </div>

            <div className="space-y-2">
              {items.map((it, idx) => {
                const q = Number(it.qtyRequested) || 0;
                const u = typeof it.unitCost === 'number' ? it.unitCost : Number(it.unitCost) || 0;
                const subtotal = q * u;

                return (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white p-2.5 rounded-xl border border-zinc-200 shadow-2xs"
                  >
                    <div className="flex-1 min-w-[200px]">
                      <span className="text-[9px] font-bold uppercase text-zinc-400 block mb-0.5 sm:hidden">
                        Descrição do Item
                      </span>
                      <input
                        value={it.description}
                        onChange={(e) => updateItemRow(idx, { description: e.target.value })}
                        placeholder={`Item ${idx + 1} (Ex: Fita isolante 3M, Disjuntor 20A, Rolamento 6204...)`}
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs bg-white font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <div className="w-24 shrink-0">
                      <span className="text-[9px] font-bold uppercase text-zinc-400 block mb-0.5 sm:hidden">
                        Qtd
                      </span>
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={it.qtyRequested}
                        onChange={(e) =>
                          updateItemRow(idx, {
                            qtyRequested: Number(e.target.value) || 1,
                          })
                        }
                        placeholder="Qtd"
                        className="w-full rounded-lg border border-zinc-300 px-2.5 py-2 text-xs text-center font-bold bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <div className="w-32 shrink-0">
                      <span className="text-[9px] font-bold uppercase text-zinc-400 block mb-0.5 sm:hidden">
                        Valor Unitário
                      </span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">
                          R$
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={it.unitCost}
                          onChange={(e) =>
                            updateItemRow(idx, {
                              unitCost: e.target.value === '' ? '' : Number(e.target.value),
                            })
                          }
                          placeholder="0,00"
                          className="w-full rounded-lg border border-zinc-300 pl-8 pr-2.5 py-2 text-xs font-bold text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>

                    <div className="w-28 shrink-0 text-right pr-1 flex items-center justify-between sm:justify-end gap-2">
                      <span className="text-[9px] font-bold uppercase text-zinc-400 sm:hidden">Subtotal:</span>
                      <span className="text-xs font-black text-emerald-700 font-mono">
                        {subtotal > 0 ? `R$ ${subtotal.toFixed(2)}` : '—'}
                      </span>
                    </div>

                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItemRow(idx)}
                        className="p-2 text-zinc-400 hover:text-rose-600 rounded-lg cursor-pointer transition-colors"
                        title="Remover item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Resumo da soma dos itens */}
            {items.some((it) => (Number(it.unitCost) || 0) > 0) && (
              <div className="flex items-center justify-between pt-2 px-1 text-xs border-t border-zinc-200/80">
                <span className="text-zinc-500 font-medium">Soma total dos itens calculados:</span>
                <span className="font-black text-emerald-800 text-sm">
                  R${' '}
                  {items
                    .reduce((acc, it) => acc + (Number(it.qtyRequested) || 0) * (Number(it.unitCost) || 0), 0)
                    .toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Anexos Duplos: Comprovante de Pagamento e Pedido/Print E-commerce */}
          <div className="space-y-2.5 bg-amber-50/40 p-3.5 rounded-2xl border border-amber-200/80">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-950 block">
                  Comprovantes & Anexos (Copia e Cola com Ctrl+V)
                </span>
                <span className="text-[10px] text-zinc-500">
                  Dois slots dedicados: um para o comprovante/cupom fiscal e outro para o pedido ou print do site
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold text-amber-900 bg-amber-100/80 border border-amber-300 px-2 py-0.5 rounded-lg">
                Ctrl+V ativo
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Slot 1: Comprovante de Pagamento / Cupom Fiscal */}
              <div
                onClick={() => setActiveTargetSlot('comprovante')}
                className={`p-3 rounded-2xl border-2 transition-all cursor-pointer ${
                  activeTargetSlot === 'comprovante'
                    ? 'border-emerald-500 bg-white shadow-sm ring-2 ring-emerald-500/20'
                    : 'border-zinc-200 bg-white/70 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                    <Receipt className="h-4 w-4 text-emerald-600" />
                    <span>1. Comprovante / Cupom Fiscal</span>
                  </span>
                  {activeTargetSlot === 'comprovante' && (
                    <span className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                      Foco Ctrl+V
                    </span>
                  )}
                </div>

                {receipt1Data ? (
                  <div className="flex items-center gap-2.5 p-2 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                    <img
                      src={receipt1Data}
                      alt="Comprovante"
                      className="h-12 w-14 object-cover rounded-lg border border-emerald-200 shadow-2xs shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-zinc-800 truncate block">
                        {receipt1Name || 'Comprovante anexado'}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-semibold">Anexado com sucesso</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReceipt1Data(null);
                        setReceipt1Name(null);
                        setActiveTargetSlot('comprovante');
                      }}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg cursor-pointer transition-colors"
                      title="Remover anexo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="border border-dashed border-zinc-300 rounded-xl p-3 text-center bg-zinc-50/50">
                      <Receipt className="h-6 w-6 text-zinc-400 mx-auto mb-1" />
                      <p className="text-[11px] font-bold text-zinc-700">Foto do Recibo / Cupom Fiscal</p>
                      <p className="text-[10px] text-zinc-400">Pressione Ctrl+V ou escolha abaixo</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handlePasteFromClipboardBtn('comprovante');
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 py-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        <Copy className="h-3 w-3" />
                        <span>Colar (Ctrl+V)</span>
                      </button>
                      <label
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 py-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        <Upload className="h-3 w-3" />
                        <span>Arquivo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              const b64 = await compressImage(f);
                              setReceipt1Data(b64);
                              setReceipt1Name(f.name);
                              if (!receipt2Data) setActiveTargetSlot('pedido');
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Slot 2: Pedido / Print da Tela do E-commerce */}
              <div
                onClick={() => setActiveTargetSlot('pedido')}
                className={`p-3 rounded-2xl border-2 transition-all cursor-pointer ${
                  activeTargetSlot === 'pedido'
                    ? 'border-indigo-500 bg-white shadow-sm ring-2 ring-indigo-500/20'
                    : 'border-zinc-200 bg-white/70 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                    <ShoppingCart className="h-4 w-4 text-indigo-600" />
                    <span>2. Pedido / Print do Site / Orçamento</span>
                  </span>
                  {activeTargetSlot === 'pedido' && (
                    <span className="text-[9px] font-black uppercase text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">
                      Foco Ctrl+V
                    </span>
                  )}
                </div>

                {receipt2Data ? (
                  <div className="flex items-center gap-2.5 p-2 bg-indigo-50/60 border border-indigo-200 rounded-xl">
                    <img
                      src={receipt2Data}
                      alt="Pedido"
                      className="h-12 w-14 object-cover rounded-lg border border-indigo-200 shadow-2xs shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-zinc-800 truncate block">
                        {receipt2Name || 'Pedido / Print anexado'}
                      </span>
                      <span className="text-[10px] text-indigo-700 font-semibold">Anexado com sucesso</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReceipt2Data(null);
                        setReceipt2Name(null);
                        setActiveTargetSlot('pedido');
                      }}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg cursor-pointer transition-colors"
                      title="Remover anexo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="border border-dashed border-zinc-300 rounded-xl p-3 text-center bg-zinc-50/50">
                      <ShoppingCart className="h-6 w-6 text-zinc-400 mx-auto mb-1" />
                      <p className="text-[11px] font-bold text-zinc-700">Print do E-commerce ou Pedido</p>
                      <p className="text-[10px] text-zinc-400">Pressione Ctrl+V ou escolha abaixo</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handlePasteFromClipboardBtn('pedido');
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 py-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        <Copy className="h-3 w-3" />
                        <span>Colar (Ctrl+V)</span>
                      </button>
                      <label
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-bold text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 py-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        <Upload className="h-3 w-3" />
                        <span>Arquivo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              const b64 = await compressImage(f);
                              setReceipt2Data(b64);
                              setReceipt2Name(f.name);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Data da Compra, Comprador e Setor */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Data da Compra
                </span>
                <input
                  type="date"
                  value={purchasedAt}
                  onChange={(e) => setPurchasedAt(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs bg-white font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </label>
            </div>

            <div>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Comprador / Solicitante
                </span>
                <input
                  value={requestedBy}
                  onChange={(e) => setRequestedBy(e.target.value)}
                  placeholder="Ex: Carlos (Eletricista)"
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs bg-white font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </label>
            </div>

            <div>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Setor Beneficiado
                </span>
                <input
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  placeholder="Ex: Envase, Caldeira..."
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs bg-white font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </label>
            </div>
          </div>

          {/* Máquina Vinculada (Opcional) */}
          {equipments.length > 0 && (
            <div>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Vincular a Máquina / Equipamento Específico (Opcional)
                </span>
                <select
                  value={equipmentId}
                  onChange={(e) => setEquipmentId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs bg-white font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Sem máquina específica (Manutenção Predial / Setorial)</option>
                  {equipments.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.code} — {eq.name} {eq.sector ? `(${eq.sector})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* Observações */}
          <div>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Observações Adicionais
              </span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalhes sobre a compra, motivo de urgência, garantia, etc."
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
          </div>
        </div>

        {error && (
          <div className="px-5 pb-2">
            <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
              {error}
            </p>
          </div>
        )}

        {/* Rodapé com Ações */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-2 px-5 py-3.5 bg-zinc-50 border-t border-zinc-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs font-bold rounded-xl border border-zinc-200 hover:bg-zinc-100 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-zinc-950 text-xs font-black rounded-xl cursor-pointer disabled:opacity-50 shadow-xs flex items-center justify-center gap-1.5 transition-all hover:shadow-md"
          >
            <Check className="h-4 w-4" />
            <span>Salvar Compra de Manutenção</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// Modal de Registro de Compra Efetivada
// -------------------------------------------------------------------------------------------------
function BuyForm({ demand, onClose, onSaved }: { demand: Demand; onClose: () => void; onSaved: () => void }) {
  const [storeName, setStoreName] = useState(demand.storeName || '');
  const [purchasedAt, setPurchasedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [purchaseValue, setPurchaseValue] = useState(demand.quotedValue != null ? String(demand.quotedValue) : '');
  const [receiptName, setReceiptName] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setReceiptName(file.name);
      setReceiptData(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) {
      setError('Informe o nome da loja ou fornecedor.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/almox/demands/${encodeURIComponent(demand.id)}/purchase`, {
        method: 'POST',
        body: JSON.stringify({
          storeName: storeName.trim(),
          purchasedAt,
          receiptName,
          receiptData,
          purchaseValue: purchaseValue.trim() ? Number(purchaseValue.replace(',', '.')) : null,
        }),
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível informar a compra.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <form
        onSubmit={(e) => void save(e)}
        className="bg-white border border-zinc-200 rounded-2xl shadow-xl w-full max-w-md p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <h3 className="font-black text-base text-zinc-900 tracking-tight">Registrar Compra Efetivada</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700">
            ✕
          </button>
        </div>

        <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200 space-y-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Item Solicitado</span>
          <p className="font-bold text-sm text-zinc-900">{labelOf(demand)}</p>
          <p className="text-xs text-zinc-500">
            Código: <strong className="font-mono text-zinc-700">{demand.trackingCode || 'SOL'}</strong> · Qtd: {qtyOf(demand)} un
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Loja / Fornecedor *</span>
          <input
            required
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="Ex: Kalunga, Leroy Merlin, Mercado Livre..."
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Data da Compra *</span>
            <input
              required
              type="date"
              value={purchasedAt}
              onChange={(e) => setPurchasedAt(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Valor Pago (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={purchaseValue}
              onChange={(e) => setPurchaseValue(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white min-h-11 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-bold"
            />
          </label>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
            Comprovante / Nota Fiscal
          </span>
          <label className="flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-zinc-300 hover:border-zinc-400 bg-zinc-50 cursor-pointer">
            <Upload className="h-5 w-5 text-zinc-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-zinc-800 truncate">
                {receiptName || 'Anexar Foto ou PDF do Comprovante'}
              </p>
              <p className="text-[10px] text-zinc-400">JPG, PNG ou PDF</p>
            </div>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
              className="hidden"
            />
          </label>
        </div>

        {error && <p className="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200">{error}</p>}

        <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold rounded-xl border border-zinc-200 hover:bg-zinc-50 cursor-pointer min-h-11"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || !storeName.trim()}
            className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 min-h-11 shadow-xs"
          >
            Registrar Compra
          </button>
        </div>
      </form>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// Modal Visualizador de Comprovante & Múltiplos Anexos
// -------------------------------------------------------------------------------------------------
function ReceiptView({
  receipt,
  onClose,
}: {
  receipt: {
    name?: string | null;
    data: string;
    attachments?: { id: string; type: string; label: string; name: string; data: string }[];
  };
  onClose: () => void;
}) {
  const attachments =
    receipt.attachments && receipt.attachments.length > 0
      ? receipt.attachments
      : [
          {
            id: '1',
            type: 'comprovante',
            label: 'Comprovante Fiscal',
            name: receipt.name || 'comprovante.jpg',
            data: receipt.data,
          },
        ];

  const [activeIdx, setActiveIdx] = useState(0);
  const current = attachments[activeIdx] || attachments[0];
  const pdf = current?.data?.startsWith('data:application/pdf');

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-zinc-200 rounded-3xl w-full max-w-4xl p-5 space-y-3.5 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg text-zinc-900 tracking-tight">
                  Anexos da Compra
                </h3>
                {attachments.length > 1 && (
                  <span className="text-[11px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full border border-amber-300">
                    {attachments.length} arquivos
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">
                {current?.name || current?.label}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl border border-zinc-200 hover:bg-zinc-100 text-zinc-600 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Abas de Navegação entre Anexos (se houver mais de 1) */}
        {attachments.length > 1 && (
          <div className="flex items-center gap-2 p-1.5 bg-zinc-100 rounded-2xl">
            {attachments.map((att, idx) => {
              const active = idx === activeIdx;
              const isPed = att.type === 'pedido' || att.label.toLowerCase().includes('pedido');
              return (
                <button
                  key={att.id || idx}
                  type="button"
                  onClick={() => setActiveIdx(idx)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200'
                      : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'
                  }`}
                >
                  {isPed ? (
                    <ShoppingCart className="h-4 w-4 text-indigo-600" />
                  ) : (
                    <Receipt className="h-4 w-4 text-emerald-600" />
                  )}
                  <span>{att.label || `Anexo ${idx + 1}`}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Visualizador do Arquivo / Foto */}
        <div className="bg-zinc-950/5 rounded-2xl overflow-hidden flex items-center justify-center flex-1 min-h-[350px] max-h-[62vh] border border-zinc-200/60 p-2">
          {pdf ? (
            <iframe
              title="Comprovante"
              src={current.data}
              className="w-full h-full min-h-[450px] rounded-xl border-none"
            />
          ) : (
            <img
              src={current.data}
              alt={current.name || current.label}
              className="max-h-[58vh] max-w-full object-contain rounded-xl shadow-xs"
            />
          )}
        </div>

        {/* Rodapé com Download e Fechar */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
          <a
            href={current.data}
            download={current.name || 'anexo_compra'}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-800 hover:text-zinc-950 px-3.5 py-2 rounded-xl border border-zinc-200 hover:bg-zinc-50 cursor-pointer shadow-xs transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Baixar {current.label || 'Arquivo'}</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-black rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer shadow-xs"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// Modal de Impressão de Talões A4 Recortáveis (4 por página A4 com linha de corte otimizada)
// -------------------------------------------------------------------------------------------------
function PrintSlipsModal({
  demands,
  initialMode,
  initialSelectedId,
  onClose,
  onPrinted,
}: {
  demands: Demand[];
  initialMode?: 'branco' | 'preenchidos';
  initialSelectedId?: string;
  onClose: () => void;
  onPrinted?: () => void;
}) {
  const [mode, setMode] = useState<'branco' | 'preenchidos'>(() => {
    if (initialMode) return initialMode;
    if (initialSelectedId) return 'preenchidos';
    return 'branco';
  });
  const [blankCount, setBlankCount] = useState<number>(4);
  const [autoGenerateCode, setAutoGenerateCode] = useState<boolean>(true);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (initialSelectedId) return [initialSelectedId];
    return demands
      .filter((d) => !isRecebida(d) && !isComprada(d) && d.status !== 'cancelada')
      .slice(0, 8)
      .map((d) => d.id);
  });
  const [logoSrc, setLogoSrc] = useState<string | null>(null);

  // Determina o número inicial da sequência contínua (mínimo 5, pois 1 a 4 já foram impressos)
  const [startSeq, setStartSeq] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('almox_last_printed_slip_seq');
      const lastNum = saved ? parseInt(saved, 10) : 0;
      if (!isNaN(lastNum) && lastNum >= 4) {
        return lastNum + 1;
      }
    } catch {}
    return 5;
  });

  // Busca do servidor a última sequência salva no banco para sincronizar entre computadores
  useEffect(() => {
    let active = true;
    async function fetchSequence() {
      try {
        const data = await apiJson<{ nextSequence?: number; lastSequence?: number }>('/almox/print-sequence');
        if (active && data && typeof data.nextSequence === 'number') {
          setStartSeq((prev) => Math.max(prev, data.nextSequence || 5, 5));
        }
      } catch {}
    }
    void fetchSequence();
    return () => {
      active = false;
    };
  }, []);

  // Carrega a logo corporativa configurada (POPs Controle de Qualidade ou Configurações Gerais de Relatórios)
  useEffect(() => {
    let active = true;
    let objUrl: string | null = null;

    async function loadLogo() {
      // 1. Tenta logo do POPs Controle de Qualidade
      try {
        const res = await apiFetch('/qualidade/pops/settings/logo');
        if (res.ok) {
          const blob = await res.blob();
          if (active && blob.size > 0) {
            objUrl = URL.createObjectURL(blob);
            setLogoSrc(objUrl);
            return;
          }
        }
      } catch {}

      // 2. Tenta logo de Configurações Gerais (relatórios)
      try {
        const res = await apiFetch('/settings/report-logo');
        if (res.ok) {
          const blob = await res.blob();
          if (active && blob.size > 0) {
            objUrl = URL.createObjectURL(blob);
            setLogoSrc(objUrl);
            return;
          }
        }
      } catch {}

      // 3. Fallback para a logo do sistema
      if (active) {
        setLogoSrc('/logo.svg');
      }
    }

    void loadLogo();

    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, []);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const printableItems = useMemo(() => {
    if (mode === 'branco') {
      return Array.from({ length: blankCount }).map((_, i) => {
        const num = startSeq + i;
        const code = autoGenerateCode
          ? `SOL-${currentYear}-${String(num).padStart(4, '0')}`
          : 'SOL-____-____';
        return {
          trackingCode: code,
          blank: true,
        };
      });
    }

    const filtered = demands.filter((d) => selectedIds.includes(d.id));
    return filtered.length > 0
      ? filtered
      : [
          {
            trackingCode: autoGenerateCode
              ? `SOL-${currentYear}-${String(startSeq).padStart(4, '0')}`
              : 'SOL-____-____',
            blank: true,
          },
        ];
  }, [mode, blankCount, autoGenerateCode, startSeq, currentYear, selectedIds, demands]);

  // Agrupa os talões em blocos de exatamente 4 por página A4
  const pages = useMemo(() => {
    const chunks: any[][] = [];
    for (let i = 0; i < printableItems.length; i += 4) {
      chunks.push(printableItems.slice(i, i + 4));
    }
    return chunks;
  }, [printableItems]);

  const triggerPrint = () => {
    if (mode === 'branco' && autoGenerateCode) {
      const lastNumber = startSeq + blankCount - 1;
      const nextNumber = lastNumber + 1;
      try {
        localStorage.setItem('almox_last_printed_slip_seq', String(lastNumber));
      } catch {}
      // Salva no banco de dados e cria os registros de talhões impressos para acompanhamento
      void apiJson('/almox/print-slips', {
        method: 'POST',
        body: JSON.stringify({
          startSeq,
          count: blankCount,
          year: currentYear,
        }),
      })
        .then(() => {
          if (onPrinted) onPrinted();
        })
        .catch(() => {
          void apiJson('/almox/print-sequence', {
            method: 'POST',
            body: JSON.stringify({ sequence: lastNumber }),
          })
            .then(() => {
              if (onPrinted) onPrinted();
            })
            .catch(() => undefined);
        });
      // Avança o número inicial para a próxima impressão contínua
      setStartSeq(nextNumber);
    }
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4">
      {/* Estilos dedicados para impressão A4: 4 talões por folha com quebra de página automática */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 4mm 6mm;
          }
          body * {
            visibility: hidden !important;
          }
          #print-slips-area, #print-slips-area * {
            visibility: visible !important;
          }
          #print-slips-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .slip-page {
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            height: 288mm !important;
            max-height: 288mm !important;
            page-break-after: always !important;
            break-after: page !important;
            box-sizing: border-box !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .slip-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .slip-unit {
            display: flex !important;
            flex-direction: column !important;
            flex: 1 1 0 !important;
            min-height: 0 !important;
            justify-content: space-between !important;
            box-sizing: border-box !important;
          }
          .slip-card {
            flex: 1 1 0 !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            box-sizing: border-box !important;
            border: 1.5px solid #000 !important;
            border-radius: 4px !important;
            padding: 5px 8px !important;
            background: white !important;
            color: black !important;
          }
          .cut-line {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            height: 14px !important;
            margin: 1.5px 0 !important;
          }
        }
      `}</style>

      <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl w-full max-w-4xl p-5 space-y-4 max-h-[94vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3 no-print">
          <div>
            <h3 className="font-black text-base text-zinc-900 tracking-tight flex items-center gap-2">
              <Printer className="h-5 w-5 text-zinc-700" />
              Imprimir Talões de Requisição (4 por Folha A4)
            </h3>
            <p className="text-xs text-zinc-500">
              Formato de alta capacidade: 4 requisições completas por folha com linhas amplas para preenchimento.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700">
            ✕
          </button>
        </div>

        {/* Controles de Impressão */}
        <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-200 space-y-3 no-print">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMode('branco')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                  mode === 'branco' ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200 text-zinc-700'
                }`}
              >
                Talões para Fábrica (Preenchimento Manual)
              </button>
              <button
                type="button"
                onClick={() => setMode('preenchidos')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                  mode === 'preenchidos' ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200 text-zinc-700'
                }`}
              >
                Solicitações Cadastradas ({selectedIds.length} selecionadas)
              </button>
            </div>

            <button
              type="button"
              onClick={triggerPrint}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs cursor-pointer shadow-xs"
            >
              <Printer className="h-4 w-4" />
              Imprimir Agora (Ctrl + P)
            </button>
          </div>

          {mode === 'branco' ? (
            <div className="space-y-2.5 pt-2 border-t border-zinc-200 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-zinc-700">Qtd de Talões:</span>
                  <div className="flex items-center gap-1">
                    {[4, 8, 12, 16].map((qtd) => (
                      <button
                        key={qtd}
                        type="button"
                        onClick={() => setBlankCount(qtd)}
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs cursor-pointer border ${
                          blankCount === qtd
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                        }`}
                      >
                        {qtd} ({qtd / 4} {qtd / 4 === 1 ? 'folha' : 'folhas'})
                      </button>
                    ))}
                  </div>
                </div>

                {/* Controle Interativo da Sequência */}
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-zinc-300 shadow-xs">
                  <span className="font-bold text-zinc-800 text-xs">Iniciar numeração em:</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-zinc-500 font-bold text-xs">Nº</span>
                    <input
                      type="number"
                      min={1}
                      value={startSeq}
                      onChange={(e) => setStartSeq(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-16 px-2 py-0.5 border border-zinc-300 rounded-lg font-mono font-black text-xs text-center focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>
                  <span className="text-zinc-600 font-mono text-[11px] font-bold bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                    {`SOL-${currentYear}-${String(startSeq).padStart(4, '0')}`} até {`SOL-${currentYear}-${String(startSeq + blankCount - 1).padStart(4, '0')}`}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
                <label className="flex items-center gap-2 cursor-pointer font-medium select-none text-zinc-700">
                  <input
                    type="checkbox"
                    checked={autoGenerateCode}
                    onChange={(e) => setAutoGenerateCode(e.target.checked)}
                    className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  <span>Imprimir com códigos sequenciais automáticos</span>
                </label>
                <span>
                  Ao imprimir, a sequência avança automaticamente para o <strong>Nº {startSeq + blankCount}</strong>.
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 pt-2 border-t border-zinc-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Selecione as solicitações que deseja imprimir ({selectedIds.length} selecionadas = {Math.ceil(selectedIds.length / 4)} folha(s)):
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedIds(demands.map((d) => d.id))}
                    className="text-[11px] font-bold text-zinc-700 hover:underline cursor-pointer"
                  >
                    Marcar Todas
                  </button>
                  <span className="text-zinc-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className="text-[11px] font-bold text-zinc-500 hover:underline cursor-pointer"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1 bg-white p-2 rounded-xl border border-zinc-200">
                {demands.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer hover:bg-zinc-50 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(d.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds((prev) => [...prev, d.id]);
                        else setSelectedIds((prev) => prev.filter((id) => id !== d.id));
                      }}
                      className="rounded border-zinc-300"
                    />
                    <span className="font-mono font-bold text-zinc-900">{d.trackingCode || 'SOL'}</span>
                    <span className="text-zinc-600 truncate">— {labelOf(d)}</span>
                    <span className="text-zinc-400 text-[11px] ml-auto">({d.requestedBy || 'Operador'})</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Área Imprimível (Exatamente 4 talões por folha A4 com picote) */}
        <div id="print-slips-area" className="space-y-4 bg-white p-1">
          {pages.map((pageGroup, pageIdx) => (
            <div key={pageIdx} className="slip-page space-y-2 print:space-y-0">
              {pageGroup.map((item: any, idx: number) => {
                const isBlank = item.blank || !item.id;

                return (
                  <div key={item.id || `${pageIdx}-${idx}`} className="slip-unit">
                    {idx > 0 && (
                      <div className="cut-line my-1.5 border-t border-dashed border-zinc-400 flex items-center justify-center text-[9px] text-zinc-500 font-mono tracking-widest print:my-0.5">
                        <span className="bg-white px-2 flex items-center gap-1.5 uppercase font-bold text-[8px] text-zinc-600">
                          <Scissors className="h-3 w-3" /> Cortar Aqui (Picote)
                        </span>
                      </div>
                    )}

                    <div className="slip-card border border-zinc-900 rounded-md p-2 bg-white text-zinc-950 flex flex-col justify-between text-[11px] leading-tight">
                      {/* Cabeçalho do Talão: Apenas a Logo à esquerda e Código de Rastreio à direita */}
                      <div className="flex items-center justify-between border-b border-zinc-900 pb-1 mb-1">
                        <div className="flex items-center h-9">
                          {logoSrc ? (
                            <img
                              src={logoSrc}
                              alt="Logo"
                              className="max-h-8 max-w-[190px] object-contain object-left print:max-h-8"
                            />
                          ) : (
                            <span className="font-black text-sm uppercase tracking-wider text-zinc-950">
                              NATUM
                            </span>
                          )}
                        </div>

                        <div className="border border-zinc-900 px-2.5 py-0.5 rounded bg-zinc-50 text-center">
                          <span className="text-[8px] font-black uppercase tracking-wider text-zinc-600 block">
                            CÓDIGO DE RASTREIO
                          </span>
                          <span className="font-mono font-black text-xs text-zinc-950 block">
                            {item.trackingCode || 'SOL-____-____'}
                          </span>
                        </div>
                      </div>

                      {/* Linha 1: Solicitante, Setor, Data, Urgência */}
                      <div className="grid grid-cols-12 gap-2 items-center mb-1 pb-1 border-b border-zinc-200 text-[10px]">
                        <div className="col-span-5 flex items-baseline gap-1">
                          <span className="text-[9px] font-black uppercase text-zinc-700 shrink-0">SOLICITANTE:</span>
                          <span className="border-b border-zinc-400 flex-1 font-semibold text-[10px] min-h-[14px] truncate">
                            {isBlank ? '' : item.requestedBy || '—'}
                          </span>
                        </div>
                        <div className="col-span-2 flex items-baseline gap-1">
                          <span className="text-[9px] font-black uppercase text-zinc-700 shrink-0">SETOR:</span>
                          <span className="border-b border-zinc-400 flex-1 font-semibold text-[10px] min-h-[14px] truncate">
                            {isBlank ? '' : item.sector || '—'}
                          </span>
                        </div>
                        <div className="col-span-2 flex items-baseline gap-1">
                          <span className="text-[9px] font-black uppercase text-zinc-700 shrink-0">DATA:</span>
                          <span className="border-b border-zinc-400 flex-1 font-mono font-semibold text-[10px] min-h-[14px]">
                            {isBlank ? '___/___/____' : dataBr(item.createdAt)}
                          </span>
                        </div>
                        <div className="col-span-3 flex items-center justify-end gap-1.5 font-bold text-[9px]">
                          <span className="text-zinc-600 uppercase text-[8px]">URGÊNCIA:</span>
                          {isBlank ? (
                            <span className="space-x-1 text-[9px] text-zinc-800 font-semibold">
                              <span>( ) Normal</span>
                              <span>( ) Alta</span>
                              <span>( ) CRÍTICA</span>
                            </span>
                          ) : (
                            <span className="uppercase font-black px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-300 text-[9px]">
                              {item.urgency === 'critica'
                                ? '🔴 CRÍTICA (MÁQ. PARADA)'
                                : item.urgency === 'alta'
                                ? '🟠 ALTA'
                                : 'NORMAL'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 3 Linhas para Itens Diferentes com Quantidade (sem unidade) */}
                      <div className="space-y-1 mb-1 pb-1 border-b border-zinc-200 text-[10px]">
                        {[0, 1, 2].map((lineIdx) => {
                          const it = !isBlank && item.items && item.items[lineIdx] ? item.items[lineIdx] : null;
                          const isFirstAndOnly = !isBlank && lineIdx === 0 && (!item.items || item.items.length === 0);
                          const itemTitle = it
                            ? it.description || it.itemCode || ''
                            : isFirstAndOnly
                            ? labelOf(item)
                            : '';
                          const itemQtd = it
                            ? `${it.qtyRequested || it.qty || 1}`
                            : isFirstAndOnly
                            ? `${qtyOf(item)}`
                            : '';

                          return (
                            <div key={lineIdx} className="grid grid-cols-12 gap-2 items-baseline">
                              <div className="col-span-10 flex items-baseline gap-1">
                                <span className="text-[9px] font-black uppercase text-zinc-700 shrink-0">
                                  {lineIdx + 1}. ITEM:
                                </span>
                                <span className="border-b border-zinc-400 flex-1 font-semibold text-[10.5px] min-h-[15px] truncate text-zinc-950">
                                  {itemTitle}
                                </span>
                              </div>
                              <div className="col-span-2 flex items-baseline gap-1">
                                <span className="text-[9px] font-black uppercase text-zinc-700 shrink-0">QTD:</span>
                                <span className="border-b border-zinc-400 flex-1 font-black text-[10.5px] text-center min-h-[15px] text-zinc-950">
                                  {itemQtd}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Justificativa (Linhas Amplas para Escrita com Caneta) */}
                      <div className="mb-1 text-[10px]">
                        <div className="flex items-baseline gap-1">
                          <span className="text-[9px] font-black uppercase text-zinc-700 shrink-0">
                            JUSTIFICATIVA:
                          </span>
                          <span className="border-b border-zinc-300 flex-1 text-[10px] italic text-zinc-800 min-h-[14px] truncate">
                            {isBlank ? '' : item.notes || 'Reposição operacional padrão.'}
                          </span>
                        </div>
                        {isBlank && <div className="border-b border-zinc-300 h-3 mt-0.5" />}
                      </div>

                      {/* Rodapé: Assinaturas e Carimbo */}
                      <div className="grid grid-cols-12 gap-3 pt-1 text-[9px] text-zinc-700">
                        <div className="col-span-5 border-t border-zinc-400 pt-0.5 text-center">
                          <span className="font-bold block text-[9px] text-zinc-900">Assinatura do Solicitante</span>
                          <span className="text-[8px] text-zinc-500 font-medium">{isBlank ? '' : item.requestedBy || ''}</span>
                        </div>
                        <div className="col-span-4 border-t border-zinc-400 pt-0.5 text-center">
                          <span className="font-bold block text-[9px] text-zinc-900">Visto Almoxarifado / Compras</span>
                          <span className="text-[8px] text-zinc-500 font-medium">Aprovação / Autorização</span>
                        </div>
                        <div className="col-span-3 border-t border-zinc-400 pt-0.5 text-center font-mono">
                          <span className="font-bold block text-[9px] text-zinc-900">Data Recebimento</span>
                          <span className="text-[8px] text-zinc-500">____/____/2026</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 no-print">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-xl border border-zinc-200 hover:bg-zinc-50 cursor-pointer"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={triggerPrint}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs cursor-pointer shadow-xs"
          >
            <Printer className="h-4 w-4" />
            Imprimir Talões
          </button>
        </div>
      </div>
    </div>
  );
}
