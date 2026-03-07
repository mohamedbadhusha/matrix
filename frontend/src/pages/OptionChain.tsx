/**
 * OptionChain.tsx
 * Full option chain viewer — OI, Greeks, IV, Bid/Ask, LTP for all strikes.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { BrokerAccount, OptionChainOC, OptionLeg } from '@/types';
import { RefreshCw, ChevronDown, Layers, Clock, BarChart2 } from 'lucide-react';

// ── Well-known underlyings ───────────────────────────────────────────────────
const UNDERLYINGS = [
  { label: 'NIFTY 50',            scrip: 13,  seg: 'IDX_I' },
  { label: 'BANK NIFTY',          scrip: 25,  seg: 'IDX_I' },
  { label: 'FIN NIFTY',           scrip: 27,  seg: 'IDX_I' },
  { label: 'MIDCAP NIFTY',        scrip: 442, seg: 'IDX_I' },
  { label: 'SENSEX',              scrip: 51,  seg: 'IDX_I' },
  { label: 'BANKEX',              scrip: 20,  seg: 'IDX_I' },
  { label: 'Custom',              scrip: 0,   seg: 'IDX_I' },
];

const SEGMENTS = ['IDX_I', 'NSE_FNO', 'BSE_FNO', 'MCX_COMM', 'NSE_EQ', 'BSE_EQ'];

const RATE_LIMIT_MS = 3000;

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtN = (v: number | undefined, dec = 2) =>
  v == null ? '—' : v.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtOI = (v: number | undefined) => {
  if (v == null) return '—';
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)}L`;
  return v.toLocaleString('en-IN');
};

function OIBar({ value, max, side }: { value: number; max: number; side: 'ce' | 'pe' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="relative h-1.5 rounded-full bg-border/30 overflow-hidden w-full">
      <div
        className={cn('absolute inset-y-0 h-full rounded-full transition-all', side === 'ce' ? 'bg-profit/60 right-0' : 'bg-loss/60 left-0')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Single cell for a leg ────────────────────────────────────────────────────
function LegCell({ leg, side, maxOI, showGreeks }: {
  leg: OptionLeg | undefined;
  side: 'ce' | 'pe';
  maxOI: number;
  showGreeks: boolean;
}) {
  if (!leg) return <td className="px-2 py-1.5 text-center text-muted text-[10px]">—</td>;

  const oiChange = leg.oi - leg.previous_oi;
  const isCE = side === 'ce';

  return (
    <td className={cn('px-1.5 py-1.5', isCE ? 'text-right' : 'text-left')}>
      <div className={cn('flex gap-3 items-center', isCE ? 'flex-row-reverse' : 'flex-row')}>
        {/* Main numbers */}
        <div className={cn('space-y-0.5 min-w-[64px]', isCE ? 'text-right' : 'text-left')}>
          <p className="font-mono font-semibold text-xs text-foreground">{fmtN(leg.last_price)}</p>
          <p className="font-mono text-[9px] text-muted">{fmtN(leg.average_price)}</p>
        </div>
        {/* IV */}
        <div className={cn('min-w-[44px]', isCE ? 'text-right' : 'text-left')}>
          <p className="font-mono text-[10px] text-accent-purple">{fmtN(leg.implied_volatility, 1)}%</p>
          <p className="font-mono text-[9px] text-muted">IV</p>
        </div>
        {/* OI + bar */}
        <div className={cn('min-w-[56px]', isCE ? 'text-right' : 'text-left')}>
          <p className="font-mono text-[10px] text-foreground">{fmtOI(leg.oi)}</p>
          <p className={cn('font-mono text-[9px]', oiChange >= 0 ? 'text-profit' : 'text-loss')}>
            {oiChange >= 0 ? '+' : ''}{fmtOI(oiChange)}
          </p>
          <OIBar value={leg.oi} max={maxOI} side={side} />
        </div>
        {/* Volume */}
        <div className={cn('hidden lg:block min-w-[48px]', isCE ? 'text-right' : 'text-left')}>
          <p className="font-mono text-[10px] text-muted">{fmtOI(leg.volume)}</p>
          <p className="font-mono text-[9px] text-muted/60">VOL</p>
        </div>
        {/* Bid/Ask */}
        <div className={cn('hidden xl:block min-w-[64px]', isCE ? 'text-right' : 'text-left')}>
          <p className="font-mono text-[10px] text-profit">{fmtN(leg.top_bid_price)}<span className="text-muted text-[8px] ml-0.5">×{leg.top_bid_quantity}</span></p>
          <p className="font-mono text-[10px] text-loss"> {fmtN(leg.top_ask_price)}<span className="text-muted text-[8px] ml-0.5">×{leg.top_ask_quantity}</span></p>
        </div>
        {/* Greeks */}
        {showGreeks && (
          <div className={cn('hidden 2xl:block text-[9px] font-mono space-y-0.5 min-w-[64px]', isCE ? 'text-right' : 'text-left')}>
            <p className="text-accent-cyan">Δ {fmtN(leg.greeks?.delta, 4)}</p>
            <p className="text-warning">θ {fmtN(leg.greeks?.theta, 2)}</p>
            <p className="text-muted">γ {fmtN(leg.greeks?.gamma, 5)}</p>
            <p className="text-accent-purple">ν {fmtN(leg.greeks?.vega, 2)}</p>
          </div>
        )}
      </div>
    </td>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function OptionChain() {
  const { profile } = useAuth();

  // Broker
  const [brokers, setBrokers]               = useState<BrokerAccount[]>([]);
  const [selectedBroker, setSelectedBroker] = useState('');

  // Underlying
  const [underlyingIdx, setUnderlyingIdx]   = useState(0);
  const [customScrip, setCustomScrip]       = useState(0);
  const [customSeg, setCustomSeg]           = useState('IDX_I');

  const activeScrip = underlyingIdx === UNDERLYINGS.length - 1 ? customScrip : UNDERLYINGS[underlyingIdx].scrip;
  const activeSeg   = underlyingIdx === UNDERLYINGS.length - 1 ? customSeg   : UNDERLYINGS[underlyingIdx].seg;

  // Expiry
  const [expiries, setExpiries]             = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [expiryLoading, setExpiryLoading]   = useState(false);

  // Chain
  const [chainData, setChainData]           = useState<{ last_price: number; oc: OptionChainOC } | null>(null);
  const [loading, setLoading]               = useState(false);
  const [lastFetched, setLastFetched]       = useState<Date | null>(null);

  // UI options
  const [showGreeks, setShowGreeks]         = useState(false);
  const [autoRefresh, setAutoRefresh]       = useState(false);
  const [countdown, setCountdown]           = useState(0);

  // Rate-limit enforcement
  const lastFetchRef  = useRef<number>(0);
  const autoTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('broker_accounts')
      .select('id, broker, client_id, is_active, mode')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .then(({ data }) => {
        const list = (data ?? []) as BrokerAccount[];
        setBrokers(list);
        if (list.length > 0 && !selectedBroker) setSelectedBroker(list[0].id);
      });
  }, [profile]);

  // Fetch expiry list whenever underlying changes
  const fetchExpiries = useCallback(async () => {
    if (!selectedBroker || !activeScrip) return;
    setExpiryLoading(true);
    try {
      const res  = await fetch('/api/dhan-option-chain-expiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId: selectedBroker, UnderlyingScrip: activeScrip, UnderlyingSeg: activeSeg }),
      });
      const data = await res.json() as { data?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      const list = data.data ?? [];
      setExpiries(list);
      setSelectedExpiry(list[0] ?? '');
      setChainData(null);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Expiry fetch failed'); }
    setExpiryLoading(false);
  }, [selectedBroker, activeScrip, activeSeg]);

  useEffect(() => { if (selectedBroker && activeScrip) fetchExpiries(); }, [selectedBroker, activeScrip, activeSeg]);

  // Fetch option chain
  const fetchChain = useCallback(async () => {
    if (!selectedBroker || !activeScrip || !selectedExpiry) return;
    const now = Date.now();
    const wait = RATE_LIMIT_MS - (now - lastFetchRef.current);
    if (wait > 0) { toast.warning(`Rate limit — wait ${(wait / 1000).toFixed(1)}s`); return; }

    setLoading(true);
    lastFetchRef.current = Date.now();
    startCountdown();
    try {
      const res  = await fetch('/api/dhan-option-chain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId: selectedBroker, UnderlyingScrip: activeScrip, UnderlyingSeg: activeSeg, Expiry: selectedExpiry }),
      });
      const data = await res.json() as { data?: { last_price: number; oc: OptionChainOC }; status?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      if (data.data) { setChainData(data.data); setLastFetched(new Date()); }
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Option chain fetch failed'); }
    setLoading(false);
  }, [selectedBroker, activeScrip, activeSeg, selectedExpiry]);

  function startCountdown() {
    if (cdTimerRef.current) clearInterval(cdTimerRef.current);
    let rem = RATE_LIMIT_MS / 1000;
    setCountdown(rem);
    cdTimerRef.current = setInterval(() => {
      rem -= 0.1;
      if (rem <= 0) { clearInterval(cdTimerRef.current!); setCountdown(0); }
      else setCountdown(parseFloat(rem.toFixed(1)));
    }, 100);
  }

  // Auto-refresh every 3s when enabled
  useEffect(() => {
    if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    if (autoRefresh && selectedExpiry) {
      autoTimerRef.current = setInterval(() => fetchChain(), RATE_LIMIT_MS + 50);
    }
    return () => { if (autoTimerRef.current) clearInterval(autoTimerRef.current); };
  }, [autoRefresh, fetchChain]);

  // Parse chain into sorted strike rows
  const strikes = chainData
    ? Object.entries(chainData.oc)
        .map(([k, v]) => ({ strike: parseFloat(k), ce: v.ce, pe: v.pe }))
        .sort((a, b) => a.strike - b.strike)
    : [];

  const atmStrike = chainData
    ? strikes.reduce((best, s) =>
        best === null || Math.abs(s.strike - chainData.last_price) < Math.abs(best - chainData.last_price)
          ? s.strike : best, null as number | null)
    : null;

  // Max OI for bar scaling
  const maxCeOI = Math.max(1, ...strikes.map(s => s.ce?.oi ?? 0));
  const maxPeOI = Math.max(1, ...strikes.map(s => s.pe?.oi ?? 0));
  const maxOI   = Math.max(maxCeOI, maxPeOI);

  // PCR
  const totalCeOI = strikes.reduce((s, r) => s + (r.ce?.oi ?? 0), 0);
  const totalPeOI = strikes.reduce((s, r) => s + (r.pe?.oi ?? 0), 0);
  const pcr = totalCeOI > 0 ? (totalPeOI / totalCeOI).toFixed(2) : '—';

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Layers size={20} className="text-accent-cyan" /> Option Chain
          </h1>
          <p className="text-xs text-muted mt-0.5">Real-time OI, Greeks, IV, Bid/Ask · Rate limit: 1 req / 3s</p>
        </div>
        {/* Broker */}
        <div className="relative">
          <select value={selectedBroker} onChange={e => setSelectedBroker(e.target.value)} className="input-base pr-8 text-sm min-w-[160px]">
            {brokers.length === 0 && <option value="">No brokers</option>}
            {brokers.map(b => <option key={b.id} value={b.id}>{b.broker} · {b.client_id}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        </div>
      </div>

      {/* Controls bar */}
      <div className="panel p-3 flex flex-wrap items-end gap-3">
        {/* Underlying selector */}
        <div>
          <label className="block text-[10px] text-muted mb-1.5 font-semibold uppercase tracking-wide">Underlying</label>
          <div className="flex flex-wrap gap-1.5">
            {UNDERLYINGS.map((u, i) => (
              <button key={i} onClick={() => setUnderlyingIdx(i)}
                className={cn('text-xs px-2.5 py-1 rounded-lg border transition-all',
                  underlyingIdx === i ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30' : 'text-muted border-border hover:text-foreground')}>
                {u.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom fields */}
        {underlyingIdx === UNDERLYINGS.length - 1 && (
          <div className="flex gap-2 items-end">
            <div>
              <label className="block text-[10px] text-muted mb-1.5">Security ID</label>
              <input type="number" className="input-base text-sm w-28 font-mono" value={customScrip || ''} onChange={e => setCustomScrip(Number(e.target.value))} placeholder="13" />
            </div>
            <div>
              <label className="block text-[10px] text-muted mb-1.5">Segment</label>
              <select className="input-base text-sm" value={customSeg} onChange={e => setCustomSeg(e.target.value)}>
                {SEGMENTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Expiry */}
        <div>
          <label className="block text-[10px] text-muted mb-1.5 font-semibold uppercase tracking-wide">Expiry</label>
          {expiryLoading ? (
            <div className="flex items-center gap-2 h-9 px-3 rounded-xl border border-border text-xs text-muted">
              <div className="w-3 h-3 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" /> Loading…
            </div>
          ) : (
            <div className="relative">
              <select className="input-base text-sm pr-8 min-w-[130px]" value={selectedExpiry} onChange={e => { setSelectedExpiry(e.target.value); setChainData(null); }}>
                {expiries.length === 0 && <option value="">—</option>}
                {expiries.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Cooldown indicator */}
          {countdown > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-warning">
              <Clock size={11} className="animate-pulse" /> {countdown}s
            </div>
          )}

          {/* Greeks toggle */}
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input type="checkbox" checked={showGreeks} onChange={e => setShowGreeks(e.target.checked)} className="accent-accent-purple" />
            <BarChart2 size={12} /> Greeks
          </label>

          {/* Auto-refresh */}
          <label className={cn('flex items-center gap-1.5 text-xs cursor-pointer select-none', autoRefresh && 'text-profit')}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="accent-profit" />
            Auto 3s
          </label>

          <button onClick={fetchChain} disabled={loading || !selectedExpiry || !selectedBroker} className="btn-primary gap-2">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Fetch
          </button>
        </div>
      </div>

      {/* Summary strip */}
      {chainData && (
        <div className="flex flex-wrap gap-4 px-1 text-xs">
          <div>
            <span className="text-muted">Underlying LTP: </span>
            <span className="font-mono font-bold text-accent-cyan">₹{fmtN(chainData.last_price)}</span>
          </div>
          <div>
            <span className="text-muted">ATM Strike: </span>
            <span className="font-mono font-bold text-foreground">{atmStrike != null ? fmtN(atmStrike, 0) : '—'}</span>
          </div>
          <div>
            <span className="text-muted">PCR: </span>
            <span className={cn('font-mono font-bold', parseFloat(pcr) >= 1 ? 'text-profit' : 'text-loss')}>{pcr}</span>
          </div>
          <div>
            <span className="text-muted">CE OI: </span>
            <span className="font-mono text-loss">{fmtOI(totalCeOI)}</span>
          </div>
          <div>
            <span className="text-muted">PE OI: </span>
            <span className="font-mono text-profit">{fmtOI(totalPeOI)}</span>
          </div>
          <div>
            <span className="text-muted">Strikes: </span>
            <span className="font-mono text-foreground">{strikes.length}</span>
          </div>
          {lastFetched && (
            <div className="ml-auto text-muted/70">
              Last: {lastFetched.toLocaleTimeString('en-IN')}
            </div>
          )}
        </div>
      )}

      {/* Main table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" />
        </div>
      ) : !chainData ? (
        <div className="panel p-16 text-center">
          <Layers size={36} className="mx-auto mb-3 text-muted opacity-20" />
          {brokers.length === 0 ? (
            <>
              <p className="text-sm text-loss font-semibold">No broker connected</p>
              <p className="text-xs text-muted/70 mt-1">Option Chain requires a Dhan broker account. Add one in <a href="/broker" className="text-accent-cyan underline">Broker settings</a>.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">Select an underlying + expiry, then click Fetch</p>
              <p className="text-xs text-muted/60 mt-1">Option chain rates are limited to 1 request per 3 seconds by Dhan</p>
              <p className="text-xs text-muted/40 mt-1">Note: Market data always uses the LIVE Dhan endpoint regardless of broker mode</p>
            </>
          )}
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate border-spacing-0">
              {/* Column header */}
              <thead>
                <tr className="border-b border-border">
                  {/* CE header */}
                  <th colSpan={showGreeks ? 6 : 5} className="px-3 py-2 text-center text-loss/80 font-semibold bg-loss/5 border-r border-border">CALL (CE)</th>
                  {/* Strike */}
                  <th className="px-3 py-2 text-center font-semibold text-muted whitespace-nowrap bg-border/10">STRIKE</th>
                  {/* PE header */}
                  <th colSpan={showGreeks ? 6 : 5} className="px-3 py-2 text-center text-profit/80 font-semibold bg-profit/5 border-l border-border">PUT (PE)</th>
                </tr>
                <tr className="border-b border-border/60 text-[9px] text-muted font-semibold uppercase tracking-wide">
                  {/* CE columns (reversed) */}
                  {showGreeks && <th className="px-2 py-1 text-right bg-loss/3">Greeks</th>}
                  <th className="px-2 py-1 text-right bg-loss/3">Bid/Ask</th>
                  <th className="px-2 py-1 text-right bg-loss/3">Vol</th>
                  <th className="px-2 py-1 text-right bg-loss/3">OI / ΔOI</th>
                  <th className="px-2 py-1 text-right bg-loss/3">IV %</th>
                  <th className="px-2 py-1 text-right bg-loss/3 border-r border-border">LTP / Avg</th>
                  {/* Strike */}
                  <th className="px-2 py-1 text-center bg-border/10">Price</th>
                  {/* PE columns */}
                  <th className="px-2 py-1 text-left bg-profit/3 border-l border-border">LTP / Avg</th>
                  <th className="px-2 py-1 text-left bg-profit/3">IV %</th>
                  <th className="px-2 py-1 text-left bg-profit/3">OI / ΔOI</th>
                  <th className="px-2 py-1 text-left bg-profit/3">Vol</th>
                  <th className="px-2 py-1 text-left bg-profit/3">Bid/Ask</th>
                  {showGreeks && <th className="px-2 py-1 text-left bg-profit/3">Greeks</th>}
                </tr>
              </thead>
              <tbody>
                {strikes.map(({ strike, ce, pe }) => {
                  const isATM = strike === atmStrike;
                  const itm_ce = chainData.last_price > strike;
                  const itm_pe = chainData.last_price < strike;
                  return (
                    <tr key={strike}
                      className={cn(
                        'border-b border-border/30 transition-colors hover:bg-border/5',
                        isATM && 'bg-accent-cyan/5 border-accent-cyan/30'
                      )}>
                      {/* CE side */}
                      {showGreeks && (
                        <td className={cn('px-1.5 py-1.5 text-right hidden 2xl:table-cell', itm_ce ? 'bg-loss/5' : '')}>
                          {ce ? (
                            <div className="text-[9px] font-mono space-y-0.5 text-right">
                              <p className="text-accent-cyan">Δ {fmtN(ce.greeks?.delta, 4)}</p>
                              <p className="text-warning">θ {fmtN(ce.greeks?.theta, 2)}</p>
                              <p className="text-muted">γ {fmtN(ce.greeks?.gamma, 5)}</p>
                              <p className="text-accent-purple">ν {fmtN(ce.greeks?.vega, 2)}</p>
                            </div>
                          ) : <span className="text-muted">—</span>}
                        </td>
                      )}
                      {/* CE Bid/Ask */}
                      <td className={cn('px-1.5 py-1.5 text-right hidden xl:table-cell', itm_ce ? 'bg-loss/5' : '')}>
                        {ce ? (
                          <div className="text-[10px] font-mono">
                            <p className="text-profit">{fmtN(ce.top_bid_price)}<span className="text-[8px] text-muted ml-0.5">×{ce.top_bid_quantity}</span></p>
                            <p className="text-loss">{fmtN(ce.top_ask_price)}<span className="text-[8px] text-muted ml-0.5">×{ce.top_ask_quantity}</span></p>
                          </div>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      {/* CE Vol */}
                      <td className={cn('px-1.5 py-1.5 text-right hidden lg:table-cell', itm_ce ? 'bg-loss/5' : '')}>
                        <p className="font-mono text-[10px] text-muted">{fmtOI(ce?.volume)}</p>
                        <p className="font-mono text-[9px] text-muted/60">{fmtOI(ce?.previous_volume)}</p>
                      </td>
                      {/* CE OI */}
                      <td className={cn('px-1.5 py-1.5 text-right', itm_ce ? 'bg-loss/5' : '')}>
                        {ce ? (
                          <div className="min-w-[60px]">
                            <p className="font-mono text-[10px]">{fmtOI(ce.oi)}</p>
                            <p className={cn('font-mono text-[9px]', (ce.oi - ce.previous_oi) >= 0 ? 'text-profit' : 'text-loss')}>
                              {ce.oi - ce.previous_oi >= 0 ? '+' : ''}{fmtOI(ce.oi - ce.previous_oi)}
                            </p>
                            <OIBar value={ce.oi} max={maxOI} side="ce" />
                          </div>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      {/* CE IV */}
                      <td className={cn('px-1.5 py-1.5 text-right', itm_ce ? 'bg-loss/5' : '')}>
                        {ce ? <p className="font-mono text-[10px] text-accent-purple">{fmtN(ce.implied_volatility, 1)}%</p> : <span className="text-muted">—</span>}
                      </td>
                      {/* CE LTP */}
                      <td className={cn('px-1.5 py-1.5 text-right border-r border-border/40', itm_ce ? 'bg-loss/5' : '')}>
                        {ce ? (
                          <div>
                            <p className="font-mono font-semibold text-xs">{fmtN(ce.last_price)}</p>
                            <p className="font-mono text-[9px] text-muted">{fmtN(ce.average_price)}</p>
                          </div>
                        ) : <span className="text-muted">—</span>}
                      </td>

                      {/* Strike */}
                      <td className={cn('px-3 py-1.5 text-center font-mono font-bold text-sm bg-border/10 whitespace-nowrap', isATM && 'text-accent-cyan')}>
                        {fmtN(strike, 0)}
                        {isATM && <span className="ml-1 text-[9px] bg-accent-cyan/20 text-accent-cyan px-1 rounded">ATM</span>}
                      </td>

                      {/* PE LTP */}
                      <td className={cn('px-1.5 py-1.5 text-left border-l border-border/40', itm_pe ? 'bg-profit/5' : '')}>
                        {pe ? (
                          <div>
                            <p className="font-mono font-semibold text-xs">{fmtN(pe.last_price)}</p>
                            <p className="font-mono text-[9px] text-muted">{fmtN(pe.average_price)}</p>
                          </div>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      {/* PE IV */}
                      <td className={cn('px-1.5 py-1.5 text-left', itm_pe ? 'bg-profit/5' : '')}>
                        {pe ? <p className="font-mono text-[10px] text-accent-purple">{fmtN(pe.implied_volatility, 1)}%</p> : <span className="text-muted">—</span>}
                      </td>
                      {/* PE OI */}
                      <td className={cn('px-1.5 py-1.5 text-left', itm_pe ? 'bg-profit/5' : '')}>
                        {pe ? (
                          <div className="min-w-[60px]">
                            <p className="font-mono text-[10px]">{fmtOI(pe.oi)}</p>
                            <p className={cn('font-mono text-[9px]', (pe.oi - pe.previous_oi) >= 0 ? 'text-profit' : 'text-loss')}>
                              {pe.oi - pe.previous_oi >= 0 ? '+' : ''}{fmtOI(pe.oi - pe.previous_oi)}
                            </p>
                            <OIBar value={pe.oi} max={maxOI} side="pe" />
                          </div>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      {/* PE Vol */}
                      <td className={cn('px-1.5 py-1.5 text-left hidden lg:table-cell', itm_pe ? 'bg-profit/5' : '')}>
                        <p className="font-mono text-[10px] text-muted">{fmtOI(pe?.volume)}</p>
                        <p className="font-mono text-[9px] text-muted/60">{fmtOI(pe?.previous_volume)}</p>
                      </td>
                      {/* PE Bid/Ask */}
                      <td className={cn('px-1.5 py-1.5 text-left hidden xl:table-cell', itm_pe ? 'bg-profit/5' : '')}>
                        {pe ? (
                          <div className="text-[10px] font-mono">
                            <p className="text-profit">{fmtN(pe.top_bid_price)}<span className="text-[8px] text-muted ml-0.5">×{pe.top_bid_quantity}</span></p>
                            <p className="text-loss">{fmtN(pe.top_ask_price)}<span className="text-[8px] text-muted ml-0.5">×{pe.top_ask_quantity}</span></p>
                          </div>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      {/* PE Greeks */}
                      {showGreeks && (
                        <td className={cn('px-1.5 py-1.5 text-left hidden 2xl:table-cell', itm_pe ? 'bg-profit/5' : '')}>
                          {pe ? (
                            <div className="text-[9px] font-mono space-y-0.5">
                              <p className="text-accent-cyan">Δ {fmtN(pe.greeks?.delta, 4)}</p>
                              <p className="text-warning">θ {fmtN(pe.greeks?.theta, 2)}</p>
                              <p className="text-muted">γ {fmtN(pe.greeks?.gamma, 5)}</p>
                              <p className="text-accent-purple">ν {fmtN(pe.greeks?.vega, 2)}</p>
                            </div>
                          ) : <span className="text-muted">—</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-border text-[10px] text-muted flex items-center gap-4">
            <span>{strikes.length} strikes</span>
            <span className="text-loss">■ ITM (CE)</span>
            <span className="text-profit">■ ITM (PE)</span>
            <span className="text-accent-cyan">■ ATM</span>
            <span className="ml-auto">OI bars scaled to max: {fmtOI(maxOI)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
