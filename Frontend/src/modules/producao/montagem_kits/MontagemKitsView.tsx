import { apiFetch } from '../../geral/lib/http';
import { useAviso } from '../../geral/components/ui/Aviso';
import Drawer from '../../geral/components/ui/Drawer';
import AppLayout from '../../geral/components/layout/AppLayout';
import { usePreviaServidor, mensagemErroServidor } from '../lib/usePreviaServidor';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ArrowLeft, Search, RefreshCw, Layers, ClipboardList, PlusCircle, Trash2, 
  CheckCircle2, Printer, X, Eye, CheckCircle, ExternalLink, Calendar, User, FileText, Settings, AlertTriangle,
  UploadCloud, Plus
} from 'lucide-react';
import KitCompositionDrawer from '../components/KitCompositionDrawer';
import LancarKitErpDrawer from './LancarKitErpDrawer';
import { api } from '../../geral/lib/api';
import { Category } from '../../geral/lib/types';
import { SeloOrdemParada } from '../lib/ordemParada';
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
import FolhaImpressaoOrdem from './FolhaImpressaoOrdem';
import AbaOrdensMontagem from './AbaOrdensMontagem';
import AbaComponentesAlertas from './AbaComponentesAlertas';
import AbaComposicaoKits from './AbaComposicaoKits';
import AbaOrdensConversao from './AbaOrdensConversao';
import DrawerNovaOrdem from './DrawerNovaOrdem';
import DrawerEditarOrdem from './DrawerEditarOrdem';
import DrawerNovaOrdemConversao from './DrawerNovaOrdemConversao';
import DrawerEditarOrdemConversao from './DrawerEditarOrdemConversao';
import DrawerNovoKit from './DrawerNovoKit';

export default function MontagemKitsView({ onBackToHub, buscaInicial }: { onBackToHub: () => void; buscaInicial?: string }) {
  const { avisar, aviso } = useAviso();
  const { pedir: pedirPrevia, abrir: abrirPrevia, elemento: previaElemento } = usePreviaServidor(avisar);
  const [activeSubTab, setActiveSubTab] = useState(buscaInicial ? 'componentes' : 'ordens'); // 'ordens', 'componentes' ou 'composicao'
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
  const [kitsSearch, setKitsSearch] = useState(buscaInicial ?? '');
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
  const [newKitQty, setNewKitQty] = useState<number | string>(10);
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
  const [editQuantityAssembled, setEditQuantityAssembled] = useState<number | string>(0);
  const [editErpLaunched, setEditErpLaunched] = useState(false);
  const [lancarErpOrdemId, setLancarErpOrdemId] = useState<number | null>(null);
  const [lancarErpViraId, setLancarErpViraId] = useState<number | null>(null);
  const [submittingEditOrder, setSubmittingEditOrder] = useState(false);

  // States: Vira de Produto (Reetiquetagem / Reenvase)
  const [viraOrders, setViraOrders] = useState([]);
  const [viraComposicao, setViraComposicao] = useState([]);
  const [viraSearch, setViraSearch] = useState('');
  const [filterViraStatus, setFilterViraStatus] = useState('ALL');
  const [loadingVira, setLoadingVira] = useState(false);

  // Vira Composicao Form
  const [newViraDeCodigo, setNewViraDeCodigo] = useState('');
  const [newViraParaCodigo, setNewViraParaCodigo] = useState('');

  // Nova Ordem de Conversão Modal & Form
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
  const [newViraFormula, setNewViraFormula] = useState('');
  const [loadingViraPackaging, setLoadingViraPackaging] = useState(false);
  const [newViraOrderNotes, setNewViraOrderNotes] = useState('');
  const [submittingNewViraOrder, setSubmittingNewViraOrder] = useState(false);

  // Preview embalagens na aba Fórmulas

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
        avisar(err.error || 'Erro ao adicionar kit.', 'erro');
      }
    } catch (e) {
      console.error(e);
      avisar('Erro de conexão.', 'erro');
    }
  };

  const handleDeleteKitComposicao = (kit, comp) => {
    abrirPrevia({
      titulo: 'Remover componente do kit',
      linhas: [{ titulo: `Componente ${comp}`, detalhe: `Kit ${kit}` }],
      confirmarRotulo: 'OK, remover',
      pedirMotivo: true,
      executar: async (motivo) => {
        const res = await apiFetch(`/kits/composicao/${encodeURIComponent(kit)}/${encodeURIComponent(comp)}?motivo=${encodeURIComponent(motivo ?? '')}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(await mensagemErroServidor(res, 'Erro ao excluir relação.'));
        await fetchKitComposicao();
        await fetchKits(); // Atualiza os alertas
      },
    });
  };

  const handleUploadKitsConfig = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingKitsConfig(true);
    const enviar = (confirmar: boolean) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch(`/kits/composicao/upload${confirmar ? '?confirmar=true' : ''}`, { method: 'POST', body: formData });
    };
    try {
      const res = await enviar(false);
      const data = await res.json();
      if (!res.ok) {
        avisar(data.error || 'Erro ao importar.', 'erro');
        return;
      }
      const r = data.resultado || {};
      const kits: string[] = r.kitsAfetados || [];
      abrirPrevia({
        titulo: 'Importar composição de kits',
        linhas: [
          { titulo: 'Relações manuais que saem', detalhe: String(r.removidas ?? 0) },
          { titulo: 'Relações do arquivo que entram', detalhe: String(r.importadas ?? 0) },
          { titulo: 'Kits afetados', detalhe: String(kits.length) },
          ...kits.slice(0, 50).map(k => ({ titulo: k })),
        ],
        avisos: [
          'Todas as relações manuais atuais são substituídas pelas do arquivo (as vindas do ERP ficam).',
          ...(kits.length > 50 ? [`Mostrando 50 de ${kits.length} kits.`] : []),
        ],
        confirmarRotulo: 'Importar e substituir',
        executar: async () => {
          const r2 = await enviar(true);
          const d2 = await r2.json().catch(() => ({}));
          if (!r2.ok) throw new Error(d2.error || 'Erro ao importar.');
          await fetchKitComposicao();
          await fetchKits(); // Atualiza os alertas
          avisar(d2.message || 'Composição de kits importada.', 'sucesso');
        },
      });
    } catch (e) {
      console.error(e);
      avisar('Erro de conexão.', 'erro');
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

  const handleDeleteViraComposicao = (de, para) => {
    abrirPrevia({
      titulo: 'Remover fórmula de conversão',
      linhas: [{ titulo: `Produto ${de}`, detalhe: `converte em ${para}` }],
      confirmarRotulo: 'OK, remover',
      pedirMotivo: true,
      executar: async (motivo) => {
        try {
          const res = await apiFetch(`/turnovers/composicao/${de}/${para}?motivo=${encodeURIComponent(motivo ?? '')}`, { method: 'DELETE' });
          if (res.ok) {
            await fetchViraComposicao();
          } else {
            avisar('Erro ao excluir relação.', 'erro');
          }
        } catch (e) {
          console.error(e);
          avisar('Erro de conexão.', 'erro');
        }
      },
    });
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
    setNewViraFormula('');
    setNewViraDeCodigo('');
    setNewViraParaCodigo('');
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

  const parConversaoExistente = (de: string, para: string) =>
    viraComposicao.find((vc) => vc.deProdutoCodigo === de && vc.paraProdutoCodigo === para) || null;

  // Escolheu origem e destino: carrega a receita do par (se existe) ou abre um par novo para preencher ali mesmo.
  const atualizarParConversao = async (de: string, para: string) => {
    setNewViraDeCodigo(de);
    setNewViraParaCodigo(para);
    const d = de.trim();
    const pa = para.trim();
    const conhece = (c: string) => products.some((pr) => String(pr.codigo || '').trim() === c);
    if (!d || !pa || d === pa || !conhece(d) || !conhece(pa)) {
      setSelectedViraComp(null);
      setNewViraPackagingLines([]);
      setNewViraFormula('');
      return;
    }
    const existente = parConversaoExistente(d, pa);
    await applyViraCompSelection(existente || { deProdutoCodigo: d, paraProdutoCodigo: pa, quantidade: Number(newViraFator) || 1, novo: true });
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
      setNewViraFormula(preview.formula || '');
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
      setNewViraFormula(preview.formula || '');
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
      // Receita do par: cria ou atualiza (rota existente, com auditoria) quando é par novo ou o fator mudou.
      const fatorReceita = Number(newViraFator) || 0;
      const jaExiste = parConversaoExistente(selectedViraComp.deProdutoCodigo, selectedViraComp.paraProdutoCodigo);
      if (fatorReceita <= 0) {
        avisar('Informe o fator da conversão (maior que zero).', 'erro');
        return;
      }
      if (!jaExiste || Math.abs((parseFloat(jaExiste.quantidade) || 0) - fatorReceita) > 1e-9) {
        const rc = await apiFetch(`/turnovers/composicao`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deProdutoCodigo: selectedViraComp.deProdutoCodigo,
            paraProdutoCodigo: selectedViraComp.paraProdutoCodigo,
            quantidade: fatorReceita,
          }),
        });
        if (!rc.ok) {
          const err = await rc.json().catch(() => ({}));
          avisar(err.error || 'Erro ao salvar a receita da conversão.', 'erro');
          return;
        }
        await fetchViraComposicao();
      }
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
        avisar(err.error || 'Erro ao criar ordem de conversão.', 'erro');
      }
    } catch (err) {
      console.error(err);
      avisar('Erro ao conectar com a API.', 'erro');
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
        // Conversão concluída e ainda fora do ERP: abre a prévia do lançamento para confirmar.
        if (editViraStatus === 'COMPLETED' && selectedViraOrder.erpLaunched !== 1) {
          setLancarErpViraId(selectedViraOrder.id);
        }
      } else {
        const err = await res.json();
        avisar(err.error || 'Erro ao atualizar ordem de conversão.', 'erro');
      }
    } catch (err) {
      console.error(err);
      avisar('Erro de conexão.', 'erro');
    } finally {
      setSubmittingEditViraOrder(false);
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

  // Excluir é escrita em 2 passos: o servidor devolve a ordem que sairia e só apaga com confirmar=true.
  const handleDeleteViraOrder = async (id) => {
    await pedirPrevia({
      url: `/turnovers/orders/${id}`,
      init: { method: 'DELETE' },
      titulo: 'Excluir ordem de conversão',
      confirmarRotulo: 'OK, excluir',
      pedirMotivo: true,
      linhas: (d) => [{
        titulo: `Ordem ${d.item?.order_number ?? id}`,
        detalhe: `${d.item?.de_produto_codigo ?? ''} → ${d.item?.para_produto_codigo ?? ''} • ${d.item?.quantity ?? ''} un`,
      }],
      erroPadrao: 'Erro ao excluir ordem.',
      aoConcluir: async () => { await fetchViraOrders(); },
    });
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
      avisar("Por favor, preencha o número do lote/ordem.", 'erro');
      return;
    }
    if (!selectedKitCode) {
      avisar("Por favor, selecione o kit.", 'erro');
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
          orderNumber: data.orderNumber || newOrderNumber,
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
        avisar(err.error || "Erro ao criar ordem de montagem", 'erro');
      }
    } catch (err) {
      console.error(err);
      avisar("Falha de rede ao criar ordem", 'erro');
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
          orderNumber: data.orderNumber || orderNum,
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
        avisar(err.error || "Erro ao gerar ordem de montagem", 'erro');
      }
    } catch (err) {
      console.error(err);
      avisar("Falha de rede ao gerar e imprimir ordem", 'erro');
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
                : kitOrderComponentNeed(item, parseFloat(String(editQuantityAssembled)) || 0),
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
        componentsLotes: list.length > 0 ? JSON.stringify(list) : null,
        quantityAssembled: parseFloat(String(editQuantityAssembled)) || 0
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
          quantityAssembled: parseFloat(String(editQuantityAssembled)) || 0,
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
        // Ordem concluída e ainda fora do ERP: abre a prévia do lançamento para confirmar.
        if (editStatus === 'COMPLETED' && selectedOrder.erpLaunched !== 1) {
          setLancarErpOrdemId(selectedOrder.id);
        }
      } else {
        avisar("Erro ao atualizar ordem de montagem", 'erro');
      }
    } catch (err) {
      console.error(err);
      avisar("Falha de rede ao atualizar", 'erro');
    } finally {
      setSubmittingEditOrder(false);
    }
  };

  // Excluir é escrita em 2 passos: o servidor devolve a ordem que sairia e só apaga com confirmar=true.
  const handleDeleteOrder = async (id) => {
    await pedirPrevia({
      url: `/kits/orders/${id}`,
      init: { method: 'DELETE' },
      titulo: 'Excluir ordem de montagem',
      confirmarRotulo: 'OK, excluir',
      pedirMotivo: true,
      linhas: (d) => [{
        titulo: `Ordem ${d.item?.order_number ?? id}`,
        detalhe: `${d.item?.kit_product_code ?? ''} • ${d.item?.quantity ?? ''} un`,
      }],
      erroPadrao: 'Erro ao excluir ordem de montagem',
      aoConcluir: async () => { fetchOrders(); },
    });
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

  const viraOrdersFiltradas = viraOrders.filter(o => {
    const q = viraSearch.toLowerCase();
    const matchesSearch =
      (o.orderNumber || '').toLowerCase().includes(q) ||
      (o.deProdutoCodigo || '').toLowerCase().includes(q) ||
      (o.deProdutoDescricao || '').toLowerCase().includes(q) ||
      (o.paraProdutoCodigo || '').toLowerCase().includes(q) ||
      (o.paraProdutoDescricao || '').toLowerCase().includes(q);
    return matchesSearch && (filterViraStatus === 'ALL' || o.status === filterViraStatus);
  });

  const ctx: any = {
    allKitsDropdown,
    applyViraCompSelection,
    newViraFormula,
    atualizarParConversao,
    parConversaoExistente,
    buildViraPrintPayload,
    editAssembledBy,
    editCheckedBy,
    editComponentLotes,
    editComponentUsedQty,
    editErpLaunched,
    editNotes,
    editOrderNumber,
    editQuantity,
    editQuantityAssembled,
    editStatus,
    editViraAssembledBy,
    editViraCheckedBy,
    editViraMotivo,
    editViraNotes,
    editViraPackagingLines,
    editViraQuantityAssembled,
    editViraStatus,
    expandedKits,
    fetchKits,
    fetchOrders,
    filterStatus,
    filterViraStatus,
    filteredOrders,
    getViraDeNamePreview,
    getViraParaNamePreview,
    handleCreateOrder,
    handleCreateViraOrder,
    handleDeleteOrder,
    handleDeleteViraComposicao,
    handleDeleteViraOrder,
    handleKitChange,
    handleKitQuantityAssembledChange,
    handleOpenEditModal,
    handleOpenEditViraOrderModal,
    handleOpenNewOrderModal,
    handlePrintOrder,
    handleQuickCreateAndPrintKit,
    handleUpdateOrder,
    handleUpdateViraOrder,
    handleUploadKitsConfig,
    kitCompSearch,
    kitComposicao,
    kitMontarQtys,
    kits,
    kitsSearch,
    kitsSelectedStatus,
    loading,
    loadingOrders,
    loadingVira,
    loadingViraPackaging,
    masterKitsList,
    newComponentLotes,
    newKitNotes,
    newKitQty,
    newKitSearch,
    newOrderNumber,
    newViraDeCodigo,
    newViraFator,
    newViraMotivo,
    newViraOrderNotes,
    newViraOrderNumber,
    newViraPackagingLines,
    newViraParaCodigo,
    newViraQtyDe,
    newViraQtyPara,
    newViraQtyParaManual,
    printingOrder,
    products,
    refreshNewViraPackaging,
    searchOrder,
    selectedKitCode,
    selectedKitObj,
    selectedOrder,
    selectedViraComp,
    selectedViraOrder,
    setEditAssembledBy,
    setEditCheckedBy,
    setEditComponentLotes,
    setEditComponentUsedQty,
    setEditNotes,
    setEditOrderNumber,
    setEditQuantity,
    setEditStatus,
    setEditViraAssembledBy,
    setEditViraCheckedBy,
    setEditViraMotivo,
    setEditViraNotes,
    setEditViraPackagingLines,
    setEditViraQuantityAssembled,
    setEditViraStatus,
    setFilterStatus,
    setFilterViraStatus,
    setIsDrawerOpen,
    setIsNewKitModalOpen,
    setKitCompSearch,
    setKitMontarQtys,
    setKitsPage,
    setKitsSearch,
    setKitsSelectedStatus,
    setLancarErpOrdemId,
    setLancarErpViraId,
    setNewComponentLotes,
    setNewKitNotes,
    setNewKitQty,
    setNewKitSearch,
    setNewOrderNumber,
    setNewViraDeCodigo,
    setNewViraFator,
    setNewViraMotivo,
    setNewViraOrderNotes,
    setNewViraOrderNumber,
    setNewViraPackagingLines,
    setNewViraParaCodigo,
    setNewViraQtyDe,
    setNewViraQtyPara,
    setNewViraQtyParaManual,
    setPrintingOrder,
    setSearchOrder,
    setSelectedDrawerKitCode,
    setSelectedDrawerKitDesc,
    setShowEditOrderModal,
    setShowEditViraOrderModal,
    setShowNewOrderModal,
    setShowNewViraOrderModal,
    setViraSearch,
    submittingEditOrder,
    submittingEditViraOrder,
    submittingNewOrder,
    submittingNewViraOrder,
    toggleKitExpanded,
    truncPrint,
    uploadingKitsConfig,
    viraComposicao,
    viraOrders,
    viraOrdersFiltradas,
    viraSearch,
  };

  return (
    <AppLayout
      moduleTitle="Kits"
      onBackToHub={onBackToHub}
      sidebarItems={[
        { id: 'ordens', label: 'Ordens de Montagem', icon: ClipboardList, badge: orders.length || undefined, grupo: 'Montagem' },
        { id: 'componentes', label: 'Componentes e Alertas', icon: Layers, grupo: 'Montagem' },
        { id: 'composicao', label: 'Composição de Kits', icon: Settings, grupo: 'Montagem' },
        { id: 'vira_ordens', label: 'Ordens de Conversão', icon: RefreshCw, badge: viraOrders.length || undefined, grupo: 'Conversão de produto' },
      ]}
      activeTab={activeSubTab}
      onTabChange={setActiveSubTab}
    >
      <div className="relative z-[60]">{previaElemento}</div>
      {lancarErpViraId !== null && (
        <div className="relative z-[60]">
          <LancarKitErpDrawer
            ordemId={lancarErpViraId}
            origem="vira"
            onClose={() => setLancarErpViraId(null)}
            onGravado={fetchViraOrders}
          />
        </div>
      )}
      {lancarErpOrdemId !== null && (
        <div className="relative z-[60]">
          <LancarKitErpDrawer
            ordemId={lancarErpOrdemId}
            onClose={() => setLancarErpOrdemId(null)}
            onGravado={fetchOrders}
          />
        </div>
      )}
      {aviso}
      {/* Printable Sheet */}
      {printingOrder && (
        <FolhaImpressaoOrdem ctx={ctx} />
      )}

        <div className="print:hidden flex flex-col min-w-0">
          <div className="min-w-0 flex flex-col">
            <div className="no-print mb-3 md:mb-5 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <h2 className="text-sm font-extrabold text-zinc-900">
                {activeSubTab === 'ordens' ? 'Ordens de Montagem' : activeSubTab === 'componentes' ? 'Componentes e Alertas' : activeSubTab === 'composicao' ? 'Composição de Kits' : 'Ordens de Conversão'}
              </h2>
            <div className="flex flex-wrap items-center md:justify-end gap-2 no-print">
              <div className="flex flex-wrap items-center gap-2 md:gap-3">
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
                    Nova Ordem de Conversão
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
              <AbaOrdensMontagem ctx={ctx} />
        )}

        {/* TAB 2: COMPONENTES E ALERTAS (Kits list) */}
        {activeSubTab === 'componentes' && (
          <AbaComponentesAlertas ctx={ctx} />
        )}

        {/* TAB 3: COMPOSIÇÃO DE KITS */}
        {activeSubTab === 'composicao' && (
          <AbaComposicaoKits ctx={ctx} />
        )}

        {/* TAB 4.5: ORDENS DE TRANSFORMAÇÃO */}
        {activeSubTab === 'vira_ordens' && (
          <AbaOrdensConversao ctx={ctx} />
        )}

        {/* TAB 5: COMPOSIÇÃO DE CONVERSÕES */}
          </div>
        </div>

      {/* MODAL: NOVA ORDEM */}
      {showNewOrderModal && (
        <DrawerNovaOrdem ctx={ctx} />
      )}

      {/* MODAL: EDITAR / VISUALIZAR ORDEM */}
      {showEditOrderModal && selectedOrder && (
        <DrawerEditarOrdem ctx={ctx} />
      )}
      {/* MODAL: NOVA ORDEM DE CONVERSÃO */}
      {showNewViraOrderModal && (
        <DrawerNovaOrdemConversao ctx={ctx} />
      )}

      {/* MODAL: RETORNO DE ORDEM DE TRANSFORMAÇÃO */}
      {showEditViraOrderModal && selectedViraOrder && (
        <DrawerEditarOrdemConversao ctx={ctx} />
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
        <DrawerNovoKit ctx={ctx} />
      )}

      <datalist id="produtos-list">
        {products.map(p => (
          <option key={p.codigo} value={p.codigo}>
            {p.descricao}
          </option>
        ))}
      </datalist>
    </AppLayout>
  );
}
