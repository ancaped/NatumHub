import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CalendarClock, Calendar, ChevronLeft, ChevronRight, Scale, FlaskConical,
  Layers, Tag, Boxes, Building2, Search, Plus, Trash2, Edit3, CheckCircle2,
  AlertTriangle, RefreshCw, Printer, Sparkles, Filter, Check, X, GripVertical,
  Info, Package, ArrowRight, ArrowLeft, Clock, HelpCircle, CheckCircle, FileSpreadsheet
} from 'lucide-react';
import { apiFetch } from '../../geral/lib/http';
import { getHoliday, HolidayInfo } from '../../geral/lib/brazilHolidays';
import { PlanejamentoSemanalTab } from '../gerenciamento/components/PlanejamentoSemanalTab';

export type BoardType = 'fabricacao' | 'pesagem' | 'envase' | 'rotulagem' | 'kits' | 'terceirizados';

interface GenericCardItem {
  id: string | number;
  data_programada: string; // YYYY-MM-DD
  product_code: string;
  product_description: string;
  quantity: number;
  quantity_kg?: number;
  lote_number?: string;
  status: string;
  extra?: any;
}

export default function PlanejamentoProducaoView({ onBackToHub }: { onBackToHub?: () => void }) {
  // Navigation & Active Board State
  const [activeBoard, setActiveBoard] = useState<BoardType>('fabricacao');

  // Shared Week State (Segunda a Sábado)
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  // Helper date functions
  const getMondayOfWeek = useCallback((d: Date): Date => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const formatDateStr = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getWeekKey = useCallback((d: Date): string => {
    const monday = getMondayOfWeek(d);
    const target = new Date(monday.valueOf());
    const dayNr = (monday.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
    }
    const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
    return `${monday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }, [getMondayOfWeek]);

  const weekMonday = useMemo(() => getMondayOfWeek(currentDate), [currentDate, getMondayOfWeek]);
  const currentWeekKey = useMemo(() => getWeekKey(currentDate), [currentDate, getWeekKey]);

  // Dias da semana da grade (Segunda a Sábado)
  const weekDays = useMemo(() => {
    const days = [];
    const nomes = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    for (let i = 0; i < 6; i++) {
      const d = new Date(weekMonday);
      d.setDate(weekMonday.getDate() + i);
      const isoDate = formatDateStr(d);
      const holiday = getHoliday(d);
      days.push({
        name: nomes[i],
        date: d,
        isoDate,
        holiday,
        formatted: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      });
    }
    return days;
  }, [weekMonday]);

  const weekRangeLabel = useMemo(() => {
    const seg = weekDays[0]?.formatted;
    const sab = weekDays[5]?.formatted;
    const ano = weekMonday.getFullYear();
    return `${seg} a ${sab}/${ano}`;
  }, [weekDays, weekMonday]);

  const handlePrevWeek = () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() - 7);
    setCurrentDate(next);
  };

  const handleNextWeek = () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + 7);
    setCurrentDate(next);
  };

  const handleCurrentWeek = () => {
    setCurrentDate(new Date());
  };

  // Boards Data States
  const [envaseItems, setEnvaseItems] = useState<GenericCardItem[]>([]);
  const [rotulagemItems, setRotulagemItems] = useState<GenericCardItem[]>([]);
  const [kitsItems, setKitsItems] = useState<GenericCardItem[]>([]);
  const [terceirizadosItems, setTerceirizadosItems] = useState<GenericCardItem[]>([]);
  const [pesagemItems, setPesagemItems] = useState<GenericCardItem[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);

  // Modal de Lote ERP com busca automática do último lote
  const [linkLoteModal, setLinkLoteModal] = useState<{
    item: GenericCardItem;
    boardType: BoardType;
    lote: string;
    loadingUltimo: boolean;
    ultimoLote?: string | null;
    dataUltimo?: string | null;
    sugestao?: string | null;
    origem?: string | null;
  } | null>(null);

  // Modal de Edição de Quantidade
  const [editQtyModal, setEditQtyModal] = useState<{
    item: GenericCardItem;
    boardType: BoardType;
    qty: number;
    qtyKg?: number;
  } | null>(null);

  // Modal de Novo Item para o Quadro Ativo
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemData, setNewItemData] = useState({
    product_code: '',
    product_description: '',
    quantity: 100,
    quantity_kg: 50,
    data_programada: weekDays[0]?.isoDate || formatDateStr(new Date()),
    lote_number: '',
    fornecedor: '',
    linha: 'Linha 1',
    tipo: 'MAQUINA',
  });

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Carrega itens dos quadros auxiliares (Envase, Rotulagem, Terceirizados, Kits, Pesagem)
  const fetchAuxiliaryBoards = useCallback(async () => {
    setLoadingBoard(true);
    try {
      // 1. Envase
      try {
        const resEnvase = await apiFetch('/administrativo/envase/programacao?data=TODOS');
        if (resEnvase.ok) {
          const data = await resEnvase.json();
          if (Array.isArray(data)) {
            setEnvaseItems(data.map((x: any) => ({
              id: x.id,
              data_programada: (x.dataProgramada || x.data_programada || '').slice(0, 10),
              product_code: x.productCode || x.product_code || '',
              product_description: x.productDescription || x.product_description || '',
              quantity: Number(x.quantity) || 0,
              quantity_kg: Number(x.quantityKg || x.quantity_kg) || 0,
              lote_number: x.loteNumber || x.lote_number || '',
              status: x.statusEnvase || x.status_envase || 'PROGRAMADO',
              extra: { linha: x.linha || 'Linha 1', categoria: x.categoriaEnvase }
            })));
          }
        }
      } catch (e) {
        console.warn('Erro ao buscar envase:', e);
      }

      // 2. Rotulagem
      try {
        const resRot = await apiFetch('/administrativo/rotulagem/programacao?data=TODOS');
        if (resRot.ok) {
          const data = await resRot.json();
          if (Array.isArray(data)) {
            setRotulagemItems(data.map((x: any) => ({
              id: x.id,
              data_programada: (x.dataProgramada || x.data_programada || '').slice(0, 10),
              product_code: x.productCode || x.product_code || '',
              product_description: x.productDescription || x.product_description || '',
              quantity: Number(x.quantity) || 0,
              quantity_kg: Number(x.quantityKg || x.quantity_kg) || 0,
              lote_number: x.loteNumber || x.lote_number || '',
              status: x.statusRotulagem || x.status_rotulagem || 'PROGRAMADO',
              extra: { tipo: x.tipo || 'MAQUINA' }
            })));
          }
        }
      } catch (e) {
        console.warn('Erro ao buscar rotulagem:', e);
      }

      // 3. Terceirizados
      try {
        const resTerc = await apiFetch('/administrativo/terceirizados/solicitacoes');
        if (resTerc.ok) {
          const data = await resTerc.json();
          if (Array.isArray(data)) {
            setTerceirizadosItems(data.map((x: any) => ({
              id: x.id,
              data_programada: (x.previsaoEntrega || x.previsao_entrega || x.createdAt || x.created_at || '').slice(0, 10),
              product_code: x.productCode || x.product_code || '',
              product_description: x.productDescription || x.product_description || '',
              quantity: Number(x.quantity) || 0,
              quantity_kg: Number(x.quantityKg || x.quantity_kg) || 0,
              lote_number: x.loteNumber || x.lote_number || '',
              status: x.status || 'SOLICITADO',
              extra: { fornecedor: x.fornecedor || 'Fornecedor Externo' }
            })));
          }
        }
      } catch (e) {
        console.warn('Erro ao buscar terceirizados:', e);
      }

      // 4. Kits (Ordens de Montagem)
      try {
        const resKits = await apiFetch('/kits/orders');
        if (resKits.ok) {
          const data = await resKits.json();
          if (Array.isArray(data)) {
            setKitsItems(data.map((x: any) => ({
              id: x.id,
              data_programada: (x.created_at || x.createdAt || '').slice(0, 10),
              product_code: x.kit_product_code || x.product_code || '',
              product_description: x.kit_product_description || x.product_description || '',
              quantity: Number(x.quantity) || 0,
              quantity_kg: 0,
              lote_number: x.order_number || '',
              status: x.status || 'PENDING',
              extra: { orderNumber: x.order_number, assembledBy: x.assembled_by }
            })));
          }
        }
      } catch (e) {
        console.warn('Erro ao buscar ordens de kits:', e);
      }

      // 5. Pesagem (Lotes com status de pesagem ou planejados aprovados)
      try {
        const resPesagem = await apiFetch(`/producao/planejamento-semanal?week=${encodeURIComponent(currentWeekKey)}`);
        if (resPesagem.ok) {
          const data = await resPesagem.json();
          if (Array.isArray(data)) {
            setPesagemItems(data.map((x: any) => ({
              id: x.id,
              data_programada: (x.data_planejada || '').slice(0, 10),
              product_code: x.codigo_produto || '',
              product_description: x.descricao || '',
              quantity: Math.round(Number(x.quantidade_planejada) * 2), // aprox un
              quantity_kg: Number(x.quantidade_planejada) || 0,
              lote_number: x.lote_erp || '',
              status: x.ordem_status === 'aprovado' ? 'Na Balança' : 'Aguardando MP',
              extra: { reator: x.reator_id }
            })));
          }
        }
      } catch (e) {
        console.warn('Erro ao buscar pesagem:', e);
      }
    } finally {
      setLoadingBoard(false);
    }
  }, [currentWeekKey]);

  useEffect(() => {
    fetchAuxiliaryBoards();
  }, [fetchAuxiliaryBoards]);

  // Drag and Drop Handler
  const handleDragStart = (e: React.DragEvent, item: GenericCardItem, sourceBoard: BoardType) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ item, sourceBoard }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropOnDay = async (e: React.DragEvent, targetIsoDate: string) => {
    e.preventDefault();
    const rawData = e.dataTransfer.getData('application/json');
    if (!rawData) return;
    try {
      const { item, sourceBoard } = JSON.parse(rawData) as { item: GenericCardItem; sourceBoard: BoardType };
      if (!item || !item.id) return;

      if (sourceBoard === 'envase') {
        setEnvaseItems(prev => prev.map(p => p.id === item.id ? { ...p, data_programada: targetIsoDate } : p));
        await apiFetch('/administrativo/envase/programacao', {
          method: 'POST',
          body: JSON.stringify({
            id: item.id,
            data_programada: targetIsoDate,
            product_code: item.product_code,
            product_description: item.product_description,
            quantity: item.quantity,
            quantity_kg: item.quantity_kg,
            lote_number: item.lote_number,
            status_envase: item.status,
            linha: item.extra?.linha || 'Linha 1'
          })
        });
        showToast('Item de envase movido para ' + targetIsoDate);
      } else if (sourceBoard === 'rotulagem') {
        setRotulagemItems(prev => prev.map(p => p.id === item.id ? { ...p, data_programada: targetIsoDate } : p));
        await apiFetch('/administrativo/rotulagem/programacao', {
          method: 'POST',
          body: JSON.stringify({
            id: item.id,
            data_programada: targetIsoDate,
            product_code: item.product_code,
            product_description: item.product_description,
            quantity: item.quantity,
            quantity_kg: item.quantity_kg,
            lote_number: item.lote_number,
            status_rotulagem: item.status,
            tipo: item.extra?.tipo || 'MAQUINA'
          })
        });
        showToast('Item de rotulagem movido para ' + targetIsoDate);
      } else if (sourceBoard === 'terceirizados') {
        setTerceirizadosItems(prev => prev.map(p => p.id === item.id ? { ...p, data_programada: targetIsoDate } : p));
        await apiFetch(`/administrativo/terceirizados/solicitacoes/${item.id}/previsao`, {
          method: 'POST',
          body: JSON.stringify({ previsao_entrega: targetIsoDate })
        });
        showToast('Previsão terceirizado atualizada para ' + targetIsoDate);
      } else if (sourceBoard === 'kits') {
        setKitsItems(prev => prev.map(p => p.id === item.id ? { ...p, data_programada: targetIsoDate } : p));
        showToast('Ordem de kit reorganizada para ' + targetIsoDate);
      } else if (sourceBoard === 'pesagem') {
        setPesagemItems(prev => prev.map(p => p.id === item.id ? { ...p, data_programada: targetIsoDate } : p));
        showToast('Pesagem remanejada para ' + targetIsoDate);
      }
    } catch (err) {
      console.error('Erro ao mover card:', err);
      showToast('Erro ao atualizar posição do card', 'error');
    }
  };

  // Abrir Modal de Lote ERP com busca automática do último lote
  const handleOpenLinkLote = async (item: GenericCardItem, boardType: BoardType) => {
    setLinkLoteModal({
      item,
      boardType,
      lote: item.lote_number || '',
      loadingUltimo: true,
      ultimoLote: null,
      dataUltimo: null,
      sugestao: null,
      origem: null,
    });

    try {
      const res = await apiFetch(`/producao/ultimo-lote?code=${encodeURIComponent(item.product_code)}`);
      if (res.ok) {
        const data = await res.json();
        setLinkLoteModal(prev => {
          if (!prev || prev.item.id !== item.id) return prev;
          return {
            ...prev,
            loadingUltimo: false,
            ultimoLote: data.ultimo_lote,
            dataUltimo: data.data_ultimo_lote,
            sugestao: data.sugestao_proximo,
            origem: data.origem,
          };
        });
      } else {
        setLinkLoteModal(prev => prev ? { ...prev, loadingUltimo: false } : null);
      }
    } catch (e) {
      console.warn('Erro ao buscar último lote:', e);
      setLinkLoteModal(prev => prev ? { ...prev, loadingUltimo: false } : null);
    }
  };

  // Confirmar Vinculação de Lote
  const handleConfirmLinkLote = async () => {
    if (!linkLoteModal) return;
    const { item, boardType, lote } = linkLoteModal;
    const cleanLote = lote.trim();

    try {
      if (boardType === 'envase') {
        setEnvaseItems(prev => prev.map(p => p.id === item.id ? { ...p, lote_number: cleanLote } : p));
        await apiFetch('/administrativo/envase/programacao', {
          method: 'POST',
          body: JSON.stringify({
            id: item.id,
            lote_number: cleanLote,
            product_code: item.product_code,
            product_description: item.product_description,
            data_programada: item.data_programada,
            quantity: item.quantity,
            quantity_kg: item.quantity_kg,
            status_envase: item.status,
            linha: item.extra?.linha || 'Linha 1'
          })
        });
      } else if (boardType === 'rotulagem') {
        setRotulagemItems(prev => prev.map(p => p.id === item.id ? { ...p, lote_number: cleanLote } : p));
        await apiFetch('/administrativo/rotulagem/programacao', {
          method: 'POST',
          body: JSON.stringify({
            id: item.id,
            lote_number: cleanLote,
            product_code: item.product_code,
            product_description: item.product_description,
            data_programada: item.data_programada,
            quantity: item.quantity,
            quantity_kg: item.quantity_kg,
            status_rotulagem: item.status,
            tipo: item.extra?.tipo || 'MAQUINA'
          })
        });
      } else if (boardType === 'terceirizados') {
        setTerceirizadosItems(prev => prev.map(p => p.id === item.id ? { ...p, lote_number: cleanLote } : p));
      } else if (boardType === 'pesagem') {
        setPesagemItems(prev => prev.map(p => p.id === item.id ? { ...p, lote_number: cleanLote } : p));
      }

      showToast(`Lote #${cleanLote} vinculado com sucesso!`);
      setLinkLoteModal(null);
    } catch (e) {
      console.error('Erro ao vincular lote:', e);
      showToast('Erro ao salvar lote no servidor', 'error');
    }
  };

  // Abrir Edição de Quantidade
  const handleOpenEditQty = (item: GenericCardItem, boardType: BoardType) => {
    setEditQtyModal({
      item,
      boardType,
      qty: item.quantity,
      qtyKg: item.quantity_kg || 0
    });
  };

  const handleConfirmEditQty = async () => {
    if (!editQtyModal) return;
    const { item, boardType, qty, qtyKg } = editQtyModal;

    try {
      if (boardType === 'envase') {
        setEnvaseItems(prev => prev.map(p => p.id === item.id ? { ...p, quantity: qty, quantity_kg: qtyKg } : p));
        await apiFetch('/administrativo/envase/programacao', {
          method: 'POST',
          body: JSON.stringify({
            id: item.id,
            product_code: item.product_code,
            product_description: item.product_description,
            data_programada: item.data_programada,
            quantity: qty,
            quantity_kg: qtyKg,
            lote_number: item.lote_number,
            status_envase: item.status,
            linha: item.extra?.linha || 'Linha 1'
          })
        });
      } else if (boardType === 'rotulagem') {
        setRotulagemItems(prev => prev.map(p => p.id === item.id ? { ...p, quantity: qty, quantity_kg: qtyKg } : p));
        await apiFetch('/administrativo/rotulagem/programacao', {
          method: 'POST',
          body: JSON.stringify({
            id: item.id,
            product_code: item.product_code,
            product_description: item.product_description,
            data_programada: item.data_programada,
            quantity: qty,
            quantity_kg: qtyKg,
            lote_number: item.lote_number,
            status_rotulagem: item.status,
            tipo: item.extra?.tipo || 'MAQUINA'
          })
        });
      } else if (boardType === 'terceirizados') {
        setTerceirizadosItems(prev => prev.map(p => p.id === item.id ? { ...p, quantity: qty, quantity_kg: qtyKg } : p));
      } else if (boardType === 'kits') {
        setKitsItems(prev => prev.map(p => p.id === item.id ? { ...p, quantity: qty } : p));
      } else if (boardType === 'pesagem') {
        setPesagemItems(prev => prev.map(p => p.id === item.id ? { ...p, quantity: qty, quantity_kg: qtyKg } : p));
      }

      showToast('Quantidade atualizada com sucesso!');
      setEditQtyModal(null);
    } catch (e) {
      console.error('Erro ao atualizar quantidade:', e);
      showToast('Erro ao atualizar quantidade no servidor', 'error');
    }
  };

  // Alternar Aprovação / Status com 1 clique
  const handleToggleApproval = async (item: GenericCardItem, boardType: BoardType) => {
    try {
      const nextStatus = item.status === 'APROVADO' || item.status === 'CONCLUIDO' || item.status === 'Na Balança'
        ? 'PROGRAMADO'
        : 'APROVADO';

      if (boardType === 'envase') {
        setEnvaseItems(prev => prev.map(p => p.id === item.id ? { ...p, status: nextStatus } : p));
        await apiFetch('/administrativo/envase/programacao', {
          method: 'POST',
          body: JSON.stringify({
            id: item.id,
            status_envase: nextStatus,
            product_code: item.product_code,
            product_description: item.product_description,
            data_programada: item.data_programada,
            quantity: item.quantity,
            quantity_kg: item.quantity_kg,
            lote_number: item.lote_number,
            linha: item.extra?.linha || 'Linha 1'
          })
        });
      } else if (boardType === 'rotulagem') {
        setRotulagemItems(prev => prev.map(p => p.id === item.id ? { ...p, status: nextStatus } : p));
        await apiFetch('/administrativo/rotulagem/programacao', {
          method: 'POST',
          body: JSON.stringify({
            id: item.id,
            status_rotulagem: nextStatus,
            product_code: item.product_code,
            product_description: item.product_description,
            data_programada: item.data_programada,
            quantity: item.quantity,
            quantity_kg: item.quantity_kg,
            lote_number: item.lote_number,
            tipo: item.extra?.tipo || 'MAQUINA'
          })
        });
      } else if (boardType === 'terceirizados') {
        const tercStatus = item.status === 'APROVADO' ? 'SOLICITADO' : 'APROVADO';
        setTerceirizadosItems(prev => prev.map(p => p.id === item.id ? { ...p, status: tercStatus } : p));
        await apiFetch(`/administrativo/terceirizados/solicitacoes/${item.id}/aprovar`, { method: 'POST' });
      } else if (boardType === 'pesagem') {
        const pesStatus = item.status === 'Na Balança' ? 'Aguardando MP' : 'Na Balança';
        setPesagemItems(prev => prev.map(p => p.id === item.id ? { ...p, status: pesStatus } : p));
      }

      showToast(`Status atualizado para: ${nextStatus}`);
    } catch (e) {
      console.error('Erro ao alternar aprovação:', e);
      showToast('Erro ao atualizar status no servidor', 'error');
    }
  };

  // Excluir card do quadro
  const handleDeleteCard = async (item: GenericCardItem, boardType: BoardType) => {
    if (!confirm(`Deseja remover o card de "${item.product_description}"?`)) return;

    try {
      if (boardType === 'envase') {
        setEnvaseItems(prev => prev.filter(p => p.id !== item.id));
        await apiFetch(`/administrativo/envase/programacao/${item.id}`, { method: 'DELETE' });
      } else if (boardType === 'rotulagem') {
        setRotulagemItems(prev => prev.filter(p => p.id !== item.id));
        await apiFetch(`/administrativo/rotulagem/programacao/${item.id}`, { method: 'DELETE' });
      } else if (boardType === 'terceirizados') {
        setTerceirizadosItems(prev => prev.filter(p => p.id !== item.id));
      } else if (boardType === 'kits') {
        setKitsItems(prev => prev.filter(p => p.id !== item.id));
      } else if (boardType === 'pesagem') {
        setPesagemItems(prev => prev.filter(p => p.id !== item.id));
      }

      showToast('Card removido com sucesso!');
    } catch (e) {
      console.error('Erro ao excluir card:', e);
      showToast('Erro ao excluir card no servidor', 'error');
    }
  };

  // Adicionar novo item manual ao quadro ativo
  const handleAddNewItemToBoard = async () => {
    if (!newItemData.product_code || !newItemData.product_description) {
      alert('Preencha o código e a descrição do produto.');
      return;
    }

    try {
      if (activeBoard === 'envase') {
        const payload = {
          data_programada: newItemData.data_programada,
          linha: newItemData.linha,
          product_code: newItemData.product_code,
          product_description: newItemData.product_description,
          quantity: Number(newItemData.quantity) || 100,
          quantity_kg: Number(newItemData.quantity_kg) || 50,
          lote_number: newItemData.lote_number,
          status_envase: 'PROGRAMADO'
        };
        const res = await apiFetch('/administrativo/envase/programacao', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showToast('Ordem de envase criada com sucesso!');
          fetchAuxiliaryBoards();
        }
      } else if (activeBoard === 'rotulagem') {
        const payload = {
          data_programada: newItemData.data_programada,
          tipo: newItemData.tipo,
          product_code: newItemData.product_code,
          product_description: newItemData.product_description,
          quantity: Number(newItemData.quantity) || 100,
          quantity_kg: Number(newItemData.quantity_kg) || 50,
          lote_number: newItemData.lote_number,
          status_rotulagem: 'PROGRAMADO'
        };
        const res = await apiFetch('/administrativo/rotulagem/programacao', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showToast('Ordem de rotulagem criada com sucesso!');
          fetchAuxiliaryBoards();
        }
      } else if (activeBoard === 'terceirizados') {
        const payload = {
          product_code: newItemData.product_code,
          product_description: newItemData.product_description,
          quantity: Number(newItemData.quantity) || 100,
          unit: 'un',
          fornecedor: newItemData.fornecedor || 'Fornecedor Terceirizado',
          previsao_entrega: newItemData.data_programada,
          lote_number: newItemData.lote_number
        };
        const res = await apiFetch('/administrativo/terceirizados/solicitacoes', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showToast('Solicitação terceirizada criada!');
          fetchAuxiliaryBoards();
        }
      } else if (activeBoard === 'kits') {
        const payload = {
          order_number: newItemData.lote_number || `ORD-${Date.now().toString().slice(-4)}`,
          kit_product_code: newItemData.product_code,
          kit_product_description: newItemData.product_description,
          quantity: Number(newItemData.quantity) || 10,
          status: 'PENDING'
        };
        const res = await apiFetch('/kits/orders', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showToast('Ordem de kit criada!');
          fetchAuxiliaryBoards();
        }
      }

      setShowAddModal(false);
      setNewItemData({
        product_code: '',
        product_description: '',
        quantity: 100,
        quantity_kg: 50,
        data_programada: weekDays[0]?.isoDate || formatDateStr(new Date()),
        lote_number: '',
        fornecedor: '',
        linha: 'Linha 1',
        tipo: 'MAQUINA',
      });
    } catch (e) {
      console.error('Erro ao adicionar item:', e);
      showToast('Erro ao criar registro', 'error');
    }
  };

  // Quadro de cards ativo (para boards auxiliares)
  const currentBoardItems = useMemo(() => {
    if (activeBoard === 'envase') return envaseItems;
    if (activeBoard === 'rotulagem') return rotulagemItems;
    if (activeBoard === 'terceirizados') return terceirizadosItems;
    if (activeBoard === 'kits') return kitsItems;
    if (activeBoard === 'pesagem') return pesagemItems;
    return [];
  }, [activeBoard, envaseItems, rotulagemItems, terceirizadosItems, kitsItems, pesagemItems]);

  // Contadores rápidos para os botões superiores
  const boardCounts = useMemo(() => {
    return {
      fabricacao: 'Reatores & Bombonas',
      pesagem: pesagemItems.length,
      envase: envaseItems.length,
      rotulagem: rotulagemItems.length,
      kits: kitsItems.length,
      terceirizados: terceirizadosItems.length,
    };
  }, [pesagemItems.length, envaseItems.length, rotulagemItems.length, kitsItems.length, terceirizadosItems.length]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-zinc-50 overflow-hidden font-sans">
      {/* 1. TOP HEADER & WORKSTATION BAR */}
      <header className="bg-white border-b border-zinc-200 px-6 py-3 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          {onBackToHub && (
            <button
              onClick={onBackToHub}
              className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-600 transition-colors"
              title="Voltar ao Início"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-zinc-900">Planejamento de Produção</h1>
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md bg-zinc-900 text-white">
                PCP
              </span>
            </div>
            <p className="text-xs text-zinc-500 font-medium">
              Semana <strong className="font-mono text-zinc-700">{currentWeekKey}</strong> ({weekRangeLabel})
            </p>
          </div>
        </div>

        {/* Semana Navigation */}
        <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-xl border border-zinc-200/80">
          <button
            onClick={handlePrevWeek}
            className="p-1.5 hover:bg-white rounded-lg text-zinc-600 hover:text-zinc-900 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
            title="Semana Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={handleCurrentWeek}
            className="px-3 py-1 text-xs font-bold text-zinc-700 hover:bg-white rounded-lg transition-all cursor-pointer shadow-2xs hover:shadow-xs flex items-center gap-1.5"
          >
            <Calendar className="h-3.5 w-3.5 text-zinc-500" />
            <span>Semana Atual</span>
          </button>
          <button
            onClick={handleNextWeek}
            className="p-1.5 hover:bg-white rounded-lg text-zinc-600 hover:text-zinc-900 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
            title="Próxima Semana"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          {activeBoard !== 'fabricacao' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Agendar no Quadro</span>
            </button>
          )}

          <button
            onClick={fetchAuxiliaryBoards}
            className="p-2 border border-zinc-200 hover:bg-zinc-100 rounded-xl text-zinc-600 transition-colors cursor-pointer"
            title="Atualizar dados dos quadros"
          >
            <RefreshCw className={`h-4 w-4 ${loadingBoard ? 'animate-spin text-zinc-900' : ''}`} />
          </button>
        </div>
      </header>

      {/* 2. SUB-HEADER: BOTÕES SUPERIORES DE ALTERNAÇÃO ENTRE OS QUADROS */}
      <div className="bg-white border-b border-zinc-200 px-6 py-2 flex items-center justify-between overflow-x-auto gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-max">
          <button
            onClick={() => setActiveBoard('fabricacao')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeBoard === 'fabricacao'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200/60'
            }`}
          >
            <FlaskConical className="h-4 w-4 text-emerald-400" />
            <span>Fabricação & Reatores</span>
          </button>

          <button
            onClick={() => setActiveBoard('pesagem')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeBoard === 'pesagem'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200/60'
            }`}
          >
            <Scale className="h-4 w-4 text-amber-500" />
            <span>Fila de Pesagem</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeBoard === 'pesagem' ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-200 text-zinc-700'
            }`}>
              {boardCounts.pesagem}
            </span>
          </button>

          <button
            onClick={() => setActiveBoard('envase')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeBoard === 'envase'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200/60'
            }`}
          >
            <Layers className="h-4 w-4 text-blue-500" />
            <span>Linhas de Envase</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeBoard === 'envase' ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-200 text-zinc-700'
            }`}>
              {boardCounts.envase}
            </span>
          </button>

          <button
            onClick={() => setActiveBoard('rotulagem')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeBoard === 'rotulagem'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200/60'
            }`}
          >
            <Tag className="h-4 w-4 text-purple-500" />
            <span>Rotulagem</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeBoard === 'rotulagem' ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-200 text-zinc-700'
            }`}>
              {boardCounts.rotulagem}
            </span>
          </button>

          <button
            onClick={() => setActiveBoard('kits')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeBoard === 'kits'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200/60'
            }`}
          >
            <Boxes className="h-4 w-4 text-orange-500" />
            <span>Ordens de Kits</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeBoard === 'kits' ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-200 text-zinc-700'
            }`}>
              {boardCounts.kits}
            </span>
          </button>

          <button
            onClick={() => setActiveBoard('terceirizados')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeBoard === 'terceirizados'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200/60'
            }`}
          >
            <Building2 className="h-4 w-4 text-indigo-500" />
            <span>Terceirizados</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeBoard === 'terceirizados' ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-200 text-zinc-700'
            }`}>
              {boardCounts.terceirizados}
            </span>
          </button>
        </div>

        <div className="text-[11px] text-zinc-400 font-semibold hidden md:flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-amber-500" />
          <span>Arraste os cards para mover entre dias da semana</span>
        </div>
      </div>

      {/* 3. CONTEÚDO PRINCIPAL DO QUADRO */}
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
        {/* VIEW 1: FABRICAÇÃO & REATORES */}
        {activeBoard === 'fabricacao' && (
          <div className="flex-1 h-full min-h-0 overflow-hidden flex flex-col">
            <PlanejamentoSemanalTab
              active={true}
              currentDate={currentDate}
              onCurrentDateChange={setCurrentDate}
              hideHeaderNav={true}
            />
          </div>
        )}

        {/* VIEW 2 a 6: QUADROS DE CARDS SEMANAIS (Pesagem, Envase, Rotulagem, Kits, Terceirizados) */}
        {activeBoard !== 'fabricacao' && (
          <div className="flex-1 min-h-0 overflow-x-auto p-4 flex flex-col">
            <div className="grid grid-cols-6 gap-3 min-w-[1200px] flex-1 min-h-0">
              {weekDays.map(day => {
                const dayItems = currentBoardItems.filter(item => item.data_programada === day.isoDate);
                const totalKg = dayItems.reduce((acc, it) => acc + (it.quantity_kg || 0), 0);
                const totalUn = dayItems.reduce((acc, it) => acc + (it.quantity || 0), 0);

                return (
                  <div
                    key={day.isoDate}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleDropOnDay(e, day.isoDate)}
                    className="flex flex-col bg-zinc-100/70 border border-zinc-200/80 rounded-2xl p-2.5 min-h-0 overflow-hidden transition-colors hover:border-zinc-300"
                  >
                    {/* Header do Dia */}
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-200/70 shrink-0">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-xs text-zinc-900">{day.name}</span>
                          <span className="text-[11px] font-mono text-zinc-500">{day.formatted}</span>
                        </div>
                        {day.holiday && (
                          <span className="text-[10px] text-amber-600 font-bold block truncate max-w-[140px]" title={day.holiday.name}>
                            ★ {day.holiday.name}
                          </span>
                        )}
                      </div>
                      <span className="px-1.5 py-0.5 rounded-full bg-white border border-zinc-200 text-zinc-700 font-mono text-[10px] font-bold shadow-2xs">
                        {dayItems.length}
                      </span>
                    </div>

                    {/* Totais do Dia */}
                    {dayItems.length > 0 && (
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono font-semibold pb-1.5 shrink-0 px-0.5">
                        <span>{totalKg > 0 ? `${totalKg.toLocaleString('pt-BR')} kg` : ''}</span>
                        <span>{totalUn.toLocaleString('pt-BR')} un</span>
                      </div>
                    )}

                    {/* Lista de Cards com Scroll */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                      {dayItems.length === 0 ? (
                        <div className="h-28 flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 rounded-xl text-zinc-400 text-xs">
                          <p className="font-semibold text-[11px]">Nenhum card</p>
                          <span className="text-[10px] text-zinc-400">Arraste aqui</span>
                        </div>
                      ) : (
                        dayItems.map(item => (
                          <div
                            key={item.id}
                            draggable
                            onDragStart={e => handleDragStart(e, item, activeBoard)}
                            className="group relative bg-white border border-zinc-200/90 hover:border-zinc-400 rounded-xl p-2.5 shadow-2xs hover:shadow-xs transition-all cursor-grab active:cursor-grabbing flex flex-col gap-1.5"
                          >
                            {/* Top row do card */}
                            <div className="flex items-start justify-between gap-1">
                              <div className="flex items-center gap-1.5">
                                <GripVertical className="h-3.5 w-3.5 text-zinc-300 group-hover:text-zinc-600 shrink-0" />
                                <span className="font-mono text-[10px] font-bold text-zinc-500 bg-zinc-100 px-1 py-0.2 rounded">
                                  {item.product_code}
                                </span>
                              </div>

                              {/* Status Badge */}
                              <button
                                onClick={() => handleToggleApproval(item, activeBoard)}
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
                                  item.status === 'APROVADO' || item.status === 'CONCLUIDO' || item.status === 'Na Balança'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-zinc-100 text-zinc-600 border border-zinc-200 hover:bg-zinc-200'
                                }`}
                                title="Clique para alternar aprovação"
                              >
                                <Check className="h-3 w-3" />
                                <span>{item.status}</span>
                              </button>
                            </div>

                            {/* Descrição do Produto */}
                            <h4 className="text-xs font-bold text-zinc-900 line-clamp-2 leading-tight" title={item.product_description}>
                              {item.product_description}
                            </h4>

                            {/* Quantidade e Lote ERP */}
                            <div className="flex items-center justify-between pt-1 border-t border-zinc-100 text-xs">
                              <button
                                onClick={() => handleOpenEditQty(item, activeBoard)}
                                className="font-mono font-bold text-zinc-800 hover:text-blue-600 flex items-center gap-1 cursor-pointer"
                                title="Editar quantidade"
                              >
                                <span>{item.quantity.toLocaleString('pt-BR')} un</span>
                                {item.quantity_kg ? (
                                  <span className="text-[10px] text-zinc-400 font-normal">({item.quantity_kg}kg)</span>
                                ) : null}
                                <Edit3 className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>

                              {/* Botão Vincular Lote com Busca Automática */}
                              <button
                                onClick={() => handleOpenLinkLote(item, activeBoard)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-all ${
                                  item.lote_number
                                    ? 'bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                                    : 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'
                                }`}
                                title="Clique para vincular ou consultar o último lote do ERP"
                              >
                                <span>{item.lote_number ? `#${item.lote_number}` : '+ Lote'}</span>
                              </button>
                            </div>

                            {/* Informações Extras por Quadro */}
                            {item.extra && (
                              <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-0.5 font-medium">
                                <span>
                                  {item.extra.linha || item.extra.tipo || item.extra.fornecedor || item.extra.orderNumber || ''}
                                </span>
                                <button
                                  onClick={() => handleDeleteCard(item, activeBoard)}
                                  className="text-zinc-300 hover:text-rose-600 p-0.5 rounded transition-colors cursor-pointer"
                                  title="Remover card"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: VINCULAR LOTE ERP (COM BUSCA AUTOMÁTICA DO ÚLTIMO LOTE) */}
      {linkLoteModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-zinc-900">Vincular Lote ERP ao Card</h3>
              </div>
              <button
                onClick={() => setLinkLoteModal(null)}
                className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-zinc-50 border border-zinc-200/80 rounded-xl p-3">
                <span className="font-mono text-[10px] font-bold text-zinc-500 uppercase">
                  {linkLoteModal.item.product_code}
                </span>
                <p className="text-xs font-bold text-zinc-800 leading-snug">
                  {linkLoteModal.item.product_description}
                </p>
                <p className="text-[11px] text-zinc-500 mt-1 font-mono">
                  Programado: <strong>{linkLoteModal.item.quantity.toLocaleString('pt-BR')} un</strong>
                  {linkLoteModal.item.quantity_kg ? ` (${linkLoteModal.item.quantity_kg} kg)` : ''}
                </p>
              </div>

              {/* Informação do Último Lote do ERP */}
              <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                    Histórico ERP de Lotes
                  </span>
                  {linkLoteModal.loadingUltimo && (
                    <RefreshCw className="h-3 w-3 animate-spin text-indigo-600" />
                  )}
                </div>

                {linkLoteModal.loadingUltimo ? (
                  <p className="text-xs text-indigo-700 italic">Buscando último lote no ERP...</p>
                ) : linkLoteModal.ultimoLote ? (
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between text-xs text-indigo-950 font-mono">
                      <span>Último Adicionado: <strong>#{linkLoteModal.ultimoLote}</strong></span>
                      {linkLoteModal.dataUltimo && (
                        <span className="text-[11px] text-indigo-700">({linkLoteModal.dataUltimo})</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        onClick={() => setLinkLoteModal(prev => prev ? { ...prev, lote: prev.ultimoLote || '' } : null)}
                        className="px-2.5 py-1 text-[11px] font-bold bg-white text-indigo-800 border border-indigo-300 rounded-lg hover:bg-indigo-100 transition-colors shadow-2xs cursor-pointer"
                      >
                        Usar #{linkLoteModal.ultimoLote}
                      </button>
                      {linkLoteModal.sugestao && (
                        <button
                          onClick={() => setLinkLoteModal(prev => prev ? { ...prev, lote: prev.sugestao || '' } : null)}
                          className="px-2.5 py-1 text-[11px] font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                        >
                          <span>Sugerir Próximo: #{linkLoteModal.sugestao}</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-indigo-700">Nenhum lote anterior registrado no ERP para este código.</p>
                )}
              </div>

              {/* Digitação Manual do Lote */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Número do Lote (ou digite manualmente)
                </label>
                <input
                  type="text"
                  value={linkLoteModal.lote}
                  onChange={e => setLinkLoteModal(prev => prev ? { ...prev, lote: e.target.value } : null)}
                  placeholder="Ex: 240810, 2026/01..."
                  className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
              <button
                onClick={() => setLinkLoteModal(null)}
                className="px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmLinkLote}
                className="px-4 py-2 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Salvar Lote</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EDITAR QUANTIDADE */}
      {editQtyModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl max-w-sm w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-zinc-700" />
                <h3 className="text-sm font-bold text-zinc-900">Editar Quantidade</h3>
              </div>
              <button
                onClick={() => setEditQtyModal(null)}
                className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs">
                <span className="font-mono font-bold text-zinc-500">{editQtyModal.item.product_code}</span>
                <p className="font-bold text-zinc-800">{editQtyModal.item.product_description}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Quantidade em Unidades</label>
                <input
                  type="number"
                  value={editQtyModal.qty}
                  onChange={e => setEditQtyModal(prev => prev ? { ...prev, qty: Number(e.target.value) } : null)}
                  className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Massa em Kg (Granel)</label>
                <input
                  type="number"
                  value={editQtyModal.qtyKg || 0}
                  onChange={e => setEditQtyModal(prev => prev ? { ...prev, qtyKg: Number(e.target.value) } : null)}
                  className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
              <button
                onClick={() => setEditQtyModal(null)}
                className="px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmEditQty}
                className="px-4 py-2 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: AGENDAR NOVO ITEM NO QUADRO ATIVO */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-zinc-700" />
                <h3 className="text-sm font-bold text-zinc-900 uppercase">
                  Novo Agendamento: {activeBoard}
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Código Produto</label>
                  <input
                    type="text"
                    value={newItemData.product_code}
                    onChange={e => setNewItemData(prev => ({ ...prev, product_code: e.target.value }))}
                    placeholder="Ex: 1.14.058"
                    className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Data Programada</label>
                  <select
                    value={newItemData.data_programada}
                    onChange={e => setNewItemData(prev => ({ ...prev, data_programada: e.target.value }))}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    {weekDays.map(d => (
                      <option key={d.isoDate} value={d.isoDate}>
                        {d.name} ({d.formatted})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Descrição</label>
                <input
                  type="text"
                  value={newItemData.product_description}
                  onChange={e => setNewItemData(prev => ({ ...prev, product_description: e.target.value }))}
                  placeholder="Nome do produto..."
                  className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Quantidade (un)</label>
                  <input
                    type="number"
                    value={newItemData.quantity}
                    onChange={e => setNewItemData(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Massa (kg)</label>
                  <input
                    type="number"
                    value={newItemData.quantity_kg}
                    onChange={e => setNewItemData(prev => ({ ...prev, quantity_kg: Number(e.target.value) }))}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Lote ERP</label>
                  <input
                    type="text"
                    value={newItemData.lote_number}
                    onChange={e => setNewItemData(prev => ({ ...prev, lote_number: e.target.value }))}
                    placeholder="Opcional"
                    className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
                {activeBoard === 'terceirizados' && (
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Fornecedor</label>
                    <input
                      type="text"
                      value={newItemData.fornecedor}
                      onChange={e => setNewItemData(prev => ({ ...prev, fornecedor: e.target.value }))}
                      placeholder="Nome do fornecedor"
                      className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                )}
                {activeBoard === 'envase' && (
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Linha</label>
                    <select
                      value={newItemData.linha}
                      onChange={e => setNewItemData(prev => ({ ...prev, linha: e.target.value }))}
                      className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    >
                      <option value="Linha 1">Linha 1</option>
                      <option value="Linha 2">Linha 2</option>
                      <option value="Linha 3">Linha 3</option>
                      <option value="Manual">Manual</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddNewItemToBoard}
                className="px-4 py-2 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Agendar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST FLUTUANTE DE NOTIFICAÇÃO */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-semibold backdrop-blur-md ${
            toast.type === 'success'
              ? 'bg-zinc-900 text-white border-zinc-800'
              : 'bg-rose-950 text-rose-100 border-rose-800'
          }`}>
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
