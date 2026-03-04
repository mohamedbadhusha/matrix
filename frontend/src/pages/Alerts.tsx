/**
 * Alerts.tsx
 * Conditional Triggers (alert-based auto-orders) page.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type {
  BrokerAccount,
  DhanConditionalTrigger,
  DhanAlertStatus,
  DhanAlertCondition,
  DhanAlertOrder,
  PlaceConditionalTriggerPayload,
} from '@/types';
import { RefreshCw, Plus, X, Bell, ChevronDown, Pencil, Eye, EyeOff } from 'lucide-react';

// ── Status badge ───────────────────────────────────────────────────────────
function AlertStatusBadge({ status }: { status: DhanAlertStatus | string }) {
  const cfg: Record<string, string> = {
    ACTIVE:    'bg-profit/10 text-profit border-profit/30',
    TRIGGERED: 'bg-accent-purple/10 text-accent-purple border-accent-purple/30',
    CANCELLED: 'bg-muted/10 text-muted border-muted/30',
    EXPIRED:   'bg-muted/10 text-muted border-muted/30',
    INACTIVE:  'bg-warning/10 text-warning border-warning/30',
  };
  return (
    <span className={cn('inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border', cfg[status] ?? 'bg-muted/10 text-muted')}>
      {status}
    </span>
  );
}

// ── Default empty condition ─────────────────────────────────────────────────
const defaultCondition = (): DhanAlertCondition => ({
  comparisonType: 'PRICE_WITH_VALUE',
  exchangeSegment: 'NSE_EQ',
  securityId: '',
  timeFrame: 'DAY',
  operator: 'CROSSING_UP',
  comparingValue: 0,
  expDate: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10),
  frequency: 'ONCE',
  userNote: '',
});

const defaultOrder = (): DhanAlertOrder => ({
  transactionType: 'BUY',
  exchangeSegment: 'NSE_EQ',
  productType: 'CNC',
  orderType: 'LIMIT',
  securityId: '',
  quantity: 1,
  validity: 'DAY',
  price: '0',
  discQuantity: '0',
  triggerPrice: '0',
});

// ── Main page ───────────────────────────────────────────────────────────────
export default function Alerts() {
  const { profile }  = useAuth();
  const [brokers, setBrokers]               = useState<BrokerAccount[]>([]);
  const [selectedBroker, setSelectedBroker] = useState('');
  const [alerts, setAlerts]                 = useState<DhanConditionalTrigger[]>([]);
  const [loading, setLoading]               = useState(false);
  const [showForm, setShowForm]             = useState(false);
  const [expandedAlert, setExpandedAlert]   = useState<string | null>(null);
  const [editTarget, setEditTarget]         = useState<DhanConditionalTrigger | null>(null);
  const [filterStatus, setFilterStatus]     = useState<'ALL' | DhanAlertStatus>('ALL');

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('broker_accounts')
      .select('id, broker_name, client_id, is_active, health_status')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .then(({ data }) => {
        const list = (data ?? []) as BrokerAccount[];
        setBrokers(list);
        if (list.length > 0 && !selectedBroker) setSelectedBroker(list[0].id);
      });
  }, [profile]);

  const fetchAlerts = useCallback(async () => {
    if (!selectedBroker) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/dhan-conditional-triggers?brokerId=${selectedBroker}`);
      const data = await res.json() as DhanConditionalTrigger[] | { error?: string };
      if (!res.ok) { toast.error((data as { error?: string }).error ?? 'Fetch failed'); setAlerts([]); }
      else setAlerts(Array.isArray(data) ? data : []);
    } catch { toast.error('Network error'); }
    setLoading(false);
  }, [selectedBroker]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const handleDelete = async (alertId: string) => {
    if (!confirm(`Delete alert ${alertId}?`)) return;
    const res  = await fetch('/api/dhan-delete-conditional-trigger', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brokerId: selectedBroker, alertId }) });
    const data = await res.json() as { error?: string };
    if (!res.ok) toast.error(data.error ?? 'Delete failed');
    else { toast.success(`Alert ${alertId} cancelled`); fetchAlerts(); }
  };

  const filtered = filterStatus === 'ALL' ? alerts : alerts.filter(a => a.alertStatus === filterStatus);

  const counts: Record<string, number> = { ALL: alerts.length };
  for (const a of alerts) counts[a.alertStatus] = (counts[a.alertStatus] ?? 0) + 1;

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Bell size={20} className="text-accent-cyan" /> Conditional Triggers</h1>
          <p className="text-xs text-muted mt-0.5">Price & indicator-based auto-orders — Equities & Indices only</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select value={selectedBroker} onChange={e => setSelectedBroker(e.target.value)} className="input-base pr-8 text-sm min-w-[160px]">
              {brokers.length === 0 && <option value="">No brokers</option>}
              {brokers.map(b => <option key={b.id} value={b.id}>{b.broker_name} · {b.client_id}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
          <button onClick={fetchAlerts} disabled={loading || !selectedBroker} className="btn-secondary gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={() => { setEditTarget(null); setShowForm(s => !s); }} disabled={!selectedBroker} className="btn-primary gap-2">
            <Plus size={14} /> New Alert
          </button>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {(['ALL','ACTIVE','TRIGGERED','CANCELLED','EXPIRED'] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={cn('text-[11px] px-2.5 py-1 rounded-lg border transition-all',
              filterStatus === s ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan' : 'border-border text-muted hover:text-foreground')}>
            {s} {counts[s] ? <span className="ml-1 opacity-60">({counts[s]})</span> : null}
          </button>
        ))}
      </div>

      {/* Place / Edit form */}
      {showForm && (
        <AlertForm
          brokerId={selectedBroker}
          existing={editTarget}
          onDone={() => { setShowForm(false); setEditTarget(null); fetchAlerts(); }}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
        />
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-7 h-7 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="panel p-12 text-center">
          <Bell size={32} className="mx-auto mb-3 text-muted opacity-40" />
          <p className="text-sm text-muted">{alerts.length === 0 ? 'No conditional triggers — create one above' : 'No alerts match filter'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((alert) => (
            <div key={alert.alertId} className="panel overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Status */}
                <AlertStatusBadge status={alert.alertStatus} />
                {/* ID */}
                <span className="font-mono text-xs text-muted">#{alert.alertId}</span>
                {/* Condition summary */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground font-medium truncate">
                    {alert.condition?.securityId} · {alert.condition?.comparisonType} · {alert.condition?.operator} {alert.condition?.comparingValue}
                  </p>
                  <p className="text-[10px] text-muted">
                    {alert.condition?.exchangeSegment} · {alert.condition?.timeFrame} · {alert.condition?.frequency}
                    {alert.condition?.userNote ? ` · "${alert.condition.userNote}"` : ''}
                  </p>
                </div>
                {/* Stats */}
                <div className="hidden md:flex items-center gap-4 text-xs text-muted">
                  <span>{Array.isArray(alert.orders) ? alert.orders.length : 0} order{Array.isArray(alert.orders) && alert.orders.length !== 1 ? 's' : ''}</span>
                  {alert.lastPrice && <span>LTP: <span className="font-mono text-foreground">{alert.lastPrice}</span></span>}
                  {alert.triggeredTime && <span className="text-accent-purple">Triggered: {new Date(alert.triggeredTime).toLocaleTimeString('en-IN')}</span>}
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1.5 ml-2">
                  <button onClick={() => setExpandedAlert(expandedAlert === alert.alertId ? null : alert.alertId)}
                    className="p-1.5 rounded-lg text-muted hover:text-foreground border border-border/50 hover:border-border transition-all" title="Details">
                    {expandedAlert === alert.alertId ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  {alert.alertStatus === 'ACTIVE' && (
                    <>
                      <button onClick={() => { setEditTarget(alert); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className="p-1.5 rounded-lg text-accent-cyan border border-accent-cyan/20 hover:bg-accent-cyan/10 transition-all" title="Modify">
                        <Pencil size={11} />
                      </button>
                      <button onClick={() => handleDelete(alert.alertId)}
                        className="p-1.5 rounded-lg text-loss border border-loss/20 hover:bg-loss/10 transition-all" title="Cancel">
                        <X size={11} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {/* Expanded detail */}
              {expandedAlert === alert.alertId && (
                <div className="border-t border-border px-4 py-3 bg-border/5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-[10px] text-muted font-semibold uppercase mb-2">Condition</p>
                    <pre className="text-[10px] font-mono text-foreground bg-background/50 rounded-lg p-2 overflow-auto max-h-32">
                      {JSON.stringify(alert.condition, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted font-semibold uppercase mb-2">Orders ({Array.isArray(alert.orders) ? alert.orders.length : 0})</p>
                    <pre className="text-[10px] font-mono text-foreground bg-background/50 rounded-lg p-2 overflow-auto max-h-32">
                      {JSON.stringify(alert.orders, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Alert Form (Place + Modify) ────────────────────────────────────────────

interface AlertFormProps { brokerId: string; existing: DhanConditionalTrigger | null; onDone: () => void; onClose: () => void; }

function AlertForm({ brokerId, existing, onDone, onClose }: AlertFormProps) {
  const isEdit = !!existing;
  const [condition, setCondition] = useState<DhanAlertCondition>(existing?.condition ?? defaultCondition());
  const [orders, setOrders]       = useState<DhanAlertOrder[]>(existing?.orders ?? [defaultOrder()]);
  const [saving, setSaving]       = useState(false);

  const updateCond = <K extends keyof DhanAlertCondition>(key: K, val: DhanAlertCondition[K]) =>
    setCondition(c => ({ ...c, [key]: val }));

  const updateOrder = <K extends keyof DhanAlertOrder>(idx: number, key: K, val: DhanAlertOrder[K]) =>
    setOrders(os => os.map((o, i) => i === idx ? { ...o, [key]: val } : o));

  const handleSubmit = async () => {
    if (!condition.securityId) { toast.error('Security ID required'); return; }
    setSaving(true);
    try {
      const payload: PlaceConditionalTriggerPayload = { brokerId, condition, orders };
      let res: Response;
      if (isEdit) {
        res = await fetch('/api/dhan-modify-conditional-trigger', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, alertId: existing!.alertId }) });
      } else {
        res = await fetch('/api/dhan-conditional-trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      const data = await res.json() as { alertId?: string; alertStatus?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success(`Alert ${isEdit ? 'modified' : 'placed'} · ${data.alertId} · ${data.alertStatus}`);
      onDone();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    setSaving(false);
  };

  const needsIndicator = condition.comparisonType === 'TECHNICAL_WITH_VALUE' || condition.comparisonType === 'TECHNICAL_WITH_TECHNICAL';

  return (
    <div className="panel p-5 space-y-5 border-l-2 border-accent-cyan/50">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{isEdit ? `Modify Alert #${existing!.alertId}` : 'New Conditional Trigger'}</h3>
        <button onClick={onClose} className="text-muted hover:text-foreground"><X size={16} /></button>
      </div>

      {/* Condition */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Condition</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div><label className="block text-xs text-muted mb-1.5">Comparison Type</label>
            <select className="input-base" value={condition.comparisonType} onChange={e => updateCond('comparisonType', e.target.value as DhanAlertCondition['comparisonType'])}>
              {(['PRICE_WITH_VALUE','TECHNICAL_WITH_VALUE','TECHNICAL_WITH_TECHNICAL','PRICE_WITH_PRICE'] as const).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div><label className="block text-xs text-muted mb-1.5">Exchange</label>
            <select className="input-base" value={condition.exchangeSegment} onChange={e => updateCond('exchangeSegment', e.target.value)}>
              {['NSE_EQ','BSE_EQ','IDX_I'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="block text-xs text-muted mb-1.5">Security ID</label>
            <input className="input-base font-mono" value={condition.securityId} onChange={e => updateCond('securityId', e.target.value)} placeholder="12345" />
          </div>
          {needsIndicator && (
            <div><label className="block text-xs text-muted mb-1.5">Indicator</label>
              <input className="input-base font-mono uppercase" value={condition.indicatorName ?? ''} onChange={e => updateCond('indicatorName', e.target.value.toUpperCase())} placeholder="SMA_5" />
            </div>
          )}
          {condition.comparisonType === 'TECHNICAL_WITH_TECHNICAL' && (
            <div><label className="block text-xs text-muted mb-1.5">Comparing Indicator</label>
              <input className="input-base font-mono uppercase" value={condition.comparingIndicatorName ?? ''} onChange={e => updateCond('comparingIndicatorName', e.target.value.toUpperCase())} placeholder="SMA_10" />
            </div>
          )}
          <div><label className="block text-xs text-muted mb-1.5">Timeframe</label>
            <select className="input-base" value={condition.timeFrame} onChange={e => updateCond('timeFrame', e.target.value as DhanAlertCondition['timeFrame'])}>
              {(['DAY','ONE_MIN','FIVE_MIN','FIFTEEN_MIN'] as const).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="block text-xs text-muted mb-1.5">Operator</label>
            <select className="input-base" value={condition.operator} onChange={e => updateCond('operator', e.target.value as DhanAlertCondition['operator'])}>
              {(['CROSSING_UP','CROSSING_DOWN','GREATER_THAN','LESS_THAN','EQUAL_TO'] as const).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {condition.comparisonType !== 'TECHNICAL_WITH_TECHNICAL' && (
            <div><label className="block text-xs text-muted mb-1.5">Comparing Value</label>
              <input type="number" step="0.05" className="input-base font-mono" value={condition.comparingValue ?? ''} onChange={e => updateCond('comparingValue', Number(e.target.value))} />
            </div>
          )}
          <div><label className="block text-xs text-muted mb-1.5">Frequency</label>
            <select className="input-base" value={condition.frequency} onChange={e => updateCond('frequency', e.target.value as 'ONCE' | 'MANY')}>
              <option value="ONCE">ONCE</option><option value="MANY">MANY</option>
            </select>
          </div>
          <div><label className="block text-xs text-muted mb-1.5">Expiry Date</label>
            <input type="date" className="input-base" value={condition.expDate} onChange={e => updateCond('expDate', e.target.value)} />
          </div>
          <div className="md:col-span-2"><label className="block text-xs text-muted mb-1.5">Note (optional)</label>
            <input className="input-base" value={condition.userNote ?? ''} onChange={e => updateCond('userNote', e.target.value)} placeholder="e.g. Price crossing SMA" />
          </div>
        </div>
      </div>

      {/* Orders */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Orders ({orders.length})</p>
          <button onClick={() => setOrders(os => [...os, defaultOrder()])} className="text-xs text-accent-cyan hover:underline">+ Add order</button>
        </div>
        {orders.map((order, idx) => (
          <div key={idx} className="rounded-xl border border-border/60 p-3 space-y-2 bg-border/5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted">Order {idx + 1}</span>
              {orders.length > 1 && (
                <button onClick={() => setOrders(os => os.filter((_, i) => i !== idx))} className="text-loss text-[10px] hover:underline">Remove</button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div><label className="block text-[10px] text-muted mb-1">Side</label>
                <select className="input-base text-xs" value={order.transactionType} onChange={e => updateOrder(idx, 'transactionType', e.target.value as 'BUY' | 'SELL')}>
                  <option value="BUY">BUY</option><option value="SELL">SELL</option>
                </select>
              </div>
              <div><label className="block text-[10px] text-muted mb-1">Exchange</label>
                <select className="input-base text-xs" value={order.exchangeSegment} onChange={e => updateOrder(idx, 'exchangeSegment', e.target.value)}>
                  {['NSE_EQ','BSE_EQ','NSE_FNO','BSE_FNO'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="block text-[10px] text-muted mb-1">Product</label>
                <select className="input-base text-xs" value={order.productType} onChange={e => updateOrder(idx, 'productType', e.target.value as typeof order.productType)}>
                  {(['CNC','INTRADAY','MARGIN','MTF'] as const).map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div><label className="block text-[10px] text-muted mb-1">Type</label>
                <select className="input-base text-xs" value={order.orderType} onChange={e => updateOrder(idx, 'orderType', e.target.value as typeof order.orderType)}>
                  {(['LIMIT','MARKET','STOP_LOSS','STOP_LOSS_MARKET'] as const).map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="block text-[10px] text-muted mb-1">Security ID</label>
                <input className="input-base text-xs font-mono" value={order.securityId} onChange={e => updateOrder(idx, 'securityId', e.target.value)} placeholder="12345" />
              </div>
              <div><label className="block text-[10px] text-muted mb-1">Qty</label>
                <input type="number" min={1} className="input-base text-xs font-mono" value={order.quantity} onChange={e => updateOrder(idx, 'quantity', Number(e.target.value))} />
              </div>
              <div><label className="block text-[10px] text-muted mb-1">Price</label>
                <input className="input-base text-xs font-mono" value={order.price} onChange={e => updateOrder(idx, 'price', e.target.value)} placeholder="250.00" />
              </div>
              <div><label className="block text-[10px] text-muted mb-1">Trigger Price</label>
                <input className="input-base text-xs font-mono" value={order.triggerPrice ?? '0'} onChange={e => updateOrder(idx, 'triggerPrice', e.target.value)} placeholder="0" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button onClick={handleSubmit} disabled={saving} className="btn-primary flex-1">
          {saving ? (isEdit ? 'Saving…' : 'Placing…') : (isEdit ? 'Update Alert' : 'Place Alert')}
        </button>
      </div>
    </div>
  );
}
