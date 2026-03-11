import { Bell, LogOut, User, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useTrades } from '@/app/providers/TradeProvider';
import { useTradeMode } from '@/app/providers/TradeModeProvider';
import { formatCurrency, getPnlClass, cn } from '@/lib/utils';

export default function TopBar() {
  const { profile, signOut } = useAuth();
  const { activeTrades, allTrades } = useTrades();
  const { tradeMode, setTradeMode } = useTradeMode();
  const navigate = useNavigate();

  const [showProfile, setShowProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notiRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
      if (notiRef.current && !notiRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const todayPnl = allTrades
    .filter((t) => new Date(t.created_at).toDateString() === new Date().toDateString())
    .reduce((sum, t) => {
      const ltp = t.ltp ?? t.entry_price;
      return sum + t.booked_pnl + (t.status === 'ACTIVE' ? (ltp - t.entry_price) * t.remaining_quantity : 0);
    }, 0);

  const liveTrades = activeTrades.filter((t) => t.mode === 'LIVE').length;

  const MODE_OPTIONS = [
    { value: 'LIVE',  label: 'Live',  activeClass: 'bg-profit/15 text-profit border border-profit/30' },
    { value: 'ALL',   label: 'All',   activeClass: 'bg-panel-dark text-foreground border border-border' },
    { value: 'PAPER', label: 'Sim',   activeClass: 'bg-warning/15 text-warning border border-warning/30' },
  ] as const;

  return (
    <header className="h-14 bg-panel-dark border-b border-border flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
      {/* Left: mode switcher + active trades count */}
      <div className="flex items-center gap-3">
        {/* Global mode switcher */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-panel-mid border border-border">
          {MODE_OPTIONS.map(({ value, label, activeClass }) => (
            <button
              key={value}
              onClick={() => setTradeMode(value)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                tradeMode === value ? activeClass : 'text-muted hover:text-foreground',
              )}
              title={value === 'LIVE' ? 'Show only Live trades' : value === 'PAPER' ? 'Show only Simulation trades' : 'Show all trades'}
            >
              {value === 'LIVE' && tradeMode === 'LIVE' && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-profit mr-1.5 align-middle animate-pulse" />
              )}
              {label}
            </button>
          ))}
        </div>

        {/* Active trades indicator */}
        {activeTrades.length > 0 && (
          <div className="hidden sm:flex items-center gap-1.5">
            <span className={liveTrades > 0 ? 'dot-live' : 'dot-paper'} />
            <span className="text-xs text-muted">
              {activeTrades.length} active
              {liveTrades > 0 && <span className="text-profit ml-1">{liveTrades}L</span>}
            </span>
          </div>
        )}
      </div>

      {/* Right: P&L + connection status + notifications + profile */}
      <div className="flex items-center gap-4">
        {/* Today's P&L */}
        <div className="text-right hidden sm:block">
          <p className="text-[10px] text-muted uppercase tracking-wide">Today P&L</p>
          <p className={cn('text-sm price', getPnlClass(todayPnl))}>
            {todayPnl >= 0 ? '+' : ''}{formatCurrency(todayPnl)}
          </p>
        </div>

        {/* Notifications */}
        <div className="relative" ref={notiRef}>
          <button
            onClick={() => { setShowNotifications((v) => !v); setShowProfile(false); }}
            className="relative p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-panel-mid transition-colors"
          >
            <Bell size={16} />
          </button>
          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-panel-dark border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Notifications</p>
              </div>
              <div className="px-4 py-8 text-center">
                <Bell size={24} className="text-muted mx-auto mb-2 opacity-40" />
                <p className="text-sm text-muted">No notifications yet</p>
              </div>
            </div>
          )}
        </div>

        {/* Profile dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => { setShowProfile((v) => !v); setShowNotifications(false); }}
            className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-cyan/30 to-accent-purple/30 border border-border flex items-center justify-center text-xs font-bold text-accent-cyan">
              {profile?.full_name?.[0]?.toUpperCase() ?? profile?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <ChevronDown size={12} className="text-muted hidden sm:block" />
          </button>
          {showProfile && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-panel-dark border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-foreground truncate">
                  {profile?.full_name ?? 'Trader'}
                </p>
                <p className="text-xs text-muted truncate">{profile?.email}</p>
                <span className="mt-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 uppercase tracking-wide">
                  {profile?.tier ?? 'free'}
                </span>
              </div>
              <div className="p-1">
                <button
                  onClick={() => { setShowProfile(false); navigate('/profile'); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:text-foreground hover:bg-panel-mid transition-colors"
                >
                  <User size={14} /> Profile
                </button>
                <button
                  onClick={() => { setShowProfile(false); signOut(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-loss hover:bg-loss/10 transition-colors"
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
