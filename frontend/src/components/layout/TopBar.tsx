import { Bell, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useTrades } from '@/app/providers/TradeProvider';
import { formatCurrency, getPnlClass, cn } from '@/lib/utils';

export default function TopBar() {
  const { profile } = useAuth();
  const { activeTrades, allTrades } = useTrades();

  const todayPnl = allTrades
    .filter((t) => {
      const today = new Date().toDateString();
      return new Date(t.created_at).toDateString() === today;
    })
    .reduce((sum, t) => sum + t.booked_pnl, 0);

  const hasLiveTrades = activeTrades.some((t) => t.mode === 'LIVE');

  return (
    <header className="h-14 bg-panel-dark border-b border-border flex items-center justify-between px-6 flex-shrink-0">
      {/* Left: page title injected by children via context in future */}
      <div className="flex items-center gap-3">
        {/* Live/Paper indicator */}
        {activeTrades.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className={hasLiveTrades ? 'dot-live' : 'dot-paper'} />
            <span className="text-xs text-muted">
              {activeTrades.length} active {activeTrades.length === 1 ? 'trade' : 'trades'}
            </span>
          </div>
        )}
      </div>

      {/* Right: P&L today + broker status + notifications + user */}
      <div className="flex items-center gap-4">
        {/* Today's P&L */}
        <div className="text-right hidden sm:block">
          <p className="text-[10px] text-muted uppercase tracking-wide">Today P&L</p>
          <p className={cn('text-sm price', getPnlClass(todayPnl))}>
            {todayPnl >= 0 ? '+' : ''}{formatCurrency(todayPnl)}
          </p>
        </div>

        {/* Broker status */}
        <div
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border',
            hasLiveTrades
              ? 'bg-profit/10 text-profit border-profit/20'
              : 'bg-border/30 text-muted border-border',
          )}
          title={hasLiveTrades ? 'Broker connected — LIVE' : 'Paper mode'}
        >
          {hasLiveTrades ? <Wifi size={12} /> : <WifiOff size={12} />}
          <span className="hidden sm:inline">{hasLiveTrades ? 'LIVE' : 'PAPER'}</span>
        </div>

        {/* Notifications (placeholder) */}
        <button className="relative p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-panel-mid transition-colors">
          <Bell size={16} />
        </button>

        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-cyan/30 to-accent-purple/30 border border-border flex items-center justify-center text-xs font-bold text-accent-cyan">
          {profile?.full_name?.[0]?.toUpperCase() ?? profile?.email?.[0]?.toUpperCase() ?? 'U'}
        </div>
      </div>
    </header>
  );
}
