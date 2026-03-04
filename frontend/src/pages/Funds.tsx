/**
 * Funds.tsx
 * Fund Limit + Single & Multi Margin Calculator.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { BrokerAccount, DhanFundLimit, MarginCalculatorPayload, DhanMarginResult, MultiMarginScript, MultiMarginCalculatorPayload, DhanMultiMarginResult } from '@/types';
import { ChevronDown, RefreshCw, Wallet, Plus, X, Calculator } from 'lucide-react';

const fmtINR = (v: number | undefined) =>
  v === undefined ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(v);

// ── Main ─────────────────────────────────────────────────────────────────────
export default function Funds() {
  const { profile } = useAuth();
  const [brokers, setBrokers]               = useState<BrokerAccount[]>([]);
  const [selectedBroker, setSelectedBroker] = useState('');

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

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Wallet size={20} className="text-accent-cyan" /> Funds & Margin</h1>
          <p className="text-xs text-muted mt-0.5">Fund limits and margin calculations</p>
        </div>
        <div className="relative">
          <select value={selectedBroker} onChange={e => setSelectedBroker(e.target.value)} className="input-base pr-8 text-sm min-w-[160px]">
            {brokers.length === 0 && <option value="">No brokers</option>}
            {brokers.map(b => <option key={b.id} value={b.id}>{b.broker_name} · {b.client_id}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        </div>
      </div>

      <FundLimitCard brokerId={selectedBroker} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SingleMarginCard brokerId={selectedBroker} />
        <MultiMarginCard  brokerId={selectedBroker} />
      </div>
    </div>
  );
}

// ── Fund Limit ───────────────────────────────────────────────────────────────

function FundLimitCard({ brokerId }: { brokerId: string }) {
  const [funds, setFunds]     = useState<DhanFundLimit | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    if (!brokerId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/dhan-fund-limit?brokerId=${brokerId}`);
      const data = await res.json() as DhanFundLimit & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setFunds(data);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
    setLoading(false);
  }, [brokerId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const items: { label: string; key: keyof DhanFundLimit; highlight?: string }[] = [
    { label: 'Available Balance', key: 'availabelBalance', highlight: 'text-profit' },
    { label: 'SOD Limit',         key: 'sodLimit' },
    { label: 'Collateral',        key: 'collateralAmount' },
    { label: 'Receivable',        key: 'receiveableAmount' },
    { label: 'Utilized',          key: 'utilizedAmount',   highlight: 'text-loss' },
    { label: 'Blocked Payout',    key: 'blockedPayoutAmount' },
    { label: 'Withdrawable',      key: 'withdrawableBalance', highlight: 'text-accent-cyan' },
  ];

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Wallet size={14} className="text-accent-cyan" /> Fund Summary</h2>
        <button onClick={fetch_} disabled={loading || !brokerId} className="btn-secondary gap-2 text-xs">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {!brokerId || (!funds && !loading) ? (
        <p className="text-xs text-center text-muted py-6">Select a broker to load fund data</p>
      ) : loading ? (
        <div className="flex justify-center py-8"><div className="w-6 h-6 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {items.map(({ label, key, highlight }) => (
              <div key={key} className="bg-border/10 rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted mb-1.5">{label}</p>
                <p className={`font-mono font-semibold text-sm ${highlight ?? 'text-foreground'}`}>
                  {fmtINR(funds?.[key] as number)}
                </p>
              </div>
            ))}
          </div>
          {funds?.dhanClientId && <p className="text-[10px] text-muted mt-3">Client ID: {funds.dhanClientId}</p>}
        </>
      )}
    </div>
  );
}

// ── Single Margin Calculator ─────────────────────────────────────────────────

const defaultSinglePayload = (): Omit<MarginCalculatorPayload, 'brokerId'> => ({
  exchangeSegment: 'NSE_EQ',
  transactionType: 'BUY',
  quantity: 1,
  productType: 'CNC',
  securityId: '',
  price: 0,
  triggerPrice: 0,
});

function SingleMarginCard({ brokerId }: { brokerId: string }) {
  const [form, setForm]       = useState(defaultSinglePayload());
  const [result, setResult]   = useState<DhanMarginResult | null>(null);
  const [loading, setLoading] = useState(false);

  const update = <K extends keyof typeof form>(key: K, val: typeof form[K]) => setForm(f => ({ ...f, [key]: val }));

  const calculate = async () => {
    if (!brokerId) { toast.error('Select a broker'); return; }
    if (!form.securityId) { toast.error('Security ID required'); return; }
    setLoading(true);
    try {
      const payload: MarginCalculatorPayload = { brokerId, ...form };
      const res  = await fetch('/api/dhan-margin-calculator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json() as DhanMarginResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setResult(data);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
    setLoading(false);
  };

  return (
    <div className="panel p-5 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2"><Calculator size={14} className="text-accent-purple" /> Margin Calculator</h2>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {[
          { label: 'Exchange', key: 'exchangeSegment' as const, type: 'select', options: ['NSE_EQ','BSE_EQ','NSE_FNO','BSE_FNO','NSE_CURRENCY','BSE_CURRENCY','MCX_COMM'] },
          { label: 'Side',     key: 'transactionType' as const, type: 'select', options: ['BUY','SELL'] },
          { label: 'Product',  key: 'productType' as const,     type: 'select', options: ['CNC','INTRADAY','MARGIN','MTF','CO','BO'] },
          { label: 'Security ID', key: 'securityId' as const, type: 'text' },
          { label: 'Quantity',    key: 'quantity' as const,    type: 'number' },
          { label: 'Price',       key: 'price' as const,       type: 'number' },
          { label: 'Trigger Price (SL)', key: 'triggerPrice' as const, type: 'number' },
        ].map(({ label, key, type, options }) => (
          <div key={key}>
            <label className="block text-xs text-muted mb-1.5">{label}</label>
            {type === 'select' ? (
              <select className="input-base text-sm" value={String(form[key])} onChange={e => update(key, e.target.value as never)}>
                {options!.map(o => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input className="input-base text-sm font-mono" type={type} value={String(form[key])} onChange={e => update(key, (type === 'number' ? Number(e.target.value) : e.target.value) as never)} />
            )}
          </div>
        ))}
      </div>

      <button onClick={calculate} disabled={loading || !brokerId} className="btn-primary w-full">
        {loading ? 'Calculating…' : 'Calculate Margin'}
      </button>

      {result && (
        <div className="border-t border-border pt-4 grid grid-cols-2 gap-2">
          {([
            { label: 'Total Margin',    key: 'totalMargin' as const,    cls: 'text-accent-cyan' },
            { label: 'SPAN Margin',     key: 'spanMargin' as const },
            { label: 'Exposure Margin', key: 'exposureMargin' as const },
            { label: 'Available Bal',   key: 'availableBalance' as const, cls: 'text-profit' },
            { label: 'Variable Margin', key: 'variableMargin' as const },
            { label: 'Insufficient',    key: 'insufficientBalance' as const, cls: result.insufficientBalance ? 'text-loss' : '' },
            { label: 'Brokerage',       key: 'brokerage' as const },
            { label: 'Leverage',        key: 'leverage' as const },
          ] as const).map(({ label, key, cls }) => (
            <div key={key} className="bg-border/10 rounded-lg px-2.5 py-2">
              <p className="text-[10px] text-muted">{label}</p>
              <p className={`font-mono text-xs font-semibold mt-0.5 ${cls ?? 'text-foreground'}`}>
                {key === 'leverage' ? `${result[key]}x` : fmtINR(Number(result[key]))}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Multi Margin Calculator ──────────────────────────────────────────────────

const defaultScript = (): MultiMarginScript => ({
  exchangeSegment: 'NSE_EQ',
  transactionType: 'BUY',
  quantity: 1,
  productType: 'CNC',
  securityId: '',
  price: 0,
});

function MultiMarginCard({ brokerId }: { brokerId: string }) {
  const [scripts, setScripts]           = useState<MultiMarginScript[]>([defaultScript()]);
  const [includePosition, setIncPos]    = useState(false);
  const [includeOrders, setIncOrd]      = useState(false);
  const [result, setResult]             = useState<DhanMultiMarginResult | null>(null);
  const [loading, setLoading]           = useState(false);

  const updateScript = <K extends keyof MultiMarginScript>(idx: number, key: K, val: MultiMarginScript[K]) =>
    setScripts(ss => ss.map((s, i) => i === idx ? { ...s, [key]: val } : s));

  const calculate = async () => {
    if (!brokerId) { toast.error('Select a broker'); return; }
    if (scripts.some(s => !s.securityId)) { toast.error('All rows need a Security ID'); return; }
    setLoading(true);
    try {
      const payload: MultiMarginCalculatorPayload = { brokerId, includePosition, includeOrders, scripts };
      const res  = await fetch('/api/dhan-margin-calculator-multi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json() as DhanMultiMarginResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setResult(data);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
    setLoading(false);
  };

  return (
    <div className="panel p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Calculator size={14} className="text-warning" /> Multi Margin Calculator</h2>
        <button onClick={() => setScripts(ss => [...ss, defaultScript()])} className="text-xs text-accent-cyan hover:underline flex items-center gap-1">
          <Plus size={11} /> Add row
        </button>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto">
        {scripts.map((s, idx) => (
          <div key={idx} className="rounded-xl border border-border/60 p-2.5 grid grid-cols-3 gap-2 text-xs bg-border/5">
            <div>
              <label className="block text-[10px] text-muted mb-1">Exchange</label>
              <select className="input-base text-xs" value={s.exchangeSegment} onChange={e => updateScript(idx, 'exchangeSegment', e.target.value)}>
                {['NSE_EQ','BSE_EQ','NSE_FNO','BSE_FNO','MCX_COMM'].map(x => <option key={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-muted mb-1">Side</label>
              <select className="input-base text-xs" value={s.transactionType} onChange={e => updateScript(idx, 'transactionType', e.target.value as 'BUY' | 'SELL')}>
                <option>BUY</option><option>SELL</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-muted mb-1">Product</label>
              <select className="input-base text-xs" value={s.productType} onChange={e => updateScript(idx, 'productType', e.target.value)}>
                {['CNC','INTRADAY','MARGIN','MTF'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-muted mb-1">Security ID</label>
              <input className="input-base text-xs font-mono" value={s.securityId} onChange={e => updateScript(idx, 'securityId', e.target.value)} placeholder="12345" />
            </div>
            <div>
              <label className="block text-[10px] text-muted mb-1">Qty</label>
              <input type="number" min={1} className="input-base text-xs font-mono" value={s.quantity} onChange={e => updateScript(idx, 'quantity', Number(e.target.value))} />
            </div>
            <div className="flex items-end gap-1">
              <div className="flex-1"><label className="block text-[10px] text-muted mb-1">Price</label>
                <input type="number" className="input-base text-xs font-mono" value={s.price} onChange={e => updateScript(idx, 'price', Number(e.target.value))} />
              </div>
              {scripts.length > 1 && (
                <button onClick={() => setScripts(ss => ss.filter((_, i) => i !== idx))} className="mb-0.5 text-loss p-1.5 rounded-lg border border-loss/20 hover:bg-loss/10">
                  <X size={10} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        <label className="flex items-center gap-1.5 text-xs cursor-pointer"><input type="checkbox" checked={includePosition} onChange={e => setIncPos(e.target.checked)} className="accent-warning" /> Include Positions</label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer"><input type="checkbox" checked={includeOrders}   onChange={e => setIncOrd(e.target.checked)} className="accent-warning" /> Include Orders</label>
      </div>

      <button onClick={calculate} disabled={loading || !brokerId} className="btn-primary w-full">
        {loading ? 'Calculating…' : 'Calculate Multi Margin'}
      </button>

      {result && (
        <div className="border-t border-border pt-4 grid grid-cols-2 gap-2">
          {([
            { label: 'Total Margin',     key: 'total_margin' as const,     cls: 'text-accent-cyan' },
            { label: 'SPAN Margin',      key: 'span_margin' as const },
            { label: 'Exposure Margin',  key: 'exposure_margin' as const },
            { label: 'Equity Margin',    key: 'equity_margin' as const },
            { label: 'F&O Margin',       key: 'fo_margin' as const },
            { label: 'Commodity Margin', key: 'commodity_margin' as const },
            { label: 'Currency Margin',  key: 'currency' as const },
            { label: 'Hedge Benefit',    key: 'hedge_benefit' as const,    cls: 'text-profit' },
          ] as const).map(({ label, key, cls }) => (
            <div key={key} className="bg-border/10 rounded-lg px-2.5 py-2">
              <p className="text-[10px] text-muted">{label}</p>
              <p className={`font-mono text-xs font-semibold mt-0.5 ${cls ?? 'text-foreground'}`}>{fmtINR(Number(result[key]))}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
