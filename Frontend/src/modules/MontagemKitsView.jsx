import React, { useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, Search, RefreshCw, Layers, ClipboardList, PlusCircle, Trash2, 
  CheckCircle2, Printer, X, Eye, CheckCircle, ExternalLink, Calendar, User, FileText, Settings, AlertTriangle,
  UploadCloud
} from 'lucide-react';

const API_BASE = 'http://127.0.0.1:3001/api';

export default function MontagemKitsView({ onBackToHub }) {
  const [activeSubTab, setActiveSubTab] = useState('ordens'); // 'ordens', 'componentes' ou 'composicao'
  const [loading, setLoading] = useState(false);

  // States: Composição de Kits Comerciais
  const [kitComposicao, setKitComposicao] = useState([]);
  const [kitCompSearch, setKitCompSearch] = useState('');
  const [kitCompNewKit, setKitCompNewKit] = useState('');
  const [kitCompNewComp, setKitCompNewComp] = useState('');
  const [kitCompNewQty, setKitCompNewQty] = useState(1);
  const [products, setProducts] = useState([]);
  const [uploadingKitsConfig, setUploadingKitsConfig] = useState(false);

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

  // Modal: Editar/Visualizar Ordem
  const [showEditOrderModal, setShowEditOrderModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  
  // Form: Editar Ordem
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
  const [newViraOrderQuantity, setNewViraOrderQuantity] = useState(10);
  const [newViraOrderNotes, setNewViraOrderNotes] = useState('');
  const [submittingNewViraOrder, setSubmittingNewViraOrder] = useState(false);

  // Editar/Visualizar Ordem de Vira
  const [showEditViraOrderModal, setShowEditViraOrderModal] = useState(false);
  const [selectedViraOrder, setSelectedViraOrder] = useState(null);
  const [editViraStatus, setEditViraStatus] = useState('PENDING');
  const [editViraAssembledBy, setEditViraAssembledBy] = useState('');
  const [editViraCheckedBy, setEditViraCheckedBy] = useState('');
  const [editViraNotes, setEditViraNotes] = useState('');
  const [editViraQuantityAssembled, setEditViraQuantityAssembled] = useState(0);
  const [editViraErpLaunched, setEditViraErpLaunched] = useState(false);
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

      const res = await fetch(`${API_BASE}/kits?${params.toString()}`);
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
      const res = await fetch(`${API_BASE}/kits/orders`);
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
      const res = await fetch(`${API_BASE}/kits?limit=1000`);
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
      const res = await fetch(`${API_BASE}/kits/next-order-number`);
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
      const res = await fetch(`${API_BASE}/products?limit=5000&show_hidden=true`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items || []);
      }
    } catch (e) {
      console.error("Error fetching products:", e);
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
      const res = await fetch(`${API_BASE}/kits/composicao`);
      if (res.ok) setKitComposicao(await res.json());
    } catch (e) {
      console.error("Error fetching kit composition:", e);
    }
  }, []);

  const handleAddKitComposicao = async (e) => {
    if (e) e.preventDefault();
    if (!kitCompNewKit.trim() || !kitCompNewComp.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/kits/composicao`, {
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
      const res = await fetch(`${API_BASE}/kits/composicao/${kit}/${comp}`, { method: 'DELETE' });
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
      const res = await fetch(`${API_BASE}/kits/composicao/upload`, { method: 'POST', body: formData });
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
      const res = await fetch(`${API_BASE}/turnovers/composicao`);
      if (res.ok) setViraComposicao(await res.json());
    } catch (e) {
      console.error("Error fetching vira composition:", e);
    }
  }, []);

  const fetchViraOrders = useCallback(async () => {
    setLoadingVira(true);
    try {
      const res = await fetch(`${API_BASE}/turnovers/orders`);
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
      const res = await fetch(`${API_BASE}/turnovers/composicao`, {
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
      const res = await fetch(`${API_BASE}/turnovers/composicao/${de}/${para}`, { method: 'DELETE' });
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
      const res = await fetch(`${API_BASE}/turnovers/next-order-number`);
      if (res.ok) {
        const data = await res.json();
        setNextViraOrderNumber(data.nextOrderNumber);
        setNewViraOrderNumber(data.nextOrderNumber);
      }
    } catch (e) {
      console.error("Error fetching next vira order number:", e);
    }
  };

  const handleOpenNewViraOrderModal = async () => {
    setSelectedViraComp(null);
    setNewViraOrderQuantity(10);
    setNewViraOrderNotes('');
    await fetchNextViraOrderNumber();
    setShowNewViraOrderModal(true);
  };

  const handleCreateViraOrder = async (e) => {
    if (e) e.preventDefault();
    if (!selectedViraComp || !newViraOrderNumber.trim()) return;
    setSubmittingNewViraOrder(true);
    try {
      const res = await fetch(`${API_BASE}/turnovers/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: newViraOrderNumber.trim(),
          deProdutoCodigo: selectedViraComp.deProdutoCodigo,
          paraProdutoCodigo: selectedViraComp.paraProdutoCodigo,
          quantity: parseFloat(newViraOrderQuantity) || 0,
          status: 'PENDING',
          observations: newViraOrderNotes
        })
      });
      if (res.ok) {
        setShowNewViraOrderModal(false);
        await fetchViraOrders();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao criar ordem de vira.');
      }
    } catch (e) {
      console.error(e);
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
    setShowEditViraOrderModal(true);
  };

  const handleUpdateViraOrder = async (e) => {
    if (e) e.preventDefault();
    if (!selectedViraOrder) return;
    setSubmittingEditViraOrder(true);
    try {
      const payload = {
        status: editViraStatus,
        assembledBy: editViraAssembledBy,
        checkedBy: editViraCheckedBy,
        observations: editViraNotes,
        erpLaunched: editViraErpLaunched ? 1 : 0,
        quantityAssembled: parseFloat(editViraQuantityAssembled) || 0
      };
      const res = await fetch(`${API_BASE}/turnovers/orders/${selectedViraOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowEditViraOrderModal(false);
        await fetchViraOrders();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao atualizar ordem de vira.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de conexão.');
    } finally {
      setSubmittingEditViraOrder(false);
    }
  };

  const handleDeleteViraOrder = async (id) => {
    if (!window.confirm("Deseja realmente excluir esta ordem de vira?")) return;
    try {
      const res = await fetch(`${API_BASE}/turnovers/orders/${id}`, { method: 'DELETE' });
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
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    if (activeSubTab === 'componentes') {
      fetchKits();
    } else if (activeSubTab === 'composicao') {
      fetchKitComposicao();
    } else if (activeSubTab === 'vira_ordens') {
      fetchViraOrders();
    } else if (activeSubTab === 'vira_composicao') {
      fetchViraComposicao();
    } else {
      fetchOrders();
    }
  }, [activeSubTab, fetchKits, fetchOrders, fetchKitComposicao, fetchViraOrders, fetchViraComposicao]);

  const toggleKitExpanded = (code) => {
    setExpandedKits(prev => 
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleOpenNewOrderModal = async (preselectedKitCode = '') => {
    await fetchAllKitsDropdown();
    await fetchNextOrderNumber();
    setSelectedKitCode(preselectedKitCode);
    setNewKitQty(10);
    setNewKitNotes('');
    setNewComponentLotes({});
    setShowNewOrderModal(true);
  };

  // Handle kit selection change to pre-populate lotes form
  const handleKitChange = (kitCode) => {
    setSelectedKitCode(kitCode);
    setNewComponentLotes({});
  };

  // Select Kit Object from dropdown list
  const selectedKitObj = allKitsDropdown.find(k => k.codigo === selectedKitCode);

  const handleCreateOrder = async (e) => {
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
      // Map lotes to JSON string
      const lotesList = selectedKitObj?.componentes?.map(comp => ({
        code: comp.codigo,
        description: comp.descricao,
        expected_qty: comp.quantidade || 1,
        lote: newComponentLotes[comp.codigo] || ""
      })) || [];

      const payload = {
        orderNumber: newOrderNumber,
        kitProductCode: selectedKitCode,
        kitProductDescription: selectedKitObj?.descricao || "",
        quantity: parseFloat(newKitQty),
        status: "PENDING",
        assembledBy: "",
        checkedBy: "",
        observations: newKitNotes,
        componentsLotes: JSON.stringify(lotesList)
      };

      const res = await fetch(`${API_BASE}/kits/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowNewOrderModal(false);
        fetchOrders();
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

  const handleKitQuantityAssembledChange = (val, componentsList) => {
    setEditQuantityAssembled(val);
    const numVal = parseFloat(val) || 0;
    
    // Auto-update used quantities for all components based on the new kit quantity
    const newUsedQties = { ...editComponentUsedQty };
    componentsList.forEach(item => {
      newUsedQties[item.code] = numVal * (item.expected_qty || 1);
    });
    setEditComponentUsedQty(newUsedQties);
  };

  const handleOpenEditModal = (order) => {
    setSelectedOrder(order);
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
        list.forEach(item => {
          parsedLotes[item.code] = item.lote || "";
          parsedUsedQties[item.code] = item.used_qty !== undefined ? item.used_qty : (item.expected_qty * (order.quantityAssembled || order.quantity));
        });
      }
    } catch (e) {
      console.error("Error parsing components lotes:", e);
    }
    setEditComponentLotes(parsedLotes);
    setEditComponentUsedQty(parsedUsedQties);
    setShowEditOrderModal(true);
  };

  const handleUpdateOrder = async (e) => {
    if (e) e.preventDefault();
    setSubmittingEditOrder(true);
    try {
      // Parse and rebuild components lotes
      let list = [];
      try {
        if (selectedOrder.componentsLotes) {
          const originalList = JSON.parse(selectedOrder.componentsLotes);
          list = originalList.map(item => ({
            ...item,
            lote: editComponentLotes[item.code] || "",
            used_qty: editComponentUsedQty[item.code] !== undefined ? parseFloat(editComponentUsedQty[item.code]) : (item.expected_qty * editQuantityAssembled)
          }));
        }
      } catch (err) {
        console.error(err);
      }

      const payload = {
        status: editStatus,
        assembledBy: editAssembledBy,
        checkedBy: editCheckedBy,
        observations: editNotes,
        erpLaunched: editErpLaunched ? 1 : 0,
        componentsLotes: list.length > 0 ? JSON.stringify(list) : null,
        quantityAssembled: parseFloat(editQuantityAssembled) || 0
      };

      const res = await fetch(`${API_BASE}/kits/orders/${selectedOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowEditOrderModal(false);
        fetchOrders();
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
      const res = await fetch(`${API_BASE}/kits/orders/${id}`, {
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
    <div className="view-container animate-in fade-in duration-200">
      {/* Printable Sheet */}
      {printingOrder && (
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
                  {printingOrder.kitProductDescription?.startsWith("CONVERSÃO:") 
                    ? "Ordem de Conversão de Produto" 
                    : "Ordem de Montagem de Kit"}
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
                  {printingOrder.kitProductDescription?.startsWith("CONVERSÃO:") 
                    ? "Conversão de Produto" 
                    : "Produto / Kit Comercial"}
                </span>
                <p className="font-extrabold text-zinc-900 leading-tight">{printingOrder.kitProductDescription}</p>
              </div>
              <div className="p-3 space-y-1 col-span-2 text-center flex flex-col justify-center">
                <span className="text-[7.5px] uppercase font-black text-zinc-400 tracking-wider block">
                  {printingOrder.kitProductDescription?.startsWith("CONVERSÃO:") 
                    ? "Código Destino" 
                    : "Código do Kit"}
                </span>
                <p className="font-mono font-bold text-zinc-800 leading-none mt-1">{printingOrder.kitProductCode}</p>
              </div>
              <div className="p-3 bg-zinc-50/50 space-y-1 col-span-2 text-center flex flex-col justify-center">
                <span className="text-[7.5px] uppercase font-black text-zinc-400 tracking-wider block">Programada</span>
                <p className="font-bold text-zinc-650 leading-none mt-1">{printingOrder.quantity} un</p>
              </div>
              <div className="p-3 space-y-1 col-span-2 text-center flex flex-col justify-center">
                <span className="text-[7.5px] uppercase font-black text-zinc-400 tracking-wider block">
                  {printingOrder.kitProductDescription?.startsWith("CONVERSÃO:") 
                    ? "Convertida Real" 
                    : "Montada Real"}
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
                  {printingOrder.kitProductDescription?.startsWith("CONVERSÃO:") 
                    ? "Instruções e Origem da Conversão" 
                    : "Instruções e Componentes do Kit"}
                </h3>
                <span className="text-[8px] text-zinc-450 font-bold uppercase">NatumHub — Controle de Fluxo</span>
              </div>
              <table className="w-full text-[9px] border-collapse">
                <thead>
                  <tr className="border-b border-zinc-950 text-zinc-900 font-black text-[8px] uppercase tracking-wider">
                    <th className="py-2 text-left w-20">Código</th>
                    <th className="py-2 text-left">
                      {printingOrder.kitProductDescription?.startsWith("CONVERSÃO:") 
                        ? "Produto Origem / Descrição" 
                        : "Componente / Descrição"}
                    </th>
                    <th className="py-2 text-center w-16">
                      {printingOrder.kitProductDescription?.startsWith("CONVERSÃO:") 
                        ? "Fator" 
                        : "Qtd p/ Kit"}
                    </th>
                    <th className="py-2 text-center w-20">
                      {printingOrder.kitProductDescription?.startsWith("CONVERSÃO:") 
                        ? "Origem Prog." 
                        : "Qtd Prog."}
                    </th>
                    <th className="py-2 text-center w-20">
                      {printingOrder.kitProductDescription?.startsWith("CONVERSÃO:") 
                        ? "Origem Usada" 
                        : "Qtd Usada"}
                    </th>
                    <th className="py-2 text-left w-36 pl-4">Lote Utilizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {(() => {
                    try {
                      if (printingOrder.componentsLotes) {
                        const list = JSON.parse(printingOrder.componentsLotes);
                        return list.map(item => {
                          const expectedQty = parseFloat(item.expected_qty) || 0;
                          const finalExpectedQty = expectedQty > 0 ? expectedQty : 1;
                          const usedQty = item.used_qty !== undefined ? parseFloat(item.used_qty) : (finalExpectedQty * (printingOrder.quantityAssembled || printingOrder.quantity));
                          return (
                            <tr key={item.code} className="hover:bg-zinc-50/20">
                              <td className="py-2 font-mono font-bold text-zinc-900">{item.code}</td>
                              <td className="py-2 font-semibold text-zinc-800">{item.description}</td>
                              <td className="py-2 text-center font-bold text-zinc-500">{finalExpectedQty.toFixed(0)}</td>
                              <td className="py-2 text-center font-bold text-zinc-500">{(finalExpectedQty * printingOrder.quantity).toFixed(0)} un</td>
                              <td className="py-2 text-center font-black text-zinc-900">
                                {printingOrder.status === 'COMPLETED' || item.used_qty !== undefined ? (
                                  `${usedQty.toFixed(0)} un`
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
                  {printingOrder.observations || (printingOrder.kitProductDescription?.startsWith("CONVERSÃO:") 
                    ? "Nenhuma observação registrada para esta ordem de conversão."
                    : "Nenhuma observação registrada para esta ordem de montagem.")
                  }
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
              {/* Column 1: Operator */}
              <div className="border border-zinc-200 bg-zinc-50/20 p-4 rounded-xl space-y-3 h-28 flex flex-col justify-between">
                <span className="text-[8px] font-black text-zinc-950 uppercase tracking-wider block border-b border-zinc-200 pb-1 text-center">
                  {printingOrder.kitProductDescription?.startsWith("CONVERSÃO:") 
                    ? "1. OPERADOR RESPONSÁVEL" 
                    : "1. MONTADOR RESPONSÁVEL"}
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

              {/* Column 2: Checker */}
              <div className="border border-zinc-200 bg-zinc-50/20 p-4 rounded-xl space-y-3 h-28 flex flex-col justify-between">
                <span className="text-[8px] font-black text-zinc-950 uppercase tracking-wider block border-b border-zinc-200 pb-1 text-center">
                  {printingOrder.kitProductDescription?.startsWith("CONVERSÃO:") 
                    ? "2. CONFERENTE CONTROLE" 
                    : "2. CONFERENTE EXPEDIÇÃO"}
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

              {/* Column 3: Supervisor */}
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
      )}

      {/* Screen Interface */}
      <div className="print:hidden flex h-screen bg-zinc-50 font-sans text-zinc-900 overflow-hidden w-full">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-zinc-200 flex flex-col shrink-0">
          {/* Header */}
          <div className="h-16 flex items-center px-6 border-b border-zinc-200 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="bg-zinc-900 text-white p-2 rounded-xl shadow-sm">
                <ClipboardList className="h-5 w-5" />
              </div>
              <h1 className="font-bold text-base tracking-tight text-zinc-800 uppercase">
                Montagem de Kits
              </h1>
            </div>
          </div>

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
              <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wider">Módulos NatumHub</h3>
              <p className="text-xs text-zinc-550 leading-relaxed">
                Controle o fluxo fabril e logístico. Gerencie montagens de kits comerciais e ordens de conversão de produtos (reetiquetagem e reenvase).
              </p>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-8 shrink-0">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-900">
                {activeSubTab === 'ordens' && 'Ordens de Montagem de Kits'}
                {activeSubTab === 'componentes' && 'Componentes e Alertas de Estoque'}
                {activeSubTab === 'composicao' && 'Composição de Kits Comerciais'}
                {activeSubTab === 'vira_ordens' && 'Ordens de Conversão de Produto'}
                {activeSubTab === 'vira_composicao' && 'Composição de Conversões de Produto'}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {activeSubTab === 'ordens' && 'Gerencie e acompanhe a montagem de kits comerciais.'}
                {activeSubTab === 'componentes' && 'Verifique a disponibilidade de componentes individuais para montagem.'}
                {activeSubTab === 'composicao' && 'Gerencie a relação de componentes que compõem cada kit comercial.'}
                {activeSubTab === 'vira_ordens' && 'Gerencie a conversão, reetiquetagem e reenvase de produtos acabados.'}
                {activeSubTab === 'vira_composicao' && 'Vincule a relação de produtos origem/destino para ordens de conversão.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {activeSubTab === 'ordens' && (
                <button 
                  onClick={() => handleOpenNewOrderModal()}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer transition-all"
                >
                  <PlusCircle size={14} />
                  Nova Ordem de Montagem
                </button>
              )}
              {activeSubTab === 'vira_ordens' && (
                <button 
                  onClick={() => handleOpenNewViraOrderModal()}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer transition-all"
                >
                  <PlusCircle size={14} />
                  Nova Ordem de Vira
                </button>
              )}
              <button 
                onClick={activeSubTab === 'ordens' ? fetchOrders : activeSubTab === 'composicao' ? fetchKitComposicao : fetchKits}
                className="p-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl text-zinc-650 transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-sm cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${(loading || loadingOrders) ? 'animate-spin' : ''}`} />
                Recarregar
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-6 flex flex-col">
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
                        <th style={{ width: '12%' }}>Código</th>
                        <th style={{ width: '30%' }}>Descrição</th>
                        <th style={{ width: '12%' }} className="text-right">Estoque</th>
                        <th style={{ width: '15%' }}>Status Alerta</th>
                        <th style={{ width: '12%' }} className="text-right">Sug. Produção</th>
                        <th style={{ width: '15%' }}>Capacidade Montagem</th>
                        <th style={{ width: '10%', textRight: 'center' }}>Gerar Ordem</th>
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
                              <td className="p-3 text-center">
                                <button 
                                  onClick={() => handleOpenNewOrderModal(k.codigo)}
                                  className="p-1.5 hover:bg-zinc-100 text-zinc-900 rounded-lg cursor-pointer"
                                  title="Iniciar Ordem de Montagem para este Kit"
                                >
                                  <PlusCircle size={15} />
                                </button>
                              </td>
                            </tr>

                            {/* Expanded components list */}
                            {isExpanded && (
                              <tr className="bg-zinc-50/50">
                                <td colSpan="8" className="p-4 border-b border-zinc-200">
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
                                            <td className="py-2.5 text-zinc-700">{comp.descricao}</td>
                                            <td className="py-2.5 text-center font-bold text-zinc-900">{comp.quantidade}</td>
                                            <td className="py-2.5 text-right font-bold text-zinc-900">{comp.estoque} un</td>
                                            <td className="py-2.5 text-right text-zinc-500">{comp.producao} un</td>
                                            <td className="py-2.5 text-right text-zinc-500">{comp.pedidos_aberto} un</td>
                                            <td className="py-2.5 text-center">
                                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                                comp.necessita_producao 
                                                  ? 'bg-rose-50 text-rose-700' 
                                                  : 'bg-zinc-100 text-zinc-450'
                                              }`}>
                                                {comp.necessita_producao ? 'Sim' : 'Não'}
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
            {/* Form to add a new relation & spreadsheet import */}
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-4 shrink-0">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                
                {/* Add relation Form */}
                <form onSubmit={handleAddKitComposicao} className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Código do Kit</label>
                    <input
                      type="text"
                      placeholder="Ex: 2.11.064"
                      value={kitCompNewKit}
                      onChange={(e) => setKitCompNewKit(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold"
                      list="produtos-list"
                      required
                    />
                    {getKitNamePreview() && (
                      <div className="text-[10px] text-zinc-550 font-semibold truncate max-w-xs">{getKitNamePreview()}</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Código do Componente</label>
                    <input
                      type="text"
                      placeholder="Ex: 70.12.010"
                      value={kitCompNewComp}
                      onChange={(e) => setKitCompNewComp(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold"
                      list="produtos-list"
                      required
                    />
                    {getCompNamePreview() && (
                      <div className="text-[10px] text-zinc-550 font-semibold truncate max-w-xs">{getCompNamePreview()}</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Qtd/Kit</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="Qtd"
                      value={kitCompNewQty}
                      onChange={(e) => setKitCompNewQty(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-zinc-900 hover:bg-zinc-850 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-colors cursor-pointer h-[36px]"
                  >
                    Vincular Componente
                  </button>
                </form>

                {/* Excel import */}
                <div className="shrink-0 flex items-center">
                  <label className="bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-200 text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5 h-[36px]">
                    <UploadCloud className="w-4 h-4 text-zinc-500" />
                    {uploadingKitsConfig ? 'Enviando...' : 'Importar Excel (.xlsx)'}
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
            </div>

            {/* Table of Composition */}
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1">
              {/* Search Bar inside Table Panel */}
              <div className="p-4 border-b border-zinc-100 flex items-center shrink-0">
                <div className="relative w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar por Kit ou Componente..."
                    value={kitCompSearch}
                    onChange={(e) => setKitCompSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-medium"
                  />
                </div>
              </div>

              {/* Scrollable Table Wrapper */}
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 border-b border-zinc-155 font-bold text-zinc-500 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-3">Código do Kit</th>
                      <th className="px-6 py-3">Descrição do Kit</th>
                      <th className="px-6 py-3">Código do Componente</th>
                      <th className="px-6 py-3">Descrição do Componente</th>
                      <th className="px-6 py-3 text-center">Qtd/Kit</th>
                      <th className="px-6 py-3 text-center w-28">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {kitComposicao.filter(row => 
                      (row.kit_codigo || '').toLowerCase().includes(kitCompSearch.toLowerCase()) || 
                      (row.kit_descricao || '').toLowerCase().includes(kitCompSearch.toLowerCase()) ||
                      (row.componente_codigo || '').toLowerCase().includes(kitCompSearch.toLowerCase()) ||
                      (row.componente_descricao || '').toLowerCase().includes(kitCompSearch.toLowerCase())
                    ).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-zinc-455 font-bold">
                          Nenhuma relação de composição de kits encontrada.
                        </td>
                      </tr>
                    ) : (
                      kitComposicao.filter(row => 
                        (row.kit_codigo || '').toLowerCase().includes(kitCompSearch.toLowerCase()) || 
                        (row.kit_descricao || '').toLowerCase().includes(kitCompSearch.toLowerCase()) ||
                        (row.componente_codigo || '').toLowerCase().includes(kitCompSearch.toLowerCase()) ||
                        (row.componente_descricao || '').toLowerCase().includes(kitCompSearch.toLowerCase())
                      ).map((row) => (
                        <tr key={`${row.kit_codigo}-${row.componente_codigo}`} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-3 font-mono font-bold text-zinc-800">{row.kit_codigo}</td>
                          <td className="px-6 py-3 font-bold text-zinc-900">{row.kit_descricao}</td>
                          <td className="px-6 py-3 font-mono text-zinc-650">{row.componente_codigo}</td>
                          <td className="px-6 py-3 text-zinc-700">{row.componente_descricao}</td>
                          <td className="px-6 py-3 text-center font-bold text-zinc-900">{row.quantidade}</td>
                          <td className="px-6 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleDeleteKitComposicao(row.kit_codigo, row.componente_codigo)}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg border border-rose-150 transition-colors cursor-pointer inline-flex items-center justify-center"
                              title="Desvincular componente do kit"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ORDENS DE VIRA */}
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
                                    const customPrint = {
                                      id: o.id,
                                      orderNumber: o.orderNumber,
                                      kitProductCode: o.paraProdutoCodigo,
                                      kitProductDescription: `CONVERSÃO: ${o.deProdutoDescricao} ➔ ${o.paraProdutoDescricao}`,
                                      quantity: o.quantity,
                                      quantityAssembled: o.quantityAssembled,
                                      status: o.status,
                                      observations: o.observations,
                                      created_at: o.createdAt,
                                      componentsLotes: JSON.stringify([
                                        {
                                          code: o.deProdutoCodigo,
                                          description: o.deProdutoDescricao,
                                          expected_qty: 1,
                                          used_qty: o.quantityAssembled || undefined
                                        }
                                      ])
                                    };
                                    setPrintingOrder(customPrint);
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

                      return filtered.map(row => (
                        <tr key={`${row.deProdutoCodigo}-${row.paraProdutoCodigo}`} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-3 font-mono font-bold text-zinc-800">{row.deProdutoCodigo}</td>
                          <td className="px-6 py-3 font-bold text-zinc-900">{row.deProdutoDescricao}</td>
                          <td className="px-6 py-3 font-mono text-zinc-650">{row.paraProdutoCodigo}</td>
                          <td className="px-6 py-3 text-zinc-700">{row.paraProdutoDescricao}</td>
                          <td className="px-6 py-3 text-center font-bold text-zinc-900">{row.quantidade}</td>
                          <td className="px-6 py-3 text-center">
                            <button
                              onClick={() => handleDeleteViraComposicao(row.deProdutoCodigo, row.paraProdutoCodigo)}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg border border-rose-150 transition-colors cursor-pointer inline-flex items-center justify-center"
                              title="Remover vínculo de vira"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
          </main>
        </div>
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
                    {selectedKitObj.componentes.map(comp => (
                      <div key={comp.codigo} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-150 pb-2 last:border-none">
                        <div className="flex-1 truncate">
                          <span className="font-bold text-zinc-900 text-[11px] block truncate">{comp.descricao}</span>
                          <span className="text-[9px] text-zinc-500">REF: {comp.codigo} | Qtd/Kit: {comp.quantidade || 1} un | Nec: {(comp.quantidade || 1) * newKitQty} un</span>
                        </div>
                        <input
                          type="text"
                          placeholder="Lote do produto..."
                          value={newComponentLotes[comp.codigo] || ''}
                          onChange={(e) => setNewComponentLotes({ ...newComponentLotes, [comp.codigo]: e.target.value })}
                          className="border border-zinc-350 bg-white rounded-lg px-2.5 py-1.5 text-xs w-full sm:w-44 focus:outline-none"
                        />
                      </div>
                    ))}
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

              <div className="flex gap-3 justify-end pt-2">
                <button 
                  type="button"
                  onClick={() => setShowNewOrderModal(false)}
                  className="px-4 py-2 border border-zinc-300 rounded-xl hover:bg-zinc-50 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={submittingNewOrder}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {submittingNewOrder ? "Gerando..." : "Gerar Ordem de Montagem"}
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
                Retorno de Ordem: Lote {selectedOrder.orderNumber}
              </h3>
              <button 
                onClick={() => setShowEditOrderModal(false)}
                className="p-1 hover:bg-zinc-100 rounded-full text-zinc-455 hover:text-zinc-900 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleUpdateOrder} className="space-y-4 text-xs font-medium text-zinc-700">
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 space-y-2">
                <div>
                  <span className="text-[10px] text-zinc-400 font-extrabold uppercase block">Produto Kit</span>
                  <span className="font-bold text-zinc-900">{selectedOrder.kitProductDescription} ({selectedOrder.kitProductCode})</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-200/50">
                  <div>
                    <span className="text-[10px] text-zinc-400 font-extrabold uppercase block">Qtd Emitida</span>
                    <span className="font-bold text-zinc-800">{selectedOrder.quantity} un</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 font-extrabold uppercase block">Data Emissão</span>
                    <span className="font-bold text-zinc-800">{selectedOrder.createdAt}</span>
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
                          {list.map(item => (
                            <div key={item.code} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-150 pb-2 last:border-none">
                              <div className="flex-1 truncate">
                                <span className="font-bold text-zinc-900 text-[11px] block truncate">{item.description}</span>
                                <span className="text-[9px] text-zinc-555">
                                  REF: {item.code} | Qtd p/ Kit: {item.expected_qty.toFixed(0)} un | Nec Programada: {(item.expected_qty * selectedOrder.quantity).toFixed(0)} un
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
                                    value={editComponentUsedQty[item.code] !== undefined ? editComponentUsedQty[item.code] : (item.expected_qty * editQuantityAssembled)}
                                    onChange={(e) => setEditComponentUsedQty({ ...editComponentUsedQty, [item.code]: e.target.value })}
                                    className="border border-zinc-300 bg-white rounded-lg px-2.5 py-1 text-xs w-20 focus:outline-none font-semibold text-zinc-900"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
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

              <div className="flex gap-3 justify-end pt-2">
                <button 
                  type="button"
                  onClick={() => setShowEditOrderModal(false)}
                  className="px-4 py-2 border border-zinc-300 rounded-xl hover:bg-zinc-50 text-xs font-bold cursor-pointer"
                >
                  Cancelar
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
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-extrabold text-sm text-zinc-900 flex items-center gap-1.5">
                <RefreshCw className="h-5 w-5 text-zinc-900" />
                Criar Ordem de Conversão de Produto
              </h3>
              <button 
                onClick={() => setShowNewViraOrderModal(false)}
                className="p-1 hover:bg-zinc-100 rounded-full text-zinc-450 hover:text-zinc-900 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateViraOrder} className="space-y-4 text-xs font-medium text-zinc-700">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Lote da Ordem de Conversão</label>
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
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Selecione a Conversão de Produto</label>
                  <select
                    value={selectedViraComp ? `${selectedViraComp.deProdutoCodigo}-${selectedViraComp.paraProdutoCodigo}` : ''}
                    onChange={(e) => {
                      const found = viraComposicao.find(vc => `${vc.deProdutoCodigo}-${vc.paraProdutoCodigo}` === e.target.value);
                      setSelectedViraComp(found || null);
                    }}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 font-semibold text-zinc-900 bg-white"
                    required
                  >
                    <option value="">Selecione uma conversão...</option>
                    {viraComposicao.map(vc => (
                      <option key={`${vc.deProdutoCodigo}-${vc.paraProdutoCodigo}`} value={`${vc.deProdutoCodigo}-${vc.paraProdutoCodigo}`}>
                        {vc.deProdutoDescricao} ➔ {vc.paraProdutoDescricao}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedViraComp && (
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
                  <h4 className="font-extrabold text-[10px] uppercase text-zinc-500 tracking-wider">Produtos Associados</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-zinc-400 font-bold block">PRODUTO ORIGEM (DE):</span>
                      <span className="font-bold text-zinc-900 block">{selectedViraComp.deProdutoDescricao}</span>
                      <span className="text-[10px] font-mono text-zinc-550 block">{selectedViraComp.deProdutoCodigo}</span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-zinc-400 font-bold block">PRODUTO DESTINO (PARA):</span>
                      <span className="font-bold text-zinc-900 block">{selectedViraComp.paraProdutoDescricao}</span>
                      <span className="text-[10px] font-mono text-zinc-550 block">{selectedViraComp.paraProdutoCodigo}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Quantidade Programada</label>
                  <input 
                    type="number"
                    min="1"
                    value={newViraOrderQuantity}
                    onChange={(e) => setNewViraOrderQuantity(parseFloat(e.target.value) || 0)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 font-bold text-zinc-900"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Observações / Instruções Especiais</label>
                <textarea 
                  value={newViraOrderNotes}
                  onChange={(e) => setNewViraOrderNotes(e.target.value)}
                  placeholder="Ex: Realizar transposição de frascos com conferência lote-a-lote..."
                  rows="2"
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
                  {submittingNewViraOrder ? "Criando..." : "Criar Ordem"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RETORNO DE ORDEM DE TRANSFORMAÇÃO */}
      {showEditViraOrderModal && selectedViraOrder && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex flex-col">
                <h3 className="font-extrabold text-sm text-zinc-900 flex items-center gap-1.5">
                  <RefreshCw className="h-5 w-5 text-zinc-900" />
                  Retorno de Lote / Ordem de Transformação
                </h3>
                <span className="text-[10px] text-zinc-500 font-mono mt-0.5">Lote: {selectedViraOrder.orderNumber}</span>
              </div>
              <button 
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
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 font-semibold text-zinc-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Conferente Expedição</label>
                  <input 
                    type="text"
                    value={editViraCheckedBy}
                    onChange={(e) => setEditViraCheckedBy(e.target.value)}
                    placeholder="Nome do conferente..."
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 font-semibold text-zinc-900"
                  />
                </div>
              </div>

              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
                <h4 className="font-extrabold text-[10px] uppercase text-zinc-500 tracking-wider">Ajuste de Quantidade Realizada</h4>
                <div className="grid grid-cols-2 gap-4 items-end">
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-zinc-400 font-bold block">QTD. PROGRAMADA:</span>
                    <span className="font-bold text-zinc-650 block">{selectedViraOrder.quantity} un</span>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Qtd. Real Virada</label>
                    <input 
                      type="number"
                      value={editViraQuantityAssembled}
                      onChange={(e) => setEditViraQuantityAssembled(parseFloat(e.target.value) || 0)}
                      className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 font-bold text-zinc-900"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block flex items-center gap-1">
                  <FileText size={10} />
                  Observações de Retorno / Ocorrências
                </label>
                <textarea 
                  value={editViraNotes}
                  onChange={(e) => setEditViraNotes(e.target.value)}
                  placeholder="Ex: Transformação concluída. Sobrou resíduo de 2 frascos no galão de origem..."
                  rows="3"
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
                  {submittingEditViraOrder ? "Salvando..." : "Salvar Retorno"}
                </button>
              </div>
            </form>
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
