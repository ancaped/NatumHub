import type { AuthUser } from '../auth';
import { isSupervisor } from '../auth';
import { moduleRegistry } from './registry';

const ALL_KEYS = new Set(moduleRegistry().flatMap((g) => g.children.map((c) => c.key)));

function viewToModuleKey(view: string): string | null {
  if (view === 'hub') return null;
  if (view === 'estoque_hub' || view === 'almoxarifado_hub' || view === 'producao_hub' || view === 'compras_hub' || view === 'vendas_hub' || view === 'qualidade_hub' || view === 'expedicao_hub' || view === 'ferramentas_hub') return null;
  if (view === 'expedicao') return 'expedicao_ecommerce';
  if (view === 'linha_produtos' || view === 'estoque_ativos') return 'admin_linha_produtos';
  if (view === 'admin_linha_produtos') return 'admin_linha_produtos';
  if (view === 'compras_simulation') return 'compras_materia_prima';
  if (ALL_KEYS.has(view)) return view;
  return null;
}

function hubVisible(modules: string[], hubView: string): boolean {
  for (const group of moduleRegistry()) {
    if (group.hubView === hubView) {
      return group.children.some((c) => modules.includes(c.key));
    }
  }
  return false;
}

export function canAccessView(user: AuthUser | null, view: string): boolean {
  if (!user) return view === 'hub_settings';
  if (view === 'hub_supervisor' || view === 'mapa_arquitetura') return isSupervisor(user);
  if (isSupervisor(user)) return true;
  if (view === 'hub') return true;

  const modules = user.modules ?? [];
  if (view === 'estoque_insumos') {
    return modules.some((m) =>
      ['estoque_insumos', 'estoque_materia_prima', 'estoque_embalagens'].includes(m)
    );
  }
  if (view === 'estoque_produtos') {
    return modules.some((m) =>
      ['estoque_produtos', 'estoque_coloracao', 'estoque_apoio'].includes(m)
    );
  }

  if (view === 'estoque_equipamentos' || view === 'estoque_manutencoes') {
    return modules.includes('estoque_equipamentos') || modules.includes('estoque_manutencoes');
  }

  const key = viewToModuleKey(view);
  if (key) {
    if (key === 'expedicao_ecommerce') {
      return modules.some((m) => ['expedicao_ecommerce', 'expedicao'].includes(m));
    }
    if (key === 'expedicao_separacao') {
      return modules.some((m) =>
        ['expedicao_separacao', 'expedicao_ecommerce', 'expedicao'].includes(m)
      );
    }
    return modules.includes(key);
  }
  return hubVisible(modules, view);
}

export function getAccessibleModules(user: AuthUser | null): string[] {
  if (!user) return [];
  if (isSupervisor(user)) return Array.from(ALL_KEYS);
  return user.modules ?? [];
}

export function canEditView(user: AuthUser | null, view: string): boolean {
  if (!user) return false;
  if (isSupervisor(user)) return true;
  if (!canAccessView(user, view)) return false;
  const key = viewToModuleKey(view);
  if (!key) return true;
  return user.permissions?.[key] !== 'view';
}
