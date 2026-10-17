import { apiFetch } from '../../geral/lib/http';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ArrowLeft, Search, RefreshCw, Layers, ClipboardList, PlusCircle, Trash2, 
  CheckCircle2, Printer, X, Eye, CheckCircle, ExternalLink, Calendar, User, FileText, Settings, AlertTriangle,
  UploadCloud, Plus
} from 'lucide-react';
import KitCompositionDrawer from '../components/KitCompositionDrawer';
import { api } from '../../geral/lib/api';
import { Category } from '../../geral/lib/types';
import {
  formatQtyPerKitLabel,
  kitComponentNeedQty,
  kitOrderComponentNeed,
} from '../lib/kitComponentQty';
import {
  linesFromPreview,
  parsePackagingDeductions,
  serializePackagingDeductions,
  splitPackagingLines,
  type PackagingPreviewResponse,
  type ViraPackagingLine,
} from '../lib/viraPackaging';

export default function MontagemKitsView({ onBackToHub }) {
  const [activeSubTab, setActiveSubTab] = useState('ordens'); // 'ordens', 'componentes' ou 'composicao'
  const [loading, setLoading] = useState(false);

  // States: Drawer de Composição de Kits
  const [selectedDrawerKitCode, setSelectedDrawerKitCode] = useState('');
  const [selectedDrawerKitDesc, setSelectedDrawerKitDesc] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // States: Composição de Kits Comerciais
  const [kitComposicao, setKitComposicao] = useState([]);
  const [kitCompSearch, setKitCompSearch] = useState('');
  const [kitCompNewKit, setKitCompNewKit] = useState('');
  const [kitCompNewComp, setKitCompNewComp] = useState('');
  const [kitCompNewQty, setKitCompNewQty] = useState(1);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [uploadingKitsConfig, setUploadingKitsConfig] = useState(false);

  // States: Compor Novo Kit Modal
  const [isNewKitModalOpen, setIsNewKitModalOpen] = useState(false);
  const [newKitSearch, setNewKitSearch] = useState('');

  // States: Componentes e Alertas (Listagem de Kits)
  const [kits, setKits] = useState([]);
  const [kitsSearch, setKitsSearch] = useState('');
  const [kitsSelectedStatus, setKitsSelectedStatus] = useState('ALL');
  const [kitsActiveTab, setKitsActiveTab] = useState('ALL');
  const [kitsPage, setKitsPage] = useState(1);
  const [kitsTotalPages, setKitsTotalPages] = useState(1);
  const [kitsTotalItems, setKitsTotalItems] = useState(0);
  const [expandedKits, setExpandedKits] = useState([]);
  const [kitSortField, setKitSortField] = useState('codigo');
  const [kitSortDir, setKitSortDir] = useState('asc');

  // States: Ordens de Montagem
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [searchOrder, setSearchOrder] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Modal: Nova Ordem
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [allKitsDropdown, setAllKitsDropdown] = useState([]);
  const [nextOrderNumber, setNextOrderNumber] = useState('');
  
  // Form: Nova Ordem
  const [newOrderNumber, setNewOrderNumber] = useState('');
  const [selectedKitCode, setSelectedKitCode] = useState('');
  const [newKitQty, setNewKitQty] = useState(10);
  const [newKitNotes, setNewKitNotes] = useState('');
  const [newComponentLotes, setNewComponentLotes] = useState({}); // code -> lote
  const [submittingNewOrder, setSubmittingNewOrder] = useState(false);

  // Quantidades editáveis inline para kits na aba Componentes e Alertas
  const [kitMontarQtys, setKitMontarQtys] = useState<Record<string, number | string>>({});

  // Modal: Editar/Visualizar Ordem
  const [showEditOrderModal, setShowEditOrderModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  
  // Form: Editar Ordem
  const [editOrderNumber, setEditOrderNumber] = useState('');
  const [editQuantity, setEditQuantity] = useState<number | string>(10);
  const [editStatus, setEditStatus] = useState('PENDING');
  const [editAssembledBy, setEditAssembledBy] = useState('');
  const [editCheckedBy, setEditCheckedBy] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editComponentLotes, setEditComponentLotes] = useState({});
  const [editComponentUsedQty, setEditComponentUsedQty] = useState({});
  const [editQuantityAssembled, setEditQuantityAssembled] = useState(0);
  const [editErpLaunched, setEditErpLaunched] = useState(false);
  const [submittingEditOrder, setSubmittingEditOrder] = useState(false);

  // States: Vira de Produto (Reetiquetagem / Reenvase)
  const [viraOrders, setViraOrders] = useState([]);
  const [viraComposicao, setViraComposicao] = useState([]);
  const [viraSearch, setViraSearch] = useState('');
  const [viraCompSearch, setViraCompSearch] = useState('');
  const [filterViraStatus, setFilterViraStatus] = useState('ALL');
  const [loadingVira, setLoadingVira] = useState(false);

  // Vira Composicao Form
  const [newViraDeCodigo, setNewViraDeCodigo] = useState('');
  const [newViraParaCodigo, setNewViraParaCodigo] = useState('');
  const [newViraQuantidade, setNewViraQuantidade] = useState(1);

  // Nova Ordem de Vira Modal & Form
  const [showNewViraOrderModal, setShowNewViraOrderModal] = useState(false);
  const [nextViraOrderNumber, setNextViraOrderNumber] = useState('');
  const [selectedViraComp, setSelectedViraComp] = useState(null); // {de, para, etc}
  const [newViraOrderNumber, setNewViraOrderNumber] = useState('');
  const [newViraQtyDe, setNewViraQtyDe] = useState(10);
  const [newViraFator, setNewViraFator] = useState(1);
  const [newViraQtyPara, setNewViraQtyPara] = useState(10);
  const [newViraQtyParaManual, setNewViraQtyParaManual] = useState(false);
  const [newViraPackagingLines, setNewViraPackagingLines] = useState<ViraPackagingLine[]>([]);
  const [newViraMotivo, setNewViraMotivo] = useState('');
  const [loadingViraPackaging, setLoadingViraPackaging] = useState(false);
  const [newViraOrderNotes, setNewViraOrderNotes] = useState('');
  const [submittingNewViraOrder, setSubmittingNewViraOrder] = useState(false);

  // Preview embalagens na aba Fórmulas
  const [expandedViraFormulaKey, setExpandedViraFormulaKey] = useState('');
  const [formulaPackagingPreview, setFormulaPackagingPreview] = useState<PackagingPreviewResponse | null>(null);
  const [loadingFormulaPackaging, setLoadingFormulaPackaging] = useState(false);

  // Editar/Visualizar Ordem de Vira
  const [showEditViraOrderModal, setShowEditViraOrderModal] = useState(false);
  const [selectedViraOrder, setSelectedViraOrder] = useState(null);
  const [editViraStatus, setEditViraStatus] = useState('PENDING');
  const [editViraAssembledBy, setEditViraAssembledBy] = useState('');
  const [editViraCheckedBy, setEditViraCheckedBy] = useState('');
  const [editViraNotes, setEditViraNotes] = useState('');
  const [editViraQuantityAssembled, setEditViraQuantityAssembled] = useState(0);
  const [editViraErpLaunched, setEditViraErpLaunched] = useState(false);
  const [editViraPackagingLines, setEditViraPackagingLines] = useState<ViraPackagingLine[]>([]);
  const [editViraMotivo, setEditViraMotivo] = useState('');
  const [submittingEditViraOrder, setSubmittingEditViraOrder] = useState(false);

  // State: Impressão
  const [printingOrder, setPrintingOrder] = useState(null);

  // Fetch configs/tabs
  const tabOptions = [
    { id: 'ALL', name: 'Todos os Kits' },
    { id: '1', name: 'Kits Tradicionais' },
    { id: '2', name: 'Kits Especiais' }
  ];

  // Fetch Kits list
  const fetchKits = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (kitsSearch.trim()) params.append('search', kitsSearch.trim());
      if (kitsActiveTab !== 'ALL') params.append('linha', kitsActiveTab);
      if (kitsSelectedStatus !== 'ALL') params.append('status', kitsSelectedStatus);
      params.append('page', kitsPage.toString());
      params.append('limit', '30');
      if (kitSortField) {
        params.append('sort', kitSortField);
        params.append('order', kitSortDir);
      }

      const res = await apiFetch(`/kits?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setKits(data.items || []);
        setKitsTotalItems(data.total || 0);
        setKitsTotalPages(data.total_pages || 1);
      }
    } catch (e) {
      console.error("Error fetching kits:", e);
    } finally {
      setLoading(false);
    }
  }, [kitsSearch, kitsActiveTab, kitsSelectedStatus, kitsPage, kitSortField, kitSortDir]);

  // Fetch Assembly Orders
  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const res = await apiFetch(`/kits/orders`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data || []);
      }
    } catch (e) {
      console.error("Error fetching orders:", e);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  // Fetch all kits for dropdown selection
  const fetchAllKitsDropdown = async () => {
    try {
      const res = await apiFetch(`/kits?limit=1000`);
      if (res.ok) {
        const data = await res.json();
        const flatKits = (data.items || []).map(item => ({
          codigo: item.codigo,
          descricao: item.descricao,
          estoque: item.estoque,
          componentes: item.componentes
        }));
        setAllKitsDropdown(flatKits);
      }
    } catch (e) {
      console.error("Error fetching kits for dropdown:", e);
    }
  };

  // Fetch next recommended order number
  const fetchNextOrderNumber = async () => {
    try {
      const res = await apiFetch(`/kits/next-order-number`);
      if (res.ok) {
        const data = await res.json();
        setNextOrderNumber(data.nextOrderNumber);
        setNewOrderNumber(data.nextOrderNumber);
      }
    } catch (e) {
      console.error("Error fetching next order number:", e);
    }
  };

  const fetchProducts = useCallback(async () => {
    try {
      const [prodsRes, catsData] = await Promise.all([
        apiFetch(`/products?limit=5000&show_hidden=true`),
        api.getCategories().catch(() => [])
      ]);
      if (prodsRes.ok) {
        const data = await prodsRes.json();
        setProducts(data.items || []);
      }
      setCategories(catsData || []);
    } catch (e) {
      console.error("Error fetching products and categories:", e);
    }
  }, []);

  const getKitNamePreview = () => {
    if (!kitCompNewKit.trim()) return '';
    const cleaned = kitCompNewKit.trim().replace(/['"]/g, '').toLowerCase();
    const found = products.find(p => (p.codigo || '').replace(/['"]/g, '').trim().toLowerCase() === cleaned);
    return found ? found.descricao : 'Produto não encontrado no estoque';
  };

  const getCompNamePreview = () => {
    if (!kitCompNewComp.trim()) return '';
    const cleaned = kitCompNewComp.trim().replace(/['"]/g, '').toLowerCase();
    const found = products.find(p => (p.codigo || '').replace(/['"]/g, '').trim().toLowerCase() === cleaned);
    return found ? found.descricao : 'Produto não encontrado no estoque';
  };

  const fetchKitComposicao = useCallback(async () => {
    try {
      const res = await apiFetch(`/kits/composicao`);
      if (res.ok) setKitComposicao(await res.json());
    } catch (e) {
      console.error("Error fetching kit composition:", e);
    }
  }, []);

  const handleAddKitComposicao = async (e) => {
    if (e) e.preventDefault();
    if (!kitCompNewKit.trim() || !kitCompNewComp.trim()) return;
    try {
      const res = await apiFetch(`/kits/composicao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          kit_codigo: kitCompNewKit.trim(), 
          componente_codigo: kitCompNewComp.trim(),
          quantidade: kitCompNewQty
        })
      });
      if (res.ok) {
        setKitCompNewKit('');
        setKitCompNewComp('');
        setKitCompNewQty(1);
        await fetchKitComposicao();
        await fetchKits(); // Atualiza os alertas
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao adicionar kit.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de conexão.');
    }
  };

  const handleDeleteKitComposicao = async (kit, comp) => {
    if (!window.confirm(`Remover componente ${comp} do kit ${kit}?`)) return;
    try {
      const res = await apiFetch(`/kits/composicao/${kit}/${comp}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchKitComposicao();
        await fetchKits(); // Atualiza os alertas
      } else {
        alert('Erro ao excluir relação.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de conexão.');
    }
  };

  const handleUploadKitsConfig = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingKitsConfig(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiFetch(`/kits/composicao/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        await fetchKitComposicao();
        await fetchKits(); // Atualiza os alertas
      } else {
        alert(data.error || 'Erro ao importar.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de conexão.');
    } finally {
      setUploadingKitsConfig(false);
    }
  };

  // === FUNÇÕES E CRUD DE VIRA DE PRODUTO ===

  const fetchViraComposicao = useCallback(async () => {
    try {
      const res = await apiFetch(`/turnovers/composicao`);
      if (res.ok) setViraComposicao(await res.json());
    } catch (e) {
      console.error("Error fetching vira composition:", e);
    }
  }, []);

  const fetchViraOrders = useCallback(async () => {
    setLoadingVira(true);
    try {
      const res = await apiFetch(`/turnovers/orders`);
      if (res.ok) setViraOrders(await res.json());
    } catch (e) {
      console.error("Error fetching vira orders:", e);
    } finally {
      setLoadingVira(false);
    }
  }, []);

  const handleAddViraComposicao = async (e) => {
    if (e) e.preventDefault();
    if (!newViraDeCodigo.trim() || !newViraParaCodigo.trim()) return;
    try {
      const res = await apiFetch(`/turnovers/composicao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          deProdutoCodigo: newViraDeCodigo.trim(), 
          paraProdutoCodigo: newViraParaCodigo.trim(),
          quantidade: parseFloat(newViraQuantidade) || 1.0
        })
      });
      if (res.ok) {
        setNewViraDeCodigo('');
        setNewViraParaCodigo('');
        setNewViraQuantidade(1);
        await fetchViraComposicao();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao adicionar vira.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de conexão.');
    }
  };

  const handleDeleteViraComposicao = async (de, para) => {
    if (!window.confirm(`Remover relação de vira do produto ${de} para ${para}?`)) return;
    try {
      const res = await apiFetch(`/turnovers/composicao/${de}/${para}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchViraComposicao();
      } else {
        alert('Erro ao excluir relação.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de conexão.');
    }
  };

  const fetchNextViraOrderNumber = async () => {
    try {
      const res = await apiFetch(`/turnovers/next-order-number`);
      if (res.ok) {
        const data = await res.json();
        setNextViraOrderNumber(data.nextOrderNumber);
        setNewViraOrderNumber(data.nextOrderNumber);
      }
    } catch (e) {
      console.error("Error fetching next vira order number:", e);
    }
  };

  const fetchViraPackagingPreview = async (de: string, para: string, qtyDe: number, qtyPara: number) => {
    const params = new URLSearchParams({
      de,
      para,
      qtyDe: String(qtyDe || 1),
      qtyPara: String(qtyPara || 1),
    });
    const res = await apiFetch(`/turnovers/packaging-preview?${params}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao carregar embalagens');
    }
    return (await res.json()) as PackagingPreviewResponse;
  };

  const handleOpenNewViraOrderModal = async () => {
    setSelectedViraComp(null);
    setNewViraQtyDe(10);
    setNewViraFator(1);
    setNewViraQtyPara(10);
    setNewViraQtyParaManual(false);
    setNewViraPackagingLines([]);
    setNewViraMotivo('');
    setNewViraOrderNotes('');
    await fetchNextViraOrderNumber();
    setShowNewViraOrderModal(true);
  };

  const applyViraCompSelection = async (found) => {
    setSelectedViraComp(found || null);
    if (!found) {
      setNewViraPackagingLines([]);
      setNewViraFator(1);
      return;
    }
    const fator = parseFloat(found.quantidade) || 1;
    setNewViraFator(fator);
    setNewViraQtyParaManual(false);
    const qtyDe = newViraQtyDe || 1;
    const qtyPara = qtyDe * fator;
    setNewViraQtyPara(qtyPara);
    setLoadingViraPackaging(true);
    try {
      const preview = await fetchViraPackagingPreview(
        found.deProdutoCodigo,
        found.paraProdutoCodigo,
        qtyDe,
        qtyPara,
      );
      setNewViraFator(preview.fator || fator);
      setNewViraPackagingLines(linesFromPreview(preview));
    } catch (err) {
      console.error(err);
      setNewViraPackagingLines([]);
    } finally {
      setLoadingViraPackaging(false);
    }
  };

  const refreshNewViraPackaging = async (qtyDe: number, qtyPara: number) => {
    if (!selectedViraComp) return;
    setLoadingViraPackaging(true);
    try {
      const preview = await fetchViraPackagingPreview(
        selectedViraComp.deProdutoCodigo,
        selectedViraComp.paraProdutoCodigo,
        qtyDe,
        qtyPara,
      );
      setNewViraPackagingLines(linesFromPreview(preview));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingViraPackaging(false);
    }
  };

  const handleCreateViraOrder = async (e) => {
    if (e) e.preventDefault();
    if (!selectedViraComp || !newViraOrderNumber.trim()) return;
    setSubmittingNewViraOrder(true);
    try {
      const packagingPayload = serializePackagingDeductions({
        meta: {
          qtyDe: Number(newViraQtyDe) || 0,
          fator: Number(newViraFator) || 1,
          qtyPara: Number(newViraQtyPara) || 0,
        },
        items: newViraPackagingLines,
      });
      const res = await apiFetch(`/turnovers/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: newViraOrderNumber.trim(),
          deProdutoCodigo: selectedViraComp.deProdutoCodigo,
          paraProdutoCodigo: selectedViraComp.paraProdutoCodigo,
          quantity: parseFloat(String(newViraQtyPara)) || 0,
          status: 'PENDING',
          observations: newViraOrderNotes,
          packagingDeductions: packagingPayload,
          motivo: newViraMotivo.trim() || null,
        }),
      });
      if (res.ok) {
        setShowNewViraOrderModal(false);
        await fetchViraOrders();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao criar ordem de vira.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao conectar com a API.');
    } finally {
      setSubmittingNewViraOrder(false);
    }
  };

  const handleOpenEditViraOrderModal = (o) => {
    setSelectedViraOrder(o);
    setEditViraStatus(o.status || 'PENDING');
    setEditViraAssembledBy(o.assembledBy || '');
    setEditViraCheckedBy(o.checkedBy || '');
    setEditViraNotes(o.observations || '');
    setEditViraQuantityAssembled(o.quantityAssembled !== null && o.quantityAssembled !== undefined ? o.quantityAssembled : o.quantity);
    setEditViraErpLaunched(o.erpLaunched === 1);
    setEditViraMotivo(o.motivo || '');
    const parsed = parsePackagingDeductions(o.packagingDeductions);
    setEditViraPackagingLines(parsed?.items ? [...parsed.items] : []);
    setShowEditViraOrderModal(true);
  };

  const handleUpdateViraOrder = async (e) => {
    if (e) e.preventDefault();
    if (!selectedViraOrder) return;
    setSubmittingEditViraOrder(true);
    try {
      const existing = parsePackagingDeductions(selectedViraOrder.packagingDeductions);
      const packagingPayload =
        editViraPackagingLines.length > 0
          ? serializePackagingDeductions({
              meta: existing?.meta,
              items: editViraPackagingLines,
            })
          : null;
      const payload: Record<string, unknown> = {
        status: editViraStatus,
        assembledBy: editViraAssembledBy,
        checkedBy: editViraCheckedBy,
        observations: editViraNotes,
        erpLaunched: editViraErpLaunched ? 1 : 0,
        quantityAssembled: parseFloat(String(editViraQuantityAssembled)) || 0,
        motivo: editViraMotivo.trim() || null,
      };
      if (packagingPayload) {
        payload.packagingDeductions = packagingPayload;
      }
      const res = await apiFetch(`/turnovers/orders/${selectedViraOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowEditViraOrderModal(false);
        await fetchViraOrders();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao atualizar ordem de vira.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão.');
    } finally {
      setSubmittingEditViraOrder(false);
    }
  };

  const toggleFormulaPackagingPreview = async (row) => {
    const key = `${row.deProdutoCodigo}|${row.paraProdutoCodigo}`;
    if (expandedViraFormulaKey === key) {
      setExpandedViraFormulaKey('');
      setFormulaPackagingPreview(null);
      return;
    }
    setExpandedViraFormulaKey(key);
    setLoadingFormulaPackaging(true);
    setFormulaPackagingPreview(null);
    try {
      const preview = await fetchViraPackagingPreview(
        row.deProdutoCodigo,
        row.paraProdutoCodigo,
        1,
        parseFloat(row.quantidade) || 1,
      );
      setFormulaPackagingPreview(preview);
    } catch (err) {
      console.error(err);
      setFormulaPackagingPreview(null);
    } finally {
      setLoadingFormulaPackaging(false);
    }
  };

  const buildViraPrintPayload = (o) => {
    const parsed = parsePackagingDeductions(o.packagingDeductions);
    const meta = parsed?.meta;
    const { returns, consumes } = splitPackagingLines(parsed?.items || []);
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      isViraPrint: true,
      kitProductCode: o.paraProdutoCodigo,
      kitProductDescription: `CONVERSÃO: ${o.deProdutoDescricao} ➔ ${o.paraProdutoDescricao}`,
      deCodigo: o.deProdutoCodigo,
      deDescricao: o.deProdutoDescricao,
      paraCodigo: o.paraProdutoCodigo,
      paraDescricao: o.paraProdutoDescricao,
      quantity: o.quantity,
      quantityAssembled: o.quantityAssembled,
      status: o.status,
      observations: o.observations,
      created_at: o.createdAt,
      motivo: o.motivo || '',
      viraMeta: meta || null,
      viraReturns: returns,
      viraConsumes: consumes,
    };
  };

  const truncPrint = (s, n = 42) => {
    const t = String(s || '').trim();
    if (t.length <= n) return t;
    return `${t.slice(0, n - 1)}…`;
  };

  const handleDeleteViraOrder = async (id) => {
    if (!window.confirm("Deseja realmente excluir esta ordem de vira?")) return;
    try {
      const res = await apiFetch(`/turnovers/orders/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchViraOrders();
      } else {
        alert('Erro ao excluir ordem.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de conexão.');
    }
  };

  const getViraDeNamePreview = () => {
    if (!newViraDeCodigo.trim()) return '';
    const cleaned = newViraDeCodigo.trim().replace(/['"]/g, '').toLowerCase();
    const found = products.find(p => (p.codigo || '').replace(/['"]/g, '').trim().toLowerCase() === cleaned);
    return found ? `${found.descricao} (Estoque: ${found.estoque} un)` : 'Produto não encontrado no estoque';
  };

  const getViraParaNamePreview = () => {
    if (!newViraParaCodigo.trim()) return '';
    const cleaned = newViraParaCodigo.trim().replace(/['"]/g, '').toLowerCase();
    const found = products.find(p => (p.codigo || '').replace(/['"]/g, '').trim().toLowerCase() === cleaned);
    return found ? `${found.descricao} (Estoque: ${found.estoque} un)` : 'Produto não encontrado no estoque';
  };

  useEffect(() => {
    // Produtos só quando a aba precisa (evita /products + /kits juntos no open)
    if (
      activeSubTab === 'composicao' ||
      activeSubTab === 'vira_composicao' ||
      activeSubTab === 'vira_ordens' ||
      activeSubTab === 'componentes'
    ) {
      fetchProducts();
    }
  }, [fetchProducts, activeSubTab]);

  useEffect(() => {
    if (activeSubTab === 'componentes') {
      fetchKits();
    } else if (activeSubTab === 'composicao') {
      fetchKitComposicao();
      fetchKits();
    } else if (activeSubTab === 'vira_ordens') {
      fetchViraOrders();
    } else if (activeSubTab === 'vira_composicao') {
      fetchViraComposicao();
    } else {
      fetchOrders();
    }
  }, [activeSubTab, fetchKits, fetchOrders, fetchKitComposicao, fetchViraOrders, fetchViraComposicao]);

  // Lista Mestre unificada de Kits Montáveis
  const masterKitsList = useMemo(() => {
    const map = new Map();
    
    // 1. Identificar categorias de Kit cadastradas no banco
    const kitCategoryIds = categories
      .filter(c => {
        const name = (c.name || '').toLowerCase();
        return name === 'kits' || name === 'kit';
      })
      .map(c => c.id);

    // 2. Adicionar produtos categorizados como kits
    products.forEach(p => {
      const isKit = p.categoria_produto === 'kit' || (p.categoria_produto && kitCategoryIds.includes(p.categoria_produto));
      if (isKit && p.codigo) {
        map.set(p.codigo, {
          codigo: p.codigo,
          descricao: p.descricao || 'Kit Montável',
          estoque: p.estoque || 0,
          pedidos_aberto: p.pedidos_aberto || 0
        });
      }
    });

    // 3. Adicionar kits do endpoint /kits (para manter compatibilidade de cálculo de estoque montável)
    kits.forEach(k => {
      if (k.codigo) {
        map.set(k.codigo, k);
      }
    });

    // 4. Adicionar kits preexistentes em kitComposicao que possam não estar categorizados
    kitComposicao.forEach(kc => {
      if (kc.kit_codigo && !map.has(kc.kit_codigo)) {
        map.set(kc.kit_codigo, {
          codigo: kc.kit_codigo,
          descricao: kc.kit_descricao || 'Kit Montável',
          estoque: 0,
          pedidos_aberto: 0
        });
      }
    });

    const list = Array.from(map.values()).sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));
    if (!kitCompSearch.trim()) return list;
    const q = kitCompSearch.trim().toLowerCase();
    return list.filter(k => 
      (k.codigo || '').toLowerCase().includes(q) || 
      (k.descricao || '').toLowerCase().includes(q)
    );
  }, [categories, products, kits, kitComposicao, kitCompSearch]);


  const toggleKitExpanded = (code) => {
    setExpandedKits(prev => 
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleOpenNewOrderModal = async (preselectedKitCode = '') => {
    await fetchAllKitsDropdown();
    await fetchNextOrderNumber();
    setSelectedKitCode(preselectedKitCode);
    const foundKit = kits.find(k => k.codigo === preselectedKitCode) || allKitsDropdown.find(k => k.codigo === preselectedKitCode);
    const customQty = preselectedKitCode 
      ? (kitMontarQtys[preselectedKitCode] !== undefined 
          ? kitMontarQtys[preselectedKitCode] 
          : (foundKit?.producao_recomendada > 0 ? foundKit.producao_recomendada : (foundKit?.max_montavel > 0 ? foundKit.max_montavel : 10))) 
      : 10;
    setNewKitQty(customQty);
    setNewKitNotes('');
    setNewComponentLotes({});
    setShowNewOrderModal(true);
  };

  // Handle kit selection change to pre-populate lotes form
  const handleKitChange = (kitCode) => {
    setSelectedKitCode(kitCode);
    setNewComponentLotes({});
    const foundKit = kits.find(k => k.codigo === kitCode) || allKitsDropdown.find(k => k.codigo === kitCode);
    if (foundKit) {
      const defaultQty = kitMontarQtys[kitCode] !== undefined
        ? kitMontarQtys[kitCode]
        : (foundKit.producao_recomendada > 0 ? foundKit.producao_recomendada : (foundKit.max_montavel > 0 ? foundKit.max_montavel : 10));
      setNewKitQty(defaultQty);
    }
  };

  // Select Kit Object from dropdown list
  const selectedKitObj = allKitsDropdown.find(k => k.codigo === selectedKitCode);

  const handleCreateOrder = async (e, andPrint = false) => {
    if (e) e.preventDefault();
    if (!newOrderNumber.trim()) {
      alert("Por favor, preencha o número do lote/ordem.");
      return;
    }
    if (!selectedKitCode) {
      alert("Por favor, selecione o kit.");
      return;
    }

    setSubmittingNewOrder(true);
    try {
      const kitQty = parseFloat(String(newKitQty)) || 0;
      const lotesList = selectedKitObj?.componentes?.map(comp => {
        const perKit = Number(comp.quantidade) || 1;
        const need = kitComponentNeedQty(
          perKit,
          kitQty,
          comp.fator_proporcao_qtd,
          comp.fator_proporcao_kits,
        );
        return {
          code: comp.codigo,
          description: comp.descricao,
          expected_qty: perKit,
          fator_proporcao_qtd: comp.fator_proporcao_qtd ?? null,
          fator_proporcao_kits: comp.fator_proporcao_kits ?? null,
          need_qty: need,
          lote: newComponentLotes[comp.codigo] || "",
        };
      }) || [];

      const payload = {
        orderNumber: newOrderNumber,
        kitProductCode: selectedKitCode,
        kitProductDescription: selectedKitObj?.descricao || "",
        quantity: kitQty,
        status: "PENDING",
        assembledBy: "",
        checkedBy: "",
        observations: newKitNotes,
        componentsLotes: JSON.stringify(lotesList)
      };

      const res = await apiFetch(`/kits/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const createdOrder = {
          id: data.id,
          orderNumber: newOrderNumber,
          kitProductCode: selectedKitCode,
          kitProductDescription: selectedKitObj?.descricao || "",
          quantity: kitQty,
          quantityAssembled: null,
          status: "PENDING",
          createdAt: data.createdAt || new Date().toLocaleString('pt-BR'),
          completedAt: null,
          assembledBy: "",
          checkedBy: "",
          observations: newKitNotes,
          erpLaunched: 0,
          componentsLotes: JSON.stringify(lotesList)
        };

        setShowNewOrderModal(false);
        fetchOrders();
        fetchNextOrderNumber();

        if (andPrint) {
          handlePrintOrder(createdOrder);
        }
      } else {
        const err = await res.json();
        alert(err.error || "Erro ao criar ordem de montagem");
      }
    } catch (err) {
      console.error(err);
      alert("Falha de rede ao criar ordem");
    } finally {
      setSubmittingNewOrder(false);
    }
  };

  const handleQuickCreateAndPrintKit = async (kit, customQty) => {
    try {
      await fetchAllKitsDropdown();
      let orderNum = nextOrderNumber;
      try {
        const resNext = await apiFetch('/kits/next-order-number');
        if (resNext.ok) {
          const d = await resNext.json();
          if (d.nextOrderNumber) orderNum = d.nextOrderNumber;
        }
      } catch (e) {}

      if (!orderNum) orderNum = `KIT-${Date.now()}`;

      const kitObj = allKitsDropdown.find(k => k.codigo === kit.codigo) || kit;
      const kitQty = parseFloat(String(customQty !== undefined ? customQty : (kitMontarQtys[kit.codigo] || (kit.producao_recomendada > 0 ? kit.producao_recomendada : (kit.max_montavel > 0 ? kit.max_montavel : 10))))) || 10;

      const lotesList = kitObj?.componentes?.map(comp => {
        const perKit = Number(comp.quantidade) || 1;
        const need = kitComponentNeedQty(
          perKit,
          kitQty,
          comp.fator_proporcao_qtd,
          comp.fator_proporcao_kits,
        );
        return {
          code: comp.codigo,
          description: comp.descricao,
          expected_qty: perKit,
          fator_proporcao_qtd: comp.fator_proporcao_qtd ?? null,
          fator_proporcao_kits: comp.fator_proporcao_kits ?? null,
          need_qty: need,
          lote: "",
        };
      }) || [];

      const payload = {
        orderNumber: orderNum,
        kitProductCode: kit.codigo,
        kitProductDescription: kit.descricao || "",
        quantity: kitQty,
        status: "PENDING",
        assembledBy: "",
        checkedBy: "",
        observations: "",
        componentsLotes: JSON.stringify(lotesList)
      };

      const res = await apiFetch(`/kits/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const created = {
          id: data.id,
          orderNumber: orderNum,
          kitProductCode: kit.codigo,
          kitProductDescription: kit.descricao || "",
          quantity: kitQty,
          quantityAssembled: null,
          status: "PENDING",
          createdAt: data.createdAt || new Date().toLocaleString('pt-BR'),
          completedAt: null,
          assembledBy: "",
          checkedBy: "",
          observations: "",
          erpLaunched: 0,
          componentsLotes: JSON.stringify(lotesList)
        };
        fetchOrders();
        fetchNextOrderNumber();
        handlePrintOrder(created);
      } else {
        const err = await res.json();
        alert(err.error || "Erro ao gerar ordem de montagem");
      }
    } catch (err) {
      console.error(err);
      alert("Falha de rede ao gerar e imprimir ordem");
    }
  };

  const handleKitQuantityAssembledChange = (val, componentsList) => {
    setEditQuantityAssembled(val);
    const numVal = parseFloat(val) || 0;
    
    // Auto-update used quantities for all components based on the new kit quantity
    const newUsedQties = { ...editComponentUsedQty };
    componentsList.forEach(item => {
      newUsedQties[item.code] = kitOrderComponentNeed(item, numVal);
    });
    setEditComponentUsedQty(newUsedQties);
  };

  const handleOpenEditModal = (order) => {
    setSelectedOrder(order);
    setEditOrderNumber(order.orderNumber || '');
    setEditQuantity(order.quantity);
    setEditStatus(order.status);
    setEditAssembledBy(order.assembledBy || '');
    setEditCheckedBy(order.checkedBy || '');
    setEditNotes(order.observations || '');
    setEditErpLaunched(order.erpLaunched === 1);
    setEditQuantityAssembled(order.quantityAssembled !== null && order.quantityAssembled !== undefined ? order.quantityAssembled : order.quantity);

    // Parse components lotes
    let parsedLotes = {};
    let parsedUsedQties = {};
    try {
      if (order.componentsLotes) {
        const list = JSON.parse(order.componentsLotes);
        const kitsMounted = order.quantityAssembled !== null && order.quantityAssembled !== undefined
          ? order.quantityAssembled
          : order.quantity;
        list.forEach(item => {
          parsedLotes[item.code] = item.lote || "";
          parsedUsedQties[item.code] =
            item.used_qty !== undefined
              ? item.used_qty
              : kitOrderComponentNeed(item, kitsMounted);
        });
      }
    } catch (e) {
      console.error("Error parsing components lotes:", e);
    }
    setEditComponentLotes(parsedLotes);
    setEditComponentUsedQty(parsedUsedQties);
    setShowEditOrderModal(true);
  };

  const handleUpdateOrder = async (e, andPrint = false) => {
    if (e) e.preventDefault();
    setSubmittingEditOrder(true);
    try {
      const parsedEditQty = parseFloat(String(editQuantity)) || selectedOrder.quantity || 0;
      // Parse and rebuild components lotes
      let list = [];
      try {
        if (selectedOrder.componentsLotes) {
          const originalList = JSON.parse(selectedOrder.componentsLotes);
          list = originalList.map(item => ({
            ...item,
            lote: editComponentLotes[item.code] || "",
            used_qty:
              editComponentUsedQty[item.code] !== undefined
                ? parseFloat(editComponentUsedQty[item.code])
                : kitOrderComponentNeed(item, parseFloat(editQuantityAssembled) || 0),
            need_qty: kitOrderComponentNeed(item, parsedEditQty),
          }));
        }
      } catch (err) {
        console.error(err);
      }

      const payload = {
        orderNumber: editOrderNumber || selectedOrder.orderNumber,
        quantity: parsedEditQty,
        status: editStatus,
        assembledBy: editAssembledBy,
        checkedBy: editCheckedBy,
        observations: editNotes,
        erpLaunched: editErpLaunched ? 1 : 0,
        componentsLotes: list.length > 0 ? JSON.stringify(list) : null,
        quantityAssembled: parseFloat(editQuantityAssembled) || 0
      };

      const res = await apiFetch(`/kits/orders/${selectedOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const updatedOrder = {
          ...selectedOrder,
          orderNumber: editOrderNumber || selectedOrder.orderNumber,
          quantity: parsedEditQty,
          quantityAssembled: parseFloat(editQuantityAssembled) || 0,
          status: editStatus,
          assembledBy: editAssembledBy,
          checkedBy: editCheckedBy,
          observations: editNotes,
          erpLaunched: editErpLaunched ? 1 : 0,
          componentsLotes: list.length > 0 ? JSON.stringify(list) : null,
        };

        setShowEditOrderModal(false);
        fetchOrders();

        if (andPrint) {
          handlePrintOrder(updatedOrder);
        }
      } else {
        alert("Erro ao atualizar ordem de montagem");
      }
    } catch (err) {
      console.error(err);
      alert("Falha de rede ao atualizar");
    } finally {
      setSubmittingEditOrder(false);
    }
  };

  const handleDeleteOrder = async (id) => {
    if (!window.confirm("Deseja realmente excluir esta ordem de montagem?")) return;
    try {
      const res = await apiFetch(`/kits/orders/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchOrders();
      } else {
        alert("Erro ao excluir ordem de montagem");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Helper: Print Ordem de Montagem ticket
  const handlePrintOrder = (order) => {
    setPrintingOrder(order);
    setTimeout(() => {
      window.print();
      setPrintingOrder(null);
    }, 150);
  };

  // Filtered orders list
  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.orderNumber.toLowerCase().includes(searchOrder.toLowerCase()) ||
                          o.kitProductCode.toLowerCase().includes(searchOrder.toLowerCase()) ||
                          o.kitProductDescription.toLowerCase().includes(searchOrder.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || o.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-1 w-full h-full overflow-hidden animate-in fade-in duration-200">
      {/* Printable Sheet */}
      {printingOrder && (
        printingOrder.isViraPrint || printingOrder.kitProductDescription?.startsWith('CONVERSÃO') ? (
          /* Folha compacta de conversão — formulário manual de chão */
          <div
            id="print-area"
            className="hidden print:block p-5 bg-white text-zinc-900 font-sans w-full max-w-[850px] mx-auto shadow-none text-[9px] leading-tight"
          >
            <div className="flex justify-between items-start border-b border-zinc-900 pb-2 mb-2">
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-black tracking-tighter">NATUM</span>
                  <span className="text-[8px] font-semibold tracking-[0.2em] text-zinc-500 uppercase">COSMÉTICOS</span>
                </div>
                <p className="text-[8px] font-bold uppercase tracking-widest text-zinc-600">Folha de Conversão de Produto</p>
              </div>
              <div className="text-right">
                <div className="inline-block bg-zinc-950 text-white px-2.5 py-1 rounded text-center">
                  <span className="text-[6px] uppercase font-black text-zinc-300 block">Nº Ordem / Lote Hub</span>
                  <span className="text-sm font-black">{printingOrder.orderNumber}</span>
                </div>
                <p className="text-[7px] text-zinc-500 font-bold mt-1 uppercase">
                  Emissão: {new Date(printingOrder.created_at || Date.now()).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>

            {/* DE → PARA + qtys */}
            <div className="border border-zinc-800 rounded mb-2 overflow-hidden">
              <div className="grid grid-cols-12 divide-x divide-zinc-300">
                <div className="col-span-5 p-1.5">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500 block">DE (origem)</span>
                  <p className="font-mono font-bold text-[9px]">{printingOrder.deCodigo || '—'}</p>
                  <p className="font-semibold text-[8px] text-zinc-700 truncate">
                    {truncPrint(printingOrder.deDescricao, 48)}
                  </p>
                </div>
                <div className="col-span-5 p-1.5">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500 block">PARA (destino)</span>
                  <p className="font-mono font-bold text-[9px]">
                    {printingOrder.paraCodigo || printingOrder.kitProductCode || '—'}
                  </p>
                  <p className="font-semibold text-[8px] text-zinc-700 truncate">
                    {truncPrint(printingOrder.paraDescricao, 48)}
                  </p>
                </div>
                <div className="col-span-2 p-1.5 text-center flex flex-col justify-center bg-zinc-50">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500">Fator</span>
                  <span className="font-black text-[11px]">
                    {printingOrder.viraMeta?.fator ?? '—'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-4 border-t border-zinc-300 divide-x divide-zinc-300 text-center">
                <div className="p-1">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Qtd DE</span>
                  <span className="font-bold">{printingOrder.viraMeta?.qtyDe ?? '—'}</span>
                </div>
                <div className="p-1">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Qtd PARA est.</span>
                  <span className="font-bold">
                    {printingOrder.viraMeta?.qtyPara ?? printingOrder.quantity ?? '—'}
                  </span>
                </div>
                <div className="p-1">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Qtd real PARA</span>
                  <div className="border-b border-dashed border-zinc-600 h-3.5 w-14 mx-auto mt-0.5" />
                </div>
                <div className="p-1">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Data conversão</span>
                  <div className="border-b border-dashed border-zinc-600 h-3.5 w-16 mx-auto mt-0.5" />
                </div>
              </div>
            </div>

            {/* Lotes produto */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="border border-zinc-400 rounded px-2 py-1.5 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Lote produto origem (virado)</span>
                  <span className="font-mono text-[8px] text-zinc-600">{printingOrder.deCodigo}</span>
                </div>
                <div className="border border-zinc-400 rounded h-6 w-28 bg-white shrink-0" title="Preencher à mão" />
              </div>
              <div className="border border-zinc-400 rounded px-2 py-1.5 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Lote item final (destino)</span>
                  <span className="font-mono text-[8px] text-zinc-600">
                    {printingOrder.paraCodigo || printingOrder.kitProductCode}
                  </span>
                </div>
                <div className="border border-zinc-400 rounded h-6 w-28 bg-white shrink-0" title="Preencher à mão" />
              </div>
            </div>

            {/* Embalagens retorno */}
            <div className="border border-zinc-700 rounded mb-1.5 overflow-hidden">
              <div className="bg-zinc-100 px-2 py-0.5 text-[7px] font-black uppercase tracking-wide text-zinc-700">
                Embalagens retorno (origem) — marcar se retornou ao estoque
              </div>
              <table className="w-full text-[8px] border-collapse">
                <thead>
                  <tr className="border-b border-zinc-400 text-[6.5px] uppercase font-black text-zinc-500">
                    <th className="py-0.5 px-1.5 text-left w-16">Cód.</th>
                    <th className="py-0.5 px-1.5 text-left">Descrição</th>
                    <th className="py-0.5 px-1.5 text-center w-10">Qtd</th>
                    <th className="py-0.5 px-1.5 text-center w-24">Retornou?</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const all = printingOrder.viraReturns || [];
                    const max = 8;
                    const rows = all.slice(0, max);
                    if (rows.length === 0) {
                      return (
                        <tr>
                          <td colSpan={4} className="px-1.5 py-1 text-zinc-400 italic">
                            Sem embalagens de retorno sugeridas
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <>
                        {rows.map((r) => (
                          <tr key={`vr-${r.code}`} className="border-t border-zinc-200">
                            <td className="py-0.5 px-1.5 font-mono font-bold">{r.code}</td>
                            <td className="py-0.5 px-1.5">{truncPrint(r.description, 36)}</td>
                            <td className="py-0.5 px-1.5 text-center font-bold">{r.qty}</td>
                            <td className="py-0.5 px-1.5 text-center font-bold tracking-wide">
                              □ Sim&nbsp;&nbsp;□ Não
                            </td>
                          </tr>
                        ))}
                        {all.length > max && (
                          <tr className="border-t border-zinc-200">
                            <td colSpan={4} className="px-1.5 py-0.5 text-zinc-500 italic">
                              +{all.length - max} no Hub (não impressas)
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            {/* Embalagens saída */}
            <div className="border border-zinc-700 rounded mb-2 overflow-hidden">
              <div className="bg-zinc-100 px-2 py-0.5 text-[7px] font-black uppercase tracking-wide text-zinc-700">
                Embalagens saída (destino) — preencher lote da embalagem usada
              </div>
              <table className="w-full text-[8px] border-collapse">
                <thead>
                  <tr className="border-b border-zinc-400 text-[6.5px] uppercase font-black text-zinc-500">
                    <th className="py-0.5 px-1.5 text-left w-16">Cód.</th>
                    <th className="py-0.5 px-1.5 text-left">Descrição</th>
                    <th className="py-0.5 px-1.5 text-center w-10">Qtd</th>
                    <th className="py-0.5 px-1.5 text-left w-28">Lote emb.</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const all = printingOrder.viraConsumes || [];
                    const max = 8;
                    const rows = all.slice(0, max);
                    if (rows.length === 0) {
                      return (
                        <tr>
                          <td colSpan={4} className="px-1.5 py-1 text-zinc-400 italic">
                            Sem embalagens de saída sugeridas
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <>
                        {rows.map((c) => (
                          <tr key={`vc-${c.code}`} className="border-t border-zinc-200">
                            <td className="py-0.5 px-1.5 font-mono font-bold">{c.code}</td>
                            <td className="py-0.5 px-1.5">{truncPrint(c.description, 36)}</td>
                            <td className="py-0.5 px-1.5 text-center font-bold">{c.qty}</td>
                            <td className="py-0.5 px-1.5">
                              <div className="border border-zinc-400 rounded h-4 w-full bg-white" />
                            </td>
                          </tr>
                        ))}
                        {all.length > max && (
                          <tr className="border-t border-zinc-200">
                            <td colSpan={4} className="px-1.5 py-0.5 text-zinc-500 italic">
                              +{all.length - max} no Hub (não impressas)
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            {/* Assinaturas + obs */}
            <div className="grid grid-cols-3 gap-2 mb-1.5 text-[8px]">
              <div className="border border-zinc-400 rounded px-2 py-1">
                <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Montou</span>
                <div className="border-b border-zinc-500 h-4 mt-1" />
              </div>
              <div className="border border-zinc-400 rounded px-2 py-1">
                <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Conferiu</span>
                <div className="border-b border-zinc-500 h-4 mt-1" />
              </div>
              <div className="border border-zinc-400 rounded px-2 py-1">
                <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Data</span>
                <div className="border-b border-zinc-500 h-4 mt-1" />
              </div>
            </div>
            <div className="border border-zinc-400 rounded px-2 py-1 mb-2">
              <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Observações</span>
              <div className="border-b border-dashed border-zinc-400 h-3.5 mt-1" />
              <div className="border-b border-dashed border-zinc-400 h-3.5 mt-1" />
            </div>
            <p className="text-[6.5px] text-zinc-500 font-medium text-center">
              Registro Hub não movimenta estoque — lançar no ERP conforme preenchido nesta folha.
            </p>
          </div>
        ) : (
        <div id="print-area" className="hidden print:flex flex-col justify-between p-8 bg-white text-zinc-900 font-sans min-h-[94vh] w-full max-w-[850px] mx-auto relative shadow-none">
          <div className="space-y-6">
            {/* Elegant Top Header with logo and document type */}
            <div className="flex justify-between items-start border-b border-zinc-200 pb-4">
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black tracking-tighter text-zinc-950">NATUM</span>
                  <span className="text-[10px] font-semibold tracking-[0.3em] text-zinc-450 uppercase">COSMÉTICOS</span>
                </div>
                <p className="text-[9px] font-bold text-zinc-455 uppercase tracking-widest mt-1">
                  Ordem de Montagem de Kit
                </p>
              </div>
              <div className="flex flex-col items-end">
                <div className="bg-zinc-950 text-white px-3 py-1.5 rounded-lg text-center min-w-32 shadow-sm">
                  <span className="text-[7px] uppercase font-black text-zinc-300 tracking-widest block mb-0.5">Nº DA ORDEM / LOTE</span>
                  <span className="text-sm font-black tracking-tight">{printingOrder.orderNumber}</span>
                </div>
                <span className="text-[8px] text-zinc-400 font-bold mt-1.5 uppercase">
                  Emissão: {new Date(printingOrder.created_at || Date.now()).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
            
            {/* Info Block - Clean modern layout */}
            <div className="grid grid-cols-12 border border-zinc-200 rounded-xl overflow-hidden divide-x divide-zinc-200 text-[10px]">
              <div className="p-3 bg-zinc-50/50 space-y-1 col-span-6">
                <span className="text-[7.5px] uppercase font-black text-zinc-400 tracking-wider block">
                  Produto / Kit Comercial
                </span>
                <p className="font-extrabold text-zinc-900 leading-tight">{printingOrder.kitProductDescription}</p>
              </div>
              <div className="p-3 space-y-1 col-span-2 text-center flex flex-col justify-center">
                <span className="text-[7.5px] uppercase font-black text-zinc-400 tracking-wider block">
                  Código do Kit
                </span>
                <p className="font-mono font-bold text-zinc-800 leading-none mt-1">{printingOrder.kitProductCode}</p>
              </div>
              <div className="p-3 bg-zinc-50/50 space-y-1 col-span-2 text-center flex flex-col justify-center">
                <span className="text-[7.5px] uppercase font-black text-zinc-400 tracking-wider block">Programada</span>
                <p className="font-bold text-zinc-650 leading-none mt-1">{printingOrder.quantity} un</p>
              </div>
              <div className="p-3 space-y-1 col-span-2 text-center flex flex-col justify-center">
                <span className="text-[7.5px] uppercase font-black text-zinc-400 tracking-wider block">
                  Montada Real
                </span>
                {printingOrder.status === 'COMPLETED' ? (
                  <p className="font-black text-zinc-950 leading-none mt-1">
                    {printingOrder.quantityAssembled !== null && printingOrder.quantityAssembled !== undefined ? printingOrder.quantityAssembled : printingOrder.quantity} un
                  </p>
                ) : (
                  <div className="border-b border-dashed border-zinc-500 h-4 w-16 mx-auto mt-0.5"></div>
                )}
              </div>
            </div>

            {/* Components Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-950 pb-1.5">
                <h3 className="text-[9px] font-black text-zinc-950 uppercase tracking-widest">
                  Instruções e Componentes do Kit
                </h3>
                <span className="text-[8px] text-zinc-450 font-bold uppercase">Nexus — Controle de Fluxo</span>
              </div>
              <table className="w-full text-[9px] border-collapse">
                <thead>
                  <tr className="border-b border-zinc-950 text-zinc-900 font-black text-[8px] uppercase tracking-wider">
                    <th className="py-2 text-left w-20">Código</th>
                    <th className="py-2 text-left">Componente / Descrição</th>
                    <th className="py-2 text-center w-16">Qtd p/ Kit</th>
                    <th className="py-2 text-center w-20">Qtd Prog.</th>
                    <th className="py-2 text-center w-20">Qtd Usada</th>
                    <th className="py-2 text-left w-36 pl-4">Lote Utilizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {(() => {
                    try {
                      if (printingOrder.componentsLotes) {
                        const list = JSON.parse(printingOrder.componentsLotes);
                        return list.map(item => {
                          const kitQty = printingOrder.quantity || 0;
                          const kitDone = printingOrder.quantityAssembled || printingOrder.quantity || 0;
                          const plannedNeed = kitOrderComponentNeed(item, kitQty);
                          const usedQty =
                            item.used_qty !== undefined
                              ? parseFloat(item.used_qty)
                              : kitOrderComponentNeed(item, kitDone);
                          return (
                            <tr key={item.code} className="hover:bg-zinc-50/20">
                              <td className="py-2 font-mono font-bold text-zinc-900">{item.code}</td>
                              <td className="py-2 font-semibold text-zinc-800">{item.description}</td>
                              <td className="py-2 text-center font-bold text-zinc-500">
                                {formatQtyPerKitLabel(
                                  item.expected_qty,
                                  item.fator_proporcao_qtd,
                                  item.fator_proporcao_kits,
                                )}
                              </td>
                              <td className="py-2 text-center font-bold text-zinc-500">{plannedNeed} un</td>
                              <td className="py-2 text-center font-black text-zinc-900">
                                {printingOrder.status === 'COMPLETED' || item.used_qty !== undefined ? (
                                  `${usedQty} un`
                                ) : (
                                  <div className="border-b border-dashed border-zinc-400 h-4 w-12 mx-auto"></div>
                                )}
                              </td>
                              <td className="py-2 pl-4 italic text-zinc-455">
                                {item.lote ? (
                                  <span className="font-bold text-zinc-900 not-italic bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">{item.lote}</span>
                                ) : (
                                  <div className="border border-zinc-300 rounded-md h-6 w-full max-w-32 bg-zinc-50/30"></div>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      }
                    } catch (e) {
                      return <tr><td colSpan="6" className="p-4 text-center text-rose-500 font-bold">Erro ao processar componentes</td></tr>;
                    }
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer details - Extremely polished signature grid */}
          <div className="space-y-6">
            {/* Observations */}
            <div className="border border-zinc-200 bg-zinc-50/30 p-3.5 rounded-xl space-y-2">
              <span className="text-[7.5px] uppercase font-black text-zinc-455 tracking-wider block">
                {printingOrder.status === 'COMPLETED' ? 'Observações de Retorno / Ocorrências Registradas' : 'Observações de Retorno / Ocorrências (Preenchimento Manual)'}
              </span>
              {printingOrder.status === 'COMPLETED' ? (
                <p className="text-[9.5px] italic text-zinc-650 leading-tight">
                  {printingOrder.observations || "Nenhuma observação registrada para esta ordem de montagem."}
                </p>
              ) : (
                <div className="space-y-2">
                  {printingOrder.observations && (
                    <p className="text-[9.5px] font-semibold text-zinc-850 mb-1 leading-tight">
                      {printingOrder.observations}
                    </p>
                  )}
                  <div className="border-b border-dashed border-zinc-300 h-4"></div>
                  <div className="border-b border-dashed border-zinc-300 h-4"></div>
                  <div className="border-b border-dashed border-zinc-300 h-4"></div>
                </div>
              )}
            </div>

            {/* Signature Grid */}
            <div className="grid grid-cols-3 gap-6 pt-4 border-t border-zinc-200">
              <div className="border border-zinc-200 bg-zinc-50/20 p-4 rounded-xl space-y-3 h-28 flex flex-col justify-between">
                <span className="text-[8px] font-black text-zinc-950 uppercase tracking-wider block border-b border-zinc-200 pb-1 text-center">
                  1. MONTADOR RESPONSÁVEL
                </span>
                <div className="space-y-2.5 text-[9.5px] text-zinc-650">
                  <div className="flex items-baseline gap-1">
                    <span className="font-bold">Nome:</span>
                    <div className="flex-1 border-b border-zinc-300 h-4"></div>
                  </div>
                  <div className="flex items-baseline gap-1 pt-1">
                    <span className="font-bold">Data:</span>
                    <span className="font-bold">____/____/______</span>
                  </div>
                </div>
              </div>

              <div className="border border-zinc-200 bg-zinc-50/20 p-4 rounded-xl space-y-3 h-28 flex flex-col justify-between">
                <span className="text-[8px] font-black text-zinc-950 uppercase tracking-wider block border-b border-zinc-200 pb-1 text-center">
                  2. CONFERENTE EXPEDIÇÃO
                </span>
                <div className="space-y-2.5 text-[9.5px] text-zinc-650">
                  <div className="flex items-baseline gap-1">
                    <span className="font-bold">Nome:</span>
                    <div className="flex-1 border-b border-zinc-300 h-4"></div>
                  </div>
                  <div className="flex items-baseline gap-1 pt-1">
                    <span className="font-bold">Data:</span>
                    <span className="font-bold">____/____/______</span>
                  </div>
                </div>
              </div>

              <div className="border border-zinc-200 bg-zinc-50/20 p-4 rounded-xl space-y-3 h-28 flex flex-col justify-between">
                <span className="text-[8px] font-black text-zinc-950 uppercase tracking-wider block border-b border-zinc-200 pb-1 text-center">3. RESPONSÁVEL CONTROLE</span>
                <div className="space-y-2.5 text-[9.5px] text-zinc-650">
                  <div className="flex items-baseline gap-1">
                    <span className="font-bold">Nome:</span>
                    <div className="flex-1 border-b border-zinc-300 h-4"></div>
                  </div>
                  <div className="flex items-baseline gap-1 pt-1">
                    <span className="font-bold">Data:</span>
                    <span className="font-bold">____/____/______</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        )
      )}

      {/* Sidebar */}
      <div className="print:hidden w-64 bg-white border-r border-zinc-200 flex flex-col shrink-0">

          {/* Back Button */}
          <div className="p-3 border-b border-zinc-100">
            <button
              onClick={onBackToHub}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-all cursor-pointer border border-zinc-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar ao Estoque Hub
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="p-2 border-b border-zinc-100 space-y-1">
            <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              Menu Montagem
            </div>
            <button
              onClick={() => setActiveSubTab('ordens')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeSubTab === 'ordens' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-650 hover:bg-zinc-50"
              }`}
            >
              <ClipboardList className="h-4 w-4" />
              Ordens de Montagem
              <span className="ml-auto bg-zinc-200 text-zinc-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {orders.length}
              </span>
            </button>
            <button
              onClick={() => setActiveSubTab('componentes')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeSubTab === 'componentes' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-650 hover:bg-zinc-50"
              }`}
            >
              <Layers className="h-4 w-4" />
              Componentes e Alertas
            </button>
            <button
              onClick={() => setActiveSubTab('composicao')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeSubTab === 'composicao' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-650 hover:bg-zinc-50"
              }`}
            >
              <Settings className="h-4 w-4" />
              Composição de Kits
            </button>
          </div>

          <div className="p-2 border-b border-zinc-100 space-y-1">
            <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              Menu Conversão de Produto
            </div>
            <button
              onClick={() => setActiveSubTab('vira_ordens')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeSubTab === 'vira_ordens' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-650 hover:bg-zinc-50"
              }`}
            >
              <RefreshCw className="h-4 w-4" />
              Ordens de Conversão
              <span className="ml-auto bg-zinc-200 text-zinc-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {viraOrders.length}
              </span>
            </button>
            <button
              onClick={() => setActiveSubTab('vira_composicao')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeSubTab === 'vira_composicao' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-650 hover:bg-zinc-50"
              }`}
            >
              <Settings className="h-4 w-4" />
              Fórmulas de Conversão
            </button>
          </div>

          {/* Info/Stats Block */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="bg-zinc-50 rounded-xl p-4 space-y-3 border border-zinc-100">
              <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wider">Módulos Nexus</h3>
              <p className="text-xs text-zinc-550 leading-relaxed">
                Controle o fluxo fabril e logístico. Gerencie montagens de kits comerciais e ordens de conversão de produtos (reetiquetagem e reenvase).
              </p>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="print:hidden flex-1 flex flex-col overflow-hidden relative">
          <main className="flex-1 overflow-y-auto p-6 flex flex-col">
            <div className="flex items-center justify-between mb-6 no-print">
              <div />
              <div className="flex items-center gap-3">
                {activeSubTab === 'ordens' && (
                  <button 
                    onClick={() => handleOpenNewOrderModal()}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer transition-all active:scale-98"
                  >
                    <PlusCircle size={14} />
                    Nova Ordem de Montagem
                  </button>
                )}
                {activeSubTab === 'vira_ordens' && (
                  <button 
                    onClick={() => handleOpenNewViraOrderModal()}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer transition-all active:scale-98"
                  >
                    <PlusCircle size={14} />
                    Nova Ordem de Vira
                  </button>
                )}
                <button 
                  onClick={activeSubTab === 'ordens' ? fetchOrders : activeSubTab === 'composicao' ? fetchKitComposicao : fetchKits}
                  className="p-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl text-zinc-650 transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-sm cursor-pointer active:scale-98"
                >
                  <RefreshCw className={`h-4 w-4 ${(loading || loadingOrders) ? 'animate-spin' : ''}`} />
                  Recarregar
                </button>
              </div>
            </div>
            <style>{`
              @media print {
                body * {
                  visibility: hidden;
                }
                #print-area, #print-area * {
                  visibility: visible;
                }
                #print-area {
                  position: absolute;
                  left: 0;
                  top: 0;
                  width: 100%;
                  height: 100%;
                  display: flex !important;
                }
                @page {
                  size: A4 portrait;
                  margin: 15mm;
                }
              }
            `}</style>

            {/* TAB 1: ORDENS DE MONTAGEM */}
            {activeSubTab === 'ordens' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-zinc-50 p-3 rounded-xl border border-zinc-200">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Buscar ordem por lote ou kit..."
                  className="w-full text-xs border border-zinc-300 rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-zinc-950 bg-white"
                  value={searchOrder}
                  onChange={(e) => setSearchOrder(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <select 
                  className="text-xs border border-zinc-300 rounded-xl px-3 py-2 bg-white focus:outline-none"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="ALL">Todos os Status</option>
                  <option value="PENDING">Pendentes (Expedição)</option>
                  <option value="COMPLETED">Concluídas</option>
                </select>

                <button 
                  onClick={fetchOrders}
                  className="p-2.5 bg-white border border-zinc-300 rounded-xl text-zinc-550 hover:text-zinc-900 cursor-pointer"
                  title="Atualizar"
                >
                  {loadingOrders ? <RefreshCw className="animate-spin h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* List */}
            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
              {loadingOrders ? (
                <div className="py-16 text-center text-zinc-400 flex flex-col items-center gap-2">
                  <RefreshCw className="animate-spin h-8 w-8 text-zinc-300" />
                  <span className="text-xs font-medium">Carregando ordens de montagem...</span>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="py-16 text-center text-zinc-400 flex flex-col items-center gap-2">
                  <ClipboardList size={40} className="text-zinc-200" />
                  <span className="text-xs font-bold text-zinc-700">Nenhuma ordem de montagem encontrada</span>
                  <p className="text-[10px] text-zinc-550">Gere uma nova ordem clicando no botão no topo.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-550 font-bold uppercase text-[9px]">
                        <th className="p-3">Lote Ordem</th>
                        <th className="p-3">Kit</th>
                        <th className="p-3 text-right">Qtd a Montar</th>
                        <th className="p-3">Emissão</th>
                        <th className="p-3">Montado Em</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">ERP</th>
                        <th className="p-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((o) => (
                        <tr key={o.id} className="border-b border-zinc-150 hover:bg-zinc-50/50">
                          <td className="p-3 font-extrabold text-zinc-950">{o.orderNumber}</td>
                          <td className="p-3">
                            <span className="font-bold text-zinc-900 block">{o.kitProductDescription}</span>
                            <span className="text-[10px] text-zinc-500">REF: {o.kitProductCode}</span>
                          </td>
                          <td className="p-3 text-right">
                            <span className="font-extrabold text-zinc-900 block">{o.quantity} un</span>
                            {o.quantityAssembled !== null && o.quantityAssembled !== undefined && o.quantityAssembled !== o.quantity && (
                              <span className="text-[9px] font-bold text-zinc-500 block">Real: {o.quantityAssembled} un</span>
                            )}
                          </td>
                          <td className="p-3 text-zinc-500 font-medium">{o.createdAt}</td>
                          <td className="p-3 text-zinc-550 font-medium">
                            {o.completedAt ? (
                              <div>
                                <span className="block font-bold text-zinc-700">{o.completedAt}</span>
                                <span className="text-[10px] text-zinc-400">Por: {o.assembledBy || '-'}</span>
                              </div>
                            ) : (
                              <span className="text-[10px] italic text-zinc-400">Pendente na Produção</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded-full text-[9px] font-extrabold tracking-wide uppercase ${
                              o.status === 'COMPLETED' 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {o.status === 'COMPLETED' ? 'Concluída' : 'Em Montagem'}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                              o.erpLaunched === 1
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-zinc-100 text-zinc-450 border border-zinc-200'
                            }`}>
                              {o.erpLaunched === 1 ? 'Sim' : 'Não'}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-2 justify-center items-center">
                              <button 
                                onClick={() => handlePrintOrder(o)}
                                className="p-1.5 hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 rounded-lg cursor-pointer"
                                title="Imprimir Ordem para preenchimento manual"
                              >
                                <Printer size={14} />
                              </button>
                              <button 
                                onClick={() => handleOpenEditModal(o)}
                                className="p-1.5 hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 rounded-lg cursor-pointer"
                                title="Preencher Retorno / Editar"
                              >
                                <Eye size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteOrder(o.id)}
                                className="p-1.5 hover:bg-zinc-100 text-rose-600 hover:text-rose-700 rounded-lg cursor-pointer"
                                title="Excluir"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: COMPONENTES E ALERTAS (Kits list) */}
        {activeSubTab === 'componentes' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-zinc-50 p-3 rounded-xl border border-zinc-200">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Buscar kit por código ou descrição..." 
                  className="w-full text-xs border border-zinc-300 rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-zinc-950 bg-white"
                  value={kitsSearch}
                  onChange={(e) => { setKitsSearch(e.target.value); setKitsPage(1); }}
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <select 
                  className="text-xs border border-zinc-300 rounded-xl px-3 py-2 bg-white focus:outline-none"
                  value={kitsSelectedStatus}
                  onChange={(e) => { setKitsSelectedStatus(e.target.value); setKitsPage(1); }}
                >
                  <option value="ALL">Todos os Alertas</option>
                  <option value="critico">Crítico: Produzir</option>
                  <option value="ordem">Abrir Ordem</option>
                  <option value="montar">Montar Urgente</option>
                  <option value="aguardando">Aguardando Produção</option>
                  <option value="saudavel">Estoque OK</option>
                  <option value="abundante">Abundante</option>
                </select>

                <button 
                  onClick={fetchKits}
                  className="p-2.5 bg-white border border-zinc-300 rounded-xl text-zinc-550 hover:text-zinc-900 cursor-pointer"
                  title="Atualizar"
                >
                  {loading ? <RefreshCw className="animate-spin h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* List Table */}
            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
              {loading ? (
                <div className="py-16 text-center text-zinc-400 flex flex-col items-center gap-2">
                  <RefreshCw className="animate-spin h-8 w-8 text-zinc-300" />
                  <span className="text-xs font-medium">Calculando estoques e alertas de componentes...</span>
                </div>
              ) : kits.length === 0 ? (
                <div className="py-16 text-center text-zinc-400">
                  <Layers size={40} className="mx-auto text-zinc-200 mb-2" />
                  <span className="text-xs font-bold text-zinc-700">Nenhum kit encontrado com os filtros selecionados</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-550 font-bold uppercase text-[9px]">
                        <th style={{ width: '4%' }}></th>
                        <th style={{ width: '10%' }}>Código</th>
                        <th style={{ width: '26%' }}>Descrição</th>
                        <th style={{ width: '10%' }} className="text-right">Estoque</th>
                        <th style={{ width: '12%' }}>Status Alerta</th>
                        <th style={{ width: '10%' }} className="text-right">Sug. Produção</th>
                        <th style={{ width: '12%' }}>Capacidade</th>
                        <th style={{ width: '12%' }} className="text-right">Qtd a Montar</th>
                        <th style={{ width: '8%', textAlign: 'center' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kits.map((k) => {
                        const isExpanded = expandedKits.includes(k.codigo);
                        let capacityClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
                        if (k.max_montavel === 0) {
                          capacityClass = "bg-rose-50 text-rose-700 border-rose-255";
                        } else if (k.max_montavel < k.producao_recomendada) {
                          capacityClass = "bg-amber-50 text-amber-700 border-amber-255";
                        }

                        const currentQty = kitMontarQtys[k.codigo] !== undefined
                          ? kitMontarQtys[k.codigo]
                          : (k.producao_recomendada > 0 ? k.producao_recomendada : (k.max_montavel > 0 ? k.max_montavel : 10));

                        return (
                          <React.Fragment key={k.codigo}>
                            <tr className={`border-b border-zinc-150 ${isExpanded ? 'bg-zinc-50/20' : ''}`}>
                              <td className="p-3 text-center">
                                <button 
                                  onClick={() => toggleKitExpanded(k.codigo)}
                                  className="p-1 hover:bg-zinc-100 rounded text-zinc-655 cursor-pointer"
                                >
                                  {isExpanded ? <X size={12} /> : <Eye size={12} />}
                                </button>
                              </td>
                              <td className="p-3 font-extrabold text-zinc-955">{k.codigo}</td>
                              <td className="p-3 font-bold text-zinc-900">{k.descricao}</td>
                              <td className="p-3 text-right font-bold text-zinc-900">
                                {k.estoque} un
                                <span className="block font-medium text-[10px] text-zinc-400">Ped: {k.pedidos_aberto} un</span>
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-1 rounded-full text-[9px] font-extrabold tracking-wide uppercase ${
                                  k.status === 'critico' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                  k.status === 'ordem' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                  k.status === 'montar' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                                  k.status === 'aguardando' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                  'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}>
                                  {k.status_label}
                                </span>
                              </td>
                              <td className="p-3 text-right font-extrabold text-zinc-900">
                                {k.producao_recomendada > 0 ? (
                                  <span className="text-rose-600">{k.producao_recomendada} un</span>
                                ) : (
                                  <span className="text-zinc-450">-</span>
                                )}
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-1 rounded border text-[9px] font-extrabold tracking-wide ${capacityClass}`}>
                                  Máx: {k.max_montavel} un
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    min="1"
                                    value={currentQty}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setKitMontarQtys(prev => ({ ...prev, [k.codigo]: val }));
                                    }}
                                    className="w-16 text-right border border-zinc-300 rounded-lg px-2 py-1 text-xs font-bold text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                                    title="Editar quantidade a montar para este kit"
                                  />
                                  <span className="text-[10px] text-zinc-400 font-semibold">un</span>
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button 
                                    onClick={() => handleQuickCreateAndPrintKit(k, currentQty)}
                                    className="p-1.5 hover:bg-zinc-100 text-zinc-700 hover:text-zinc-950 rounded-lg cursor-pointer"
                                    title="Gerar e Imprimir Ordem de Montagem diretamente com esta quantidade"
                                  >
                                    <Printer size={15} />
                                  </button>
                                  <button 
                                    onClick={() => handleOpenNewOrderModal(k.codigo)}
                                    className="p-1.5 hover:bg-zinc-100 text-zinc-700 hover:text-zinc-950 rounded-lg cursor-pointer"
                                    title="Configurar Ordem de Montagem detalhada"
                                  >
                                    <PlusCircle size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Expanded components list */}
                            {isExpanded && (
                              <tr className="bg-zinc-50/50">
                                <td colSpan={9} className="p-4 border-b border-zinc-200">
                                  <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 text-xs">
                                    <h4 className="font-extrabold text-zinc-900 border-b pb-2 mb-3">Componentes do Kit ({k.componentes?.length || 0})</h4>
                                    <table className="w-full text-xs text-left border-collapse">
                                      <thead>
                                        <tr className="text-zinc-400 font-bold border-b border-zinc-100 pb-1">
                                          <th className="pb-2">REF</th>
                                          <th className="pb-2">Componente</th>
                                          <th className="pb-2 text-center">Qtd/Kit</th>
                                          <th className="pb-2 text-right">Estoque</th>
                                          <th className="pb-2 text-right">Produção</th>
                                          <th className="pb-2 text-right">Pedidos</th>
                                          <th className="pb-2 text-center">Necessita Produzir</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {k.componentes?.map(comp => (
                                          <tr key={comp.codigo} className="border-b border-zinc-100 last:border-none">
                                            <td className="py-2.5 font-bold text-zinc-800">{comp.codigo}</td>
                                            <td className="py-2.5 text-zinc-700">
                                              <span className="block">{comp.descricao}</span>
                                              {comp.fonte === 'item' && (
                                                <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700">embalagem/insumo</span>
                                              )}
                                            </td>
                                            <td className="py-2.5 text-center font-bold text-zinc-900">
                                              {formatQtyPerKitLabel(
                                                Number(comp.quantidade) || 1,
                                                comp.fator_proporcao_qtd,
                                                comp.fator_proporcao_kits,
                                              )}
                                            </td>
                                            <td className="py-2.5 text-right font-bold text-zinc-900">{comp.estoque} un</td>
                                            <td className="py-2.5 text-right text-zinc-500">{comp.producao} un</td>
                                            <td className="py-2.5 text-right text-zinc-500">{comp.pedidos_aberto} un</td>
                                            <td className="py-2.5 text-center">
                                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                                comp.necessita_producao 
                                                  ? 'bg-rose-50 text-rose-700' 
                                                  : 'bg-zinc-100 text-zinc-450'
                                              }`}>
                                                {comp.fonte === 'item' ? '—' : (comp.necessita_producao ? 'Sim' : 'Não')}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: COMPOSIÇÃO DE KITS */}
        {activeSubTab === 'composicao' && (
          <div className="space-y-4 animate-in fade-in duration-200 flex-1 flex flex-col overflow-hidden">
            {/* Toolbar com importação Excel e busca */}
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="relative w-full max-w-md">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar kit por código ou descrição..."
                    value={kitCompSearch}
                    onChange={(e) => setKitCompSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 text-xs font-medium transition-all"
                  />
                </div>
                <p className="hidden lg:block text-[11px] text-zinc-400 font-medium max-w-xs leading-snug shrink-0">
                  Estrutura principal vem do ERP (sync). Excel/CRUD só alteram linhas manuais.
                </p>
              </div>

              {/* Excel import & Compor Novo Kit */}
              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewKitModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5 h-[36px]"
                >
                  <Plus className="w-4 h-4" />
                  Compor Novo Kit
                </button>

                <label className="bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-200 text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5 h-[36px]">
                  <UploadCloud className="w-4 h-4 text-zinc-500" />
                  {uploadingKitsConfig ? 'Importando...' : 'Importar Excel (.xlsx)'}
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={handleUploadKitsConfig}
                    disabled={uploadingKitsConfig}
                  />
                </label>
              </div>
            </div>

            {/* Lista Mestre-Detalhe dos Kits Montáveis */}
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1">
              <div className="px-6 py-3.5 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between text-xs font-bold text-zinc-600">
                <span>Catálogo de Kits Montáveis ({masterKitsList.length})</span>
                <span className="text-[11px] text-zinc-400 font-normal">Clique em um kit para gerenciar seus insumos/proporções</span>
              </div>

              <div className="overflow-y-auto flex-1 p-4">
                {masterKitsList.length === 0 ? (
                  <div className="p-12 text-center text-zinc-400 font-bold space-y-2">
                    <Layers className="w-8 h-8 mx-auto text-zinc-300" />
                    <p>Nenhum kit encontrado.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {masterKitsList.map((kit) => {
                      const kitItems = kitComposicao.filter(row => row.kit_codigo === kit.codigo);
                      const compCount = kitItems.length;
                      return (
                        <div
                          key={kit.codigo}
                          onClick={() => {
                            setSelectedDrawerKitCode(kit.codigo);
                            setSelectedDrawerKitDesc(kit.descricao);
                            setIsDrawerOpen(true);
                          }}
                          className="p-4 bg-white border border-zinc-200 hover:border-zinc-900 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-4 group relative overflow-hidden"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-extrabold px-2.5 py-1 bg-zinc-100 group-hover:bg-zinc-900 group-hover:text-white text-zinc-900 rounded-lg transition-colors">
                                {kit.codigo}
                              </span>
                              {compCount > 0 ? (
                                <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full font-bold text-[11px] inline-flex items-center gap-1">
                                  <Layers className="w-3.5 h-3.5 text-emerald-600" />
                                  {compCount} {compCount === 1 ? 'insumo' : 'insumos'}
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full font-bold text-[11px] inline-flex items-center gap-1 animate-pulse">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                  Sem composição
                                </span>
                              )}
                            </div>

                            <h4 className="text-sm font-bold text-zinc-900 line-clamp-2 leading-snug">
                              {kit.descricao}
                            </h4>
                          </div>

                          <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs">
                            <div className="text-[11px] text-zinc-500 font-medium">
                              {compCount > 0 ? (
                                <span className="text-zinc-600">
                                  Insumos ativos vinculados
                                </span>
                              ) : (
                                <span className="text-amber-600 font-semibold">
                                  Configure a estrutura do kit
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="px-3 py-1.5 bg-zinc-100 group-hover:bg-zinc-900 text-zinc-700 group-hover:text-white rounded-xl font-bold transition-all inline-flex items-center gap-1.5 shadow-xs"
                            >
                              Ver / Editar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ORDENS DE CONVERSÃO SIMPLES */}
        {activeSubTab === 'vira_ordens_simples' && (
          <div className="space-y-4 animate-in fade-in duration-200 flex-1 flex flex-col overflow-hidden">
            {/* Search and filter toolbar */}
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar por lote, produto de origem ou destino..."
                    value={viraSearch}
                    onChange={(e) => setViraSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-955 text-xs font-semibold text-zinc-900"
                  />
                </div>
                <select
                  value={filterViraStatus}
                  onChange={(e) => setFilterViraStatus(e.target.value)}
                  className="bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold text-zinc-700 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">Todos os Status</option>
                  <option value="PENDING">Pendente</option>
                  <option value="COMPLETED">Concluída</option>
                </select>
              </div>
            </div>

            {/* List of Vira Orders */}
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1">
              {loadingVira ? (
                <div className="flex-1 flex items-center justify-center p-12 text-zinc-400 font-semibold text-xs">
                  Carregando ordens de conversão...
                </div>
              ) : (
                <div className="overflow-y-auto flex-1">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-zinc-50 border-b border-zinc-155 font-bold text-zinc-500 sticky top-0 z-10">
                      <tr>
                        <th className="p-4">Nº Ordem / Lote</th>
                        <th className="p-4">Conversão (De ➔ Para)</th>
                        <th className="p-4 text-right">Qtd. Programada</th>
                        <th className="p-4 text-right">Qtd. Real</th>
                        <th className="p-4">Data Emissão</th>
                        <th className="p-4">Conclusão / Operador</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center">ERP</th>
                        <th className="p-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {(() => {
                        const filtered = viraOrders.filter(o => {
                          const isSimple = !o.packaging_deductions && !o.motivo;
                          if (!isSimple) return false;

                          const matchesSearch = 
                            (o.orderNumber || '').toLowerCase().includes(viraSearch.toLowerCase()) ||
                            (o.deProdutoCodigo || '').toLowerCase().includes(viraSearch.toLowerCase()) ||
                            (o.deProdutoDescricao || '').toLowerCase().includes(viraSearch.toLowerCase()) ||
                            (o.paraProdutoCodigo || '').toLowerCase().includes(viraSearch.toLowerCase()) ||
                            (o.paraProdutoDescricao || '').toLowerCase().includes(viraSearch.toLowerCase());
                          
                          const matchesStatus = 
                            filterViraStatus === 'ALL' || 
                            o.status === filterViraStatus;

                          return matchesSearch && matchesStatus;
                        });

                        if (filtered.length === 0) {
                          return (
                            <tr>
                              <td colSpan={9} className="p-8 text-center text-zinc-450 font-bold">
                                Nenhuma ordem de conversão simples encontrada.
                              </td>
                            </tr>
                          );
                        }

                        return filtered.map(o => (
                          <tr key={o.id} className="border-b border-zinc-150 hover:bg-zinc-50/50">
                            <td className="p-4 font-extrabold text-zinc-955">{o.orderNumber}</td>
                            <td className="p-4 space-y-1">
                              <div className="flex items-center gap-1.5 text-zinc-800 font-bold">
                                <span className="text-[10px] text-zinc-400 font-mono">DE:</span>
                                <span>{o.deProdutoDescricao}</span>
                                <span className="text-[9px] text-zinc-500">({o.deProdutoCodigo})</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-zinc-900 font-extrabold">
                                <span className="text-[10px] text-zinc-500 font-mono">PARA:</span>
                                <span>{o.paraProdutoDescricao}</span>
                                <span className="text-[9px] text-zinc-500">({o.paraProdutoCodigo})</span>
                              </div>
                            </td>
                            <td className="p-4 text-right font-extrabold text-zinc-650">{o.quantity} un</td>
                            <td className="p-4 text-right font-black text-zinc-955">
                              {o.status === 'COMPLETED' ? `${o.quantityAssembled !== null && o.quantityAssembled !== undefined ? o.quantityAssembled : o.quantity} un` : '—'}
                            </td>
                            <td className="p-4 text-zinc-500 font-medium">{o.createdAt}</td>
                            <td className="p-4 text-zinc-550 font-medium">
                              {o.completedAt ? (
                                <div>
                                  <span className="block font-bold text-zinc-700">{o.completedAt}</span>
                                  <span className="text-[10px] text-zinc-400">Por: {o.assembledBy || '-'}</span>
                                </div>
                              ) : (
                                <span className="text-[10px] italic text-zinc-400">Pendente</span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              <span className={`px-2 py-1 rounded-full text-[9px] font-extrabold tracking-wide uppercase ${
                                o.status === 'COMPLETED' 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {o.status === 'COMPLETED' ? 'Concluída' : 'Pendente'}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                                o.erpLaunched === 1
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-zinc-100 text-zinc-450 border border-zinc-200'
                              }`}>
                                {o.erpLaunched === 1 ? 'Sim' : 'Não'}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="flex gap-2 justify-center items-center">
                                <button 
                                  onClick={() => {
                                    setPrintingOrder(buildViraPrintPayload(o));
                                    setTimeout(() => window.print(), 100);
                                  }}
                                  className="p-1.5 hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 rounded-lg cursor-pointer"
                                  title="Imprimir Folha de Conversão"
                                >
                                  <Printer size={14} />
                                </button>
                                <button 
                                  onClick={() => handleOpenEditViraOrderModal(o)}
                                  className="p-1.5 hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 rounded-lg cursor-pointer"
                                  title="Registrar Retorno"
                                >
                                  <Eye size={14} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteViraOrder(o.id)}
                                  className="p-1.5 hover:bg-zinc-100 text-rose-600 hover:text-rose-700 rounded-lg cursor-pointer"
                                  title="Excluir Ordem"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4.5: ORDENS DE TRANSFORMAÇÃO */}
        {activeSubTab === 'vira_ordens' && (
          <div className="space-y-4 animate-in fade-in duration-200 flex-1 flex flex-col overflow-hidden">
            {/* Search and filter toolbar */}
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar por lote, produto de origem ou destino..."
                    value={viraSearch}
                    onChange={(e) => setViraSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-955 text-xs font-semibold text-zinc-900"
                  />
                </div>
                <select
                  value={filterViraStatus}
                  onChange={(e) => setFilterViraStatus(e.target.value)}
                  className="bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold text-zinc-700 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">Todos os Status</option>
                  <option value="PENDING">Em Montagem (Pendente)</option>
                  <option value="COMPLETED">Concluídas</option>
                </select>
              </div>
            </div>

            {/* List of Vira Orders */}
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1">
              {loadingVira ? (
                <div className="flex-1 flex items-center justify-center p-12 text-zinc-400 font-semibold text-xs">
                  Carregando ordens de vira...
                </div>
              ) : (
                <div className="overflow-y-auto flex-1">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-zinc-50 border-b border-zinc-155 font-bold text-zinc-500 sticky top-0 z-10">
                      <tr>
                        <th className="p-4">Nº Ordem / Lote</th>
                        <th className="p-4">Transformação (De ➔ Para)</th>
                        <th className="p-4 text-right">Qtd. Programada</th>
                        <th className="p-4 text-right">Qtd. Real</th>
                        <th className="p-4">Data Emissão</th>
                        <th className="p-4">Conclusão / Operador</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center">ERP</th>
                        <th className="p-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {(() => {
                        const filtered = viraOrders.filter(o => {
                          const matchesSearch = 
                            (o.orderNumber || '').toLowerCase().includes(viraSearch.toLowerCase()) ||
                            (o.deProdutoCodigo || '').toLowerCase().includes(viraSearch.toLowerCase()) ||
                            (o.deProdutoDescricao || '').toLowerCase().includes(viraSearch.toLowerCase()) ||
                            (o.paraProdutoCodigo || '').toLowerCase().includes(viraSearch.toLowerCase()) ||
                            (o.paraProdutoDescricao || '').toLowerCase().includes(viraSearch.toLowerCase());
                          
                          const matchesStatus = 
                            filterViraStatus === 'ALL' || 
                            o.status === filterViraStatus;

                          return matchesSearch && matchesStatus;
                        });

                        if (filtered.length === 0) {
                          return (
                            <tr>
                              <td colSpan={9} className="p-8 text-center text-zinc-450 font-bold">
                                Nenhuma ordem de vira de produto encontrada.
                              </td>
                            </tr>
                          );
                        }

                        return filtered.map(o => (
                          <tr key={o.id} className="border-b border-zinc-150 hover:bg-zinc-50/50">
                            <td className="p-4 font-extrabold text-zinc-955">{o.orderNumber}</td>
                            <td className="p-4 space-y-1">
                              <div className="flex items-center gap-1.5 text-zinc-800 font-bold">
                                <span className="text-[10px] text-zinc-400 font-mono">DE:</span>
                                <span>{o.deProdutoDescricao}</span>
                                <span className="text-[9px] text-zinc-500">({o.deProdutoCodigo})</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-zinc-900 font-extrabold">
                                <span className="text-[10px] text-zinc-500 font-mono">PARA:</span>
                                <span>{o.paraProdutoDescricao}</span>
                                <span className="text-[9px] text-zinc-500">({o.paraProdutoCodigo})</span>
                              </div>
                            </td>
                            <td className="p-4 text-right font-extrabold text-zinc-650">{o.quantity} un</td>
                            <td className="p-4 text-right font-black text-zinc-950">
                              {o.status === 'COMPLETED' ? `${o.quantityAssembled !== null && o.quantityAssembled !== undefined ? o.quantityAssembled : o.quantity} un` : '—'}
                            </td>
                            <td className="p-4 text-zinc-500 font-medium">{o.createdAt}</td>
                            <td className="p-4 text-zinc-550 font-medium">
                              {o.completedAt ? (
                                <div>
                                  <span className="block font-bold text-zinc-700">{o.completedAt}</span>
                                  <span className="text-[10px] text-zinc-400">Por: {o.assembledBy || '-'}</span>
                                </div>
                              ) : (
                                <span className="text-[10px] italic text-zinc-400">Pendente de Produção</span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              <span className={`px-2 py-1 rounded-full text-[9px] font-extrabold tracking-wide uppercase ${
                                o.status === 'COMPLETED' 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {o.status === 'COMPLETED' ? 'Concluída' : 'Em Montagem'}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                                o.erpLaunched === 1
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-zinc-100 text-zinc-450 border border-zinc-200'
                              }`}>
                                {o.erpLaunched === 1 ? 'Sim' : 'Não'}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="flex gap-2 justify-center items-center">
                                <button 
                                  onClick={() => {
                                    setPrintingOrder(buildViraPrintPayload(o));
                                    setTimeout(() => window.print(), 100);
                                  }}
                                  className="p-1.5 hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 rounded-lg cursor-pointer"
                                  title="Imprimir Folha de Vira"
                                >
                                  <Printer size={14} />
                                </button>
                                <button 
                                  onClick={() => handleOpenEditViraOrderModal(o)}
                                  className="p-1.5 hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 rounded-lg cursor-pointer"
                                  title="Registrar Retorno / Observar"
                                >
                                  <Eye size={14} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteViraOrder(o.id)}
                                  className="p-1.5 hover:bg-zinc-100 text-rose-600 hover:text-rose-700 rounded-lg cursor-pointer"
                                  title="Excluir Ordem"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: COMPOSIÇÃO DE CONVERSÕES */}
        {activeSubTab === 'vira_composicao' && (
          <div className="space-y-4 animate-in fade-in duration-200 flex-1 flex flex-col overflow-hidden">
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-4 shrink-0">
              <form onSubmit={handleAddViraComposicao} className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Produto Origem (DE)</label>
                  <input
                    type="text"
                    placeholder="Código do produto de origem..."
                    value={newViraDeCodigo}
                    onChange={(e) => setNewViraDeCodigo(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold text-zinc-900"
                    list="produtos-list"
                    required
                  />
                  {getViraDeNamePreview() && (
                    <div className="text-[10px] text-zinc-550 font-bold truncate max-w-xs">{getViraDeNamePreview()}</div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Produto Destino (PARA)</label>
                  <input
                    type="text"
                    placeholder="Código do produto final..."
                    value={newViraParaCodigo}
                    onChange={(e) => setNewViraParaCodigo(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold text-zinc-900"
                    list="produtos-list"
                    required
                  />
                  {getViraParaNamePreview() && (
                    <div className="text-[10px] text-zinc-550 font-bold truncate max-w-xs">{getViraParaNamePreview()}</div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Fator de Conversão</label>
                  <input
                    type="number"
                    step="any"
                    value={newViraQuantidade}
                    onChange={(e) => setNewViraQuantidade(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-955 text-xs font-semibold text-zinc-900"
                    required
                  />
                  <p className="text-[9px] text-zinc-450 font-medium leading-snug">
                    1 origem → N destino (ex.: 300g → 100g = fator 3)
                  </p>
                </div>
                <button
                  type="submit"
                  className="w-full bg-zinc-900 hover:bg-zinc-850 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-colors cursor-pointer h-[36px]"
                >
                  Vincular Conversão de Produto
                </button>
              </form>
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1">
              <div className="p-4 border-b border-zinc-100 flex items-center shrink-0">
                <div className="relative w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar por código ou descrição..."
                    value={viraCompSearch}
                    onChange={(e) => setViraCompSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-955 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="overflow-y-auto flex-1">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 border-b border-zinc-155 font-bold text-zinc-500 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-3">Cód. Origem</th>
                      <th className="px-6 py-3">Produto de Origem (DE)</th>
                      <th className="px-6 py-3">Cód. Destino</th>
                      <th className="px-6 py-3">Produto de Destino (PARA)</th>
                      <th className="px-6 py-3 text-center">Proporção</th>
                      <th className="px-6 py-3 text-center w-28">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {(() => {
                      const filtered = viraComposicao.filter(row => 
                        (row.deProdutoCodigo || '').toLowerCase().includes(viraCompSearch.toLowerCase()) || 
                        (row.deProdutoDescricao || '').toLowerCase().includes(viraCompSearch.toLowerCase()) ||
                        (row.paraProdutoCodigo || '').toLowerCase().includes(viraCompSearch.toLowerCase()) ||
                        (row.paraProdutoDescricao || '').toLowerCase().includes(viraCompSearch.toLowerCase())
                      );

                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-zinc-450 font-bold">
                              Nenhuma relação de vira cadastrada.
                            </td>
                          </tr>
                        );
                      }

                      return filtered.map(row => {
                        const key = `${row.deProdutoCodigo}|${row.paraProdutoCodigo}`;
                        const expanded = expandedViraFormulaKey === key;
                        return (
                          <React.Fragment key={key}>
                            <tr className="hover:bg-zinc-50/50 transition-colors">
                              <td className="px-6 py-3 font-mono font-bold text-zinc-800">{row.deProdutoCodigo}</td>
                              <td className="px-6 py-3 font-bold text-zinc-900">{row.deProdutoDescricao}</td>
                              <td className="px-6 py-3 font-mono text-zinc-650">{row.paraProdutoCodigo}</td>
                              <td className="px-6 py-3 text-zinc-700">{row.paraProdutoDescricao}</td>
                              <td className="px-6 py-3 text-center font-bold text-zinc-900">
                                1 → {row.quantidade}
                              </td>
                              <td className="px-6 py-3 text-center">
                                <div className="inline-flex gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => toggleFormulaPackagingPreview(row)}
                                    className="p-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 rounded-lg border border-zinc-200 transition-colors cursor-pointer"
                                    title="Ver embalagens (por unidade)"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteViraComposicao(row.deProdutoCodigo, row.paraProdutoCodigo)}
                                    className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg border border-rose-150 transition-colors cursor-pointer"
                                    title="Remover vínculo de vira"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {expanded && (
                              <tr className="bg-zinc-50/80">
                                <td colSpan={6} className="px-6 py-3">
                                  {loadingFormulaPackaging ? (
                                    <p className="text-[11px] text-zinc-500 font-medium">Carregando embalagens da formulação…</p>
                                  ) : !formulaPackagingPreview ? (
                                    <p className="text-[11px] text-zinc-500 font-medium">Sem dados de embalagem ou falha ao carregar.</p>
                                  ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
                                      <div>
                                        <p className="font-extrabold text-zinc-600 uppercase tracking-wide mb-1.5">Retorno (origem) / un</p>
                                        {(formulaPackagingPreview.returns || []).length === 0 ? (
                                          <p className="text-zinc-400">Nenhuma embalagem na formulação DE</p>
                                        ) : (
                                          <ul className="space-y-1">
                                            {formulaPackagingPreview.returns.map((r) => (
                                              <li key={`r-${r.code}`} className="flex justify-between gap-2 border-b border-zinc-100 py-0.5">
                                                <span className="font-medium text-zinc-800 truncate">{r.code} · {r.description}</span>
                                                <span className="font-bold text-zinc-600 shrink-0">{r.unitQty ?? r.qty}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                      <div>
                                        <p className="font-extrabold text-zinc-600 uppercase tracking-wide mb-1.5">Saída (destino) / un destino</p>
                                        {(formulaPackagingPreview.consumes || []).length === 0 ? (
                                          <p className="text-zinc-400">Nenhuma embalagem na formulação PARA</p>
                                        ) : (
                                          <ul className="space-y-1">
                                            {formulaPackagingPreview.consumes.map((c) => (
                                              <li key={`c-${c.code}`} className="flex justify-between gap-2 border-b border-zinc-100 py-0.5">
                                                <span className="font-medium text-zinc-800 truncate">{c.code} · {c.description}</span>
                                                <span className="font-bold text-zinc-600 shrink-0">{c.unitQty ?? c.qty}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
          </main>
        </div>

      {/* MODAL: NOVA ORDEM */}
      {showNewOrderModal && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-extrabold text-sm text-zinc-900 flex items-center gap-1.5">
                <Layers className="h-5 w-5 text-zinc-900" />
                Criar Ordem de Montagem de Kit
              </h3>
              <button 
                onClick={() => setShowNewOrderModal(false)}
                className="p-1 hover:bg-zinc-100 rounded-full text-zinc-450 hover:text-zinc-900 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-4 text-xs font-medium text-zinc-700">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Lote da Ordem</label>
                  <input 
                    type="text" 
                    value={newOrderNumber}
                    onChange={(e) => setNewOrderNumber(e.target.value)}
                    placeholder="Ex: KIT-15423"
                    className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                    required
                  />
                  <p className="text-[9px] text-zinc-455 italic mt-0.5">Editável. As próximas ordens seguirão a ordem sequencial.</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Quantidade a Montar</label>
                  <input 
                    type="number" 
                    value={newKitQty}
                    onChange={(e) => setNewKitQty(e.target.value)}
                    min="1"
                    className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Selecionar Kit</label>
                <select
                  value={selectedKitCode}
                  onChange={(e) => handleKitChange(e.target.value)}
                  className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white font-bold text-zinc-900"
                  required
                >
                  <option value="">-- Selecione o Produto Kit --</option>
                  {allKitsDropdown.map(k => (
                    <option key={k.codigo} value={k.codigo}>
                      {k.descricao} ({k.codigo}) - Estoque: {k.estoque} un
                    </option>
                  ))}
                </select>
              </div>

              {/* Components individual lotes form section */}
              {selectedKitObj && selectedKitObj.componentes && selectedKitObj.componentes.length > 0 && (
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-zinc-800 font-bold border-b pb-1.5">
                    <ClipboardList size={14} />
                    <span>Lotes de Fabricação dos Componentes (Opcional)</span>
                  </div>
                  <p className="text-[9px] text-zinc-400">
                    Se você já souber quais lotes dos produtos individuais serão usados, digite-os abaixo. Caso contrário, imprima a ordem em branco para preenchimento manual no chão de fábrica e registre depois.
                  </p>
                  
                  <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                    {selectedKitObj.componentes.map(comp => {
                      const kitQty = parseFloat(String(newKitQty)) || 0;
                      const need = kitComponentNeedQty(
                        Number(comp.quantidade) || 1,
                        kitQty,
                        comp.fator_proporcao_qtd,
                        comp.fator_proporcao_kits,
                      );
                      return (
                      <div key={comp.codigo} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-150 pb-2 last:border-none">
                        <div className="flex-1 truncate">
                          <span className="font-bold text-zinc-900 text-[11px] block truncate">{comp.descricao}</span>
                          <span className="text-[9px] text-zinc-500">
                            REF: {comp.codigo} |{' '}
                            {formatQtyPerKitLabel(
                              Number(comp.quantidade) || 1,
                              comp.fator_proporcao_qtd,
                              comp.fator_proporcao_kits,
                            )}{' '}
                            | Nec: <strong className="text-zinc-800">{need} un</strong>
                            {comp.fonte === 'item' ? ' · embalagem/insumo' : ''}
                          </span>
                        </div>
                        <input
                          type="text"
                          placeholder={comp.fonte === 'item' ? 'Lote / lote embalagem…' : 'Lote do produto...'}
                          value={newComponentLotes[comp.codigo] || ''}
                          onChange={(e) => setNewComponentLotes({ ...newComponentLotes, [comp.codigo]: e.target.value })}
                          className="border border-zinc-350 bg-white rounded-lg px-2.5 py-1.5 text-xs w-full sm:w-44 focus:outline-none"
                        />
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Observações da Ordem</label>
                <textarea 
                  value={newKitNotes}
                  onChange={(e) => setNewKitNotes(e.target.value)}
                  placeholder="Instruções de expedição, montagem específica..."
                  rows="3"
                  className="w-full border border-zinc-300 rounded-xl p-3 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button 
                  type="button"
                  onClick={() => setShowNewOrderModal(false)}
                  className="px-4 py-2 border border-zinc-300 rounded-xl hover:bg-zinc-50 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  disabled={submittingNewOrder}
                  onClick={(e) => handleCreateOrder(e, true)}
                  className="px-4 py-2 bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-900 rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Criar a ordem e abrir imediatamente a janela de impressão"
                >
                  <Printer size={14} />
                  {submittingNewOrder ? "Gerando..." : "Gerar e Imprimir"}
                </button>
                <button 
                  type="submit"
                  disabled={submittingNewOrder}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {submittingNewOrder ? "Gerando..." : "Gerar Ordem"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR / VISUALIZAR ORDEM */}
      {showEditOrderModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-extrabold text-sm text-zinc-900 flex items-center gap-1.5">
                <ClipboardList className="h-5 w-5 text-zinc-900" />
                Retorno / Edição de Ordem: Lote {editOrderNumber || selectedOrder.orderNumber}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const parsedEditQty = parseFloat(String(editQuantity)) || selectedOrder.quantity || 0;
                    let list = [];
                    try {
                      if (selectedOrder.componentsLotes) {
                        const originalList = JSON.parse(selectedOrder.componentsLotes);
                        list = originalList.map(item => ({
                          ...item,
                          lote: editComponentLotes[item.code] || "",
                          used_qty:
                            editComponentUsedQty[item.code] !== undefined
                              ? parseFloat(editComponentUsedQty[item.code])
                              : kitOrderComponentNeed(item, parseFloat(editQuantityAssembled) || 0),
                          need_qty: kitOrderComponentNeed(item, parsedEditQty),
                        }));
                      }
                    } catch (err) {}
                    handlePrintOrder({
                      ...selectedOrder,
                      orderNumber: editOrderNumber || selectedOrder.orderNumber,
                      quantity: parsedEditQty,
                      quantityAssembled: parseFloat(editQuantityAssembled) || 0,
                      status: editStatus,
                      assembledBy: editAssembledBy,
                      checkedBy: editCheckedBy,
                      observations: editNotes,
                      erpLaunched: editErpLaunched ? 1 : 0,
                      componentsLotes: list.length > 0 ? JSON.stringify(list) : selectedOrder.componentsLotes,
                    });
                  }}
                  className="px-2.5 py-1 hover:bg-zinc-100 rounded-lg text-zinc-700 hover:text-zinc-950 flex items-center gap-1 text-xs font-bold border border-zinc-200 cursor-pointer shadow-xs"
                  title="Imprimir folha desta ordem com os valores atuais"
                >
                  <Printer size={13} />
                  <span>Imprimir Folha</span>
                </button>
                <button 
                  onClick={() => setShowEditOrderModal(false)}
                  className="p-1 hover:bg-zinc-100 rounded-full text-zinc-455 hover:text-zinc-900 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <form onSubmit={handleUpdateOrder} className="space-y-4 text-xs font-medium text-zinc-700">
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 space-y-3">
                <div>
                  <span className="text-[10px] text-zinc-400 font-extrabold uppercase block">Produto Kit</span>
                  <span className="font-bold text-zinc-900">{selectedOrder.kitProductDescription} ({selectedOrder.kitProductCode})</span>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-zinc-200/60">
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Lote da Ordem</label>
                    <input 
                      type="text"
                      value={editOrderNumber}
                      onChange={(e) => setEditOrderNumber(e.target.value)}
                      className="w-full border border-zinc-300 rounded-lg p-2 text-xs font-mono font-bold text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Qtd a Montar (Prog.)</label>
                    <input 
                      type="number"
                      step="any"
                      min="1"
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(e.target.value)}
                      className="w-full border border-zinc-300 rounded-lg p-2 text-xs font-bold text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      required
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 font-extrabold uppercase block">Data Emissão</span>
                    <span className="font-bold text-zinc-800 text-xs mt-2 block">{selectedOrder.createdAt}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1 col-span-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white font-bold text-zinc-900"
                  >
                    <option value="PENDING">Pendente</option>
                    <option value="COMPLETED">Concluída</option>
                  </select>
                </div>
                <div className="space-y-1 col-span-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Qtd Real Montada</label>
                  <input
                    type="number"
                    step="any"
                    value={editQuantityAssembled}
                    onChange={(e) => {
                      const val = e.target.value;
                      let list = [];
                      try {
                        if (selectedOrder.componentsLotes) {
                          list = JSON.parse(selectedOrder.componentsLotes);
                        }
                      } catch (err) {}
                      handleKitQuantityAssembledChange(val, list);
                    }}
                    className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 font-bold text-zinc-900 bg-white"
                  />
                </div>
                <div className="space-y-1 col-span-1 flex items-end">
                  <label className="flex items-center gap-1.5 border border-zinc-300 rounded-xl p-2.5 w-full bg-zinc-50/50 cursor-pointer select-none font-bold text-zinc-800 text-[10px] h-10">
                    <input 
                      type="checkbox"
                      checked={editErpLaunched}
                      onChange={(e) => setEditErpLaunched(e.target.checked)}
                      className="accent-zinc-900 rounded"
                    />
                    ERP Lançado
                  </label>
                </div>
              </div>

              {/* Responsible Operator Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block flex items-center gap-1">
                    <User size={10} />
                    Quem Montou
                  </label>
                  <input 
                    type="text" 
                    value={editAssembledBy}
                    onChange={(e) => setEditAssembledBy(e.target.value)}
                    placeholder="Nome do operador..."
                    className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block flex items-center gap-1">
                    <User size={10} />
                    Quem Conferiu
                  </label>
                  <input 
                    type="text" 
                    value={editCheckedBy}
                    onChange={(e) => setEditCheckedBy(e.target.value)}
                    placeholder="Nome do conferente..."
                    className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
              </div>

              {/* Components lotes section */}
              {(() => {
                try {
                  if (selectedOrder.componentsLotes) {
                    const list = JSON.parse(selectedOrder.componentsLotes);
                    const parsedPlannedKitQty = parseFloat(String(editQuantity)) || selectedOrder.quantity || 0;
                    return (
                      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-1.5 text-zinc-800 font-bold border-b pb-1.5">
                          <ClipboardList size={14} />
                          <span>Lotes de Fabricação dos Componentes Individuais</span>
                        </div>
                        <p className="text-[9px] text-zinc-400">
                          Preencha com os lotes retornados no papel de montagem preenchido manualmente.
                        </p>
                        
                        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                          {list.map(item => {
                            const planned = kitOrderComponentNeed(item, parsedPlannedKitQty);
                            const used =
                              editComponentUsedQty[item.code] !== undefined
                                ? editComponentUsedQty[item.code]
                                : kitOrderComponentNeed(
                                    item,
                                    parseFloat(editQuantityAssembled) || parsedPlannedKitQty || 0,
                                  );
                            return (
                            <div key={item.code} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-150 pb-2 last:border-none">
                              <div className="flex-1 truncate">
                                <span className="font-bold text-zinc-900 text-[11px] block truncate">{item.description}</span>
                                <span className="text-[9px] text-zinc-555">
                                  REF: {item.code} |{' '}
                                  {formatQtyPerKitLabel(
                                    item.expected_qty,
                                    item.fator_proporcao_qtd,
                                    item.fator_proporcao_kits,
                                  )}{' '}
                                  | Nec: <strong>{planned} un</strong>
                                  {editStatus === 'COMPLETED' ? ` | Usada: ${used} un` : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 w-full sm:w-auto">
                                <div className="flex flex-col space-y-0.5">
                                  <span className="text-[8px] uppercase text-zinc-400 font-bold">Lote</span>
                                  <input
                                    type="text"
                                    placeholder="Lote..."
                                    value={editComponentLotes[item.code] || ''}
                                    onChange={(e) => setEditComponentLotes({ ...editComponentLotes, [item.code]: e.target.value })}
                                    className="border border-zinc-300 bg-white rounded-lg px-2.5 py-1 text-xs w-28 focus:outline-none"
                                  />
                                </div>
                                <div className="flex flex-col space-y-0.5">
                                  <span className="text-[8px] uppercase text-zinc-400 font-bold">Qtd Usada</span>
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="Qtd..."
                                    value={
                                      editComponentUsedQty[item.code] !== undefined
                                        ? editComponentUsedQty[item.code]
                                        : kitOrderComponentNeed(
                                            item,
                                            parseFloat(editQuantityAssembled) || 0,
                                          )
                                    }
                                    onChange={(e) => setEditComponentUsedQty({ ...editComponentUsedQty, [item.code]: e.target.value })}
                                    className="border border-zinc-300 bg-white rounded-lg px-2.5 py-1 text-xs w-20 focus:outline-none font-semibold text-zinc-900"
                                  />
                                </div>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                } catch (err) {
                  return <div className="text-rose-500 font-bold">Erro ao exibir componentes</div>;
                }
              })()}

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block flex items-center gap-1">
                  <FileText size={10} />
                  Observações de Retorno / Ocorrências
                </label>
                <textarea 
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Ex: Danificou embalagem do item X, trocado por lote Y..."
                  rows="3"
                  className="w-full border border-zinc-300 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button 
                  type="button"
                  onClick={() => setShowEditOrderModal(false)}
                  className="px-4 py-2 border border-zinc-300 rounded-xl hover:bg-zinc-50 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  disabled={submittingEditOrder}
                  onClick={(e) => handleUpdateOrder(e, true)}
                  className="px-4 py-2 bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-900 rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Salvar alterações e imprimir a folha de montagem atualizada"
                >
                  <Printer size={14} />
                  {submittingEditOrder ? "Salvando..." : "Salvar e Imprimir"}
                </button>
                <button 
                  type="submit"
                  disabled={submittingEditOrder}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {submittingEditOrder ? "Salvando..." : "Salvar Retorno"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL: NOVA ORDEM DE CONVERSÃO */}
      {showNewViraOrderModal && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-extrabold text-sm text-zinc-900 flex items-center gap-1.5">
                <RefreshCw className="h-5 w-5 text-zinc-900" />
                Criar Ordem de Conversão de Produto
              </h3>
              <button
                type="button"
                onClick={() => setShowNewViraOrderModal(false)}
                className="p-1 hover:bg-zinc-100 rounded-full text-zinc-450 hover:text-zinc-900 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateViraOrder} className="space-y-4 text-xs font-medium text-zinc-700">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Lote da Ordem</label>
                  <input
                    type="text"
                    value={newViraOrderNumber}
                    onChange={(e) => setNewViraOrderNumber(e.target.value)}
                    placeholder="Ex: V-1001"
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 font-semibold text-zinc-900 bg-zinc-50/50"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Conversão</label>
                  <select
                    value={selectedViraComp ? `${selectedViraComp.deProdutoCodigo}-${selectedViraComp.paraProdutoCodigo}` : ''}
                    onChange={(e) => {
                      const found = viraComposicao.find(
                        (vc) => `${vc.deProdutoCodigo}-${vc.paraProdutoCodigo}` === e.target.value,
                      );
                      void applyViraCompSelection(found || null);
                    }}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 font-semibold text-zinc-900 bg-white"
                    required
                  >
                    <option value="">Selecione uma conversão...</option>
                    {viraComposicao.map((vc) => (
                      <option
                        key={`${vc.deProdutoCodigo}-${vc.paraProdutoCodigo}`}
                        value={`${vc.deProdutoCodigo}-${vc.paraProdutoCodigo}`}
                      >
                        {vc.deProdutoDescricao} ➔ {vc.paraProdutoDescricao}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedViraComp && (
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
                  <h4 className="font-extrabold text-[10px] uppercase text-zinc-500 tracking-wider">
                    Quantidade estimada (DE × fator → PARA)
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] text-zinc-400 font-bold uppercase block">Qtd origem (DE)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={newViraQtyDe}
                        onChange={(e) => {
                          const qtyDe = parseFloat(e.target.value) || 0;
                          setNewViraQtyDe(qtyDe);
                          const qtyPara = newViraQtyParaManual
                            ? newViraQtyPara
                            : qtyDe * (Number(newViraFator) || 1);
                          if (!newViraQtyParaManual) setNewViraQtyPara(qtyPara);
                          void refreshNewViraPackaging(
                            qtyDe,
                            newViraQtyParaManual ? newViraQtyPara : qtyPara,
                          );
                        }}
                        className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-zinc-400 font-bold uppercase block">Fator (1→N)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={newViraFator}
                        onChange={(e) => {
                          const fator = parseFloat(e.target.value) || 0;
                          setNewViraFator(fator);
                          if (!newViraQtyParaManual) {
                            const qtyPara = (Number(newViraQtyDe) || 0) * fator;
                            setNewViraQtyPara(qtyPara);
                            void refreshNewViraPackaging(Number(newViraQtyDe) || 0, qtyPara);
                          }
                        }}
                        className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-zinc-400 font-bold uppercase block">Qtd estimada PARA</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={newViraQtyPara}
                        onChange={(e) => {
                          const qtyPara = parseFloat(e.target.value) || 0;
                          setNewViraQtyParaManual(true);
                          setNewViraQtyPara(qtyPara);
                          void refreshNewViraPackaging(Number(newViraQtyDe) || 0, qtyPara);
                        }}
                        className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900"
                        required
                      />
                    </div>
                  </div>
                  <p className="text-[9px] text-zinc-450">
                    {selectedViraComp.deProdutoCodigo} → {selectedViraComp.paraProdutoCodigo}
                    {loadingViraPackaging ? ' · atualizando embalagens…' : ''}
                  </p>
                </div>
              )}

              {selectedViraComp && (
                <div className="space-y-3 border border-zinc-200 rounded-xl p-4">
                  <h4 className="font-extrabold text-[10px] uppercase text-zinc-500 tracking-wider">
                    Embalagens (registro — não movimenta estoque no Hub)
                  </h4>
                  <div className="space-y-2">
                    <p className="text-[9px] font-bold text-emerald-700 uppercase">Retorno ao estoque (origem)</p>
                    {newViraPackagingLines.filter((l) => l.role === 'return').length === 0 ? (
                      <p className="text-[11px] text-zinc-400">Nenhuma embalagem sugerida na formulação DE</p>
                    ) : (
                      newViraPackagingLines
                        .filter((l) => l.role === 'return')
                        .map((line, idx) => {
                          const i = newViraPackagingLines.indexOf(line);
                          return (
                            <div key={`ret-${line.code}-${idx}`} className="flex flex-wrap items-center gap-2 text-[11px]">
                              <label className="inline-flex items-center gap-1.5 shrink-0 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={line.returned !== false}
                                  onChange={(e) => {
                                    const next = [...newViraPackagingLines];
                                    next[i] = { ...line, returned: e.target.checked };
                                    setNewViraPackagingLines(next);
                                  }}
                                />
                                <span className="font-bold text-zinc-600">Retornou</span>
                              </label>
                              <span className="font-mono text-zinc-800 truncate flex-1 min-w-[120px]">
                                {line.code} · {line.description}
                              </span>
                              <input
                                type="number"
                                step="any"
                                value={line.qty}
                                onChange={(e) => {
                                  const next = [...newViraPackagingLines];
                                  next[i] = { ...line, qty: parseFloat(e.target.value) || 0 };
                                  setNewViraPackagingLines(next);
                                }}
                                className="w-20 border border-zinc-200 rounded-lg px-2 py-1 font-bold"
                              />
                            </div>
                          );
                        })
                    )}
                  </div>
                  <div className="space-y-2 pt-2 border-t border-zinc-100">
                    <p className="text-[9px] font-bold text-amber-700 uppercase">Saída (destino)</p>
                    {newViraPackagingLines.filter((l) => l.role === 'consume').length === 0 ? (
                      <p className="text-[11px] text-zinc-400">Nenhuma embalagem sugerida na formulação PARA</p>
                    ) : (
                      newViraPackagingLines
                        .filter((l) => l.role === 'consume')
                        .map((line) => {
                          const i = newViraPackagingLines.indexOf(line);
                          return (
                            <div key={`con-${line.code}-${i}`} className="flex flex-wrap items-center gap-2 text-[11px]">
                              <span className="font-mono text-zinc-800 truncate flex-1 min-w-[120px]">
                                {line.code} · {line.description}
                              </span>
                              <input
                                type="number"
                                step="any"
                                value={line.qty}
                                onChange={(e) => {
                                  const next = [...newViraPackagingLines];
                                  next[i] = { ...line, qty: parseFloat(e.target.value) || 0 };
                                  setNewViraPackagingLines(next);
                                }}
                                className="w-20 border border-zinc-200 rounded-lg px-2 py-1 font-bold"
                              />
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Motivo / observação de embalagem</label>
                <input
                  type="text"
                  value={newViraMotivo}
                  onChange={(e) => setNewViraMotivo(e.target.value)}
                  placeholder="Ex.: frasco origem rachado — sem retorno"
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Observações / Instruções</label>
                <textarea
                  value={newViraOrderNotes}
                  onChange={(e) => setNewViraOrderNotes(e.target.value)}
                  placeholder="Ex: Conferência lote-a-lote..."
                  rows={2}
                  className="w-full border border-zinc-300 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewViraOrderModal(false)}
                  className="px-4 py-2 border border-zinc-300 rounded-xl hover:bg-zinc-50 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingNewViraOrder || !selectedViraComp}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {submittingNewViraOrder ? 'Criando...' : 'Criar Ordem'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RETORNO DE ORDEM DE TRANSFORMAÇÃO */}
      {showEditViraOrderModal && selectedViraOrder && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex flex-col">
                <h3 className="font-extrabold text-sm text-zinc-900 flex items-center gap-1.5">
                  <RefreshCw className="h-5 w-5 text-zinc-900" />
                  Retorno de Lote / Ordem de Transformação
                </h3>
                <span className="text-[10px] text-zinc-500 font-mono mt-0.5">
                  Lote: {selectedViraOrder.orderNumber}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowEditViraOrderModal(false)}
                className="p-1 hover:bg-zinc-100 rounded-full text-zinc-450 hover:text-zinc-900 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleUpdateViraOrder} className="space-y-4 text-xs font-medium text-zinc-700">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Status da Produção</label>
                  <select
                    value={editViraStatus}
                    onChange={(e) => setEditViraStatus(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 font-bold text-zinc-900 bg-white"
                  >
                    <option value="PENDING">Em Montagem (Pendente)</option>
                    <option value="COMPLETED">Concluída</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Lançado no ERP?</label>
                  <div className="flex items-center h-[36px]">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editViraErpLaunched}
                        onChange={(e) => setEditViraErpLaunched(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-zinc-900"></div>
                      <span className="ml-3 text-xs font-bold text-zinc-700">Confirmar Lançamento</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Operador Montador</label>
                  <input
                    type="text"
                    value={editViraAssembledBy}
                    onChange={(e) => setEditViraAssembledBy(e.target.value)}
                    placeholder="Nome do operador..."
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Conferente Expedição</label>
                  <input
                    type="text"
                    value={editViraCheckedBy}
                    onChange={(e) => setEditViraCheckedBy(e.target.value)}
                    placeholder="Nome do conferente..."
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-900"
                  />
                </div>
              </div>

              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
                <h4 className="font-extrabold text-[10px] uppercase text-zinc-500 tracking-wider">
                  Ajuste de Quantidade Realizada (itens PARA)
                </h4>
                <div className="grid grid-cols-2 gap-4 items-end">
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-zinc-400 font-bold block">QTD. PROGRAMADA PARA:</span>
                    <span className="font-bold text-zinc-650 block">{selectedViraOrder.quantity} un</span>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Qtd. Real Virada</label>
                    <input
                      type="number"
                      value={editViraQuantityAssembled}
                      onChange={(e) => setEditViraQuantityAssembled(parseFloat(e.target.value) || 0)}
                      className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900"
                      required
                    />
                  </div>
                </div>
              </div>

              {editViraPackagingLines.length > 0 && (
                <div className="border border-zinc-200 rounded-xl p-4 space-y-3">
                  <h4 className="font-extrabold text-[10px] uppercase text-zinc-500 tracking-wider">
                    Embalagens — confirmar retornos
                  </h4>
                  {editViraPackagingLines
                    .filter((l) => l.role === 'return')
                    .map((line) => {
                      const i = editViraPackagingLines.indexOf(line);
                      return (
                        <label
                          key={`edit-ret-${line.code}-${i}`}
                          className="flex items-center gap-2 text-[11px] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={line.returned !== false}
                            onChange={(e) => {
                              const next = [...editViraPackagingLines];
                              next[i] = { ...line, returned: e.target.checked };
                              setEditViraPackagingLines(next);
                            }}
                          />
                          <span className="font-bold text-zinc-600 w-16">Retornou</span>
                          <span className="font-mono flex-1 truncate">
                            {line.code} · {line.description}
                          </span>
                          <span className="font-bold text-zinc-700">{line.qty}</span>
                        </label>
                      );
                    })}
                  {editViraPackagingLines.filter((l) => l.role === 'consume').length > 0 && (
                    <div className="pt-2 border-t border-zinc-100 space-y-1">
                      <p className="text-[9px] font-bold text-amber-700 uppercase">Saídas (destino)</p>
                      {editViraPackagingLines
                        .filter((l) => l.role === 'consume')
                        .map((line, i) => (
                          <div key={`edit-con-${line.code}-${i}`} className="flex justify-between text-[11px]">
                            <span className="font-mono truncate">
                              {line.code} · {line.description}
                            </span>
                            <span className="font-bold">{line.qty}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Motivo / embalagem</label>
                <input
                  type="text"
                  value={editViraMotivo}
                  onChange={(e) => setEditViraMotivo(e.target.value)}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs"
                  placeholder="Ex.: origem não retornou — danificada"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block flex items-center gap-1">
                  <FileText size={10} />
                  Observações de Retorno / Ocorrências
                </label>
                <textarea
                  value={editViraNotes}
                  onChange={(e) => setEditViraNotes(e.target.value)}
                  placeholder="Ex: Transformação concluída..."
                  rows={3}
                  className="w-full border border-zinc-300 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditViraOrderModal(false)}
                  className="px-4 py-2 border border-zinc-300 rounded-xl hover:bg-zinc-50 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingEditViraOrder}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {submittingEditViraOrder ? 'Salvando...' : 'Salvar Retorno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <KitCompositionDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        kitCodigo={selectedDrawerKitCode}
        kitDescricao={selectedDrawerKitDesc}
        onCompositionUpdated={() => {
          fetchKitComposicao();
          fetchKits();
        }}
      />

      {/* MODAL: SELECIONAR NOVO KIT PARA COMPOSIÇÃO */}
      {isNewKitModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center border-b border-zinc-150 pb-3 shrink-0">
              <h3 className="font-extrabold text-sm text-zinc-900 flex items-center gap-2">
                <PlusCircle className="h-5 w-5 text-emerald-600 animate-pulse" />
                Definir Composição para Novo Kit
              </h3>
              <button 
                onClick={() => { setIsNewKitModalOpen(false); setNewKitSearch(''); }}
                className="p-1.5 hover:bg-zinc-100 rounded-full text-zinc-450 hover:text-zinc-900 cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 flex-1 flex flex-col overflow-hidden">
              <p className="text-xs text-zinc-500 font-medium">
                Pesquise e selecione qualquer produto cadastrado no sistema para iniciar a definição da sua composição (estrutura de insumos).
              </p>

              <div className="relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Pesquise por código ou descrição do produto..."
                  value={newKitSearch}
                  onChange={(e) => setNewKitSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 text-xs font-semibold text-zinc-900"
                />
              </div>

              <div className="flex-1 overflow-y-auto border border-zinc-200 rounded-xl divide-y divide-zinc-100">
                {products
                  .filter(p => {
                    if (!newKitSearch.trim()) return false;
                    const q = newKitSearch.toLowerCase();
                    return (
                      (p.codigo || '').toLowerCase().includes(q) ||
                      (p.descricao || '').toLowerCase().includes(q)
                    );
                  })
                  .slice(0, 50)
                  .map(p => {
                    const isAlreadyKit = kitComposicao.some(kc => kc.kit_codigo === p.codigo);
                    return (
                      <button
                        key={p.codigo}
                        type="button"
                        onClick={() => {
                          setSelectedDrawerKitCode(p.codigo);
                          setSelectedDrawerKitDesc(p.descricao);
                          setIsDrawerOpen(true);
                          setIsNewKitModalOpen(false);
                          setNewKitSearch('');
                        }}
                        className="w-full text-left p-3 hover:bg-zinc-50 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md border border-zinc-200">
                              {p.codigo}
                            </span>
                            <span className="text-xs font-bold text-zinc-950 truncate">
                              {p.descricao}
                            </span>
                          </div>
                        </div>
                        {isAlreadyKit ? (
                          <span className="text-[10px] font-bold text-zinc-400 shrink-0">
                            Já possui composição
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md shrink-0">
                            Iniciar composição
                          </span>
                        )}
                      </button>
                    );
                  })}
                {newKitSearch.trim() && products.filter(p => {
                  const q = newKitSearch.toLowerCase();
                  return (
                    (p.codigo || '').toLowerCase().includes(q) ||
                    (p.descricao || '').toLowerCase().includes(q)
                  );
                }).length === 0 && (
                  <div className="p-8 text-center text-zinc-400 font-bold text-xs">
                    Nenhum produto encontrado com essa busca.
                  </div>
                )}
                {!newKitSearch.trim() && (
                  <div className="p-8 text-center text-zinc-450 font-bold text-xs space-y-1">
                    <Search className="w-5 h-5 text-zinc-350 mx-auto" />
                    <p>Comece a digitar para pesquisar produtos.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-150 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => { setIsNewKitModalOpen(false); setNewKitSearch(''); }}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <datalist id="produtos-list">
        {products.map(p => (
          <option key={p.codigo} value={p.codigo}>
            {p.descricao}
          </option>
        ))}
      </datalist>
    </div>
  );
}
