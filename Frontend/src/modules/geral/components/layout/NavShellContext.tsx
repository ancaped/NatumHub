import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

interface NavShellContextValue {
  active: boolean;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

const NavShellContext = createContext<NavShellContextValue>({
  active: false,
  sidebarCollapsed: false,
  toggleSidebar: () => {},
  setSidebarCollapsed: () => {},
});

export function NavShellProvider({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const mini = localStorage.getItem('nexus_sidebar_mini');
    if (mini != null) return mini === 'true';
    return localStorage.getItem('nexus_sidebar_collapsed') === 'true';
  });

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    try {
      localStorage.setItem('nexus_sidebar_mini', String(collapsed));
      localStorage.setItem('nexus_sidebar_collapsed', String(collapsed));
    } catch {}
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsedState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('nexus_sidebar_mini', String(next));
        localStorage.setItem('nexus_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  // Atalho de teclado global Ctrl+B / Cmd+B para alternar a sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  const value = useMemo(
    () => ({
      active,
      sidebarCollapsed,
      toggleSidebar,
      setSidebarCollapsed,
    }),
    [active, sidebarCollapsed, toggleSidebar, setSidebarCollapsed]
  );

  return <NavShellContext.Provider value={value}>{children}</NavShellContext.Provider>;
}

export function useNavShell(): NavShellContextValue {
  return useContext(NavShellContext);
}

export function useGlobalNavActive(): boolean {
  return useContext(NavShellContext).active;
}
