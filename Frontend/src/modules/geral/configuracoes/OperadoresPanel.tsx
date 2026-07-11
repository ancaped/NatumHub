import React, { useCallback, useEffect, useState } from 'react';
import {
  Users, Plus, Loader2, Check, X, Shield, ChevronDown, ChevronUp, Save, UserX,
} from 'lucide-react';
import {
  fetchOperatorsManage,
  createOperator,
  updateOperator,
  isSupervisor,
  type AuthUser,
  type OperatorDetail,
  type UpdateChannel,
} from '../lib/auth';
import { UPDATE_CHANNEL_LABELS } from '../lib/updateChannel';
import { defaultModulesForRole, moduleRegistry, type ModuleGroup } from '../lib/modules/registry';
import { checkServerHealth } from '../lib/connectionConfig';

interface OperadoresPanelProps {
  currentUser: AuthUser | null;
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
  /** Canais de update ficam só no painel administrador */
  includeUpdateChannel?: boolean;
}

interface FormState {
  displayName: string;
  role: string;
  active: boolean;
  modules: string[];
  updateChannel: UpdateChannel;
  password: string;
  passwordConfirm: string;
}

const EMPTY_FORM: FormState = {
  displayName: '',
  role: 'operador',
  active: true,
  modules: [],
  updateChannel: 'stable',
  password: '',
  passwordConfirm: '',
};

function defaultChannelForRole(role: string): UpdateChannel {
  return role === 'supervisor' || role === 'admin' ? 'alpha' : 'stable';
}

function applyChannelForRole(form: FormState, role: string): FormState {
  const next = { ...form, role };
  if (form.updateChannel === 'alpha' && role !== 'supervisor' && role !== 'admin') {
    next.updateChannel = 'stable';
  } else if ((role === 'supervisor' || role === 'admin') && form.updateChannel === 'stable') {
    next.updateChannel = 'alpha';
  }
  return next;
}

export default function OperadoresPanel({
  currentUser,
  setMessage,
  includeUpdateChannel = false,
}: OperadoresPanelProps) {
  const [registry] = useState<ModuleGroup[]>(() => moduleRegistry());
  const [operators, setOperators] = useState<OperatorDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState<FormState>({
    ...EMPTY_FORM,
    modules: defaultModulesForRole('operador'),
    updateChannel: 'stable',
  });
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
        forms[op.id] = {
          displayName: op.displayName,
          role: op.role,
          active: op.active,
          modules: [...op.modules],
          updateChannel: op.updateChannel,
          password: '',
          passwordConfirm: '',
        };
      }
      setEditForms(forms);
    } catch (e: any) {
      const msg = e?.message || 'Erro ao carregar operadores';
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

  const applyRoleTemplate = (form: FormState, role: string): FormState =>
    applyChannelForRole(
      { ...form, role, modules: defaultModulesForRole(role) },
      role
    );

  const toggleModule = (formKey: 'new' | string, moduleKey: string) => {
    if (formKey === 'new') {
      setNewForm((prev) => {
        const has = prev.modules.includes(moduleKey);
        return {
          ...prev,
          modules: has
            ? prev.modules.filter((m) => m !== moduleKey)
            : [...prev.modules, moduleKey],
        };
      });
    } else {
      setEditForms((prev) => {
        const form = prev[formKey];
        if (!form) return prev;
        const has = form.modules.includes(moduleKey);
        return {
          ...prev,
          [formKey]: {
            ...form,
            modules: has
              ? form.modules.filter((m) => m !== moduleKey)
              : [...form.modules, moduleKey],
          },
        };
      });
    }
  };

  const validatePasswordPair = (password: string, confirm: string, required: boolean) => {
    if (!required && !password.trim()) return true;
    if (required && password.length < 4) {
      setMessage({ text: 'Senha deve ter no mínimo 4 caracteres.', type: 'error' });
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
      setMessage({ text: 'Informe o nome do operador.', type: 'error' });
      return;
    }
    if (!validatePasswordPair(newForm.password, newForm.passwordConfirm, true)) return;
    setSaving(true);
    try {
      await createOperator({
        displayName: newForm.displayName,
        role: newForm.role,
        modules: newForm.modules,
        updateChannel: includeUpdateChannel ? newForm.updateChannel : 'stable',
        password: newForm.password,
      });
      setMessage({ text: 'Operador criado com sucesso.', type: 'success' });
      setShowNewForm(false);
      setNewForm({
        ...EMPTY_FORM,
        modules: defaultModulesForRole('operador'),
        updateChannel: 'stable',
      });
      await load();
    } catch (e: any) {
      setMessage({ text: e?.message || 'Erro ao criar operador', type: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleSave = async (id: string) => {
    const form = editForms[id];
    const op = operators.find((o) => o.id === id);
    if (!form?.displayName.trim()) {
      setMessage({ text: 'Nome é obrigatório.', type: 'error' });
      return;
    }
    const changingPassword = Boolean(form.password.trim());
    if (!validatePasswordPair(form.password, form.passwordConfirm, changingPassword)) return;
    setSaving(true);
    try {
      await updateOperator(id, {
        displayName: form.displayName,
        role: form.role,
        active: form.active,
        modules: form.modules,
        updateChannel: includeUpdateChannel ? form.updateChannel : (op?.updateChannel ?? 'stable'),
        password: changingPassword ? form.password : undefined,
      });
      setMessage({ text: 'Operador atualizado.', type: 'success' });
      await load();
    } catch (e: any) {
      setMessage({ text: e?.message || 'Erro ao salvar', type: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const renderModuleCheckboxes = (
    form: FormState,
    formKey: 'new' | string,
    onRoleChange: (role: string) => void
  ) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Nome</label>
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
            className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm bg-zinc-50"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Perfil base</label>
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
            className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm bg-zinc-50"
          >
            <option value="estoque">Estoque</option>
            <option value="producao">Produção</option>
            <option value="micro">Microbiologia</option>
            <option value="fisco">Físico-Química</option>
            <option value="compras">Compras</option>
            <option value="financeiro">Financeiro</option>
            <option value="vendas">Vendas</option>
            <option value="operador">Operador (customizado)</option>
          </select>
        </div>
      </div>

      {includeUpdateChannel && (
      <div>
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
          Canal de atualização
        </label>
        <select
          value={form.updateChannel}
          onChange={(e) => {
            const updateChannel = e.target.value as UpdateChannel;
            if (formKey === 'new') {
              setNewForm((p) => ({ ...p, updateChannel }));
            } else {
              setEditForms((p) => ({
                ...p,
                [formKey]: { ...p[formKey], updateChannel },
              }));
            }
          }}
          className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm bg-zinc-50"
        >
          <option value="stable">{UPDATE_CHANNEL_LABELS.stable}</option>
          <option value="beta">{UPDATE_CHANNEL_LABELS.beta}</option>
          <option value="alpha" disabled={form.role !== 'supervisor' && form.role !== 'admin'}>
            {UPDATE_CHANNEL_LABELS.alpha}
            {form.role !== 'supervisor' && form.role !== 'admin' ? ' (só supervisor)' : ''}
          </option>
        </select>
      </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
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
          placeholder={formKey === 'new' ? 'Mín. 4 caracteres' : 'Deixe vazio para manter'}
          className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm bg-zinc-50"
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
          className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm bg-zinc-50"
        />
      </div>
      </div>

      {formKey !== 'new' && (
        <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 cursor-pointer">
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
            className="rounded border-zinc-300"
          />
          Operador ativo (pode fazer login)
          {currentUser?.id === formKey && (
            <span className="text-xs text-zinc-400 font-normal">— não pode desativar a si mesmo</span>
          )}
        </label>
      )}

      <div>
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
          Módulos permitidos
        </p>
        <div className="space-y-3 max-h-64 overflow-y-auto border border-zinc-100 rounded-xl p-3 bg-zinc-50/50">
          {registry.map((group) => (
            <div key={group.key}>
              <p className="text-xs font-bold text-zinc-700 mb-1.5">{group.label}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {group.children.map((leaf) => (
                  <label
                    key={leaf.key}
                    className="flex items-center gap-2 text-xs text-zinc-600 cursor-pointer hover:text-zinc-900"
                  >
                    <input
                      type="checkbox"
                      checked={form.modules.includes(leaf.key)}
                      onChange={() => toggleModule(formKey, leaf.key)}
                      className="rounded border-zinc-300"
                    />
                    {leaf.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-150 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-50 text-violet-600 rounded-xl">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-sm tracking-tight">Gestão de Operadores</h3>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              Até 5 usuários · permissões por módulo
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="flex items-center gap-1.5 bg-zinc-900 text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo operador
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-zinc-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando operadores...</span>
        </div>
      ) : loadError ? (
        <div className="text-center py-6 space-y-3">
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">{loadError}</p>
          <button
            onClick={load}
            className="text-xs font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 px-4 py-2 rounded-xl cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {showNewForm && (
            <div className="border border-violet-200 bg-violet-50/30 rounded-xl p-4 space-y-4">
              <p className="text-xs font-bold text-violet-800 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Novo operador
              </p>
              {renderModuleCheckboxes(newForm, 'new', () => {})}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowNewForm(false)}
                  className="text-xs font-bold text-zinc-500 px-3 py-2 rounded-lg hover:bg-zinc-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-violet-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Criar
                </button>
              </div>
            </div>
          )}

          {operators.map((op) => {
            const form = editForms[op.id];
            const isExpanded = expandedId === op.id;
            const isSelf = currentUser?.id === op.id;

            return (
              <div
                key={op.id}
                className={`border rounded-xl overflow-hidden transition-colors ${
                  op.active ? 'border-zinc-200 bg-white' : 'border-zinc-150 bg-zinc-50 opacity-75'
                }`}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : op.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-50 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold uppercase ${
                      op.active ? 'bg-zinc-900 text-white' : 'bg-zinc-200 text-zinc-500'
                    }`}>
                      {op.displayName.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-zinc-900 truncate">
                        {op.displayName}
                        {isSelf && <span className="text-zinc-400 font-normal ml-1">(você)</span>}
                      </p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                        {op.role} · {op.modules.length} módulo(s)
                        {includeUpdateChannel ? ` · ${UPDATE_CHANNEL_LABELS[op.updateChannel]}` : ''}
                        {op.hasPassword ? '' : ' · SEM SENHA'}
                        {!op.active && ' · INATIVO'}
                      </p>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-zinc-400 shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
                  )}
                </button>

                {isExpanded && form && (
                  <div className="px-4 pb-4 border-t border-zinc-100 pt-4 space-y-4">
                    {renderModuleCheckboxes(form, op.id, () => {})}
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleSave(op.id)}
                        disabled={saving}
                        className="flex items-center gap-1.5 bg-zinc-900 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Salvar alterações
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {operators.length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-4">Nenhum operador cadastrado.</p>
          )}

          <p className="text-[10px] text-zinc-400 flex items-start gap-1.5 pt-2">
            <UserX className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Operadores só conseguem entrar se estiverem cadastrados aqui. Desativar encerra sessões ativas.
          </p>
        </div>
      )}
    </div>
  );
}
