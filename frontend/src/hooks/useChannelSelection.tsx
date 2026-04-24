import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface ChannelSelectionContextValue {
  selectedIds: Set<string>;
  toggle: (id: string) => void;
  select: (id: string) => void;
  deselect: (id: string) => void;
  clear: () => void;
  selectAll: (ids: string[]) => void;
}

const ChannelSelectionContext = createContext<ChannelSelectionContextValue | null>(null);

export function ChannelSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const select = useCallback((id: string) => {
    setSelectedIds(prev => new Set(prev).add(id));
  }, []);

  const deselect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  return (
    <ChannelSelectionContext.Provider value={{ selectedIds, toggle, select, deselect, clear, selectAll }}>
      {children}
    </ChannelSelectionContext.Provider>
  );
}

export function useChannelSelection(): ChannelSelectionContextValue {
  const ctx = useContext(ChannelSelectionContext);
  if (!ctx) throw new Error('useChannelSelection must be used within ChannelSelectionProvider');
  return ctx;
}
