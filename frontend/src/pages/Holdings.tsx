/**
 * Holdings.tsx
 * Demat holdings viewer with convert-position capability.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { BrokerAccount, DhanHolding, ConvertPositionPayload } from '@/types';
import { RefreshCw, Package, ArrowRightLeft, ChevronDown, X } from 'lucide-react';

export default function Holdings() {
  const { profile } = useAuth();
  const [brokers, setBrokers]             = useState<BrokerAccount[]>([]);
  const [selectedBroker, setSelectedBroker] = useState('');
  const [holdings, setHoldings]           = useState<DhanHolding[]>([]);
  const [loading, setLoading]             = useState(false);
  const [search, setSearch]               = useState('');
  const [convertTarget, setConvertTarget] = useState<DhanHolding | null>(null);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('broker_accounts')
      .select('id, broker, client_id, is_active, health_status')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .then(({ data }) => {
        const list = (data ?? []) as BrokerAccount[];
        setBrokers(list);
        if (list.length > 0 && !selectedBroker) setSelectedBroker(list[0].id);
      });
  }, [profile]);

  const fetchHoldings = useCallback(async () => {
    if (!selectedBroker) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/dhan-holdings?brokerId=${selectedBroker}`);
      const data = await res.json() as DhanHolding[] | { error?: string };
      if (!res.ok) { toast.error((data as { error?: string }).error ?? 'Fetch failed'); setHoldings([]); }
      else setHoldings(Array.isArray(data) ? data : []);
    } catch { toast.error('Network error'); }
    setLoading(false);
  }, [selectedBroker]);

  useEffect(() => { fetchHoldings(); }, [fetchHoldings]);

  const filtered = holdings.filter(h =>
    !search || h.tradingSymbol.toLowerCase().includes(search.toLowerCase()) || h.isin?.toLowerCase().includes(search.toLowerCase()),
  );

  const totalValue   = holdings.reduce((s, h) => s + h.avgCostPrice * h.totalQty, 0);
  const totalHeld    = holdings.filter(h => h.totalQty > 0).length;
  const t1Count      = holdings.filter(h => h.t1Qty > 0).reduce((s, h) => s + h.t1Qty, 0);
  const collateral   = holdings.filter(h => h.collateralQty > 0).length;

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Package size={20} className="text-accent-cyan" /> Holdings
          </h1>
          <p className="text-xs text-muted mt-0.5">Demat holdings from your broker account</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select value={selectedBroker} onChange={e => setSelectedBroker(e.target.value)} className="input-base pr-8 text-sm min-w-[160px]">
              {brokers.length === 0 && <option value="">No brokers</option>}
              {brokers.map(b => <option key={b.id} value={b.id}>{b.broker} · {b.client_id}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
          <button onClick={fetchHoldings} disabled={loading || !selectedBroker} className="btn-secondary gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Holdings',        value: totalHeld,     mono: false },
          { label: 'Invested Value', value: `₹${Math.round(totalValue).toLocaleString('en-IN')}`, mono: true },
          { label: 'T+1 Pending',    value: t1Count,        mono: false },
          { label: 'Collateral',     value: collateral,     mono: false },
        ].map(({ label, value, mono }) => (
          <div key={label} className="panel px-4 py-3 space-y-1">
            <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
            <p className={cn('text-lg font-bold', mono ? 'font-mono text-accent-cyan' : 'text-foreground')}>{value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        className="input-base text-sm w-full max-w-xs"
        placeholder="Search symbol or ISIN…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Convert form */}
      {convertTarget && (
        <ConvertPositionForm
          holding={convertTarget}
          brokerId={selectedBroker}
          onDone={() => { setConvertTarget(null); fetchHoldings(); }}
          onClose={() => setConvertTarget(null)}
        />
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-7 h-7 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="panel p-12 text-center">
          <Package size={32} className="mx-auto mb-3 text-muted opacity-40" />
          <p className="text-sm text-muted">{holdings.length === 0 ? 'No holdings — click Refresh to fetch' : 'No holdings match search'}</p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {['Symbol','Exchange','ISIN','Total','DP','T+1','Available','Collateral','Avg Cost','Value',''].map(h => (
                    <th key={h} className="text-left text-muted font-medium px-3 py-2.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.map((h, i) => (
                  <tr key={`${h.securityId}-${i}`} className="hover:bg-border/20 transition-colors">
                    <td className="px-3 py-2.5 font-mono font-semibold text-foreground">{h.tradingSymbol}</td>
                    <td className="px-3 py-2.5 text-muted text-[11px]">{h.exchange}</td>
                    <td className="px-3 py-2.5 text-muted font-mono text-[10px]">{h.isin ?? '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-foreground font-semibold">{h.totalQty}</td>
                    <td className="px-3 py-2.5 font-mono text-foreground">{h.dpQty}</td>
                    <td className="px-3 py-2.5 font-mono text-warning">{h.t1Qty > 0 ? h.t1Qty : '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-profit">{h.availableQty}</td>
                    <td className="px-3 py-2.5 font-mono text-muted">{h.collateralQty > 0 ? h.collateralQty : '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-foreground">{h.avgCostPrice.toFixed(2)}</td>
                    <td className="px-3 py-2.5 font-mono text-accent-cyan">₹{(h.avgCostPrice * h.totalQty).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => setConvertTarget(h)} className="p-1.5 rounded-lg text-accent-cyan border border-accent-cyan/20 hover:bg-accent-cyan/10 transition-all" title="Convert position">
                        <ArrowRightLeft size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
            <p className="text-xs text-muted">{filtered.length} holding{filtered.length !== 1 ? 's' : ''}</p>
            <p className="text-xs font-mono font-semibold text-accent-cyan">Total: ₹{Math.round(totalValue).toLocaleString('en-IN')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Convert Position Form ──────────────────────────────────────────────────

interface ConvertFormProps { holding: DhanHolding; brokerId: string; onDone: () => void; onClose: () => void; }

function ConvertPositionForm({ holding, brokerId, onDone, onClose }: ConvertFormProps) {
  const [form, setForm] = useState<Omit<ConvertPositionPayload, 'brokerId'>>({
    fromProductType: 'CNC',
    exchangeSegment: 'NSE_EQ',
    positionType: 'LONG',
    securityId: holding.securityId,
    tradingSymbol: holding.tradingSymbol,
    convertQty: holding.availableQty,
    toProductType: 'INTRADAY',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (form.fromProductType === form.toProductType) { toast.error('From and to product types must differ'); return; }
    setSaving(true);
    try {
      const res  = await fetch('/api/dhan-convert-position', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brokerId, ...form }) });
      const data = await res.json() as { status?: string; message?: string; error?: string };
      if (!res.ok && res.status !== 202) throw new Error(data.error ?? 'Conversion failed');
      toast.success(data.message ?? 'Position conversion submitted');
      onDone();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    setSaving(false);
  };

  return (
    <div className="panel p-5 space-y-4 border-l-2 border-accent-cyan/50 animate-slide-up">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><ArrowRightLeft size={14} /> Convert Position — {holding.tradingSymbol}</h3>
        <button onClick={onClose} className="text-muted hover:text-foreground"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <div>
          <label className="block text-xs text-muted mb-1.5">Exchange</label>
          <select className="input-base" value={form.exchangeSegment} onChange={e => setForm(f => ({ ...f, exchangeSegment: e.target.value }))}>
            {['NSE_EQ','BSE_EQ','NSE_FNO','BSE_FNO','NSE_CURRENCY','BSE_CURRENCY','MCX_COMM'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Position Type</label>
          <select className="input-base" value={form.positionType} onChange={e => setForm(f => ({ ...f, positionType: e.target.value as 'LONG' | 'SHORT' | 'CLOSED' }))}>
            {(['LONG','SHORT','CLOSED'] as const).map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">From Product</label>
          <select className="input-base" value={form.fromProductType} onChange={e => setForm(f => ({ ...f, fromProductType: e.target.value as typeof form.fromProductType }))}>
            {(['CNC','INTRADAY','MARGIN','CO','BO'] as const).map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">To Product</label>
          <select className="input-base" value={form.toProductType} onChange={e => setForm(f => ({ ...f, toProductType: e.target.value as typeof form.toProductType }))}>
            {(['CNC','INTRADAY','MARGIN','CO','BO'] as const).map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Quantity</label>
          <input type="number" min={1} max={holding.availableQty} className="input-base font-mono" value={form.convertQty} onChange={e => setForm(f => ({ ...f, convertQty: Number(e.target.value) }))} />
          <p className="text-[10px] text-muted mt-0.5">Available: {holding.availableQty}</p>
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button onClick={handleSubmit} disabled={saving} className="btn-primary flex-1">
          {saving ? 'Converting…' : `Convert ${form.fromProductType} → ${form.toProductType}`}
        </button>
      </div>
    </div>
  );
}
