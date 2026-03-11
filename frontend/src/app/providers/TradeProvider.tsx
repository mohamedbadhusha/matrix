import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import type { TradeNode } from '@/types';
import { useAuth } from './AuthProvider';
import { useTradeMode } from './TradeModeProvider';

interface TradeContextValue {
  activeTrades: TradeNode[];
  allTrades: TradeNode[];
  loadingTrades: boolean;
  refetchTrades: () => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
  updateTrade: (id: string, updates: Partial<TradeNode>) => Promise<void>;
}

const TradeContext = createContext<TradeContextValue | undefined>(undefined);

export function TradeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { tradeMode } = useTradeMode();

  // rawTrades holds every trade for this user (unfiltered by mode).
  // activeTrades / allTrades are derived via useMemo and update instantly
  // whenever tradeMode changes — no extra fetches needed.
  const [rawTrades, setRawTrades] = useState<TradeNode[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(false);

  const allTrades = useMemo(
    () => tradeMode === 'ALL' ? rawTrades : rawTrades.filter((t) => t.mode === tradeMode),
    [rawTrades, tradeMode],
  );

  const activeTrades = useMemo(
    () => allTrades.filter((t) => t.status === 'ACTIVE'),
    [allTrades],
  );

  const fetchTrades = useCallback(async () => {
    if (!user?.id) return;
    setLoadingTrades(true);
    try {
      const { data, error } = await supabase
        .from('trade_nodes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setRawTrades(data as TradeNode[]);
      }
    } finally {
      setLoadingTrades(false);
    }
  }, [user?.id]);

  const refetchTrades = fetchTrades;

  const deleteTrade = useCallback(async (id: string) => {
    setRawTrades((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from('trade_nodes').delete().eq('id', id);
    if (error) {
      fetchTrades();
      console.error('[deleteTrade] DB delete failed:', error.message);
    }
  }, [fetchTrades]);

  const updateTrade = useCallback(async (id: string, updates: Partial<TradeNode>) => {
    setRawTrades((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } : t));
    const { error } = await supabase.from('trade_nodes').update(updates).eq('id', id);
    if (error) {
      fetchTrades();
      console.error('[updateTrade] DB update failed:', error.message);
      throw error;
    }
  }, [fetchTrades]);

  // Initial fetch
  useEffect(() => {
    if (user?.id) fetchTrades();
    else setRawTrades([]);
  }, [user?.id, fetchTrades]);

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`user-trades-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trade_nodes',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setRawTrades((prev) => [payload.new as TradeNode, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as TradeNode;
            setRawTrades((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as TradeNode;
            setRawTrades((prev) => prev.filter((t) => t.id !== deleted.id));
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  return (
    <TradeContext.Provider value={{ activeTrades, allTrades, loadingTrades, refetchTrades, deleteTrade, updateTrade }}>
      {children}
    </TradeContext.Provider>
  );
}

export function useTrades() {
  const ctx = useContext(TradeContext);
  if (!ctx) throw new Error('useTrades must be used within TradeProvider');
  return ctx;
}
