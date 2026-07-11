/** Títulos legíveis por view — usado no Header e no contexto do FeedbackWidget. */
export function getModuleTitle(view: string): string {
  switch (view) {
    case 'hub':
      return '';
    case 'producao_hub':
      return 'Produção';
    case 'producao':
      return 'Produção > Gerenciamento';
    case 'microbiologia':
      return 'Produção > Microbiologia';
    case 'fisco_quimica':
      return 'Produção > Físico-Química';
    case 'montagem_kits':
      return 'Produção > Montagem de Kits';
    case 'compras_hub':
      return 'Compras';
    case 'compras':
      return 'Compras > Planejamento';
    case 'compras_materia_prima':
      return 'Compras > Matéria-Prima';
    case 'compras_embalagens':
      return 'Compras > Embalagens';
    case 'compras_coloracao':
      return 'Compras > Coloração';
    case 'compras_apoio':
      return 'Compras > Material de Apoio';
    case 'compras_quotations':
      return 'Compras > Cotações';
    case 'compras_online':
      return 'Compras > Compras Online';
    case 'compras_pedidos':
      return 'Compras > Pedidos';
    case 'compras_notas':
      return 'Compras > Notas Fiscais';
    case 'estoque_hub':
      return 'Estoque';
    case 'estoque_insumos':
      return 'Estoque > Insumos';
    case 'estoque_produtos':
      return 'Estoque > Produtos';
    case 'estoque_ativos':
      return 'Estoque > Linha de Produtos';
    case 'vendas':
      return 'Vendas';
    case 'linha_produtos':
      return 'Estoque > Linhas';
    case 'financeiro':
      return 'Financeiro';
    case 'hub_settings':
      return 'Configurações Gerais';
    case 'hub_feedbacks':
      return 'Gestão de Feedbacks';
    default:
      return '';
  }
}

/** View id usado no App.tsx por mode do ComprasView. */
export const COMPRAS_MODE_VIEW: Record<string, string> = {
  all: 'compras',
  materia_prima: 'compras_materia_prima',
  embalagens: 'compras_embalagens',
  coloracao: 'compras_coloracao',
  apoio: 'compras_apoio',
  quotations: 'compras_quotations',
};

/** Atualiza __current_page__ ao trocar de view (evita tab obsoleta de módulo anterior). */
export function syncCurrentPageForView(view: string, tabLabel?: string): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __current_page__?: string };
  const base = getModuleTitle(view);
  if (tabLabel && base) {
    w.__current_page__ = base.includes(tabLabel) ? base : `${base} > ${tabLabel}`;
  } else if (base) {
    w.__current_page__ = base;
  } else {
    w.__current_page__ = view === 'hub' ? '' : tabLabel || '';
  }
}

/** Monta o caminho Geral > Módulo > Aba para envio de feedback. */
export function buildFeedbackPagePath(currentView?: string): string {
  const title = getModuleTitle(currentView || 'hub');
  const tab =
    typeof window !== 'undefined'
      ? ((window as unknown as { __current_page__?: string }).__current_page__ || '')
      : '';

  if (tab && title && tab.startsWith(title)) return tab;
  if (tab && !title && tab.includes('>')) return tab;
  if (title && tab && !title.includes(tab)) return `${title} > ${tab}`;
  if (title) return title;
  if (tab) return tab.includes('>') ? tab : `Geral > ${tab}`;
  return 'Geral';
}

/** Separa módulo e subpágina para o formulário do widget. */
export function splitFeedbackPagePath(path: string): { module: string; subPage: string } {
  const parts = path.split(' > ').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { module: 'Geral', subPage: '' };
  if (parts.length === 1) return { module: parts[0], subPage: '' };
  return { module: parts[0], subPage: parts.slice(1).join(' > ') };
}
