import { apiFetch } from '../../geral/lib/http';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, Clock, PackageOpen, AlertTriangle, CheckCircle2, ClipboardList } from 'lucide-react';
import AppLayout, { type SidebarItem } from '../../geral/components/layout/AppLayout';
import Drawer from '../../geral/components/ui/Drawer';
import {
  ReportHeader, FilterBar, StatusBadge, TabelaPainel, BotaoAcao, type VarianteBadge,
} from '../../geral/components/ui/ReportKit';

interface PedidosViewProps {
  onBackToHub: () => void;
}

interface PurchaseOrder {
  nRegistro: number;
  nPedido: number;
  dPedido: string | null;
  nCodFornec: number | null;
  cNomeF: string | null;
  cUsuario: string | null;
  cStatus: string | null;
  cPrazoPgto: string | null;
  cPrevEntrega: string | null;
  nValor: number;
  dPrevisao: string | null;
  cEmail: string | null;
  mObservac: string | null;
  itemEncontrado?: string | null;
}

interface PurchaseOrderItem {
  id: number;
  nPedidoRegistro: number;
  nPedido: number;
  cReferencia: string;
  nQtde: number;
  nPreco: number;
  nChegou: number;
  cDescricao: string | null;
  cUnidade: string | null;
  nValorTotal: number;
  nRegistro: number;
  cChegada: string | null;
}

interface NotaVinculada {
  invoiceNumber: string;
  supplierId: string;
  invoiceDate: string | null;
  itemCode: string;
  quantidade: number;
  itemPedidoId: number;
}

interface PurchaseOrderDetail extends PurchaseOrder {
  items: PurchaseOrderItem[];
  notas: NotaVinculada[];
}

type Classe = 'ABERTO' | 'PARCIAL' | 'ATRASADO' | 'FECHADO' | 'CANCELADO' | 'OUTRO';
type Aba = 'ABERTO' | 'PARCIAL' | 'ATRASADO' | 'FECHADO' | 'ALL';

const classeDe = (status: string | null): Classe => {
  const s = (status || '').toUpperCase().trim();
  if (s === 'ABERTO' || s === 'A' || s.includes('ABERT')) return 'ABERTO';
  if (s === 'PARCIAL' || s === 'P' || s.includes('PARCI')) return 'PARCIAL';
  if (s === '!' || s.includes('ATRAS')) return 'ATRASADO';
  if (s === 'CANCELADO' || s === 'C' || s.includes('CANCEL')) return 'CANCELADO';
  if (s === 'FECHADO' || s === 'F' || s === 'T' || s.includes('FECH') || s.includes('CONCLU') || s.includes('TOTAL')) return 'FECHADO';
  return 'OUTRO';
};

const BADGE: Record<Classe, { label: string; variante: VarianteBadge }> = {
  ABERTO: { label: 'Aberto', variante: 'aguardando' },
  PARCIAL: { label: 'Parcial', variante: 'ordem' },
  ATRASADO: { label: 'Atrasado', variante: 'critico' },
  FECHADO: { label: 'Fechado', variante: 'saudavel' },
  CANCELADO: { label: 'Cancelado', variante: 'descontinuado' },
  OUTRO: { label: 'Indefinido', variante: 'descontinuado' },
};

const fmtData = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const fmtMoeda = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = (n: number) => Number(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const vazio: React.CSSProperties = { padding: 20, textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' };

export default function PedidosView({ onBackToHub }: PedidosViewProps) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [aba, setAba] = useState<Aba>('ABERTO');

  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrderDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const loadOrders = useCallback(async (termo: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (termo.trim()) params.set('search', termo.trim());
      const res = await apiFetch(`/compras/pedidos?${params.toString()}`);
      if (res.ok) setOrders(await res.json());
    } catch (e) {
      console.error('Erro ao carregar pedidos:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (window as any).__current_page__ = 'Módulo de Compras > Controle de Pedidos';
  }, []);

  // A busca vai ao servidor (acha também por código/descrição do item); as abas filtram na tela.
  useEffect(() => {
    const timer = setTimeout(() => { loadOrders(search); }, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [search, loadOrders]);

  const handleOpenDetail = async (nRegistro: number) => {
    setDrawerLoading(true);
    setSelectedOrder(null);
    try {
      const res = await apiFetch(`/compras/pedidos/${nRegistro}`);
      if (res.ok) setSelectedOrder(await res.json());
    } catch (e) {
      console.error('Erro ao carregar detalhe do pedido:', e);
    } finally {
      setDrawerLoading(false);
    }
  };

  const contagem = useMemo(() => {
    const c = { ABERTO: 0, PARCIAL: 0, ATRASADO: 0, FECHADO: 0, ALL: orders.length };
    for (const o of orders) {
      const k = classeDe(o.cStatus);
      if (k === 'ABERTO' || k === 'PARCIAL' || k === 'ATRASADO' || k === 'FECHADO') c[k] += 1;
    }
    return c;
  }, [orders]);

  const visiveis = useMemo(
    () => (aba === 'ALL' ? orders : orders.filter((o) => classeDe(o.cStatus) === aba)),
    [orders, aba],
  );

  const sidebarItems: SidebarItem[] = [
    { id: 'ABERTO', label: 'Em aberto', icon: Clock, badge: contagem.ABERTO },
    { id: 'PARCIAL', label: 'Parcial', icon: PackageOpen, badge: contagem.PARCIAL },
    { id: 'ATRASADO', label: 'Atrasados', icon: AlertTriangle, badge: contagem.ATRASADO, badgeTone: 'amber' },
    { id: 'FECHADO', label: 'Concluídos', icon: CheckCircle2, badge: contagem.FECHADO },
    { id: 'ALL', label: 'Todos', icon: ClipboardList, badge: contagem.ALL },
  ];

  const badgeDe = (status: string | null) => {
    const b = BADGE[classeDe(status)];
    return <StatusBadge variante={b.variante}>{classeDe(status) === 'OUTRO' && status ? status : b.label}</StatusBadge>;
  };

  return (
    <AppLayout
      moduleTitle="Pedidos de Compra"
      moduleSubtitle="Compras"
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={aba}
      onTabChange={(id) => setAba(id as Aba)}
    >
      <div className="w-full max-w-none">
      <ReportHeader
        titulo="Pedidos de compra"
        subtitulo="Pedidos do ERP, com as notas recebidas de cada um."
        acoes={
          <>
            <BotaoAcao onClick={() => loadOrders(search)} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar
            </BotaoAcao>
          </>
        }
      />
      <FilterBar busca={search} onBusca={setSearch} placeholder="Buscar por nº do pedido, fornecedor ou item (código/descrição)..." />

      <TabelaPainel>
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Data</th>
            <th>Fornecedor</th>
            <th>Usuário</th>
            <th className="numeric-col">Valor</th>
            <th>Status</th>
            <th>Previsão</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={7} style={vazio}>Carregando pedidos de compra...</td></tr>
          )}
          {!loading && visiveis.length === 0 && (
            <tr><td colSpan={7} style={vazio}>Nenhum pedido encontrado.</td></tr>
          )}
          {!loading && visiveis.map((o) => (
            <tr key={o.nRegistro} style={{ cursor: 'pointer' }} onClick={() => handleOpenDetail(o.nRegistro)}>
              <td>
                <span className="product-code" style={{ fontWeight: 700 }}>#{o.nRegistro}</span>
                {o.itemEncontrado && (
                  <div style={{ marginTop: 2 }}>
                    <StatusBadge variante="apoio" title="Item do pedido que casou com a busca">contém {o.itemEncontrado}</StatusBadge>
                  </div>
                )}
              </td>
              <td>{fmtData(o.dPedido)}</td>
              <td style={{ fontWeight: 600 }}>{o.cNomeF || 'Não informado'}</td>
              <td>{o.cUsuario || '—'}</td>
              <td className="numeric-col">{fmtMoeda(o.nValor)}</td>
              <td>{badgeDe(o.cStatus)}</td>
              <td>{o.cPrevEntrega || fmtData(o.dPrevisao)}</td>
            </tr>
          ))}
        </tbody>
      </TabelaPainel>

      <Drawer
        isOpen={Boolean(selectedOrder || drawerLoading)}
        onClose={() => setSelectedOrder(null)}
        badge="Pedido de Compra"
        title={selectedOrder ? `Pedido #${selectedOrder.nRegistro}` : 'Carregando...'}
        subtitle={selectedOrder ? `${selectedOrder.cNomeF || 'Fornecedor não informado'} · ${fmtData(selectedOrder.dPedido)}` : undefined}
        size="xl"
        loading={drawerLoading}
        loadingText="Carregando detalhes do pedido..."
      >
        {selectedOrder && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: '0.78rem', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {badgeDe(selectedOrder.cStatus)}
              <span>Valor: <strong>{fmtMoeda(selectedOrder.nValor)}</strong></span>
              <span>Previsão: <strong>{selectedOrder.cPrevEntrega || fmtData(selectedOrder.dPrevisao)}</strong></span>
              <span>Prazo pgto: <strong>{selectedOrder.cPrazoPgto || '—'}</strong></span>
              <span>Usuário: <strong>{selectedOrder.cUsuario || '—'}</strong></span>
              {selectedOrder.cEmail && <span>{selectedOrder.cEmail}</span>}
            </p>

            {selectedOrder.mObservac && (
              <div className="panel-card" style={{ padding: '8px 12px', fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>
                <strong>Observações: </strong>{selectedOrder.mObservac}
              </div>
            )}

            <div>
              <h4 style={{ fontSize: '0.82rem', fontWeight: 800, marginBottom: 6 }}>Itens ({(selectedOrder.items ?? []).length})</h4>
              <TabelaPainel>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="numeric-col">Pedido</th>
                    <th className="numeric-col">Chegou</th>
                    <th className="numeric-col">Pendente</th>
                    <th className="numeric-col">Preço</th>
                    <th className="numeric-col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedOrder.items ?? []).length === 0 && (
                    <tr><td colSpan={6} style={vazio}>Nenhum item registrado neste pedido.</td></tr>
                  )}
                  {(selectedOrder.items ?? []).map((i) => (
                    <tr key={i.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{i.cDescricao || i.cReferencia}</div>
                        <span className="product-code" style={{ fontSize: '0.65rem' }}>{i.cReferencia}</span>
                      </td>
                      <td className="numeric-col">{fmtNum(i.nQtde)} {i.cUnidade ?? ''}</td>
                      <td className="numeric-col">{fmtNum(i.nChegou)}</td>
                      <td className="numeric-col" style={{ fontWeight: 700 }}>{fmtNum(Math.max(i.nQtde - i.nChegou, 0))}</td>
                      <td className="numeric-col">{fmtMoeda(i.nPreco)}</td>
                      <td className="numeric-col">{fmtMoeda(i.nValorTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </TabelaPainel>
            </div>

            {(() => {
              const porNota = new Map<string, { data: string | null; itens: string[] }>();
              for (const n of selectedOrder.notas ?? []) {
                const g = porNota.get(n.invoiceNumber) ?? { data: n.invoiceDate, itens: [] };
                if (!g.itens.includes(n.itemCode)) g.itens.push(n.itemCode);
                porNota.set(n.invoiceNumber, g);
              }
              return (
                <div>
                  <h4 style={{ fontSize: '0.82rem', fontWeight: 800, marginBottom: 6 }}>Notas recebidas ({porNota.size})</h4>
                  <TabelaPainel>
                    <thead>
                      <tr>
                        <th>Nota</th>
                        <th>Data</th>
                        <th>Itens recebidos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porNota.size === 0 && (
                        <tr><td colSpan={3} style={vazio}>Nenhuma nota registrada para este pedido.</td></tr>
                      )}
                      {[...porNota.entries()].map(([numero, g]) => (
                        <tr key={numero}>
                          <td><span className="product-code" style={{ fontWeight: 700 }}>NF {numero}</span></td>
                          <td>{fmtData(g.data)}</td>
                          <td><span className="product-code">{g.itens.join('  ')}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </TabelaPainel>
                  <p style={{ fontSize: '0.68rem', color: 'hsl(var(--text-secondary-hsl))', marginTop: 4 }}>
                    O pedido de cada nota é o que o ERP registrou no recebimento.
                  </p>
                </div>
              );
            })()}
          </div>
        )}
      </Drawer>
      </div>
    </AppLayout>
  );
}
