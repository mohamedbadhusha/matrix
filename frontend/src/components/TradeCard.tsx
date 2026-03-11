import { type TradeNode, type Protocol } from '@/types';
import {
  formatPrice,
  formatCurrency,
  getPnlClass,
  relativeTime,
  cn,
} from '@/lib/utils';
import { PROTOCOL_META } from '@/lib/constants';
import { TrendingUp, Clock, AlertCircle, Trash2, Pencil, Check, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface TradeCardProps {
  trade: TradeNode;
  onClick?: () => void;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, updates: Partial<TradeNode>) => Promise<void>;
}

// ── Sub-status helper (partial booking, pending entry) ─────────────────────
function getSubStatus(trade: TradeNode): { label: string; cls: string } | null {
  if (trade.status !== 'ACTIVE') return null;
  if (trade.mode === 'LIVE' && !trade.broker_order_id) {
    return { label: 'ENTRY PENDING', cls: 'bg-warning/10 text-warning border-warning/30' };
  }
  if (trade.t2_hit) return { label: 'T2 BOOKED', cls: 'bg-profit/10 text-profit border-profit/30' };
  if (trade.t1_hit) return { label: 'T1 BOOKED', cls: 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30' };
  return null;
}

// ── Inline edit form ───────────────────────────────────────────────────────
function EditTradeForm({
  trade,
  onSave,
  onCancel,
}: {
  trade: TradeNode;
  onSave: (updates: Partial<TradeNode>) => Promise<void>;
  onCancel: () => void;
}) {
  const [sl, setSl] = useState(String(trade.sl));
  const [t1, setT1] = useState(String(trade.t1));
  const [t2, setT2] = useState(String(trade.t2));
  const [t3, setT3] = useState(String(trade.t3));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const slV = parseFloat(sl);
    const t1V = parseFloat(t1);
    const t2V = parseFloat(t2);
    const t3V = parseFloat(t3);
    if ([slV, t1V, t2V, t3V].some(isNaN)) {
      toast.error('All price fields must be valid numbers');
      return;
    }
    if (slV >= trade.entry_price) {
      toast.error('SL must be below entry price');
      return;
    }
    if (!(t1V < t2V && t2V < t3V)) {
      toast.error('Targets must be ordered: T1 < T2 < T3');
      return;
    }
    setSaving(true);
    try {
      await onSave({ sl: slV, t1: t1V, t2: t2V, t3: t3V });
      toast.success('Trade levels updated — worker will use new values on next tick');
      onCancel();
    } catch {
      toast.error('Failed to save — check console');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="mt-3 pt-3 border-t border-border/50 space-y-3 animate-slide-up"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">Edit Levels</p>
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: 'Stop Loss', val: sl, set: setSl, cls: 'text-loss' },
          { label: 'Target 1',  val: t1, set: setT1, cls: 'text-profit' },
          { label: 'Target 2',  val: t2, set: setT2, cls: 'text-profit' },
          { label: 'Target 3',  val: t3, set: setT3, cls: 'text-profit' },
        ].map(({ label, val, set, cls }) => (
          <div key={label}>
            <label className="text-[9px] text-muted/60 uppercase tracking-wide block mb-1">{label}</label>
            <input
              type="number"
              step="0.05"
              className={cn('input-base text-xs w-full', cls)}
              value={val}
              onChange={(e) => set(e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-profit/15 text-profit border border-profit/30 hover:bg-profit/25 transition-colors disabled:opacity-50"
        >
          <Check size={11} /> {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-panel-mid text-muted border border-border hover:text-foreground transition-colors"
        >
          <X size={11} /> Cancel
        </button>
      </div>
    </div>
  );
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

export default function TradeCard({ trade, onClick, onDelete, onEdit }: TradeCardProps) {
  const meta = PROTOCOL_META[trade.protocol as Protocol];
  const ltp = trade.ltp ?? trade.entry_price;
  const unrealizedPnl = (ltp - trade.entry_price) * trade.remaining_quantity;
  const totalPnl = trade.booked_pnl + unrealizedPnl;
  const isActive = trade.status === 'ACTIVE';
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const subStatus = getSubStatus(trade);
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
        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
          {/* Sub-status (ENTRY PENDING / T1 BOOKED / T2 BOOKED) */}
          {subStatus && (
            <span className={cn('badge text-[10px]', subStatus.cls)}>{subStatus.label}</span>
          )}
          {isActive ? (
            <>
              <span className={trade.mode === 'LIVE' ? 'dot-live' : 'dot-paper'} />
              <span className="text-[10px] text-muted">
                {trade.mode === 'LIVE' ? 'LIVE' : 'SIM'}
              </span>
            </>
          ) : trade.status === 'CLOSED' ? (
            <span className="badge text-[10px] bg-muted/10 text-muted border-muted/30">CLOSED</span>
          ) : trade.status === 'SL_HIT' ? (
            <span className="flex items-center gap-1 badge text-[10px] bg-loss/10 text-loss border-loss/30">
              <AlertCircle size={10} /> SL HIT
            </span>
          ) : trade.status === 'KILLED' ? (
            <span className="flex items-center gap-1 badge text-[10px] bg-loss/10 text-loss border-loss/30">
              <AlertCircle size={10} /> KILLED
            </span>
          ) : null}
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
          {isActive && (
            <div className="space-y-0.5 mt-0.5">
              {trade.booked_pnl !== 0 && (
                <p className={cn('text-[10px] font-semibold', getPnlClass(trade.booked_pnl))}>
                  Booked {trade.booked_pnl >= 0 ? '+' : ''}{formatCurrency(trade.booked_pnl)}
                </p>
              )}
              {trade.remaining_quantity > 0 && (
                <p className={cn('text-[10px]', getPnlClass(unrealizedPnl))}>
                  Open {unrealizedPnl >= 0 ? '+' : ''}{formatCurrency(unrealizedPnl)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Time + action buttons */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1">
          <Clock size={10} className="text-muted/50" />
          <span className="text-[10px] text-muted/50">{relativeTime(trade.created_at)}</span>
          {trade.closed_at && (
            <span className="text-[10px] text-muted/50"> · closed {relativeTime(trade.closed_at)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Edit button — only for active trades */}
          {isActive && onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); setEditOpen((v) => !v); }}
              className={cn(
                'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors',
                editOpen
                  ? 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30'
                  : 'bg-panel-mid text-muted border-border hover:text-accent-cyan hover:border-accent-cyan/30',
              )}
              title="Edit SL / Targets"
            >
              <Pencil size={10} /> Edit
            </button>
          )}
          {onDelete && (
            <div className="flex items-center gap-1.5">
              {confirmDelete ? (
                <>
                  <span className="text-[10px] text-loss">Delete?</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(trade.id); }}
                    className="text-[10px] px-2 py-0.5 rounded bg-loss/20 text-loss border border-loss/30 hover:bg-loss/40 transition-colors"
                  >
                    Yes
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                    className="text-[10px] px-2 py-0.5 rounded bg-panel-mid text-muted border border-border hover:text-foreground transition-colors"
                  >
                    No
                  </button>
                </>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                  className="text-muted/40 hover:text-loss transition-colors p-1 rounded hover:bg-loss/10"
                  title="Delete trade"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit form (inline, only shown when editOpen) */}
      {editOpen && onEdit && (
        <EditTradeForm
          trade={trade}
          onSave={(updates) => onEdit(trade.id, updates)}
          onCancel={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}

// Compact version for tables (9 cols: Symbol, Protocol, Mode, Entry, Exit/LTP, P&L, Status, Date, Actions)
export function TradeCardCompact({
  trade,
  onExpand,
  expanded,
  onDelete,
  onEdit,
}: {
  trade: TradeNode;
  onExpand?: (id: string) => void;
  expanded?: boolean;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, updates: Partial<TradeNode>) => Promise<void>;
}) {
  const meta = PROTOCOL_META[trade.protocol as Protocol];
  const ltp = trade.ltp ?? trade.entry_price;
  const isActive = trade.status === 'ACTIVE';
  const bookedPnl = trade.booked_pnl ?? 0;
  const openPnl = isActive ? (ltp - trade.entry_price) * trade.remaining_quantity : 0;
  const pnl = trade.realised_pnl !== null && trade.realised_pnl !== undefined
    ? trade.realised_pnl
    : bookedPnl + openPnl;
  const subStatus = getSubStatus(trade);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <tr className="border-b border-border/50 hover:bg-panel-mid/50 transition-colors">
        {/* Symbol */}
        <td className="py-3 px-4">
          <div className="flex items-center gap-1.5 flex-wrap">
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
          <div>
            <span className={cn('price text-sm font-semibold', getPnlClass(pnl))}>
              {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
            </span>
            {isActive && bookedPnl !== 0 && (
              <p className={cn('text-[10px]', getPnlClass(bookedPnl))}>
                Bkd {bookedPnl >= 0 ? '+' : ''}{formatCurrency(bookedPnl)}
              </p>
            )}
          </div>
        </td>
        {/* Status */}
        <td className="py-3 px-4">
          <div className="flex flex-col gap-1">
            <span className={cn(
              'badge text-[10px] w-fit',
              trade.status === 'ACTIVE'  ? 'bg-profit/10 text-profit border-profit/30' :
              trade.status === 'CLOSED'  ? 'bg-muted/10 text-muted border-muted/30' :
              trade.status === 'SL_HIT'  ? 'bg-loss/10 text-loss border-loss/30' :
              'bg-loss/10 text-loss border-loss/30',
            )}>
              {trade.status === 'SL_HIT' ? 'SL HIT' : trade.status}
            </span>
            {subStatus && (
              <span className={cn('badge text-[10px] w-fit', subStatus.cls)}>
                {subStatus.label}
              </span>
            )}
          </div>
        </td>
        {/* Date */}
        <td className="py-3 px-4 text-xs text-muted">
          {relativeTime(trade.created_at)}
          {trade.closed_at && (
            <p className="text-[10px] text-muted/50">↳ {relativeTime(trade.closed_at)}</p>
          )}
        </td>
        {/* Actions */}
        <td className="py-3 px-4">
          <div className="flex items-center gap-1.5">
            {onExpand && (
              <button
                onClick={() => onExpand(trade.id)}
                className="text-muted hover:text-foreground transition-colors text-xs"
              >
                {expanded ? '▲' : '▼'}
              </button>
            )}
            {isActive && onEdit && (
              <button
                onClick={() => setEditOpen((v) => !v)}
                className={cn(
                  'p-1 rounded transition-colors',
                  editOpen ? 'text-accent-cyan' : 'text-muted/40 hover:text-accent-cyan hover:bg-accent-cyan/10',
                )}
                title="Edit SL / Targets"
              >
                <Pencil size={11} />
              </button>
            )}
            {onDelete && (
              confirmDelete ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onDelete(trade.id)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-loss/20 text-loss border border-loss/30 hover:bg-loss/40 transition-colors"
                  >
                    Del
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-panel-mid text-muted border border-border hover:text-foreground transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-muted/40 hover:text-loss transition-colors p-1 rounded hover:bg-loss/10"
                  title="Delete trade"
                >
                  <Trash2 size={12} />
                </button>
              )
            )}
          </div>
        </td>
      </tr>
      {/* Inline edit row */}
      {editOpen && onEdit && (
        <tr>
          <td colSpan={9} className="px-4 pb-3 bg-panel-mid/40">
            <EditTradeForm
              trade={trade}
              onSave={(updates) => onEdit(trade.id, updates)}
              onCancel={() => setEditOpen(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}
