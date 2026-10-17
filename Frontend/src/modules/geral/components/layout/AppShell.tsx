import React, { useEffect } from 'react';
import type { AuthUser } from '../../lib/auth';
import { useNavRecents } from '../../lib/nav/useNavRecents';
import { isDeprecatedHubView, resolveDeprecatedHubView } from '../../lib/nav/navRegistry';
import AppTopBar from './AppTopBar';
import { NavShellProvider } from './NavShellContext';
import NexusLogo from '../NexusLogo';

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
      <div className="text-center space-y-4 max-w-md flex flex-col items-center">
        <NexusLogo variant="badge" size="xl" />
        <div className="space-y-1">
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-2xl font-black text-zinc-900 tracking-tight uppercase">Nexus</h2>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-zinc-900 text-white">0.1b</span>
          </div>
          <p className="text-sm text-zinc-500">
            Passe o mouse ou clique em um módulo na barra superior para escolher a tela.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AppShell({
  view,
  setView,
  currentUser,
  onLogout,
  fetchSqlConfig,
  children,
}: AppShellProps) {
  const { usage, recordViewVisit } = useNavRecents(currentUser);
  const showModules = true;

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
