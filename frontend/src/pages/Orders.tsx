/**
 * Orders.tsx
 * Dhan order management page — place, modify, cancel, view order book & trade book.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type {
  BrokerAccount,
  DhanOrder,
  DhanTrade,
  DhanSuperOrder,
  DhanForeverOrder,
  PlaceOrderPayload,
  ModifyOrderPayload,
  DhanOrderType,
  DhanProductType,
  DhanTransactionType,
  DhanValidity,
  DhanForeverOrderFlag,
} from '@/types';
import {
  RefreshCw,
  Plus,
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Ban,
  ArrowUpRight,
  ArrowDownRight,
  Pencil,
  ListOrdered,
  BarChart3,
  Layers,
  BookMarked,
  ChevronDown,
  Target,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const EXCHANGE_SEGMENTS = [
  'NSE_EQ', 'BSE_EQ', 'NSE_FNO', 'BSE_FNO',
  'NSE_CURRENCY', 'BSE_CURRENCY', 'MCX_COMM',
];

const MODIFIABLE_STATUSES: DhanOrder['orderStatus'][] = ['TRANSIT', 'PENDING'];
const CANCELLABLE_STATUSES: DhanOrder['orderStatus'][] = ['TRANSIT', 'PENDING', 'PART_TRADED'];

// ─────────────────────────────────────────────────────────────────────────────
// Order status badge
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DhanOrder['orderStatus'] | undefined | null }) {
  if (!status) return <span className="text-xs text-muted">—</span>;

  const cfg: Record<string, { cls: string; icon: React.ReactNode }> = {
    TRANSIT:     { cls: 'bg-warning/10 text-warning border-warning/30',    icon: <Clock size={10} /> },
    PENDING:     { cls: 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30', icon: <Clock size={10} /> },
    PART_TRADED: { cls: 'bg-accent-purple/10 text-accent-purple border-accent-purple/30', icon: <CheckCircle2 size={10} /> },
    TRADED:      { cls: 'bg-profit/10 text-profit border-profit/30',       icon: <CheckCircle2 size={10} /> },
    REJECTED:    { cls: 'bg-loss/10 text-loss border-loss/30',             icon: <AlertTriangle size={10} /> },
    CANCELLED:   { cls: 'bg-muted/10 text-muted border-muted/30',          icon: <Ban size={10} /> },
    EXPIRED:     { cls: 'bg-muted/10 text-muted border-muted/30',          icon: <Ban size={10} /> },
  };
  const { cls, icon } = cfg[status] ?? { cls: 'bg-muted/10 text-muted', icon: null };

  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border', cls)}>
      {icon}{status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Place Order Form
// ─────────────────────────────────────────────────────────────────────────────

interface PlaceOrderFormProps {
  brokerId: string;
  onDone: () => void;
  onClose: () => void;
}

function PlaceOrderForm({ brokerId, onDone, onClose }: PlaceOrderFormProps) {
  const [form, setForm] = useState<Omit<PlaceOrderPayload, 'brokerId'>>({
    transactionType: 'BUY',
    exchangeSegment: 'NSE_FNO',
    productType: 'INTRADAY',
    orderType: 'MARKET',
    validity: 'DAY',
    securityId: '',
    tradingSymbol: '',
    quantity: 1,
    price: 0,
    triggerPrice: 0,
    afterMarketOrder: false,
    slicing: false,
  });
  const [saving, setSaving] = useState(false);

  const needsPrice = form.orderType === 'LIMIT' || form.orderType === 'STOP_LOSS';
  const needsTrigger = form.orderType === 'STOP_LOSS' || form.orderType === 'STOP_LOSS_MARKET';

  const Field = ({
    label, children, col2 = false,
  }: { label: string; children: React.ReactNode; col2?: boolean }) => (
    <div className={col2 ? 'col-span-2' : ''}>
      <label className="block text-xs text-muted mb-1.5">{label}</label>
      {children}
    </div>
  );

  const handleSubmit = async () => {
    if (!form.securityId.trim()) { toast.error('Security ID is required'); return; }
    if (form.quantity < 1) { toast.error('Quantity must be at least 1'); return; }
    if (needsPrice && (!form.price || form.price <= 0)) { toast.error('Price required for this order type'); return; }
    if (needsTrigger && (!form.triggerPrice || form.triggerPrice <= 0)) { toast.error('Trigger price required'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/dhan-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId, ...form }),
      });
      const data = await res.json() as { orderId?: string; orderStatus?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Order placement failed');
      toast.success(`Order placed — ID: ${data.orderId ?? '?'} · Status: ${data.orderStatus ?? '?'}`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to place order');
    }
    setSaving(false);
  };

  return (
    <div className="panel p-5 space-y-4 border-l-2 border-accent-cyan/50 animate-slide-up">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Place New Order</h3>
        <button onClick={onClose} className="text-muted hover:text-foreground"><X size={16} /></button>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {/* Transaction type */}
        <Field label="Side">
          <div className="flex gap-2">
            {(['BUY', 'SELL'] as DhanTransactionType[]).map((t) => (
              <button
                key={t}
                onClick={() => setForm((f) => ({ ...f, transactionType: t }))}
                className={cn(
                  'flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all',
                  form.transactionType === t
                    ? t === 'BUY'
                      ? 'bg-profit/15 border-profit/50 text-profit'
                      : 'bg-loss/15 border-loss/50 text-loss'
                    : 'border-border text-muted hover:text-foreground',
                )}
              >
                {t === 'BUY' ? <ArrowUpRight size={12} className="inline mr-1" /> : <ArrowDownRight size={12} className="inline mr-1" />}
                {t}
              </button>
            ))}
          </div>
        </Field>

        {/* Exchange */}
        <Field label="Exchange Segment">
          <select
            className="input-base"
            value={form.exchangeSegment}
            onChange={(e) => setForm((f) => ({ ...f, exchangeSegment: e.target.value }))}
          >
            {EXCHANGE_SEGMENTS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>

        {/* Product type */}
        <Field label="Product Type">
          <select
            className="input-base"
            value={form.productType}
            onChange={(e) => setForm((f) => ({ ...f, productType: e.target.value as DhanProductType }))}
          >
            {(['CNC', 'INTRADAY', 'MARGIN', 'MTF', 'CO', 'BO'] as DhanProductType[]).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>

        {/* Order type */}
        <Field label="Order Type">
          <select
            className="input-base"
            value={form.orderType}
            onChange={(e) => setForm((f) => ({ ...f, orderType: e.target.value as DhanOrderType }))}
          >
            {(['MARKET', 'LIMIT', 'STOP_LOSS', 'STOP_LOSS_MARKET'] as DhanOrderType[]).map((o) => (
              <option key={o} value={o}>{o.replace('_', ' ')}</option>
            ))}
          </select>
        </Field>

        {/* Trading symbol */}
        <Field label="Trading Symbol">
          <input
            className="input-base font-mono uppercase"
            placeholder="NIFTY24MAY18000CE"
            value={form.tradingSymbol ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, tradingSymbol: e.target.value.toUpperCase() }))}
          />
        </Field>

        {/* Security ID */}
        <Field label="Security ID">
          <input
            className="input-base font-mono"
            placeholder="11536"
            value={form.securityId}
            onChange={(e) => setForm((f) => ({ ...f, securityId: e.target.value }))}
          />
        </Field>

        {/* Quantity */}
        <Field label="Quantity">
          <input
            className="input-base font-mono"
            type="number"
            min={1}
            value={form.quantity}
            onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
          />
        </Field>

        {/* Validity */}
        <Field label="Validity">
          <select
            className="input-base"
            value={form.validity}
            onChange={(e) => setForm((f) => ({ ...f, validity: e.target.value as DhanValidity }))}
          >
            <option value="DAY">DAY</option>
            <option value="IOC">IOC</option>
          </select>
        </Field>

        {/* Price — conditional */}
        {needsPrice && (
          <Field label="Price">
            <input
              className="input-base font-mono"
              type="number"
              step="0.05"
              value={form.price ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
            />
          </Field>
        )}

        {/* Trigger price — conditional */}
        {needsTrigger && (
          <Field label="Trigger Price">
            <input
              className="input-base font-mono"
              type="number"
              step="0.05"
              value={form.triggerPrice ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, triggerPrice: Number(e.target.value) }))}
            />
          </Field>
        )}

        {/* Correlation ID */}
        <Field label="Correlation ID (optional)" col2>
          <input
            className="input-base font-mono text-xs"
            maxLength={30}
            placeholder="Your tracking tag (max 30 chars)"
            value={form.correlationId ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, correlationId: e.target.value }))}
          />
        </Field>

        {/* Options */}
        <div className="col-span-2 flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-3.5 h-3.5"
              checked={form.slicing ?? false}
              onChange={(e) => setForm((f) => ({ ...f, slicing: e.target.checked }))}
            />
            Slice order (over freeze limit)
          </label>
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-3.5 h-3.5"
              checked={form.afterMarketOrder ?? false}
              onChange={(e) => setForm((f) => ({ ...f, afterMarketOrder: e.target.checked }))}
            />
            After Market Order (AMO)
          </label>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className={cn(
            'flex-1 py-2 rounded-xl text-sm font-semibold border transition-all',
            form.transactionType === 'BUY'
              ? 'bg-profit/15 border-profit/50 text-profit hover:bg-profit/25'
              : 'bg-loss/15 border-loss/50 text-loss hover:bg-loss/25',
          )}
        >
          {saving ? 'Placing…' : `Place ${form.transactionType} Order`}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modify Order Form (inline panel below a row)
// ─────────────────────────────────────────────────────────────────────────────

interface ModifyPanelProps {
  order: DhanOrder;
  brokerId: string;
  onDone: () => void;
  onClose: () => void;
}

function ModifyPanel({ order, brokerId, onDone, onClose }: ModifyPanelProps) {
  const [form, setForm] = useState<Omit<ModifyOrderPayload, 'brokerId' | 'orderId'>>({
    orderType: order.orderType,
    quantity: order.quantity,
    price: order.price,
    triggerPrice: order.triggerPrice,
    validity: order.validity,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/dhan-modify-order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId, orderId: order.orderId, ...form }),
      });
      const data = await res.json() as { orderId?: string; orderStatus?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Modification failed');
      toast.success(`Order ${order.orderId} modified · Status: ${data.orderStatus}`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Modify failed');
    }
    setSaving(false);
  };

  return (
    <div className="mt-2 p-3 rounded-xl bg-border/20 space-y-3 animate-slide-up">
      <p className="text-xs font-semibold text-foreground">Modify Order {order.orderId}</p>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="block text-[10px] text-muted mb-1">Order Type</label>
          <select
            className="input-base text-xs"
            value={form.orderType}
            onChange={(e) => setForm((f) => ({ ...f, orderType: e.target.value as DhanOrderType }))}
          >
            {(['LIMIT', 'MARKET', 'STOP_LOSS', 'STOP_LOSS_MARKET'] as DhanOrderType[]).map((o) => (
              <option key={o} value={o}>{o.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-muted mb-1">Quantity</label>
          <input
            type="number"
            className="input-base text-xs font-mono"
            value={form.quantity ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted mb-1">Price</label>
          <input
            type="number"
            step="0.05"
            className="input-base text-xs font-mono"
            value={form.price ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted mb-1">Trigger</label>
          <input
            type="number"
            step="0.05"
            className="input-base text-xs font-mono"
            value={form.triggerPrice ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, triggerPrice: Number(e.target.value) }))}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="btn-secondary text-xs flex-1">Cancel</button>
        <button onClick={handleSubmit} disabled={saving} className="btn-primary text-xs flex-1">
          {saving ? 'Saving…' : 'Update Order'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'orders' | 'trades' | 'super' | 'forever';

export default function Orders() {
  const { profile } = useAuth();
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);
  const [selectedBroker, setSelectedBroker] = useState<string>('');

  const [tab, setTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<DhanOrder[]>([]);
  const [trades, setTrades] = useState<DhanTrade[]>([]);
  const [superOrders, setSuperOrders] = useState<DhanSuperOrder[]>([]);
  const [foreverOrders, setForeverOrders] = useState<DhanForeverOrder[]>([]);

  const [loading, setLoading] = useState(false);
  const [showPlaceForm, setShowPlaceForm] = useState(false);
  const [showSuperForm, setShowSuperForm] = useState(false);
  const [showForeverForm, setShowForeverForm] = useState(false);
  const [modifyingOrder, setModifyingOrder] = useState<string | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<string | null>(null);
  const [modifyingSuperOrder, setModifyingSuperOrder] = useState<string | null>(null);
  const [cancellingForeverOrder, setCancellingForeverOrder] = useState<string | null>(null);
  const [expandedSuperLegs, setExpandedSuperLegs] = useState<Set<string>>(new Set());

  // Filter state
  const [filterSide, setFilterSide] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // ── Load brokers ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    supabase
      .from('broker_accounts')
      .select('*')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .then(({ data }) => {
        const list = (data ?? []) as BrokerAccount[];
        setBrokers(list);
        if (list.length > 0 && !selectedBroker) setSelectedBroker(list[0].id);
      });
  }, [profile]);

  // ── Fetch order book ────────────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    if (!selectedBroker) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dhan-orderbook?brokerId=${selectedBroker}`);
      const data = await res.json() as DhanOrder[] | { error: string };
      if (res.ok && Array.isArray(data)) setOrders(data);
      else toast.error((data as { error: string }).error ?? 'Failed to load orders');
    } catch {
      toast.error('Network error fetching orders');
    }
    setLoading(false);
  }, [selectedBroker]);

  // ── Fetch trade book ─────────────────────────────────────────────────────
  const fetchTrades = useCallback(async () => {
    if (!selectedBroker) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dhan-tradebook?brokerId=${selectedBroker}`);
      const data = await res.json() as DhanTrade[] | { error: string };
      if (res.ok && Array.isArray(data)) setTrades(data);
      else toast.error((data as { error: string }).error ?? 'Failed to load trades');
    } catch {
      toast.error('Network error fetching trades');
    }
    setLoading(false);
  }, [selectedBroker]);

  // ── Fetch super order book ─────────────────────────────────────────────
  const fetchSuperOrders = useCallback(async () => {
    if (!selectedBroker) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dhan-super-orderbook?brokerId=${selectedBroker}`);
      const data = await res.json() as DhanSuperOrder[] | { error: string };
      if (res.ok && Array.isArray(data)) setSuperOrders(data);
      else toast.error((data as { error: string }).error ?? 'Failed to load super orders');
    } catch {
      toast.error('Network error fetching super orders');
    }
    setLoading(false);
  }, [selectedBroker]);

  // ── Fetch forever order book ───────────────────────────────────────────
  const fetchForeverOrders = useCallback(async () => {
    if (!selectedBroker) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dhan-forever-orderbook?brokerId=${selectedBroker}`);
      const data = await res.json() as DhanForeverOrder[] | { error: string };
      if (res.ok && Array.isArray(data)) setForeverOrders(data);
      else toast.error((data as { error: string }).error ?? 'Failed to load forever orders');
    } catch {
      toast.error('Network error fetching forever orders');
    }
    setLoading(false);
  }, [selectedBroker]);

  useEffect(() => {
    if (!selectedBroker) return;
    if (tab === 'orders') fetchOrders();
    else if (tab === 'trades') fetchTrades();
    else if (tab === 'super') fetchSuperOrders();
    else if (tab === 'forever') fetchForeverOrders();
  }, [selectedBroker, tab, fetchOrders, fetchTrades, fetchSuperOrders, fetchForeverOrders]);

  // ── Cancel order ────────────────────────────────────────────────────────
  const handleCancel = async (orderId: string) => {
    if (!confirm(`Cancel order ${orderId}?`)) return;
    setCancellingOrder(orderId);
    try {
      const res = await fetch('/api/dhan-cancel-order', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId: selectedBroker, orderId }),
      });
      const data = await res.json() as { orderStatus?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Cancel failed');
      toast.success(`Order ${orderId} cancelled`);
      fetchOrders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cancel failed');
    }
    setCancellingOrder(null);
  };

  // ── Filtered orders ─────────────────────────────────────────────────────
  const filteredOrders = orders.filter((o) => {
    if (filterSide !== 'ALL' && o.transactionType !== filterSide) return false;
    if (filterStatus !== 'ALL' && o.orderStatus !== filterStatus) return false;
    return true;
  });

  const uniqueStatuses = ['ALL', ...Array.from(new Set(orders.map((o) => o.orderStatus)))];

  // ── P&L row for trades ──────────────────────────────────────────────────
  const tradePnl = trades.reduce((sum, t) => {
    return sum + (t.transactionType === 'SELL' ? 1 : -1) * t.tradedPrice * t.tradedQuantity;
  }, 0);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Orders</h1>
          <p className="text-sm text-muted mt-0.5">Dhan order book &amp; trade book</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Broker selector */}
          <select
            className="input-base text-sm min-w-[200px]"
            value={selectedBroker}
            onChange={(e) => setSelectedBroker(e.target.value)}
          >
            {brokers.length === 0 && <option value="">No active brokers</option>}
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.broker} · {b.client_id} ({b.mode})
              </option>
            ))}
          </select>
          {/* Refresh */}
          <button
            onClick={() => {
              if (tab === 'orders') fetchOrders();
              else if (tab === 'trades') fetchTrades();
              else if (tab === 'super') fetchSuperOrders();
              else fetchForeverOrders();
            }}
            disabled={loading || !selectedBroker}
            className="text-xs flex items-center gap-1.5 border border-border text-muted hover:text-foreground px-3 py-2 rounded-lg transition-all"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {/* Place order — contextual label */}
          {(tab === 'orders') && (
            <button onClick={() => setShowPlaceForm((v) => !v)} disabled={!selectedBroker} className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={15} /> Place Order
            </button>
          )}
          {(tab === 'super') && (
            <button onClick={() => setShowSuperForm((v) => !v)} disabled={!selectedBroker} className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={15} /> Place Super Order
            </button>
          )}
          {(tab === 'forever') && (
            <button onClick={() => setShowForeverForm((v) => !v)} disabled={!selectedBroker} className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={15} /> Place Forever Order
            </button>
          )}
        </div>
      </div>

      {/* Place Order Form */}
      {showPlaceForm && selectedBroker && (
        <PlaceOrderForm
          brokerId={selectedBroker}
          onDone={fetchOrders}
          onClose={() => setShowPlaceForm(false)}
        />
      )}
      {showSuperForm && selectedBroker && (
        <PlaceSuperOrderForm
          brokerId={selectedBroker}
          onDone={fetchSuperOrders}
          onClose={() => setShowSuperForm(false)}
        />
      )}
      {showForeverForm && selectedBroker && (
        <PlaceForeverOrderForm
          brokerId={selectedBroker}
          onDone={fetchForeverOrders}
          onClose={() => setShowForeverForm(false)}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {([
          { key: 'orders',  label: 'Order Book',    icon: ListOrdered, count: orders.length },
          { key: 'trades',  label: 'Trade Book',    icon: BarChart3,   count: trades.length },
          { key: 'super',   label: 'Super Orders',  icon: Layers,      count: superOrders.length },
          { key: 'forever', label: 'Forever Orders', icon: BookMarked, count: foreverOrders.length },
        ] as const).map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key as Tab)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all whitespace-nowrap',
              tab === key
                ? 'border-accent-cyan text-accent-cyan'
                : 'border-transparent text-muted hover:text-foreground',
            )}
          >
            <Icon size={14} />
            {label}
            {count > 0 && (
              <span className="ml-1 text-[10px] bg-border px-1.5 py-0.5 rounded-full">{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── ORDER BOOK TAB ─────────────────────────────────────────────── */}
      {tab === 'orders' && (
        <div className="space-y-3">
          {/* Filters */}
          {orders.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1">
                {(['ALL', 'BUY', 'SELL'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilterSide(s)}
                    className={cn(
                      'text-xs px-3 py-1.5 rounded-lg border transition-all',
                      filterSide === s
                        ? s === 'BUY'
                          ? 'bg-profit/15 border-profit/40 text-profit'
                          : s === 'SELL'
                          ? 'bg-loss/15 border-loss/40 text-loss'
                          : 'bg-accent-cyan/15 border-accent-cyan/40 text-accent-cyan'
                        : 'border-border text-muted hover:text-foreground',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <select
                className="input-base text-xs h-8 py-0"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                {uniqueStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {(filterSide !== 'ALL' || filterStatus !== 'ALL') && (
                <button
                  onClick={() => { setFilterSide('ALL'); setFilterStatus('ALL'); }}
                  className="text-xs text-muted hover:text-foreground flex items-center gap-1"
                >
                  <X size={11} /> Clear
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-7 h-7 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="panel p-12 text-center text-muted text-sm">
              {orders.length === 0 ? 'No orders today — place one above' : 'No orders match filters'}
            </div>
          ) : (
            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {['Symbol', 'Side', 'Type', 'Product', 'Qty', 'Price', 'Trig.', 'Filled', 'Avg', 'Status', 'Time', ''].map((h) => (
                        <th key={h} className="text-left text-muted font-medium px-3 py-2.5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {filteredOrders.map((order) => {
                      const isMod = modifyingOrder === order.orderId;
                      const canMod = MODIFIABLE_STATUSES.includes(order.orderStatus);
                      const canCxl = CANCELLABLE_STATUSES.includes(order.orderStatus);

                      return (
                        <>
                          <tr
                            key={order.orderId}
                            className={cn(
                              'hover:bg-border/20 transition-colors',
                              isMod && 'bg-border/10',
                            )}
                          >
                            <td className="px-3 py-2.5 font-mono font-semibold text-foreground whitespace-nowrap">
                              {order.tradingSymbol || order.securityId}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={cn(
                                'font-semibold',
                                order.transactionType === 'BUY' ? 'text-profit' : 'text-loss',
                              )}>
                                {order.transactionType === 'BUY'
                                  ? <><ArrowUpRight size={10} className="inline" /> BUY</>
                                  : <><ArrowDownRight size={10} className="inline" /> SELL</>
                                }
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-muted">{order.orderType.replace('_', ' ')}</td>
                            <td className="px-3 py-2.5 text-muted">{order.productType}</td>
                            <td className="px-3 py-2.5 font-mono text-foreground">{order.quantity}</td>
                            <td className="px-3 py-2.5 font-mono text-foreground">
                              {order.price > 0 ? order.price.toFixed(2) : '—'}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-muted">
                              {order.triggerPrice > 0 ? order.triggerPrice.toFixed(2) : '—'}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-foreground">
                              {order.filledQty} / {order.quantity}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-foreground">
                              {order.averageTradedPrice > 0 ? order.averageTradedPrice.toFixed(2) : '—'}
                            </td>
                            <td className="px-3 py-2.5"><StatusBadge status={order.orderStatus} /></td>
                            <td className="px-3 py-2.5 text-muted whitespace-nowrap">
                              {order.createTime ? order.createTime.split(' ')[1] ?? order.createTime : '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1">
                                {canMod && (
                                  <button
                                    onClick={() => setModifyingOrder(isMod ? null : order.orderId)}
                                    className="p-1.5 rounded-lg text-accent-cyan border border-accent-cyan/20 hover:bg-accent-cyan/10 transition-all"
                                    title="Modify order"
                                  >
                                    <Pencil size={11} />
                                  </button>
                                )}
                                {canCxl && (
                                  <button
                                    onClick={() => handleCancel(order.orderId)}
                                    disabled={cancellingOrder === order.orderId}
                                    className="p-1.5 rounded-lg text-loss border border-loss/20 hover:bg-loss/10 transition-all"
                                    title="Cancel order"
                                  >
                                    <X size={11} className={cancellingOrder === order.orderId ? 'animate-spin' : ''} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {/* Inline modify panel */}
                          {isMod && (
                            <tr key={`${order.orderId}-mod`}>
                              <td colSpan={12} className="px-3 pb-3">
                                <ModifyPanel
                                  order={order}
                                  brokerId={selectedBroker}
                                  onDone={fetchOrders}
                                  onClose={() => setModifyingOrder(null)}
                                />
                              </td>
                            </tr>
                          )}
                          {/* Error row */}
                          {order.omsErrorDescription && (
                            <tr key={`${order.orderId}-err`} className="bg-loss/5">
                              <td colSpan={12} className="px-3 py-1.5 text-[10px] text-loss">
                                ⚠ {order.omsErrorDescription}
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
                <p className="text-xs text-muted">
                  {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
                  {filterSide !== 'ALL' || filterStatus !== 'ALL' ? ' (filtered)' : ' today'}
                </p>
                <p className="text-xs text-muted">
                  Traded:{' '}
                  <span className="text-profit font-mono">
                    {orders.filter((o) => o.orderStatus === 'TRADED' || o.orderStatus === 'PART_TRADED').length}
                  </span>
                  {' · '}Pending:{' '}
                  <span className="text-warning font-mono">
                    {orders.filter((o) => o.orderStatus === 'PENDING' || o.orderStatus === 'TRANSIT').length}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TRADE BOOK TAB ──────────────────────────────────────────────── */}
      {tab === 'trades' && (
        <div className="space-y-3">
          {/* Summary banner */}
          {trades.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total Trades', value: String(trades.length), cls: 'text-foreground' },
                {
                  label: 'Buy Value',
                  value: `₹${trades
                    .filter((t) => t.transactionType === 'BUY')
                    .reduce((s, t) => s + t.tradedPrice * t.tradedQuantity, 0)
                    .toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
                  cls: 'text-profit',
                },
                {
                  label: 'Sell Value',
                  value: `₹${trades
                    .filter((t) => t.transactionType === 'SELL')
                    .reduce((s, t) => s + t.tradedPrice * t.tradedQuantity, 0)
                    .toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
                  cls: 'text-loss',
                },
              ].map(({ label, value, cls }) => (
                <div key={label} className="panel-mid p-3 rounded-xl">
                  <p className="text-xs text-muted">{label}</p>
                  <p className={cn('text-lg font-bold font-mono mt-0.5', cls)}>{value}</p>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-7 h-7 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" />
            </div>
          ) : trades.length === 0 ? (
            <div className="panel p-12 text-center text-muted text-sm">
              No trades executed today
            </div>
          ) : (
            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {['Symbol', 'Side', 'Product', 'Type', 'Qty', 'Price', 'Value', 'Exchange Trade ID', 'Time'].map((h) => (
                        <th key={h} className="text-left text-muted font-medium px-3 py-2.5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {trades.map((trade) => (
                      <tr key={trade.exchangeTradeId || `${trade.orderId}-${trade.tradedQuantity}`} className="hover:bg-border/20 transition-colors">
                        <td className="px-3 py-2.5 font-mono font-semibold text-foreground whitespace-nowrap">
                          {trade.tradingSymbol || trade.securityId}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn('font-semibold', trade.transactionType === 'BUY' ? 'text-profit' : 'text-loss')}>
                            {trade.transactionType === 'BUY'
                              ? <><ArrowUpRight size={10} className="inline" /> BUY</>
                              : <><ArrowDownRight size={10} className="inline" /> SELL</>}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted">{trade.productType}</td>
                        <td className="px-3 py-2.5 text-muted">{trade.orderType.replace('_', ' ')}</td>
                        <td className="px-3 py-2.5 font-mono text-foreground">{trade.tradedQuantity}</td>
                        <td className="px-3 py-2.5 font-mono text-foreground">{trade.tradedPrice.toFixed(2)}</td>
                        <td className="px-3 py-2.5 font-mono text-foreground">
                          ₹{(trade.tradedPrice * trade.tradedQuantity).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-muted text-[10px]">{trade.exchangeTradeId || '—'}</td>
                        <td className="px-3 py-2.5 text-muted whitespace-nowrap">
                          {trade.exchangeTime ? trade.exchangeTime.split(' ')[1] ?? trade.exchangeTime : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
                <p className="text-xs text-muted">{trades.length} trade{trades.length !== 1 ? 's' : ''} today</p>
                <p className={cn('text-xs font-mono font-semibold', tradePnl >= 0 ? 'text-profit' : 'text-loss')}>
                  Net: {tradePnl >= 0 ? '+' : ''}
                  ₹{Math.abs(tradePnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SUPER ORDERS TAB ──────────────────────────────────────────────────── */}
      {tab === 'super' && (
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-7 h-7 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" />
            </div>
          ) : superOrders.length === 0 ? (
            <div className="panel p-12 text-center text-muted text-sm">
              No super orders today — place one above
            </div>
          ) : (
            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {['Symbol','Side','Product','Type','Entry','Target','SL','Trail','Qty','Filled','Status','Legs','Actions'].map((h) => (
                        <th key={h} className="text-left text-muted font-medium px-3 py-2.5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {superOrders.map((so) => {
                      const isMod   = modifyingSuperOrder === so.orderId;
                      const legsExp = expandedSuperLegs.has(so.orderId);
                      const canMod  = (so.orderStatus === 'PENDING' || so.orderStatus === 'PART_TRADED');
                      return (
                        <>
                          <tr key={so.orderId} className={cn('hover:bg-border/20 transition-colors', isMod && 'bg-border/10')}>
                            <td className="px-3 py-2.5 font-mono font-semibold text-foreground whitespace-nowrap">{so.tradingSymbol || so.securityId}</td>
                            <td className="px-3 py-2.5">
                              <span className={cn('font-semibold', so.transactionType === 'BUY' ? 'text-profit' : 'text-loss')}>
                                {so.transactionType === 'BUY' ? <><ArrowUpRight size={10} className="inline" /> BUY</> : <><ArrowDownRight size={10} className="inline" /> SELL</>}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-muted">{so.productType}</td>
                            <td className="px-3 py-2.5 text-muted">{so.orderType}</td>
                            <td className="px-3 py-2.5 font-mono text-foreground">{so.price?.toFixed(2)}</td>
                            <td className="px-3 py-2.5 font-mono text-profit">{so.legDetails?.find(l => l.legName === 'TARGET_LEG')?.price?.toFixed(2) ?? '—'}</td>
                            <td className="px-3 py-2.5 font-mono text-loss">{so.legDetails?.find(l => l.legName === 'STOP_LOSS_LEG')?.price?.toFixed(2) ?? '—'}</td>
                            <td className="px-3 py-2.5 font-mono text-muted">{so.legDetails?.find(l => l.legName === 'STOP_LOSS_LEG')?.trailingJump ?? 0}</td>
                            <td className="px-3 py-2.5 font-mono text-foreground">{so.quantity}</td>
                            <td className="px-3 py-2.5 font-mono text-foreground">{so.filledQty}</td>
                            <td className="px-3 py-2.5"><SuperStatusBadge status={so.orderStatus} /></td>
                            <td className="px-3 py-2.5">
                              <button
                                onClick={() => setExpandedSuperLegs(prev => {
                                  const next = new Set(prev);
                                  legsExp ? next.delete(so.orderId) : next.add(so.orderId);
                                  return next;
                                })}
                                className="text-muted hover:text-foreground"
                              >
                                <ChevronDown size={12} className={cn('transition-transform', legsExp && 'rotate-180')} />
                              </button>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1">
                                {canMod && (
                                  <button
                                    onClick={() => setModifyingSuperOrder(isMod ? null : so.orderId)}
                                    className="p-1.5 rounded-lg text-accent-cyan border border-accent-cyan/20 hover:bg-accent-cyan/10 transition-all"
                                    title="Modify"
                                  >
                                    <Pencil size={11} />
                                  </button>
                                )}
                                {canMod && (
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`Cancel all legs of super order ${so.orderId}?`)) return;
                                      const r = await fetch('/api/dhan-cancel-super-order', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brokerId: selectedBroker, orderId: so.orderId, legName: 'ENTRY_LEG' }) });
                                      const d = await r.json() as { error?: string };
                                      if (!r.ok) toast.error((d as { error?: string }).error ?? 'Cancel failed');
                                      else { toast.success(`Super order ${so.orderId} cancelled`); fetchSuperOrders(); }
                                    }}
                                    className="p-1.5 rounded-lg text-loss border border-loss/20 hover:bg-loss/10 transition-all"
                                    title="Cancel all legs"
                                  >
                                    <X size={11} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {legsExp && Array.isArray(so.legDetails) && so.legDetails.length > 0 && (
                            <tr key={`${so.orderId}-legs`}>
                              <td colSpan={13} className="px-4 pb-2 pt-0">
                                <div className="flex gap-2 flex-wrap mt-1">
                                  {so.legDetails.map((leg) => (
                                    <div key={leg.legName} className="text-[10px] border border-border rounded-lg px-2 py-1.5 bg-border/10 space-y-0.5">
                                      <p className="font-semibold text-foreground">{leg.legName.replace('_LEG','')}</p>
                                      <p className="text-muted">Price: <span className="font-mono text-foreground">{leg.price}</span></p>
                                      <p className="text-muted">Remaining: <span className="font-mono text-foreground">{leg.remainingQuantity}</span></p>
                                      <p className="text-muted">Triggered: <span className="font-mono text-foreground">{leg.triggeredQuantity}</span></p>
                                      {leg.trailingJump > 0 && <p className="text-muted">Trail: <span className="font-mono text-accent-cyan">{leg.trailingJump}</span></p>}
                                      <SuperStatusBadge status={leg.orderStatus} />
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                          {isMod && (
                            <tr key={`${so.orderId}-mod`}>
                              <td colSpan={13} className="px-3 pb-3">
                                <ModifySuperOrderPanel
                                  order={so}
                                  brokerId={selectedBroker}
                                  onDone={fetchSuperOrders}
                                  onClose={() => setModifyingSuperOrder(null)}
                                />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border px-4 py-2.5">
                <p className="text-xs text-muted">{superOrders.length} super order{superOrders.length !== 1 ? 's' : ''} today</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FOREVER ORDERS TAB ──────────────────────────────────────────────── */}
      {tab === 'forever' && (
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-7 h-7 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" />
            </div>
          ) : foreverOrders.length === 0 ? (
            <div className="panel p-12 text-center text-muted text-sm">
              No forever orders found — place one above
            </div>
          ) : (
            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {['Symbol','Flag','Side','Product','Price','Trigger','OCO Price','Status','Leg','Time',''].map((h) => (
                        <th key={h} className="text-left text-muted font-medium px-3 py-2.5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {foreverOrders.map((fo) => {
                      const canCancel = fo.orderStatus !== 'CANCELLED' && fo.orderStatus !== 'TRADED' && fo.orderStatus !== 'EXPIRED';
                      return (
                        <tr key={fo.orderId} className="hover:bg-border/20 transition-colors">
                          <td className="px-3 py-2.5 font-mono font-semibold text-foreground whitespace-nowrap">{fo.tradingSymbol || fo.securityId}</td>
                          <td className="px-3 py-2.5">
                            <span className={cn(
                              'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                              fo.orderType === 'SINGLE'
                                ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30'
                                : 'bg-accent-purple/10 text-accent-purple border-accent-purple/30',
                            )}>{fo.orderType}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn('font-semibold', fo.transactionType === 'BUY' ? 'text-profit' : 'text-loss')}>{fo.transactionType}</span>
                          </td>
                          <td className="px-3 py-2.5 text-muted">{fo.productType}</td>
                          <td className="px-3 py-2.5 font-mono text-foreground">{fo.price?.toFixed(2)}</td>
                          <td className="px-3 py-2.5 font-mono text-foreground">{fo.triggerPrice?.toFixed(2)}</td>
                          <td className="px-3 py-2.5 font-mono text-muted">
                            {fo.price1 ? `${fo.price1.toFixed(2)} @ ${fo.triggerPrice1?.toFixed(2)}` : '—'}
                          </td>
                          <td className="px-3 py-2.5"><ForeverStatusBadge status={fo.orderStatus} /></td>
                          <td className="px-3 py-2.5 text-muted text-[10px]">{fo.legName || '—'}</td>
                          <td className="px-3 py-2.5 text-muted whitespace-nowrap">{fo.createTime ? fo.createTime.split(' ')[1] ?? fo.createTime : '—'}</td>
                          <td className="px-3 py-2.5">
                            {canCancel && (
                              <button
                                disabled={cancellingForeverOrder === fo.orderId}
                                onClick={async () => {
                                  if (!confirm(`Cancel forever order ${fo.orderId}?`)) return;
                                  setCancellingForeverOrder(fo.orderId);
                                  const r = await fetch('/api/dhan-cancel-forever-order', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brokerId: selectedBroker, orderId: fo.orderId }) });
                                  const d = await r.json() as { error?: string };
                                  if (!r.ok) toast.error(d.error ?? 'Cancel failed');
                                  else { toast.success(`Forever order ${fo.orderId} cancelled`); fetchForeverOrders(); }
                                  setCancellingForeverOrder(null);
                                }}
                                className="p-1.5 rounded-lg text-loss border border-loss/20 hover:bg-loss/10 transition-all"
                                title="Cancel"
                              >
                                <X size={11} className={cancellingForeverOrder === fo.orderId ? 'animate-spin' : ''} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border px-4 py-2.5">
                <p className="text-xs text-muted">{foreverOrders.length} forever order{foreverOrders.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Super Order Status Badge
// ─────────────────────────────────────────────────────────────────────────────

function SuperStatusBadge({ status }: { status: DhanSuperOrder['orderStatus'] | string | undefined | null }) {
  if (!status) return <span className="text-xs text-muted">—</span>;
  const cfg: Record<string, string> = {
    TRANSIT:     'bg-warning/10 text-warning border-warning/30',
    PENDING:     'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30',
    PART_TRADED: 'bg-accent-purple/10 text-accent-purple border-accent-purple/30',
    TRADED:      'bg-profit/10 text-profit border-profit/30',
    CLOSED:      'bg-profit/10 text-profit border-profit/30',
    TRIGGERED:   'bg-profit/10 text-profit border-profit/30',
    REJECTED:    'bg-loss/10 text-loss border-loss/30',
    CANCELLED:   'bg-muted/10 text-muted border-muted/30',
    EXPIRED:     'bg-muted/10 text-muted border-muted/30',
  };
  return (
    <span className={cn('inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border', cfg[status] ?? 'bg-muted/10 text-muted')}>
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Forever Order Status Badge
// ─────────────────────────────────────────────────────────────────────────────

function ForeverStatusBadge({ status }: { status: DhanForeverOrder['orderStatus'] | undefined | null }) {
  if (!status) return <span className="text-xs text-muted">—</span>;
  const cfg: Record<string, string> = {
    TRANSIT:  'bg-warning/10 text-warning border-warning/30',
    PENDING:  'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30',
    CONFIRM:  'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30',
    TRADED:   'bg-profit/10 text-profit border-profit/30',
    REJECTED: 'bg-loss/10 text-loss border-loss/30',
    CANCELLED:'bg-muted/10 text-muted border-muted/30',
    EXPIRED:  'bg-muted/10 text-muted border-muted/30',
  };
  return (
    <span className={cn('inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border', cfg[status] ?? 'bg-muted/10 text-muted')}>
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Place Super Order Form
// ─────────────────────────────────────────────────────────────────────────────

interface PlaceSuperOrderFormProps { brokerId: string; onDone: () => void; onClose: () => void; }

function PlaceSuperOrderForm({ brokerId, onDone, onClose }: PlaceSuperOrderFormProps) {
  const [form, setForm] = useState({
    transactionType: 'BUY' as 'BUY' | 'SELL',
    exchangeSegment: 'NSE_FNO',
    productType: 'INTRADAY' as 'CNC' | 'INTRADAY' | 'MARGIN' | 'MTF',
    orderType: 'LIMIT' as 'LIMIT' | 'MARKET',
    securityId: '',
    tradingSymbol: '',
    quantity: 1,
    price: 0,
    targetPrice: 0,
    stopLossPrice: 0,
    trailingJump: 0,
    correlationId: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.securityId.trim()) { toast.error('Security ID required'); return; }
    if (form.targetPrice <= 0)   { toast.error('Target price required'); return; }
    if (form.stopLossPrice <= 0) { toast.error('Stop loss price required'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/dhan-super-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId, ...form }),
      });
      const data = await res.json() as { orderId?: string; orderStatus?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success(`Super order placed — ${data.orderId} · ${data.orderStatus}`);
      onDone(); onClose();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    setSaving(false);
  };

  return (
    <div className="panel p-5 space-y-4 border-l-2 border-accent-purple/50 animate-slide-up">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Layers size={14} /> Place Super Order</h3>
        <button onClick={onClose} className="text-muted hover:text-foreground"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <label className="block text-xs text-muted mb-1.5">Side</label>
          <div className="flex gap-2">
            {(['BUY','SELL'] as const).map(t => (
              <button key={t} onClick={() => setForm(f => ({ ...f, transactionType: t }))}
                className={cn('flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all',
                  form.transactionType === t
                    ? t === 'BUY' ? 'bg-profit/15 border-profit/50 text-profit' : 'bg-loss/15 border-loss/50 text-loss'
                    : 'border-border text-muted hover:text-foreground')}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Exchange</label>
          <select className="input-base" value={form.exchangeSegment} onChange={e => setForm(f => ({ ...f, exchangeSegment: e.target.value }))}>
            {['NSE_EQ','BSE_EQ','NSE_FNO','BSE_FNO','NSE_CURRENCY','BSE_CURRENCY','MCX_COMM'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Product</label>
          <select className="input-base" value={form.productType} onChange={e => setForm(f => ({ ...f, productType: e.target.value as typeof form.productType }))}>
            {(['CNC','INTRADAY','MARGIN','MTF'] as const).map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Order Type</label>
          <select className="input-base" value={form.orderType} onChange={e => setForm(f => ({ ...f, orderType: e.target.value as 'LIMIT' | 'MARKET' }))}>
            <option value="LIMIT">LIMIT</option><option value="MARKET">MARKET</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Trading Symbol</label>
          <input className="input-base font-mono uppercase" value={form.tradingSymbol} onChange={e => setForm(f => ({ ...f, tradingSymbol: e.target.value.toUpperCase() }))} placeholder="HDFCBANK" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Security ID</label>
          <input className="input-base font-mono" value={form.securityId} onChange={e => setForm(f => ({ ...f, securityId: e.target.value }))} placeholder="1333" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Quantity</label>
          <input className="input-base font-mono" type="number" min={1} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Entry Price</label>
          <input className="input-base font-mono" type="number" step="0.05" value={form.price || ''} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Target Price</label>
          <input className="input-base font-mono text-profit" type="number" step="0.05" value={form.targetPrice || ''} onChange={e => setForm(f => ({ ...f, targetPrice: Number(e.target.value) }))} />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Stop Loss Price</label>
          <input className="input-base font-mono text-loss" type="number" step="0.05" value={form.stopLossPrice || ''} onChange={e => setForm(f => ({ ...f, stopLossPrice: Number(e.target.value) }))} />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Trailing Jump</label>
          <input className="input-base font-mono" type="number" step="0.05" value={form.trailingJump || ''} onChange={e => setForm(f => ({ ...f, trailingJump: Number(e.target.value) }))} />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Correlation ID</label>
          <input className="input-base font-mono text-xs" maxLength={30} value={form.correlationId} onChange={e => setForm(f => ({ ...f, correlationId: e.target.value }))} placeholder="optional" />
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button onClick={handleSubmit} disabled={saving}
          className={cn('flex-1 py-2 rounded-xl text-sm font-semibold border transition-all',
            form.transactionType === 'BUY' ? 'bg-profit/15 border-profit/50 text-profit hover:bg-profit/25' : 'bg-loss/15 border-loss/50 text-loss hover:bg-loss/25')}>
          {saving ? 'Placing…' : `Place ${form.transactionType} Super Order`}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modify Super Order Panel
// ─────────────────────────────────────────────────────────────────────────────

interface ModifySuperOrderPanelProps { order: DhanSuperOrder; brokerId: string; onDone: () => void; onClose: () => void; }

function ModifySuperOrderPanel({ order, brokerId, onDone, onClose }: ModifySuperOrderPanelProps) {
  const [legName, setLegName] = useState<'ENTRY_LEG' | 'TARGET_LEG' | 'STOP_LOSS_LEG'>('ENTRY_LEG');
  const [form, setForm] = useState({
    orderType: order.orderType as 'LIMIT' | 'MARKET',
    quantity: order.quantity,
    price: order.price,
    targetPrice: order.legDetails?.find(l => l.legName === 'TARGET_LEG')?.price ?? 0,
    stopLossPrice: order.legDetails?.find(l => l.legName === 'STOP_LOSS_LEG')?.price ?? 0,
    trailingJump: order.legDetails?.find(l => l.legName === 'STOP_LOSS_LEG')?.trailingJump ?? 0,
  });
  const [saving, setSaving] = useState(false);

  const isEntry = legName === 'ENTRY_LEG';
  const isSL    = legName === 'STOP_LOSS_LEG';

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { brokerId, orderId: order.orderId, legName };
      if (isEntry) {
        payload.orderType = form.orderType; payload.quantity = form.quantity;
        payload.price = form.price; payload.targetPrice = form.targetPrice;
        payload.stopLossPrice = form.stopLossPrice; payload.trailingJump = form.trailingJump;
      } else if (legName === 'TARGET_LEG') {
        payload.targetPrice = form.targetPrice;
      } else {
        payload.stopLossPrice = form.stopLossPrice; payload.trailingJump = form.trailingJump;
      }
      const res = await fetch('/api/dhan-modify-super-order', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json() as { orderStatus?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success(`Super order modified · ${data.orderStatus}`);
      onDone(); onClose();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    setSaving(false);
  };

  return (
    <div className="mt-2 p-3 rounded-xl bg-border/20 space-y-3 animate-slide-up">
      <p className="text-xs font-semibold text-foreground">Modify Super Order {order.orderId}</p>
      <div className="flex gap-2 mb-2">
        {(['ENTRY_LEG','TARGET_LEG','STOP_LOSS_LEG'] as const).map(l => (
          <button key={l} onClick={() => setLegName(l)}
            className={cn('text-[10px] px-2 py-1 rounded-lg border transition-all',
              legName === l ? 'border-accent-cyan text-accent-cyan bg-accent-cyan/10' : 'border-border text-muted hover:text-foreground')}>
            {l.replace('_LEG','')}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {isEntry && (
          <>
            <div><label className="block text-[10px] text-muted mb-1">Order Type</label>
              <select className="input-base text-xs" value={form.orderType} onChange={e => setForm(f => ({ ...f, orderType: e.target.value as 'LIMIT' | 'MARKET' }))}>
                <option value="LIMIT">LIMIT</option><option value="MARKET">MARKET</option>
              </select>
            </div>
            <div><label className="block text-[10px] text-muted mb-1">Quantity</label><input type="number" className="input-base text-xs font-mono" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} /></div>
            <div><label className="block text-[10px] text-muted mb-1">Entry Price</label><input type="number" step="0.05" className="input-base text-xs font-mono" value={form.price} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} /></div>
          </>
        )}
        {(isEntry || legName === 'TARGET_LEG') && (
          <div><label className="block text-[10px] text-muted mb-1">Target Price</label><input type="number" step="0.05" className="input-base text-xs font-mono text-profit" value={form.targetPrice} onChange={e => setForm(f => ({ ...f, targetPrice: Number(e.target.value) }))} /></div>
        )}
        {(isEntry || isSL) && (
          <>
            <div><label className="block text-[10px] text-muted mb-1">SL Price</label><input type="number" step="0.05" className="input-base text-xs font-mono text-loss" value={form.stopLossPrice} onChange={e => setForm(f => ({ ...f, stopLossPrice: Number(e.target.value) }))} /></div>
            <div><label className="block text-[10px] text-muted mb-1">Trail Jump</label><input type="number" step="0.05" className="input-base text-xs font-mono" value={form.trailingJump} onChange={e => setForm(f => ({ ...f, trailingJump: Number(e.target.value) }))} /></div>
          </>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="btn-secondary text-xs flex-1">Cancel</button>
        <button onClick={handleSubmit} disabled={saving} className="btn-primary text-xs flex-1">{saving ? 'Saving…' : 'Update'}</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Place Forever Order Form
// ─────────────────────────────────────────────────────────────────────────────

interface PlaceForeverOrderFormProps { brokerId: string; onDone: () => void; onClose: () => void; }

function PlaceForeverOrderForm({ brokerId, onDone, onClose }: PlaceForeverOrderFormProps) {
  const [form, setForm] = useState({
    orderFlag: 'SINGLE' as DhanForeverOrderFlag,
    transactionType: 'BUY' as 'BUY' | 'SELL',
    exchangeSegment: 'NSE_EQ',
    productType: 'CNC' as 'CNC' | 'MTF',
    orderType: 'LIMIT' as 'LIMIT' | 'MARKET',
    validity: 'DAY' as 'DAY' | 'IOC',
    securityId: '',
    tradingSymbol: '',
    quantity: 1,
    price: 0,
    triggerPrice: 0,
    disclosedQuantity: 0,
    correlationId: '',
    price1: 0,
    triggerPrice1: 0,
    quantity1: 1,
  });
  const [saving, setSaving] = useState(false);
  const isOCO = form.orderFlag === 'OCO';

  const handleSubmit = async () => {
    if (!form.securityId.trim()) { toast.error('Security ID required'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/dhan-forever-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId, ...form }),
      });
      const data = await res.json() as { orderId?: string; orderStatus?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success(`Forever order placed — ${data.orderId} · ${data.orderStatus}`);
      onDone(); onClose();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    setSaving(false);
  };

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div><label className="block text-xs text-muted mb-1.5">{label}</label>{children}</div>
  );

  return (
    <div className="panel p-5 space-y-4 border-l-2 border-accent-purple/50 animate-slide-up">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Target size={14} /> Place Forever Order</h3>
        <button onClick={onClose} className="text-muted hover:text-foreground"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <F label="Order Flag">
          <div className="flex gap-2">
            {(['SINGLE','OCO'] as const).map(f => (
              <button key={f} onClick={() => setForm(prev => ({ ...prev, orderFlag: f }))}
                className={cn('flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all',
                  form.orderFlag === f ? 'bg-accent-cyan/15 border-accent-cyan/50 text-accent-cyan' : 'border-border text-muted hover:text-foreground')}>
                {f}
              </button>
            ))}
          </div>
        </F>
        <F label="Side">
          <div className="flex gap-2">
            {(['BUY','SELL'] as const).map(t => (
              <button key={t} onClick={() => setForm(f => ({ ...f, transactionType: t }))}
                className={cn('flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all',
                  form.transactionType === t
                    ? t === 'BUY' ? 'bg-profit/15 border-profit/50 text-profit' : 'bg-loss/15 border-loss/50 text-loss'
                    : 'border-border text-muted hover:text-foreground')}>
                {t}
              </button>
            ))}
          </div>
        </F>
        <F label="Exchange"><select className="input-base" value={form.exchangeSegment} onChange={e => setForm(f => ({ ...f, exchangeSegment: e.target.value }))}>{['NSE_EQ','BSE_EQ','NSE_FNO','BSE_FNO'].map(s => <option key={s}>{s}</option>)}</select></F>
        <F label="Product"><select className="input-base" value={form.productType} onChange={e => setForm(f => ({ ...f, productType: e.target.value as 'CNC' | 'MTF' }))}>{(['CNC','MTF'] as const).map(p => <option key={p}>{p}</option>)}</select></F>
        <F label="Order Type"><select className="input-base" value={form.orderType} onChange={e => setForm(f => ({ ...f, orderType: e.target.value as 'LIMIT' | 'MARKET' }))}><option value="LIMIT">LIMIT</option><option value="MARKET">MARKET</option></select></F>
        <F label="Validity"><select className="input-base" value={form.validity} onChange={e => setForm(f => ({ ...f, validity: e.target.value as 'DAY' | 'IOC' }))}><option>DAY</option><option>IOC</option></select></F>
        <F label="Trading Symbol"><input className="input-base font-mono uppercase" value={form.tradingSymbol} onChange={e => setForm(f => ({ ...f, tradingSymbol: e.target.value.toUpperCase() }))} placeholder="HDFCBANK" /></F>
        <F label="Security ID"><input className="input-base font-mono" value={form.securityId} onChange={e => setForm(f => ({ ...f, securityId: e.target.value }))} placeholder="1333" /></F>
        <F label="Quantity"><input className="input-base font-mono" type="number" min={1} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} /></F>
        <F label="Price"><input className="input-base font-mono" type="number" step="0.05" value={form.price || ''} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} /></F>
        <F label="Trigger Price"><input className="input-base font-mono" type="number" step="0.05" value={form.triggerPrice || ''} onChange={e => setForm(f => ({ ...f, triggerPrice: Number(e.target.value) }))} /></F>
        <F label="Disclosed Qty"><input className="input-base font-mono" type="number" min={0} value={form.disclosedQuantity || ''} onChange={e => setForm(f => ({ ...f, disclosedQuantity: Number(e.target.value) }))} /></F>
        {isOCO && (
          <>
            <F label="OCO Target Price"><input className="input-base font-mono text-profit" type="number" step="0.05" value={form.price1 || ''} onChange={e => setForm(f => ({ ...f, price1: Number(e.target.value) }))} /></F>
            <F label="OCO Trigger Price"><input className="input-base font-mono text-profit" type="number" step="0.05" value={form.triggerPrice1 || ''} onChange={e => setForm(f => ({ ...f, triggerPrice1: Number(e.target.value) }))} /></F>
            <F label="OCO Quantity"><input className="input-base font-mono" type="number" min={1} value={form.quantity1} onChange={e => setForm(f => ({ ...f, quantity1: Number(e.target.value) }))} /></F>
          </>
        )}
        <div className="col-span-2">
          <label className="block text-xs text-muted mb-1.5">Correlation ID (optional)</label>
          <input className="input-base font-mono text-xs" maxLength={30} value={form.correlationId} onChange={e => setForm(f => ({ ...f, correlationId: e.target.value }))} placeholder="optional — max 30 chars" />
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button onClick={handleSubmit} disabled={saving}
          className={cn('flex-1 py-2 rounded-xl text-sm font-semibold border transition-all',
            form.transactionType === 'BUY' ? 'bg-profit/15 border-profit/50 text-profit hover:bg-profit/25' : 'bg-loss/15 border-loss/50 text-loss hover:bg-loss/25')}>
          {saving ? 'Placing…' : `Place ${form.orderFlag} Forever Order`}
        </button>
      </div>
    </div>
  );
}

