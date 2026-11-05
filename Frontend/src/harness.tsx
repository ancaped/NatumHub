import { createRoot } from 'react-dom/client';
import './index.css';
import EtiquetasView from './modules/ferramentas/etiquetas/EtiquetasView';
import ImpressorasView from './modules/ferramentas/impressoras/ImpressorasView';
import RelatoriosView from './modules/ferramentas/relatorios/RelatoriosView';
import BalancaView from './modules/ferramentas/balanca/BalancaView';

const lote = (i: number) => ({ lote: `0${i}1125`, codigo: `PA00${i}`, descricao: `Shampoo Hidratante Natum ${i} 300ml`, quantidade: 120 + i, quantidade_estimada: i % 2 === 0, data_producao: '2026-11-04', quantidade_caixa: 24, codigo_barras: '7890000000017', caixas: 5, etiquetas_sugeridas: 6, etiquetas_impressas: i % 3, ultima_impressao: null, status: i % 3 ? 'impresso' : 'pendente' });
const impressora = { id: 1, name: 'Zebra GC420t', connection_type: 'windows_lpd', is_default: true, status: 'online', raw_protocol: 'zpl', dpi: 203 };
const orig = window.fetch;
window.fetch = (async (url: any, init?: any) => {
  const u = String(url);
  if (!u.includes('/api/')) return orig(url, init);
  let body: any = [];
  if (/etiquetas\/(lotes|kits|coloracoes)/.test(u)) body = Array.from({ length: 8 }, (_, i) => lote(i + 1));
  else if (/impressoras\/jobs/.test(u)) body = { data: [] };
  else if (/impressoras/.test(u)) body = { data: [impressora] };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as any;

const v = new URLSearchParams(location.search).get('v') || 'etiquetas';
const nop = () => {};
const V: any = { etiquetas: <EtiquetasView onBackToHub={nop} onNavigateToEditor={nop} />, impressoras: <ImpressorasView onBackToHub={nop} />, relatorios: <RelatoriosView onBackToHub={nop} />, balanca: <BalancaView onBackToHub={nop} /> };
createRoot(document.getElementById('root')!).render(V[v]);
