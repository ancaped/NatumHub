import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Settings, LogOut, UserCog, ClipboardList, Shield, ArrowLeft, Network, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Menu, X, Code2 } from 'lucide-react';
import { cn, getAppVersion, getAppEnvironment } from '../../lib/utils';
import { canAccessView } from '../../lib/modules/permissions';
import { isSupervisor, canSeeFeedbacks } from '../../lib/auth';
import type { AuthUser } from '../../lib/auth';
import { apiJson, ApiError } from '../../lib/http';
import Modal from '../ui/Modal';
import NotificationsPanel from './NotificationsPanel';
import NexusLogo from '../NexusLogo';
import {
  getAccessibleSubmodules,
  getModuleGroupForView,
  getNavModuleGroups,
  sortSubmodulesByUsage,
  type NavModuleGroup,
  type NavSubmodule,
} from '../../lib/nav/navRegistry';
import { getModuleTitle } from '../../lib/viewLabels';

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

const EMPTY_PROFILE: ProfileForm = {
  fullName: '',
  cpf: '',
  phone: '',
  email: '',
  birthDate: '',
  hireDate: '',
  addressStreet: '',
  addressNumber: '',
  addressComplement: '',
  addressNeighborhood: '',
  addressCity: '',
  addressState: '',
  addressZip: '',
  notes: '',
};

interface AppTopBarProps {
  view: string;
  setView: (view: string) => void;
  currentUser: AuthUser | null;
  usage: Record<string, number>;
  onLogout: () => void;
  fetchSqlConfig: () => void;
  showModules?: boolean;
}

interface MenuAnchor {
  groupKey: string;
  top: number;
  left: number;
  submodules: NavSubmodule[];
}

export default function AppTopBar({
  view,
  setView,
  currentUser,
  usage,
  onLogout,
  fetchSqlConfig,
  showModules = true,
}: AppTopBarProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [finePointer, setFinePointer] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm>(EMPTY_PROFILE);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [quickSyncing, setQuickSyncing] = useState(false);
  const [quickSyncHint, setQuickSyncHint] = useState<string | null>(null);
  const barRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const closeTimerRef = useRef<number | null>(null);

  const groups = getNavModuleGroups(currentUser);
  const activeGroup = getModuleGroupForView(view);
  const canQuickSync = isSupervisor(currentUser);

  const handleQuickErpSync = useCallback(async () => {
    if (!canQuickSync || quickSyncing) return;
    setQuickSyncing(true);
    setQuickSyncHint(null);
    try {
      const lock = await apiJson<{ running?: boolean }>('/import/sync-lock');
      if (lock.running) {
        setQuickSyncHint('Sync já em andamento');
        return;
      }
      const data = await apiJson<{ message?: string }>('/import/sync', { method: 'POST' });
      setQuickSyncHint(data.message || 'Sync ERP concluído');
    } catch (e: unknown) {
      const msg =
        e instanceof ApiError
          ? String((e.body as { error?: string })?.error || e.message)
          : e instanceof Error
            ? e.message
            : 'Falha no sync ERP';
      setQuickSyncHint(msg);
    } finally {
      setQuickSyncing(false);
      window.setTimeout(() => setQuickSyncHint(null), 6000);
    }
  }, [canQuickSync, quickSyncing]);

  const [appVersion, setAppVersion] = useState<string>(() => getAppVersion());
  const appEnv = getAppEnvironment();

  useEffect(() => {
    let cancelled = false;
    apiJson<{ version?: string }>('/health')
      .then((res) => {
        if (!cancelled && res?.version) {
          setAppVersion(res.version);
        }
      })
      .catch(() => {
        apiJson<{ version?: string }>('/server-manager/status')
          .then((res) => {
            if (!cancelled && res?.version) {
              setAppVersion(res.version);
            }
          })
          .catch(() => undefined);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const onChange = () => setFinePointer(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closeModuleMenu = useCallback(() => {
    clearCloseTimer();
    setOpenGroup(null);
    setMenuAnchor(null);
  }, [clearCloseTimer]);

  const openModuleMenu = useCallback(
    (group: NavModuleGroup, trigger: HTMLButtonElement) => {
      clearCloseTimer();
      const submodules = sortSubmodulesByUsage(
        getAccessibleSubmodules(group, currentUser),
        usage
      );
      if (submodules.length === 0) return;

      const rect = trigger.getBoundingClientRect();
      const menuWidth = 260;
      const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - menuWidth - 8));
      setOpenGroup(group.key);
      setMenuAnchor({
        groupKey: group.key,
        top: rect.bottom + 4,
        left,
        submodules,
      });
    },
    [clearCloseTimer, currentUser, usage]
  );

  const scheduleCloseModuleMenu = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeModuleMenu();
    }, 120);
  }, [clearCloseTimer, closeModuleMenu]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const inBar = barRef.current?.contains(target);
      const inMenu = menuRef.current?.contains(target);
      if (!inBar && !inMenu) {
        closeModuleMenu();
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeModuleMenu]);

  useEffect(() => {
    closeModuleMenu();
    setMobileNavOpen(false);
  }, [view, closeModuleMenu]);

  useEffect(() => {
    if (!menuAnchor) return;

    const updatePosition = () => {
      const trigger = triggerRefs.current.get(menuAnchor.groupKey);
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = 260;
      const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - menuWidth - 8));
      setMenuAnchor((prev) =>
        prev
          ? { ...prev, top: rect.bottom + 4, left }
          : null
      );
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [menuAnchor?.groupKey]);

  const openProfileModal = async () => {
    setDropdownOpen(false);
    setProfileModalOpen(true);
    setProfileError(null);
    setProfileLoading(true);
    try {
      const raw = await apiJson<Record<string, unknown>>('/administrativo/funcionarios/me');
      setProfileForm({
        fullName: String(raw.fullName ?? ''),
        cpf: String(raw.cpf ?? ''),
        phone: String(raw.phone ?? ''),
        email: String(raw.email ?? ''),
        birthDate: String(raw.birthDate ?? ''),
        hireDate: String(raw.hireDate ?? ''),
        addressStreet: String(raw.addressStreet ?? ''),
        addressNumber: String(raw.addressNumber ?? ''),
        addressComplement: String(raw.addressComplement ?? ''),
        addressNeighborhood: String(raw.addressNeighborhood ?? ''),
        addressCity: String(raw.addressCity ?? ''),
        addressState: String(raw.addressState ?? ''),
        addressZip: String(raw.addressZip ?? ''),
        notes: String(raw.notes ?? ''),
      });
    } catch (e: unknown) {
      setProfileForm(EMPTY_PROFILE);
      setProfileError(e instanceof Error ? e.message : 'Falha ao carregar perfil');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileError(null);
    try {
      await apiJson('/administrativo/funcionarios/me', {
        method: 'PUT',
        body: JSON.stringify(profileForm),
      });
      setProfileModalOpen(false);
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : 'Erro ao salvar perfil');
    } finally {
      setProfileSaving(false);
    }
  };

  const setPF = (key: keyof ProfileForm, value: string) => {
    setProfileForm((prev) => ({ ...prev, [key]: value }));
  };

  const navigateTo = (target: string) => {
    setView(target);
    closeModuleMenu();
  };

  const renderModuleButton = (group: NavModuleGroup) => {
    const isActive = activeGroup?.key === group.key;

    if (group.directView) {
      return (
        <button
          key={group.key}
          type="button"
          onClick={() => navigateTo(group.directView!)}
          className={cn(
            'shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border',
            isActive
              ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
              : 'text-zinc-650 border-transparent hover:bg-zinc-50 hover:text-zinc-900 hover:border-zinc-200'
          )}
        >
          {group.label}
        </button>
      );
    }

    const isOpen = openGroup === group.key;

    return (
      <div
        key={group.key}
        className="relative shrink-0"
        onMouseEnter={() => {
          if (!finePointer) return;
          const trigger = triggerRefs.current.get(group.key);
          if (trigger) openModuleMenu(group, trigger);
        }}
        onMouseLeave={() => {
          if (!finePointer) return;
          scheduleCloseModuleMenu();
        }}
      >
        <button
          ref={(el) => {
            if (el) triggerRefs.current.set(group.key, el);
            else triggerRefs.current.delete(group.key);
          }}
          type="button"
          onClick={() => {
            const trigger = triggerRefs.current.get(group.key);
            if (!trigger) return;
            if (isOpen) {
              closeModuleMenu();
            } else {
              openModuleMenu(group, trigger);
            }
          }}
          className={cn(
            'flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border',
            isActive
              ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
              : 'text-zinc-650 border-transparent hover:bg-zinc-50 hover:text-zinc-900 hover:border-zinc-200'
          )}
        >
          {group.label}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />
        </button>
      </div>
    );
  };

  const moduleMenuPortal =
    menuAnchor &&
    typeof document !== 'undefined' &&
    document.body &&
    createPortal(
      <div
        ref={menuRef}
        className="fixed z-[9999]"
        style={{ top: menuAnchor.top, left: menuAnchor.left }}
        onMouseEnter={() => {
          if (finePointer) clearCloseTimer();
        }}
        onMouseLeave={() => {
          if (finePointer) scheduleCloseModuleMenu();
        }}
      >
        <div className="bg-white border border-zinc-200 rounded-xl shadow-xl p-2 min-w-[220px] animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="grid grid-cols-1 gap-0.5">
            {menuAnchor.submodules.map((sub) => {
              const Icon = sub.icon;
              const subActive = view === sub.view;
              return (
                <button
                  key={sub.view}
                  type="button"
                  onClick={() => navigateTo(sub.view)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-3 lg:py-2 min-h-11 lg:min-h-0 rounded-lg text-sm lg:text-xs font-semibold text-left cursor-pointer transition-colors',
                    subActive
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-700 hover:bg-zinc-50'
                  )}
                >
                  <Icon
                    className={cn('h-4 w-4 shrink-0', subActive ? 'text-white' : 'text-zinc-400')}
                  />
                  <span className="truncate">{sub.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <>
      <header
        ref={barRef}
        className="no-print h-14 w-full bg-white border-b border-zinc-200 px-2 sm:px-4 lg:px-6 flex items-center gap-2 lg:gap-4 shadow-sm shrink-0 z-40 relative select-none"
      >
        <button
          type="button"
          onClick={() => setView('hub')}
          className="flex items-center hover:opacity-80 transition-opacity focus:outline-none shrink-0 mr-1 cursor-pointer"
          title="Início"
        >
          <NexusLogo variant="badge" size="sm" />
        </button>

        {showModules ? (
          <>
            <button
              type="button"
              onClick={() => {
                setDropdownOpen(false);
                closeModuleMenu();
                setMobileExpanded(activeGroup?.key ?? null);
                setMobileNavOpen(true);
              }}
              className="lg:hidden inline-flex items-center gap-1.5 h-11 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-800 shrink-0"
              aria-label="Abrir módulos"
            >
              <Menu className="h-4 w-4" />
              Módulos
            </button>
            <span className="lg:hidden flex-1 min-w-0 truncate text-xs font-semibold text-zinc-600">
              {view === 'hub' ? 'Início' : getModuleTitle(view)}
            </span>
            <nav
              className="hidden lg:flex items-center gap-1 flex-1 min-w-0 overflow-x-auto touch-pan-x"
              aria-label="Módulos"
            >
              {groups.map(renderModuleButton)}
            </nav>
          </>
        ) : (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setView('hub')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-650 border border-zinc-200 bg-white hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer shrink-0"
              title="Voltar ao início"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Início</span>
            </button>
            {getModuleTitle(view) && (
              <span className="text-xs font-bold text-zinc-600 truncate">{getModuleTitle(view)}</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 shrink-0">
          <span
            className={cn(
              'hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[11px] font-bold tracking-wide select-none',
              appEnv === 'dev'
                ? 'bg-amber-500/10 text-amber-700 border border-amber-500/25 shadow-2xs'
                : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
            )}
            title={appEnv === 'dev' ? 'Nexus DEV (:3002)' : 'Nexus PROD (:3001)'}
          >
            v{appVersion} · {appEnv.toUpperCase()}
          </span>

          {canQuickSync && (
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => void handleQuickErpSync()}
                disabled={quickSyncing}
                className="p-2 rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Sync ERP rápido (incremental)"
                aria-label="Sync ERP rápido"
              >
                <RefreshCw className={cn('h-4 w-4', quickSyncing && 'animate-spin')} />
              </button>
              {quickSyncHint && (
                <div className="absolute right-0 top-full mt-1 z-50 max-w-[220px] rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-zinc-700 shadow-md">
                  {quickSyncHint}
                </div>
              )}
            </div>
          )}

          {currentUser && <NotificationsPanel currentUser={currentUser} />}

          {currentUser && (
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center justify-center gap-2 min-h-11 min-w-11 p-1 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 transition-all cursor-pointer focus:outline-none shadow-sm"
              >
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName}
                    className="h-7 w-7 rounded-lg border border-zinc-255 shadow-sm object-cover"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-lg bg-zinc-900 text-white flex items-center justify-center font-bold text-sm shadow-sm uppercase">
                    {currentUser.displayName.charAt(0)}
                  </div>
                )}
                <span className="text-xs font-bold text-zinc-700 px-1 pr-2 hidden md:inline">
                  {currentUser.displayName}
                </span>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-[min(16rem,calc(100vw-1rem))] bg-white border border-zinc-200 rounded-2xl shadow-xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-4 py-2.5 border-b border-zinc-100 flex items-center gap-3">
                    {currentUser.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt={currentUser.displayName}
                        className="h-8 w-8 rounded-full border border-zinc-200 object-cover"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-zinc-900 text-white flex items-center justify-center font-bold text-sm uppercase">
                        {currentUser.displayName.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-black text-zinc-900 truncate leading-none mb-1">
                        {currentUser.displayName}
                      </p>
                      <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                        {currentUser.role || 'operador'}
                      </span>
                    </div>
                  </div>

                  <div className="p-1 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => void openProfileModal()}
                      className="w-full flex items-center gap-2.5 px-3 py-3 min-h-11 rounded-lg text-sm font-semibold text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer text-left"
                    >
                      <UserCog className="h-4 w-4 text-zinc-400" />
                      Dados do Perfil
                    </button>

                    {isSupervisor(currentUser) && (
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          setView('desenvolvimento');
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-3 min-h-11 rounded-lg text-sm font-semibold text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer text-left"
                      >
                        <Code2 className="h-4 w-4 text-zinc-400" />
                        Desenvolvimento
                      </button>
                    )}

                    {canAccessView(currentUser, 'hub_settings') && (
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          fetchSqlConfig();
                          setView(isSupervisor(currentUser) ? 'hub_supervisor' : 'hub_settings');
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-3 min-h-11 rounded-lg text-sm font-semibold text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer text-left"
                      >
                        <Settings className="h-4 w-4 text-zinc-400" />
                        Configurações Gerais
                      </button>
                    )}
                  </div>

                  <div className="border-t border-zinc-100 mt-1 pt-1 p-1">
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        onLogout();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-3 min-h-11 rounded-lg text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer text-left"
                    >
                      <LogOut className="h-4 w-4" />
                      Sair / Desconectar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {moduleMenuPortal}

      {mobileNavOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="lg:hidden fixed inset-0 z-[10000]">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="Fechar módulos"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-[min(100%,22rem)] flex-col bg-white shadow-xl pt-[env(safe-area-inset-top)]">
              <div className="flex items-center justify-between h-14 px-4 border-b border-zinc-200 shrink-0">
                <span className="text-sm font-bold text-zinc-900">Módulos</span>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-zinc-200 text-zinc-700"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-1" aria-label="Módulos">
                {groups.map((group) => {
                  const subs = sortSubmodulesByUsage(getAccessibleSubmodules(group, currentUser), usage);
                  const expanded = mobileExpanded === group.key;
                  const groupActive = activeGroup?.key === group.key;

                  if (group.directView) {
                    return (
                      <button
                        key={group.key}
                        type="button"
                        onClick={() => navigateTo(group.directView!)}
                        className={cn(
                          'w-full min-h-11 px-3 rounded-xl text-left text-sm font-bold border',
                          groupActive
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-white text-zinc-800 border-zinc-200'
                        )}
                      >
                        {group.label}
                      </button>
                    );
                  }

                  return (
                    <div key={group.key} className="rounded-xl border border-zinc-200 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setMobileExpanded(expanded ? null : group.key)}
                        className={cn(
                          'w-full min-h-11 px-3 flex items-center justify-between gap-2 text-sm font-bold',
                          groupActive ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-800'
                        )}
                      >
                        {group.label}
                        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', expanded && 'rotate-180')} />
                      </button>
                      {expanded && (
                        <div className="border-t border-zinc-100 bg-zinc-50 p-1.5 space-y-0.5">
                          {subs.map((sub) => {
                            const Icon = sub.icon;
                            const subActive = view === sub.view;
                            return (
                              <button
                                key={sub.view}
                                type="button"
                                onClick={() => navigateTo(sub.view)}
                                className={cn(
                                  'w-full min-h-11 flex items-center gap-2.5 px-3 rounded-lg text-sm font-semibold text-left',
                                  subActive ? 'bg-zinc-900 text-white' : 'text-zinc-700 active:bg-white'
                                )}
                              >
                                <Icon className={cn('h-4 w-4 shrink-0', subActive ? 'text-white' : 'text-zinc-400')} />
                                <span className="truncate">{sub.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
            </div>
          </div>,
          document.body
        )}

      {profileModalOpen && (
        <Modal isOpen={true} title="Dados do Perfil" onClose={() => setProfileModalOpen(false)}>
          <form onSubmit={handleSaveProfile} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-3 py-2 text-xs text-zinc-600">
              Login: <strong>{currentUser?.displayName}</strong>
              {currentUser?.role ? ` · ${currentUser.role}` : ''}
            </div>

            {profileError && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                {profileError}
              </p>
            )}

            {profileLoading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500 py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando perfil…
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Nome completo</span>
                  <input
                    value={profileForm.fullName}
                    onChange={(e) => setPF('fullName', e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                    autoFocus
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">CPF</span>
                  <input value={profileForm.cpf} onChange={(e) => setPF('cpf', e.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Telefone</span>
                  <input value={profileForm.phone} onChange={(e) => setPF('phone', e.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                </label>
                <label className="col-span-2 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">E-mail</span>
                  <input type="email" value={profileForm.email} onChange={(e) => setPF('email', e.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Nascimento</span>
                  <input type="date" value={profileForm.birthDate} onChange={(e) => setPF('birthDate', e.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Admissão</span>
                  <input type="date" value={profileForm.hireDate} onChange={(e) => setPF('hireDate', e.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                </label>
                <label className="col-span-2 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Rua</span>
                  <input value={profileForm.addressStreet} onChange={(e) => setPF('addressStreet', e.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Número</span>
                  <input value={profileForm.addressNumber} onChange={(e) => setPF('addressNumber', e.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Complemento</span>
                  <input value={profileForm.addressComplement} onChange={(e) => setPF('addressComplement', e.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Bairro</span>
                  <input value={profileForm.addressNeighborhood} onChange={(e) => setPF('addressNeighborhood', e.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Cidade</span>
                  <input value={profileForm.addressCity} onChange={(e) => setPF('addressCity', e.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">UF</span>
                  <input value={profileForm.addressState} onChange={(e) => setPF('addressState', e.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">CEP</span>
                  <input value={profileForm.addressZip} onChange={(e) => setPF('addressZip', e.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                </label>
                <label className="col-span-2 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Observações</span>
                  <textarea
                    value={profileForm.notes}
                    onChange={(e) => setPF('notes', e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                className="px-4 py-2 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-650 hover:bg-zinc-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={profileLoading || profileSaving}
                className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
              >
                {profileSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar Perfil
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
