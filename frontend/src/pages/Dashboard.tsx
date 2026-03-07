import { useNavigate } from 'react-router-dom';
import { useTrades } from '@/app/providers/TradeProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import TradeCard from '@/components/TradeCard';
import LoadingScreen from '@/components/ui/LoadingScreen';
import {
  formatCurrency,
  getPnlClass,
  cn,
} from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Activity,
  ArrowRight,
  Plus,
} from 'lucide-react';
import { DAILY_TRADE_LIMITS } from '@/lib/constants';

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  valueClass?: string;
}) {
  return (
    <div className="panel p-4 flex items-start justify-between">
      <div>
        <p className="text-xs text-muted uppercase tracking-wide mb-1">{label}</p>
        <p className={cn('text-xl font-bold price', valueClass ?? 'text-foreground')}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      </div>
      <div className="w-9 h-9 rounded-lg bg-panel-mid border border-border flex items-center justify-center text-muted">
        <Icon size={18} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { activeTrades, allTrades, loadingTrades, deleteTrade } = useTrades();
  const { profile } = useAuth();
  const navigate = useNavigate();

  if (loadingTrades) return <LoadingScreen fullScreen={false} message="Loading trades…" />;

  // Compute stats
  const today = new Date().toDateString();
  const todayTrades = allTrades.filter(
    (t) => new Date(t.created_at).toDateString() === today,
  );
  const todayPnl = todayTrades.reduce((sum, t) => {
    const ltp = t.ltp ?? t.entry_price;
    return sum + t.booked_pnl + (ltp - t.entry_price) * t.remaining_quantity;
  }, 0);

  const closedTrades = allTrades.filter((t) => t.status === 'CLOSED');
  const winningTrades = closedTrades.filter((t) => t.booked_pnl > 0);
  const winRate = closedTrades.length > 0
    ? Math.round((winningTrades.length / closedTrades.length) * 100)
    : 0;

  const dailyLimit = DAILY_TRADE_LIMITS[profile?.tier ?? 'free'];
  const tradesLeft = dailyLimit === Infinity
    ? '∞'
    : String(dailyLimit - (profile?.daily_trades_used ?? 0));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {getGreeting()},{' '}
            <span className="text-gradient-cyan">
              {profile?.full_name?.split(' ')[0] ?? 'Trader'}
            </span>
          </h1>
          <p className="text-sm text-muted mt-0.5">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
          </p>
        </div>
        <button
          onClick={() => navigate('/deploy')}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          Deploy Trade
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Today P&L"
          value={`${todayPnl >= 0 ? '+' : ''}${formatCurrency(todayPnl)}`}
          sub={`${todayTrades.length} trade${todayTrades.length !== 1 ? 's' : ''} today`}
          icon={todayPnl >= 0 ? TrendingUp : TrendingDown}
          valueClass={getPnlClass(todayPnl)}
        />
        <StatCard
          label="Active Trades"
          value={String(activeTrades.length)}
          sub={activeTrades.filter(t => t.mode === 'LIVE').length + ' LIVE'}
          icon={Activity}
        />
        <StatCard
          label="Win Rate"
          value={`${winRate}%`}
          sub={`${winningTrades.length} / ${closedTrades.length} closed`}
          icon={TrendingUp}
          valueClass={winRate >= 50 ? 'text-profit' : 'text-loss'}
        />
        <StatCard
          label="Trades Left Today"
          value={tradesLeft}
          sub={`${profile?.tier?.toUpperCase()} tier`}
          icon={Zap}
          valueClass={tradesLeft === '0' ? 'text-loss' : 'text-foreground'}
        />
      </div>

      {/* Active trades */}
      {activeTrades.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="dot-live" />
              Active Trades
              <span className="badge bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30 text-[10px]">
                {activeTrades.length}
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {activeTrades.map((trade) => (
              <TradeCard key={trade.id} trade={trade} onDelete={deleteTrade} />
            ))}
          </div>
        </div>
      ) : (
        <div className="panel p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-panel-mid border border-border flex items-center justify-center mx-auto mb-4">
            <Zap size={24} className="text-muted" />
          </div>
          <p className="text-foreground font-medium mb-1">No active trades</p>
          <p className="text-muted text-sm mb-4">
            Deploy your first trade to get started
          </p>
          <button
            onClick={() => navigate('/deploy')}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus size={15} /> Deploy Trade
          </button>
        </div>
      )}

      {/* Recent trades preview */}
      {closedTrades.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground">Recent Trades</h2>
            <button
              onClick={() => navigate('/trades')}
              className="text-xs text-accent-cyan hover:text-cyan-300 flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight size={12} />
            </button>
          </div>
          <div className="panel overflow-hidden">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Protocol</th>
                  <th>Entry</th>
                  <th>P&L</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {closedTrades.slice(0, 5).map((trade) => (
                  <tr key={trade.id} className="border-b border-border/50 hover:bg-panel-mid/50 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-semibold text-sm">{trade.symbol}</span>{' '}
                      <span className="text-muted text-xs">{trade.strike}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="badge text-[10px] bg-panel-mid border-border text-muted">
                        {trade.protocol.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 price text-sm">{trade.entry_price}</td>
                    <td className="py-3 px-4">
                      <span className={cn('price text-sm', getPnlClass(trade.booked_pnl))}>
                        {trade.booked_pnl >= 0 ? '+' : ''}{formatCurrency(trade.booked_pnl)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="badge text-[10px] bg-muted/10 text-muted border-muted/30">
                        {trade.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
