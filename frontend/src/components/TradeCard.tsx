import { type TradeNode, type Protocol } from '@/types';
import {
  formatPrice,
  formatCurrency,
  getPnlClass,
  relativeTime,
  cn,
} from '@/lib/utils';
import { PROTOCOL_META } from '@/lib/constants';
import { TrendingUp, Clock, AlertCircle } from 'lucide-react';

interface TradeCardProps {
  trade: TradeNode;
  onClick?: () => void;
}

function BucketDots({ total, remaining }: { total: number; remaining: number }) {
  const exited = total - remaining;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'w-2.5 h-2.5 rounded-full border transition-all',
            i < exited
              ? 'bg-profit border-profit/50'
              : i === exited && remaining > 0
              ? 'bg-accent-cyan border-accent-cyan/50 animate-pulse'
              : 'bg-panel-mid border-border',
          )}
          title={i < exited ? 'Exited' : i === exited ? 'Active' : 'Pending'}
        />
      ))}
    </div>
  );
}

function PriceBar({ trade }: { trade: TradeNode }) {
  const { entry_price, t1, t2, t3, sl, ltp } = trade;
  const range = t3 - sl;
  if (range <= 0) return null;

  const pct = (val: number) => Math.min(100, Math.max(0, ((val - sl) / range) * 100));

  const entryPct = pct(entry_price);
  const ltpPct = pct(ltp ?? entry_price);
  const t1Pct = pct(t1);
  const t2Pct = pct(t2);
  const t3Pct = pct(t3);

  return (
    <div className="relative h-1.5 bg-panel-mid rounded-full overflow-visible mt-1 mb-3">
      {/* Fill bar */}
      <div
        className={cn(
          'absolute left-0 top-0 h-full rounded-full transition-all duration-700',
          (ltp ?? entry_price) >= entry_price ? 'bg-profit/50' : 'bg-loss/50',
        )}
        style={{ width: `${ltpPct}%` }}
      />
      {/* SL marker */}
      <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-loss rounded-full" style={{ left: '0%' }} title={`SL: ${sl}`} />
      {/* Entry marker */}
      <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-muted rounded-full" style={{ left: `${entryPct}%` }} title={`Entry: ${entry_price}`} />
      {/* T1 */}
      <div className={cn('absolute top-1/2 -translate-y-1/2 w-1 h-3 rounded-full transition-colors', trade.t1_hit ? 'bg-profit' : 'bg-muted/50')} style={{ left: `${t1Pct}%` }} title={`T1: ${t1}`} />
      {/* T2 */}
      <div className={cn('absolute top-1/2 -translate-y-1/2 w-1 h-3 rounded-full transition-colors', trade.t2_hit ? 'bg-profit' : 'bg-muted/50')} style={{ left: `${t2Pct}%` }} title={`T2: ${t2}`} />
      {/* T3 */}
      <div className={cn('absolute top-1/2 -translate-y-1/2 w-1.5 h-4 rounded-full transition-colors', trade.t3_hit ? 'bg-profit' : 'bg-muted/30')} style={{ left: `${t3Pct}%` }} title={`T3: ${t3}`} />
      {/* LTP dot */}
      {ltp && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-accent-cyan border-2 border-navy shadow-glow-cyan transition-all duration-700"
          style={{ left: `calc(${ltpPct}% - 5px)` }}
          title={`LTP: ${ltp}`}
        />
      )}
    </div>
  );
}

export default function TradeCard({ trade, onClick }: TradeCardProps) {
  const meta = PROTOCOL_META[trade.protocol as Protocol];
  const ltp = trade.ltp ?? trade.entry_price;
  const unrealizedPnl = (ltp - trade.entry_price) * trade.remaining_quantity;
  const totalPnl = trade.booked_pnl + unrealizedPnl;
  const isActive = trade.status === 'ACTIVE';

  const glowClass = isActive ? meta.glowClass : 'glow-red';

  return (
    <div
      className={cn(
        'panel rounded-xl p-4 cursor-pointer hover:scale-[1.005] transition-all duration-200 animate-slide-up',
        glowClass,
        trade.status === 'KILLED' && 'opacity-60',
      )}
      onClick={onClick}
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base font-bold text-foreground price">
            {trade.symbol}
          </span>
          <span className="text-sm font-semibold text-muted price">{trade.strike}</span>

          {/* Protocol badge */}
          <span className={cn('badge text-[10px]', meta.tagClass)}>
            {meta.label}
          </span>

          {/* Mode badge */}
          <span
            className={cn(
              'badge text-[10px]',
              trade.mode === 'LIVE'
                ? 'bg-profit/10 text-profit border-profit/30'
                : 'bg-warning/10 text-warning/80 border-warning/30',
            )}
          >
            {trade.mode}
          </span>

          {/* Copy badge */}
          {trade.origin === 'COPY' && (
            <span className="badge text-[10px] bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30">
              COPY
            </span>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isActive && (
            <>
              <span className={trade.mode === 'LIVE' ? 'dot-live' : 'dot-paper'} />
              <span className="text-[10px] text-muted">
                {trade.ltp_source === 'BROKER' ? 'LIVE' : 'SIM'}
              </span>
            </>
          )}
          {trade.status === 'CLOSED' && (
            <span className="text-[10px] text-muted">CLOSED</span>
          )}
          {trade.status === 'KILLED' && (
            <span className="flex items-center gap-1 text-[10px] text-loss">
              <AlertCircle size={10} /> KILLED
            </span>
          )}
        </div>
      </div>

      {/* Price bar */}
      <PriceBar trade={trade} />

      {/* Price levels row */}
      <div className="grid grid-cols-5 gap-1 mb-3 text-center">
        {[
          { label: 'SL', value: trade.sl, hit: trade.sl_hit, cls: 'text-loss' },
          { label: 'Entry', value: trade.entry_price, hit: false, cls: 'text-muted' },
          { label: 'T1', value: trade.t1, hit: trade.t1_hit, cls: trade.t1_hit ? 'text-profit' : 'text-muted' },
          { label: 'T2', value: trade.t2, hit: trade.t2_hit, cls: trade.t2_hit ? 'text-profit' : 'text-muted' },
          { label: 'T3', value: trade.t3, hit: trade.t3_hit, cls: trade.t3_hit ? 'text-profit' : 'text-muted' },
        ].map(({ label, value, cls }) => (
          <div key={label}>
            <p className="text-[9px] text-muted/60 uppercase tracking-wide">{label}</p>
            <p className={cn('text-xs price', cls)}>{formatPrice(value)}</p>
          </div>
        ))}
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <div className="flex items-center gap-3">
          {/* LTP */}
          {isActive && (
            <div>
              <p className="text-[9px] text-muted/60 uppercase tracking-wide">LTP</p>
              <p className={cn('text-sm price', ltp >= trade.entry_price ? 'text-profit' : 'text-loss')}>
                {formatPrice(ltp)}
              </p>
            </div>
          )}

          {/* Buckets */}
          <div>
            <p className="text-[9px] text-muted/60 uppercase tracking-wide mb-1">Buckets</p>
            <BucketDots
              total={PROTOCOL_META[trade.protocol as Protocol] ? Object.keys(PROTOCOL_META).indexOf(trade.protocol) + 2 : 3}
              remaining={trade.remaining_buckets}
            />
          </div>

          {/* Lots */}
          <div>
            <p className="text-[9px] text-muted/60 uppercase tracking-wide">Lots</p>
            <p className="text-xs price text-foreground">{trade.lots}</p>
          </div>
        </div>

        {/* P&L */}
        <div className="text-right">
          <p className="text-[9px] text-muted/60 uppercase tracking-wide">
            {isActive ? 'Total P&L' : 'Final P&L'}
          </p>
          <p className={cn('text-base price', getPnlClass(totalPnl))}>
            {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
          </p>
          {isActive && trade.booked_pnl !== 0 && (
            <p className="text-[10px] text-muted">
              Booked: {formatCurrency(trade.booked_pnl)}
            </p>
          )}
        </div>
      </div>

      {/* Time */}
      <div className="flex items-center gap-1 mt-2">
        <Clock size={10} className="text-muted/50" />
        <span className="text-[10px] text-muted/50">{relativeTime(trade.created_at)}</span>
        {trade.closed_at && (
          <span className="text-[10px] text-muted/50"> · closed {relativeTime(trade.closed_at)}</span>
        )}
      </div>
    </div>
  );
}

// Compact version for tables (9 cols: Symbol, Protocol, Mode, Entry, Exit/LTP, P&L, Status, Date, Expand)
export function TradeCardCompact({
  trade,
  onExpand,
  expanded,
}: {
  trade: TradeNode;
  onExpand?: (id: string) => void;
  expanded?: boolean;
}) {
  const meta = PROTOCOL_META[trade.protocol as Protocol];
  const ltp = trade.ltp ?? trade.entry_price;
  const pnl = trade.realised_pnl !== null && trade.realised_pnl !== undefined
    ? trade.realised_pnl
    : (ltp - trade.entry_price) * trade.remaining_quantity;

  return (
    <tr className="border-b border-border/50 hover:bg-panel-mid/50 transition-colors">
      {/* Symbol */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm text-foreground">{trade.symbol}</span>
          <span className="text-muted text-xs">{trade.strike}</span>
        </div>
      </td>
      {/* Protocol */}
      <td className="py-3 px-4">
        <span className={cn('badge text-[10px]', meta.tagClass)}>{meta.label}</span>
      </td>
      {/* Mode */}
      <td className="py-3 px-4">
        <span className={cn(
          'badge text-[10px]',
          trade.mode === 'LIVE'
            ? 'bg-profit/10 text-profit border-profit/30'
            : 'bg-warning/10 text-warning border-warning/30',
        )}>
          {trade.mode}
        </span>
      </td>
      {/* Entry */}
      <td className="py-3 px-4 price text-sm">{formatPrice(trade.entry_price)}</td>
      {/* Exit / LTP */}
      <td className="py-3 px-4 price text-sm">
        <span className={ltp >= trade.entry_price ? 'text-profit' : 'text-loss'}>
          {trade.exit_price ? formatPrice(trade.exit_price) : formatPrice(ltp)}
        </span>
      </td>
      {/* P&L */}
      <td className="py-3 px-4">
        <span className={cn('price text-sm font-semibold', getPnlClass(pnl))}>
          {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
        </span>
      </td>
      {/* Status */}
      <td className="py-3 px-4">
        <span className={cn(
          'badge text-[10px]',
          trade.status === 'ACTIVE' ? 'bg-profit/10 text-profit border-profit/30' :
          trade.status === 'CLOSED' ? 'bg-muted/10 text-muted border-muted/30' :
          'bg-loss/10 text-loss border-loss/30',
        )}>
          {trade.status}
        </span>
      </td>
      {/* Date */}
      <td className="py-3 px-4 text-xs text-muted">
        {relativeTime(trade.created_at)}
      </td>
      {/* Expand */}
      <td className="py-3 px-4">
        {onExpand && (
          <button
            onClick={() => onExpand(trade.id)}
            className="text-muted hover:text-foreground transition-colors text-xs"
          >
            {expanded ? '▲' : '▼'}
          </button>
        )}
      </td>
    </tr>
  );
}
