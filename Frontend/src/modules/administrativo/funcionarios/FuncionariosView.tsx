import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, RefreshCw, Search, Users, X, Circle,
  FileText, Shield, Calendar, Phone, Mail, MapPin, CheckCircle2,
} from 'lucide-react';
import { apiJson } from '../../geral/lib/http';
import { cn } from '../../geral/lib/utils';

export interface Funcionario {
  operatorId: string;
  displayName: string;
  role: string;
  active: boolean;
  fullName: string;
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  hireDate?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  addressNeighborhood?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
  notes?: string | null;
  updatedAt?: string | null;
  lastSessionAt?: string | null;
  sessionActive: boolean;
  modules: string[];
}

interface ActivityEvent {
  id: string;
  createdAt: string;
  action: string;
  summary: string;
  moduleKey?: string | null;
  requestPath?: string | null;
}

interface ProfileForm {
  fullName: string;
  cpf: string;
  phone: string;
  email: string;
  birthDate: string;
  hireDate: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  notes: string;
}

function toForm(f: Funcionario): ProfileForm {
  return {
    fullName: f.fullName || '',
    cpf: f.cpf || '',
    phone: f.phone || '',
    email: f.email || '',
    birthDate: f.birthDate || '',
    hireDate: f.hireDate || '',
    addressStreet: f.addressStreet || '',
    addressNumber: f.addressNumber || '',
    addressComplement: f.addressComplement || '',
    addressNeighborhood: f.addressNeighborhood || '',
    addressCity: f.addressCity || '',
    addressState: f.addressState || '',
    addressZip: f.addressZip || '',
    notes: f.notes || '',
  };
}

function Field({
  label, value, onChange, type = 'text', className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <label className={cn('block space-y-1', className)}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-900"
      />
    </label>
  );
}

interface Props {
  onBackToHub: () => void;
}

export default function FuncionariosView({ onBackToHub }: Props) {
  const [rows, setRows] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Funcionario | null>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<Funcionario[]>('/administrativo/funcionarios');
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar funcionários');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openDrawer = async (f: Funcionario) => {
    setSelected(f);
    setForm(toForm(f));
    setActivity([]);
    try {
      const ev = await apiJson<ActivityEvent[]>(
        `/administrativo/funcionarios/${encodeURIComponent(f.operatorId)}/activity?limit=30`,
      );
      setActivity(Array.isArray(ev) ? ev : []);
    } catch {
      setActivity([]);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.displayName, r.fullName, r.cpf, r.email, r.phone, r.role]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const save = async () => {
    if (!selected || !form) return;
    setSaving(true);
    setMsg(null);
    try {
      const updated = await apiJson<Funcionario>(
        `/administrativo/funcionarios/${encodeURIComponent(selected.operatorId)}`,
        {
          method: 'PUT',
          body: JSON.stringify(form),
        },
      );
      setSelected(updated);
      setForm(toForm(updated));
      setMsg({ text: 'Perfil salvo.', type: 'success' });
      await load();
    } catch (e: unknown) {
      setMsg({
        text: e instanceof Error ? e.message : 'Erro ao salvar',
        type: 'error',
      });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3500);
    }
  };

  const setF = (key: keyof ProfileForm, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-zinc-700" />
          <h1 className="text-lg font-bold text-zinc-900">Funcionários</h1>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </button>
      </header>

      <main className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-4">
        <p className="text-sm text-zinc-500">
          Cadastro RH dos operadores do Hub. Acesso a módulos continua em Configurações → Operadores.
        </p>

        {msg && (
          <div
            className={cn(
              'rounded-xl border px-4 py-3 text-sm font-bold',
              msg.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800',
            )}
          >
            {msg.text}
          </div>
        )}

        <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-xl px-3 py-2 max-w-md">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, CPF, e-mail…"
            className="flex-1 text-sm bg-transparent border-none focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500 py-10">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : error ? (
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">{error}</p>
        ) : (
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-[10px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Operador</th>
                  <th className="px-4 py-3">Nome completo</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Contato</th>
                  <th className="px-4 py-3">Última sessão</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr
                    key={f.operatorId}
                    onClick={() => void openDrawer(f)}
                    className="border-t border-zinc-50 hover:bg-zinc-50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-[10px] font-bold uppercase',
                          f.sessionActive ? 'text-emerald-700' : 'text-zinc-400',
                        )}
                        title={f.sessionActive ? 'Sessão ativa' : 'Offline'}
                      >
                        <Circle className={cn('h-2 w-2 fill-current', f.sessionActive ? 'text-emerald-500' : 'text-zinc-300')} />
                        {f.sessionActive ? 'Online' : 'Off'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-zinc-900">{f.displayName}</td>
                    <td className="px-4 py-3 text-zinc-700">{f.fullName || '—'}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{f.role}</td>
                    <td className="px-4 py-3 text-xs text-zinc-600">
                      {[f.phone, f.email].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
                      {f.lastSessionAt
                        ? new Date(f.lastSessionAt.includes('T') ? f.lastSessionAt : `${f.lastSessionAt}Z`).toLocaleString('pt-BR')
                        : '—'}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                      Nenhum funcionário encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {selected && form && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
          <div className="h-full w-full max-w-lg bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div>
                <h2 className="font-bold text-zinc-900">{selected.displayName}</h2>
                <p className="text-xs text-zinc-500">
                  {selected.role} · {selected.active ? 'ativo' : 'inativo'} · {selected.modules.length} módulos
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-zinc-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nome completo" value={form.fullName} onChange={(v) => setF('fullName', v)} className="col-span-2" />
                <Field label="CPF" value={form.cpf} onChange={(v) => setF('cpf', v)} />
                <Field label="Telefone" value={form.phone} onChange={(v) => setF('phone', v)} />
                <Field label="E-mail" value={form.email} onChange={(v) => setF('email', v)} className="col-span-2" />
                <Field label="Nascimento" value={form.birthDate} onChange={(v) => setF('birthDate', v)} type="date" />
                <Field label="Admissão" value={form.hireDate} onChange={(v) => setF('hireDate', v)} type="date" />
                <Field label="Rua" value={form.addressStreet} onChange={(v) => setF('addressStreet', v)} className="col-span-2" />
                <Field label="Número" value={form.addressNumber} onChange={(v) => setF('addressNumber', v)} />
                <Field label="Complemento" value={form.addressComplement} onChange={(v) => setF('addressComplement', v)} />
                <Field label="Bairro" value={form.addressNeighborhood} onChange={(v) => setF('addressNeighborhood', v)} />
                <Field label="Cidade" value={form.addressCity} onChange={(v) => setF('addressCity', v)} />
                <Field label="UF" value={form.addressState} onChange={(v) => setF('addressState', v)} />
                <Field label="CEP" value={form.addressZip} onChange={(v) => setF('addressZip', v)} />
                <label className="block space-y-1 col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Observações</span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setF('notes', e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </label>
              </div>

              <div className="border-t border-zinc-100 pt-4 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Atividade recente</h3>
                {activity.length === 0 ? (
                  <p className="text-xs text-zinc-400">Nenhum evento de auditoria.</p>
                ) : (
                  <ul className="space-y-2 max-h-48 overflow-auto">
                    {activity.map((ev) => (
                      <li key={ev.id} className="rounded-lg border border-zinc-100 px-3 py-2 text-xs">
                        <div className="flex justify-between gap-2 text-zinc-400">
                          <span>{new Date(ev.createdAt).toLocaleString('pt-BR')}</span>
                          <span className="font-bold uppercase">{ev.action}</span>
                        </div>
                        <p className="text-zinc-700 mt-0.5">{ev.summary}</p>
                        {ev.moduleKey && <p className="text-zinc-400 mt-0.5">{ev.moduleKey}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="border-t border-zinc-200 px-5 py-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-650 hover:bg-zinc-50"
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar perfil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
