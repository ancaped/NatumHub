import React, { createContext, useContext, useMemo } from 'react';

const NavShellContext = createContext(false);

export function NavShellProvider({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo(() => active, [active]);
  return <NavShellContext.Provider value={value}>{children}</NavShellContext.Provider>;
}

export function useGlobalNavActive(): boolean {
  return useContext(NavShellContext);
}
