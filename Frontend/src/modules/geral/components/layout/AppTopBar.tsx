import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, User, Settings, LogOut, UserCog, ClipboardList, Shield, ArrowLeft } from 'lucide-react';
import { cn } from '../../lib/utils';
import { localAuth } from '../../lib/api';
import { canAccessView } from '../../lib/modules/permissions';
import { isSupervisor, canSeeFeedbacks } from '../../lib/auth';
import type { AuthUser } from '../../lib/auth';
import Modal from '../ui/Modal';
import NotificationsPanel from './NotificationsPanel';
import {
  getAccessibleSubmodules,
  getModuleGroupForView,
  getNavModuleGroups,
  sortSubmodulesByUsage,
  type NavModuleGroup,
  type NavSubmodule,
} from '../../lib/nav/navRegistry';
import { getModuleTitle } from '../../lib/viewLabels';

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
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState(currentUser?.displayName || '');
  const barRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const closeTimerRef = useRef<number | null>(null);

  const groups = getNavModuleGroups(currentUser);
  const activeGroup = getModuleGroupForView(view);

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
      setOpenGroup(group.key);
      setMenuAnchor({
        groupKey: group.key,
        top: rect.bottom + 4,
        left: rect.left,
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
  }, [view, closeModuleMenu]);

  useEffect(() => {
    if (!menuAnchor) return;

    const updatePosition = () => {
      const trigger = triggerRefs.current.get(menuAnchor.groupKey);
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setMenuAnchor((prev) =>
        prev
          ? { ...prev, top: rect.bottom + 4, left: rect.left }
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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editName.trim()) {
      try {
        const user = await localAuth.signIn(editName.trim());
        setEditName(user.displayName);
        setProfileModalOpen(false);
        window.location.reload();
      } catch {
        // erro exibido via reload ou toast futuro
      }
    }
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
          const trigger = triggerRefs.current.get(group.key);
          if (trigger) openModuleMenu(group, trigger);
        }}
        onMouseLeave={scheduleCloseModuleMenu}
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
    createPortal(
      <div
        ref={menuRef}
        className="fixed z-[9999]"
        style={{ top: menuAnchor.top, left: menuAnchor.left }}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleCloseModuleMenu}
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
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-left cursor-pointer transition-colors',
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
        className="no-print h-14 w-full bg-white border-b border-zinc-200 px-4 sm:px-6 flex items-center gap-4 shadow-sm shrink-0 z-40 relative select-none overflow-visible"
      >
        {showModules ? (
          <nav
            className="flex items-center gap-1 flex-1 min-w-0 overflow-visible"
            aria-label="Módulos"
          >
            {groups.map(renderModuleButton)}
          </nav>
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
          <span className="text-xs text-zinc-400 font-mono hidden sm:inline">v0.0.11</span>

          {currentUser && <NotificationsPanel currentUser={currentUser} />}

          {currentUser && (
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 p-1 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 transition-all cursor-pointer focus:outline-none shadow-sm"
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
                <div className="absolute right-0 mt-2 w-56 bg-white border border-zinc-200 rounded-2xl shadow-xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-150">
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
                      onClick={() => {
                        setDropdownOpen(false);
                        setEditName(currentUser.displayName);
                        setProfileModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer text-left"
                    >
                      <UserCog className="h-4 w-4 text-zinc-400" />
                      Dados do Perfil
                    </button>

                    {canSeeFeedbacks(currentUser) && (
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          setView('hub_feedbacks');
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer text-left"
                      >
                        <ClipboardList className="h-4 w-4 text-zinc-400" />
                        Gestão de Feedbacks
                      </button>
                    )}

                    {isSupervisor(currentUser) && (
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          fetchSqlConfig();
                          setView('hub_supervisor');
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-violet-700 hover:bg-violet-50 transition-colors cursor-pointer text-left"
                      >
                        <Shield className="h-4 w-4 text-violet-500" />
                        Painel Supervisor
                      </button>
                    )}

                    {canAccessView(currentUser, 'hub_settings') && (
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          fetchSqlConfig();
                          setView('hub_settings');
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer text-left"
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
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer text-left"
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

      {profileModalOpen && (
        <Modal title="Dados do Perfil" onClose={() => setProfileModalOpen(false)}>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="profile-name"
                className="text-xs font-bold text-zinc-500 uppercase tracking-wider"
              >
                Nome do Operador
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                  <User className="h-4 w-4" />
                </span>
                <input
                  id="profile-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nome do operador..."
                  className="w-full bg-white border border-zinc-300 rounded-xl pl-10 pr-4 py-3 text-sm font-semibold text-zinc-800 shadow-sm focus:outline-none focus:border-zinc-500"
                  autoFocus
                />
              </div>
            </div>

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
                className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 cursor-pointer"
              >
                Salvar Alterações
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
