import React, { useEffect } from 'react';
import type { AuthUser } from '../../lib/auth';
import { useNavRecents } from '../../lib/nav/useNavRecents';
import { isDeprecatedHubView, resolveDeprecatedHubView } from '../../lib/nav/navRegistry';
import AppTopBar from './AppTopBar';
import { NavShellProvider } from './NavShellContext';

interface AppShellProps {
  view: string;
  setView: (view: string) => void;
  currentUser: AuthUser | null;
  onLogout: () => void;
  fetchSqlConfig: () => void;
  children: React.ReactNode;
}

function HubWelcome() {
  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-zinc-50">
      <div className="text-center space-y-2 max-w-md">
        <h2 className="text-xl font-extrabold text-zinc-900 tracking-tight">Bem-vindo ao NatumHub</h2>
        <p className="text-sm text-zinc-500">
          Passe o mouse ou clique em um módulo na barra superior para escolher a tela.
        </p>
      </div>
    </div>
  );
}

const ADMIN_VIEWS = new Set(['hub_settings', 'hub_supervisor', 'hub_feedbacks', 'mapa_arquitetura']);

export default function AppShell({
  view,
  setView,
  currentUser,
  onLogout,
  fetchSqlConfig,
  children,
}: AppShellProps) {
  const { usage, recordViewVisit } = useNavRecents(currentUser);
  const showModules = !ADMIN_VIEWS.has(view);

  useEffect(() => {
    if (isDeprecatedHubView(view)) {
      const target = resolveDeprecatedHubView(view, currentUser, usage);
      if (target && target !== view) {
        setView(target);
      }
    }
  }, [view, currentUser, usage, setView]);

  useEffect(() => {
    if (view && view !== 'hub' && !isDeprecatedHubView(view)) {
      recordViewVisit(view);
    }
  }, [view, recordViewVisit]);

  const content = view === 'hub' ? <HubWelcome /> : children;

  return (
    <NavShellProvider active>
      <div className="flex flex-col flex-1 min-h-0">
        <AppTopBar
          view={view}
          setView={setView}
          currentUser={currentUser}
          usage={usage}
          onLogout={onLogout}
          fetchSqlConfig={fetchSqlConfig}
          showModules={showModules}
        />
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">{content}</div>
      </div>
    </NavShellProvider>
  );
}
