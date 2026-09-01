import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BookOpen,
  Boxes,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Cog,
  DollarSign,
  FileText,
  FolderOpen,
  FlaskConical,
  Globe,
  GraduationCap,
  Layers,
  Package,
  PackageCheck,
  PackageX,
  Palette,
  FileSpreadsheet,
  ShoppingCart,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  Thermometer,
  TrendingUp,
  Truck,
  Users,
  Wrench,
  Warehouse,
  Calculator,
  Printer,
} from 'lucide-react';
import type { AuthUser } from '../auth';
import { canAccessView } from '../modules/permissions';
import { moduleRegistry } from '../modules/registry';

/** Módulos exibidos na barra horizontal (exclui Sistema). */
export const TOP_NAV_GROUP_KEYS = [
  'compras',
  'producao',
  'estoque',
  'almoxarifado',
  'vendas',
  'qualidade',
  'expedicao',
  'administrativo',
  'financeiro',
  'ferramentas',
] as const;

export type TopNavGroupKey = (typeof TOP_NAV_GROUP_KEYS)[number];

export interface NavSubmodule {
  view: string;
  label: string;
  icon: LucideIcon;
  defaultOrder: number;
}

export interface NavModuleGroup {
  key: TopNavGroupKey | string;
  label: string;
  hubView: string;
  /** View única quando o módulo não tem submódulos distintos (ex.: vendas). */
  directView?: string;
  submodules: NavSubmodule[];
}

const SUBMODULE_ICONS: Record<string, LucideIcon> = {
  compras_materia_prima: Boxes,
  compras_embalagens: Layers,
  compras_coloracao: Palette,
  compras_apoio: Tag,
  compras_quotations: ShoppingCart,
  compras_online: Globe,
  compras_pedidos: ClipboardList,
  compras_notas: FileText,
  compras_simulation: Calculator,
  producao: Package,
  montagem_kits: Layers,
  microbiologia: FlaskConical,
  fisco_quimica: Activity,
  estoque_insumos: Boxes,
  estoque_produtos: Boxes,
  estoque_materia_prima: Boxes,
  estoque_embalagens: Layers,
  estoque_coloracao: Palette,
  estoque_apoio: Tag,
  estoque_ordens_manuais: ClipboardList,
  estoque_itens: Boxes,
  estoque_almoxarifado: Warehouse,
  estoque_supermercado: Store,
  estoque_pecas: Cog,
  estoque_equipamentos: Wrench,
  estoque_manutencoes: ClipboardList,
  compras_almoxarifado: Warehouse,
  admin_linha_produtos: CheckCircle2,
  admin_relatorios: FileSpreadsheet,
  admin_produtos_ativos_relatorios: FileSpreadsheet,
  admin_funcionarios: Users,
  estoque_ativos: CheckCircle2,
  vendas: TrendingUp,
  vendas_online: ShoppingBag,
  controle_qualidade: ClipboardCheck,
  qualidade_devolucoes: PackageX,
  qualidade_pops: BookOpen,
  qualidade_treinamentos: GraduationCap,
  qualidade_temperatura: Thermometer,
  qualidade_limpeza: Sparkles,
  qualidade_recebimento_mp: PackageCheck,
  qualidade_documentacao: FolderOpen,
  administrativo: Briefcase,
  expedicao_ecommerce: Globe,
  expedicao: Truck,
  financeiro: DollarSign,
  ferramentas: Wrench,
  ferramentas_etiquetas: Tag,
  ferramentas_editor: Palette,
  ferramentas_impressoras: Printer,
};

const DEPRECATED_HUB_VIEWS = new Set(['compras_hub', 'producao_hub', 'estoque_hub', 'almoxarifado_hub', 'vendas_hub', 'qualidade_hub', 'expedicao_hub', 'ferramentas_hub']);

export function isDeprecatedHubView(view: string): boolean {
  return DEPRECATED_HUB_VIEWS.has(view);
}

export function buildNavRegistry(): NavModuleGroup[] {
  return moduleRegistry()
    .filter((g) => TOP_NAV_GROUP_KEYS.includes(g.key as TopNavGroupKey))
    .map((group) => {
      const submodules: NavSubmodule[] = group.children.map((child, index) => ({
        view: child.key,
        label: child.label,
        icon: SUBMODULE_ICONS[child.key] ?? Boxes,
        defaultOrder: index,
      }));

      const singleChild = submodules.length === 1 && submodules[0].view === group.hubView;

      return {
        key: group.key,
        label: group.label,
        hubView: group.hubView,
        directView: singleChild ? submodules[0].view : undefined,
        submodules: singleChild ? [] : submodules,
      };
    });
}

export function getNavModuleGroups(user: AuthUser | null): NavModuleGroup[] {
  return buildNavRegistry().filter((group) => {
    if (group.directView) {
      return canAccessView(user, group.directView);
    }
    return group.submodules.some((s) => canAccessView(user, s.view));
  });
}

export function getAccessibleSubmodules(group: NavModuleGroup, user: AuthUser | null): NavSubmodule[] {
  if (group.directView) return [];
  return group.submodules.filter((s) => canAccessView(user, s.view));
}

const VIEW_TO_GROUP = (() => {
  const map = new Map<string, NavModuleGroup>();
  for (const group of buildNavRegistry()) {
    if (group.directView) {
      map.set(group.directView, group);
    }
    for (const sub of group.submodules) {
      map.set(sub.view, group);
    }
    map.set(group.hubView, group);
  }
  return map;
})();

export function getModuleGroupForView(view: string): NavModuleGroup | null {
  if (view === 'hub' || view === 'linha_produtos') return null;
  if (view === 'linha_produtos' || view === 'estoque_ativos') return VIEW_TO_GROUP.get('admin_linha_produtos') ?? null;
  return VIEW_TO_GROUP.get(view) ?? null;
}

export function isFlatModuleView(view: string): boolean {
  const group = getModuleGroupForView(view);
  return Boolean(group?.directView);
}

export function shouldShowNavColumn(view: string): boolean {
  if (
    view === 'hub' ||
    view === 'hub_settings' ||
    view === 'hub_supervisor' ||
    view === 'hub_feedbacks' ||
    view === 'mapa_arquitetura'
  ) {
    return false;
  }
  return getModuleGroupForView(view) !== null;
}

export function shouldShowSubmoduleNav(view: string, user: AuthUser | null): boolean {
  if (view === 'hub') return false;
  const group = getModuleGroupForView(view);
  if (!group || group.directView) return false;
  return getAccessibleSubmodules(group, user).length > 0;
}

export function sortSubmodulesByUsage(
  items: NavSubmodule[],
  usage: Record<string, number>
): NavSubmodule[] {
  return [...items].sort((a, b) => {
    const diff = (usage[b.view] ?? 0) - (usage[a.view] ?? 0);
    if (diff !== 0) return diff;
    return a.defaultOrder - b.defaultOrder;
  });
}

export function pickDefaultViewForGroup(
  group: NavModuleGroup,
  user: AuthUser | null,
  usage: Record<string, number>
): string | null {
  if (group.directView && canAccessView(user, group.directView)) {
    return group.directView;
  }
  const accessible = sortSubmodulesByUsage(getAccessibleSubmodules(group, user), usage);
  return accessible[0]?.view ?? null;
}

export function resolveDeprecatedHubView(
  view: string,
  user: AuthUser | null,
  usage: Record<string, number>
): string | null {
  if (!isDeprecatedHubView(view)) return null;
  const group = buildNavRegistry().find((g) => g.hubView === view);
  if (!group) return 'hub';
  return pickDefaultViewForGroup(group, user, usage) ?? 'hub';
}
