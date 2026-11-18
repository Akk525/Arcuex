'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  type WorkspaceId,
  readStoredWorkspace,
  writeStoredWorkspace,
} from '@/lib/workspace';

type WorkspaceContextValue = {
  workspace: WorkspaceId | null;
  hydrated: boolean;
  setWorkspace: (workspace: WorkspaceId) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspaceState] = useState<WorkspaceId | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setWorkspaceState(readStoredWorkspace());
    setHydrated(true);
  }, []);

  const setWorkspace = useCallback((next: WorkspaceId) => {
    setWorkspaceState(next);
    writeStoredWorkspace(next);
  }, []);

  const value = useMemo(
    () => ({ workspace, hydrated, setWorkspace }),
    [workspace, hydrated, setWorkspace],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace requires WorkspaceProvider');
  return ctx;
}
