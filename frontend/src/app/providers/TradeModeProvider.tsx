/**
 * Global trade-view mode context.
 * Selecting LIVE or Simulation in the TopBar filters all pages at once.
 * The preference is persisted to localStorage so it survives page refreshes.
 */
import { createContext, useContext, useState, type ReactNode } from 'react';

export type TradeViewMode = 'ALL' | 'LIVE' | 'PAPER';

interface TradeModeContextValue {
  tradeMode: TradeViewMode;
  setTradeMode: (m: TradeViewMode) => void;
}

const TradeModeContext = createContext<TradeModeContextValue | undefined>(undefined);

const STORAGE_KEY = 'mpro_trade_mode';

export function TradeModeProvider({ children }: { children: ReactNode }) {
  const [tradeMode, setTradeModeState] = useState<TradeViewMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'LIVE' || stored === 'PAPER' ? stored : 'ALL';
  });

  const setTradeMode = (m: TradeViewMode) => {
    setTradeModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  };

  return (
    <TradeModeContext.Provider value={{ tradeMode, setTradeMode }}>
      {children}
    </TradeModeContext.Provider>
  );
}

export function useTradeMode() {
  const ctx = useContext(TradeModeContext);
  if (!ctx) throw new Error('useTradeMode must be used within TradeModeProvider');
  return ctx;
}
