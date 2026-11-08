import React, { useEffect } from 'react';
import type { AuthUser } from '../../lib/auth';
import { useNavRecents } from '../../lib/nav/useNavRecents';
import { isDeprecatedHubView, resolveDeprecatedHubView } from '../../lib/nav/navRegistry';
import AppTopBar from './AppTopBar';
import { NavShellProvider } from './NavShellContext';
import HomeDashboard from '../../dashboard/HomeDashboard';

interface AppShellProps {
  view: string;
  setView: (view: string) => void;
  currentUser: AuthUser | null;
  onLogout: () => void;
  fetchSqlConfig: () => void;
  children: React.ReactNode;
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

  const content =
    view === 'hub' ? <HomeDashboard currentUser={currentUser} usage={usage} setView={setView} /> : children;

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
