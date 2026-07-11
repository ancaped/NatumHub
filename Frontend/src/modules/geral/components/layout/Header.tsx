import React, { useState, useRef, useEffect } from 'react';
import { Boxes, User, Settings, LogOut, ChevronRight, UserCog, ClipboardList } from 'lucide-react';
import { localAuth } from '../../lib/api';
import { isPrincipalPc } from '../../lib/connectionConfig';
import { canAccessView } from '../../lib/modules/permissions';
import { isAdmin } from '../../lib/auth';
import type { AuthUser } from '../../lib/auth';
import Modal from '../ui/Modal';
import NotificationsPanel from './NotificationsPanel';

interface HeaderProps {
  view: string;
  setView: (view: any) => void;
  currentUser: AuthUser | null;
  onLogout: () => void;
  fetchSqlConfig: () => void;
}

// Map views to human-readable titles for the breadcrumb
import { getModuleTitle } from '../../lib/viewLabels';

export { getModuleTitle };

export default function Header({
  view,
  setView,
  currentUser,
  onLogout,
  fetchSqlConfig
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState(currentUser?.displayName || '');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const moduleTitle = getModuleTitle(view);

  return (
    <>
      <header className="no-print h-16 w-full bg-white border-b border-zinc-200 px-8 flex items-center justify-between shadow-sm shrink-0 z-30 relative select-none">
        
        {/* Left Side: Brand Logo + Breadcrumb */}
        <div className="flex items-center gap-2.5">
          <button 
            onClick={() => setView('hub')}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity focus:outline-none text-left cursor-pointer"
          >
            <div className="bg-zinc-900 text-white p-2 rounded-lg shadow-sm">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-tight text-zinc-900 uppercase">NatumHub</span>
              <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider -mt-0.5">Gestão Integrada</p>
            </div>
          </button>

          {moduleTitle && (
            <div className="flex items-center gap-2 text-zinc-300 font-semibold text-xs ml-2">
              <ChevronRight className="h-4.5 w-4.5 text-zinc-300" />
              <span className="text-zinc-800 font-extrabold text-xs tracking-tight bg-zinc-50 border border-zinc-150 px-2.5 py-1 rounded-lg uppercase">
                {moduleTitle}
              </span>
            </div>
          )}

        </div>

        {/* Right Side: Notifications + Profile */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400 font-mono hidden sm:inline">
            v0.011 alpha
          </span>

          {currentUser && <NotificationsPanel currentUser={currentUser} />}

          {currentUser && (
            <div className="relative" ref={dropdownRef}>
              {/* Trigger Button */}
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

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-zinc-200 rounded-2xl shadow-xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-150">
                  {/* Operator Header Card */}
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

                  {/* Options */}
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

                    {isAdmin(currentUser) && (
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

                    {canAccessView(currentUser, 'hub_settings') && (
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        if (isPrincipalPc()) fetchSqlConfig();
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

      {/* Edit Profile Modal */}
      {profileModalOpen && (
        <Modal
          title="Dados do Perfil"
          onClose={() => setProfileModalOpen(false)}
        >
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="profile-name" className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
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
