import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import type { TradeNode } from '@/types';
import { useAuth } from './AuthProvider';

interface TradeContextValue {
  activeTrades: TradeNode[];
  allTrades: TradeNode[];
  loadingTrades: boolean;
  refetchTrades: () => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
}

const TradeContext = createContext<TradeContextValue | undefined>(undefined);

export function TradeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeTrades, setActiveTrades] = useState<TradeNode[]>([]);
  const [allTrades, setAllTrades] = useState<TradeNode[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(false);

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
        const trades = data as TradeNode[];
        setAllTrades(trades);
        setActiveTrades(trades.filter((t) => t.status === 'ACTIVE'));
      }
    } finally {
      setLoadingTrades(false);
    }
  }, [user?.id]);

  const refetchTrades = fetchTrades;

  const deleteTrade = useCallback(async (id: string) => {
    await supabase.from('trade_nodes').delete().eq('id', id);
    setAllTrades((prev) => prev.filter((t) => t.id !== id));
    setActiveTrades((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Initial fetch
  useEffect(() => {
    if (user?.id) fetchTrades();
    else {
      setActiveTrades([]);
      setAllTrades([]);
    }
  }, [user?.id, fetchTrades]);

  // Realtime subscription for live trade updates
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
            const newTrade = payload.new as TradeNode;
            setAllTrades((prev) => [newTrade, ...prev]);
            if (newTrade.status === 'ACTIVE') {
              setActiveTrades((prev) => [newTrade, ...prev]);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as TradeNode;
            setAllTrades((prev) =>
              prev.map((t) => (t.id === updated.id ? updated : t)),
            );
            setActiveTrades((prev) => {
              const filtered = prev.filter((t) => t.id !== updated.id);
              if (updated.status === 'ACTIVE') return [updated, ...filtered];
              return filtered;
            });
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as TradeNode;
            setAllTrades((prev) => prev.filter((t) => t.id !== deleted.id));
            setActiveTrades((prev) => prev.filter((t) => t.id !== deleted.id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return (
    <TradeContext.Provider value={{ activeTrades, allTrades, loadingTrades, refetchTrades, deleteTrade }}>
      {children}
    </TradeContext.Provider>
  );
}

export function useTrades() {
  const ctx = useContext(TradeContext);
  if (!ctx) throw new Error('useTrades must be used within TradeProvider');
  return ctx;
}
