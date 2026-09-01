import React, { useCallback, useEffect, useState } from 'react';
import {
  Users, Plus, Loader2, Check, X, Shield, ChevronDown, ChevronUp, Save, UserX, Trash2,
  Eye, Edit3, Lock, Search, CheckCircle2,
} from 'lucide-react';
import {
  fetchOperatorsManage,
  createOperator,
  updateOperator,
  deleteOperator,
  isSupervisor,
  type AuthUser,
  type OperatorDetail,
} from '../lib/auth';
import { defaultModulesForRole, moduleRegistry, type ModuleGroup } from '../lib/modules/registry';
import { checkServerHealth } from '../lib/connectionConfig';

interface OperadoresPanelProps {
  currentUser: AuthUser | null;
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}

interface FormState {
  displayName: string;
  role: string;
  active: boolean;
  modules: string[];
  permissions: Record<string, 'view' | 'edit'>;
  password: string;
  passwordConfirm: string;
}

const EMPTY_FORM: FormState = {
  displayName: '',
  role: 'operador',
  active: true,
  modules: [],
  permissions: {},
  password: '',
  passwordConfirm: '',
};

export default function OperadoresPanel({
  currentUser,
  setMessage,
}: OperadoresPanelProps) {
  const [registry] = useState<ModuleGroup[]>(() => moduleRegistry());
  const [operators, setOperators] = useState<OperatorDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [moduleFilter, setModuleFilter] = useState('');
  
  const initDefaultForm = (): FormState => {
    const mods = defaultModulesForRole('operador');
    const perms: Record<string, 'view' | 'edit'> = {};
    for (const m of mods) perms[m] = 'edit';
    return {
      ...EMPTY_FORM,
      modules: mods,
      permissions: perms,
    };
  };

  const [newForm, setNewForm] = useState<FormState>(initDefaultForm);
  const [editForms, setEditForms] = useState<Record<string, FormState>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const health = await checkServerHealth();
      if (!health.ok) {
        throw new Error(health.error || 'Servidor master offline. Verifique a conexão em Configurações → Rede.');
      }
      const ops = await fetchOperatorsManage();
      setOperators(ops);
      const forms: Record<string, FormState> = {};
      for (const op of ops) {
        const perms: Record<string, 'view' | 'edit'> = {};
        for (const m of op.modules) {
          perms[m] = op.permissions?.[m] === 'view' ? 'view' : 'edit';
        }
        forms[op.id] = {
          displayName: op.displayName,
          role: op.role,
          active: op.active,
          modules: [...op.modules],
          permissions: perms,
          password: '',
          passwordConfirm: '',
        };
      }
      setEditForms(forms);
    } catch (e: any) {
      const msg = e?.message || 'Erro ao carregar usuários';
      setLoadError(msg);
      setMessage({ text: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [setMessage]);

  useEffect(() => {
    if (isSupervisor(currentUser)) load();
  }, [load, currentUser]);

  if (!isSupervisor(currentUser)) {
    return null;
  }

  const applyRoleTemplate = (form: FormState, role: string): FormState => {
    const mods = defaultModulesForRole(role);
    const perms: Record<string, 'view' | 'edit'> = {};
    for (const m of mods) {
      perms[m] = form.permissions[m] || 'edit';
    }
    return { ...form, role, modules: mods, permissions: perms };
  };

  const setModulePermission = (
    formKey: 'new' | string,
    moduleKey: string,
    level: 'none' | 'view' | 'edit'
  ) => {
    const updater = (prev: FormState): FormState => {
      if (level === 'none') {
        const newModules = prev.modules.filter((m) => m !== moduleKey);
        const newPerms = { ...prev.permissions };
        delete newPerms[moduleKey];
        return { ...prev, modules: newModules, permissions: newPerms };
      }
      const newModules = prev.modules.includes(moduleKey)
        ? prev.modules
        : [...prev.modules, moduleKey];
      return {
        ...prev,
        modules: newModules,
        permissions: { ...prev.permissions, [moduleKey]: level },
      };
    };

    if (formKey === 'new') {
      setNewForm(updater);
    } else {
      setEditForms((prev) => {
        const f = prev[formKey];
        if (!f) return prev;
        return { ...prev, [formKey]: updater(f) };
      });
    }
  };

  const setGroupPermission = (
    formKey: 'new' | string,
    group: ModuleGroup,
    level: 'none' | 'view' | 'edit'
  ) => {
    const keys = group.children.map((c) => c.key);
    const updater = (prev: FormState): FormState => {
      if (level === 'none') {
        const newModules = prev.modules.filter((m) => !keys.includes(m));
        const newPerms = { ...prev.permissions };
        for (const k of keys) delete newPerms[k];
        return { ...prev, modules: newModules, permissions: newPerms };
      }
      const moduleSet = new Set(prev.modules);
      const newPerms = { ...prev.permissions };
      for (const k of keys) {
        moduleSet.add(k);
        newPerms[k] = level;
      }
      return { ...prev, modules: Array.from(moduleSet), permissions: newPerms };
    };

    if (formKey === 'new') {
      setNewForm(updater);
    } else {
      setEditForms((prev) => {
        const f = prev[formKey];
        if (!f) return prev;
        return { ...prev, [formKey]: updater(f) };
      });
    }
  };

  const validatePasswordPair = (password: string, confirm: string, required: boolean, role?: string) => {
    if (!required && !password.trim()) return true;
    const minLen = role === 'supervisor' || role === 'admin' ? 8 : 4;
    if (password.length < minLen) {
      setMessage({
        text: `Senha deve ter no mínimo ${minLen} caracteres.`,
        type: 'error',
      });
      return false;
    }
    if (password !== confirm) {
      setMessage({ text: 'Senha e confirmação não conferem.', type: 'error' });
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    if (!newForm.displayName.trim()) {
      setMessage({ text: 'Informe o nome do usuário.', type: 'error' });
      return;
    }
    if (!validatePasswordPair(newForm.password, newForm.passwordConfirm, true, newForm.role)) return;
    setSaving(true);
    try {
      await createOperator({
        displayName: newForm.displayName,
        role: newForm.role,
        modules: newForm.modules,
        permissions: newForm.permissions,
        updateChannel: 'stable',
        password: newForm.password,
      });
      setMessage({ text: 'Usuário criado com sucesso.', type: 'success' });
      setShowNewForm(false);
      setNewForm(initDefaultForm());
      await load();
    } catch (e: any) {
      setMessage({ text: e?.message || 'Erro ao criar usuário', type: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleSave = async (id: string) => {
    const form = editForms[id];
    if (!form?.displayName.trim()) {
      setMessage({ text: 'Nome é obrigatório.', type: 'error' });
      return;
    }
    const changingPassword = Boolean(form.password.trim());
    if (!validatePasswordPair(form.password, form.passwordConfirm, changingPassword, form.role)) return;
    setSaving(true);
    try {
      await updateOperator(id, {
        displayName: form.displayName,
        role: form.role,
        active: form.active,
        modules: form.modules,
        permissions: form.permissions,
        updateChannel: 'stable',
        password: changingPassword ? form.password : undefined,
      });
      setMessage({
        text: changingPassword
          ? 'Usuário atualizado. Senha alterada com sucesso.'
          : 'Usuário atualizado.',
        type: 'success',
      });
      await load();
    } catch (e: any) {
      setMessage({ text: e?.message || 'Erro ao salvar usuário', type: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleDelete = async (op: OperatorDetail) => {
    if (currentUser?.id === op.id) {
      setMessage({ text: 'Você não pode excluir sua própria conta.', type: 'error' });
      return;
    }
    const ok = window.confirm(
      `Excluir permanentemente o usuário "${op.displayName}"?\nSessões ativas serão encerradas. Esta ação não pode ser desfeita.`
    );
    if (!ok) return;
    setSaving(true);
    try {
      await deleteOperator(op.id);
      setMessage({ text: 'Usuário excluído.', type: 'success' });
      if (expandedId === op.id) setExpandedId(null);
      await load();
    } catch (e: any) {
      setMessage({ text: e?.message || 'Erro ao excluir usuário', type: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const renderModuleTree = (
    form: FormState,
    formKey: 'new' | string,
    onRoleChange: (role: string) => void
  ) => {
    const filterLower = moduleFilter.toLowerCase().trim();

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Nome de usuário</label>
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => {
                if (formKey === 'new') {
                  setNewForm((p) => ({ ...p, displayName: e.target.value }));
                } else {
                  setEditForms((p) => ({
                    ...p,
                    [formKey]: { ...p[formKey], displayName: e.target.value },
                  }));
                }
              }}
              placeholder="Ex: João Silva"
              className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm bg-zinc-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all font-medium"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Perfil Base</label>
            {form.role === 'supervisor' || form.role === 'admin' ? (
              <div className="mt-1 w-full border border-violet-200 rounded-xl px-3 py-2 text-sm bg-violet-50 text-violet-900 font-bold flex items-center justify-between">
                <span>Supervisor Master</span>
                <Shield className="h-4 w-4 text-violet-600" />
              </div>
            ) : (
              <select
                value={form.role}
                onChange={(e) => {
                  const role = e.target.value;
                  if (formKey === 'new') {
                    setNewForm((p) => applyRoleTemplate(p, role));
                  } else {
                    setEditForms((p) => ({
                      ...p,
                      [formKey]: applyRoleTemplate(p[formKey], role),
                    }));
                  }
                  onRoleChange(role);
                }}
                className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm bg-zinc-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all font-medium cursor-pointer"
              >
                <option value="estoque">Estoque (Almoxarifado & Insumos)</option>
                <option value="producao">Produção & Lotes</option>
                <option value="micro">Microbiologia & Laudos</option>
                <option value="fisco">Físico-Química</option>
                <option value="compras">Compras & Cotações</option>
                <option value="financeiro">Financeiro</option>
                <option value="vendas">Vendas & Expedição</option>
                <option value="operador">Operador (Customizado)</option>
              </select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              {formKey === 'new' ? 'Senha inicial' : 'Nova senha (opcional)'}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => {
                const password = e.target.value;
                if (formKey === 'new') {
                  setNewForm((p) => ({ ...p, password }));
                } else {
                  setEditForms((p) => ({
                    ...p,
                    [formKey]: { ...p[formKey], password },
                  }));
                }
              }}
              placeholder={
                form.role === 'supervisor' || form.role === 'admin'
                  ? (formKey === 'new' ? 'Mín. 8 caracteres' : 'Mín. 8 — vazio mantém')
                  : (formKey === 'new' ? 'Mín. 4 caracteres' : 'Deixe vazio para manter')
              }
              className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm bg-zinc-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              Confirmar senha
            </label>
            <input
              type="password"
              value={form.passwordConfirm}
              onChange={(e) => {
                const passwordConfirm = e.target.value;
                if (formKey === 'new') {
                  setNewForm((p) => ({ ...p, passwordConfirm }));
                } else {
                  setEditForms((p) => ({
                    ...p,
                    [formKey]: { ...p[formKey], passwordConfirm },
                  }));
                }
              }}
              placeholder="Repita a senha"
              className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm bg-zinc-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
            />
          </div>
        </div>

        {formKey !== 'new' && (
          <label className="flex items-center gap-2 text-sm font-bold text-zinc-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={form.active}
              disabled={currentUser?.id === formKey}
              onChange={(e) =>
                setEditForms((p) => ({
                  ...p,
                  [formKey]: { ...p[formKey], active: e.target.checked },
                }))
              }
              className="rounded border-zinc-300 text-violet-600 focus:ring-violet-500 h-4 w-4"
            />
            <span>Usuário ativo (pode fazer login no sistema)</span>
            {currentUser?.id === formKey && (
              <span className="text-xs text-zinc-400 font-normal ml-1">— não pode desativar a própria conta</span>
            )}
          </label>
        )}

        {/* Níveis de Permissão por Módulo */}
        <div className="pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
            <div>
              <p className="text-[11px] font-black text-zinc-800 uppercase tracking-wider">
                Permissões de Acesso por Módulo
              </p>
              <p className="text-[10px] text-zinc-500">
                Defina se o usuário não acessa, apenas visualiza (leitura) ou pode alterar dados.
              </p>
            </div>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                placeholder="Filtrar módulos..."
                className="pl-8 pr-3 py-1 text-xs border border-zinc-200 rounded-lg bg-zinc-50 focus:bg-white focus:outline-none focus:border-violet-500 w-full sm:w-44"
              />
            </div>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto border border-zinc-200/80 rounded-2xl p-4 bg-zinc-50/50 shadow-inner">
            {registry.map((group) => {
              const visibleChildren = group.children.filter((leaf) =>
                !filterLower ||
                leaf.label.toLowerCase().includes(filterLower) ||
                group.label.toLowerCase().includes(filterLower)
              );

              if (visibleChildren.length === 0) return null;

              return (
                <div key={group.key} className="bg-white border border-zinc-200/70 rounded-xl p-3 shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                    <span className="text-xs font-black text-zinc-800 uppercase tracking-wider">
                      {group.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setGroupPermission(formKey, group, 'none')}
                        className="text-[10px] font-bold text-zinc-400 hover:text-zinc-700 px-1.5 py-0.5 rounded hover:bg-zinc-100 transition-colors cursor-pointer"
                      >
                        Nenhum
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupPermission(formKey, group, 'view')}
                        className="text-[10px] font-bold text-sky-600 hover:text-sky-800 px-1.5 py-0.5 rounded hover:bg-sky-50 transition-colors cursor-pointer flex items-center gap-0.5"
                      >
                        <Eye className="h-3 w-3" /> Ver Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupPermission(formKey, group, 'edit')}
                        className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 px-1.5 py-0.5 rounded hover:bg-emerald-50 transition-colors cursor-pointer flex items-center gap-0.5"
                      >
                        <Edit3 className="h-3 w-3" /> Alterar Todos
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {visibleChildren.map((leaf) => {
                      const hasModule = form.modules.includes(leaf.key);
                      const currentLevel: 'none' | 'view' | 'edit' = !hasModule
                        ? 'none'
                        : form.permissions[leaf.key] === 'view'
                        ? 'view'
                        : 'edit';

                      return (
                        <div
                          key={leaf.key}
                          className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                            currentLevel === 'edit'
                              ? 'bg-emerald-50/40 border-emerald-200/80 text-emerald-950'
                              : currentLevel === 'view'
                              ? 'bg-sky-50/40 border-sky-200/80 text-sky-950'
                              : 'bg-zinc-50 border-zinc-150 text-zinc-500 opacity-80 hover:opacity-100'
                          }`}
                        >
                          <span className="text-xs font-semibold truncate pr-2" title={leaf.label}>
                            {leaf.label}
                          </span>

                          <div className="flex items-center bg-white border border-zinc-200 rounded-lg p-0.5 shadow-2xs shrink-0">
                            <button
                              type="button"
                              onClick={() => setModulePermission(formKey, leaf.key, 'none')}
                              title="Sem acesso (bloqueado)"
                              className={`px-1.5 py-0.5 text-[10px] font-bold rounded flex items-center gap-1 transition-colors cursor-pointer ${
                                currentLevel === 'none'
                                  ? 'bg-zinc-200 text-zinc-800 shadow-2xs'
                                  : 'text-zinc-400 hover:text-zinc-700'
                              }`}
                            >
                              <Lock className="h-2.5 w-2.5" />
                              <span>Off</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setModulePermission(formKey, leaf.key, 'view')}
                              title="Apenas Visualizar (leitura)"
                              className={`px-1.5 py-0.5 text-[10px] font-bold rounded flex items-center gap-1 transition-colors cursor-pointer ${
                                currentLevel === 'view'
                                  ? 'bg-sky-500 text-white shadow-2xs'
                                  : 'text-zinc-500 hover:text-sky-700'
                              }`}
                            >
                              <Eye className="h-2.5 w-2.5" />
                              <span>Ver</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setModulePermission(formKey, leaf.key, 'edit')}
                              title="Visualizar e Alterar (completo)"
                              className={`px-1.5 py-0.5 text-[10px] font-bold rounded flex items-center gap-1 transition-colors cursor-pointer ${
                                currentLevel === 'edit'
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'text-zinc-500 hover:text-emerald-700'
                              }`}
                            >
                              <Edit3 className="h-2.5 w-2.5" />
                              <span>Alterar</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-150 pb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-50 text-violet-600 rounded-xl">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-sm tracking-tight text-zinc-900">Gestão de Usuários</h3>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              Controle de usuários · permissões de visualização e alteração por módulo
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-xs cursor-pointer active:scale-98"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo Usuário
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-zinc-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
          <span className="text-sm font-medium">Carregando usuários do sistema...</span>
        </div>
      ) : loadError ? (
        <div className="text-center py-6 space-y-3">
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 font-medium">{loadError}</p>
          <button
            onClick={load}
            className="text-xs font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 px-4 py-2 rounded-xl cursor-pointer transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {showNewForm && (
            <div className="border-2 border-violet-300 bg-violet-50/20 rounded-2xl p-5 space-y-4 shadow-sm animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-violet-100 pb-3">
                <p className="text-xs font-black text-violet-900 flex items-center gap-1.5 uppercase tracking-wider">
                  <Shield className="h-4 w-4 text-violet-600" /> Cadastrar Novo Usuário
                </p>
                <button
                  onClick={() => setShowNewForm(false)}
                  className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {renderModuleTree(newForm, 'new', () => {})}
              <div className="flex gap-2 justify-end pt-2 border-t border-violet-100">
                <button
                  onClick={() => setShowNewForm(false)}
                  className="text-xs font-bold text-zinc-600 px-4 py-2 rounded-xl hover:bg-zinc-100 cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-5 py-2 rounded-xl disabled:opacity-50 cursor-pointer shadow-xs transition-all active:scale-98"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Cadastrar Usuário
                </button>
              </div>
            </div>
          )}

          {operators.map((op) => {
            const form = editForms[op.id];
            const isExpanded = expandedId === op.id;
            const isSelf = currentUser?.id === op.id;

            // Estatísticas rápidas de permissões do usuário
            const totalModules = op.modules.length;
            const viewCount = op.modules.filter((m) => op.permissions?.[m] === 'view').length;
            const editCount = totalModules - viewCount;

            return (
              <div
                key={op.id}
                className={`border rounded-2xl overflow-hidden transition-all duration-200 ${
                  op.active ? 'border-zinc-200/90 bg-white hover:border-zinc-300 shadow-xs' : 'border-zinc-200 bg-zinc-50/80 opacity-75'
                }`}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : op.id)}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-zinc-50/60 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center text-xs font-black uppercase shadow-2xs ${
                      op.role === 'supervisor' || op.role === 'admin'
                        ? 'bg-violet-600 text-white'
                        : op.active
                        ? 'bg-zinc-900 text-white'
                        : 'bg-zinc-300 text-zinc-600'
                    }`}>
                      {op.displayName.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-zinc-900 truncate">
                          {op.displayName}
                        </p>
                        {isSelf && (
                          <span className="text-[10px] font-bold bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded-md">
                            Você
                          </span>
                        )}
                        {op.role === 'supervisor' && (
                          <span className="text-[10px] font-black bg-violet-100 text-violet-800 px-1.5 py-0.5 rounded-md">
                            Supervisor
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500">
                        <span className="font-semibold capitalize">{op.role}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1 font-medium">
                          <span>{totalModules} módulo(s)</span>
                          {totalModules > 0 && (
                            <span className="text-[10px] text-zinc-400">
                              ({editCount} alterar · {viewCount} ver)
                            </span>
                          )}
                        </span>
                        {!op.hasPassword && <span className="text-rose-600 font-bold">· SEM SENHA</span>}
                        {!op.active && <span className="text-amber-700 font-bold">· INATIVO</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-400">
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </div>
                </button>

                {isExpanded && form && (
                  <div className="px-5 pb-5 border-t border-zinc-150 pt-4 space-y-4 bg-zinc-50/30">
                    {renderModuleTree(form, op.id, () => {})}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-150 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleDelete(op)}
                        disabled={saving || isSelf}
                        className="flex items-center gap-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold px-4 py-2 rounded-xl disabled:opacity-40 cursor-pointer transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir Usuário
                      </button>
                      <button
                        onClick={() => handleSave(op.id)}
                        disabled={saving}
                        className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold px-5 py-2.5 rounded-xl disabled:opacity-50 cursor-pointer shadow-xs transition-all active:scale-98"
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Salvar Alterações
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {operators.length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-6">Nenhum usuário cadastrado.</p>
          )}

          <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl text-[11px] text-zinc-500 flex items-start gap-2 mt-4">
            <UserX className="h-4 w-4 shrink-0 text-zinc-400 mt-0.5" />
            <p className="leading-relaxed">
              Usuários cadastrados acessam o sistema com nome e senha. Módulos com permissão <strong>Ver</strong> abrem apenas para leitura e relatórios, bloqueando alterações. Desativar encerra sessões abertas imediatamente.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
