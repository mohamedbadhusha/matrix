import { useState, useCallback, useRef } from 'react';
import {
  PlayCircle, StopCircle, RotateCcw, TrendingUp, TrendingDown,
  ChevronUp, ChevronDown, AlertTriangle, CheckCircle2, Zap, Info,
} from 'lucide-react';
import { parseSignal } from '@/lib/signalParser';
import { calcMomentumTargets, calcBucketQuantity } from '@/lib/tradeUtils';
import { LOT_SIZES, PROTOCOL_META, PROTOCOL_BUCKETS } from '@/lib/constants';
import type { Protocol, ParsedSignal } from '@/types';
import { cn } from '@/lib/utils';

// ── Simulator trade state (mirrors TradeNode, fully in-memory) ──────────────
interface SimTrade {
  protocol: Protocol;
  symbol: string;
  strike: string;
  entryPrice: number;
  sl: number;
  initialSl: number;
  t1: number;
  t2: number;
  t3: number;
  lots: number;
  lotSize: number;
  qtyPerBucket: number;
  remainingBuckets: number;
  remainingQty: number;
  t1Hit: boolean;
  t2Hit: boolean;
  t3Hit: boolean;
  slHit: boolean;
  bookedPnl: number;
  status: 'ACTIVE' | 'CLOSED' | 'SL_HIT';
  exitPrice: number | null;
  realisedPnl: number | null;
  ltp: number;
  events: SimEvent[];
}

interface SimEvent {
  id: number;
  type: 'T1_HIT' | 'T2_HIT' | 'T3_HIT' | 'SL_HIT' | 'SL_TRAILED' | 'CLOSED' | 'ENTRY';
  ltp: number;
  message: string;
  pnl?: number;
}

// ── Protocol simulation logic (mirrors worker/src/protocolHandlers.ts) ───────
function runProtocolTick(trade: SimTrade, ltp: number): SimTrade {
  if (trade.status !== 'ACTIVE') return trade;
  let t = { ...trade, ltp, events: [...trade.events] };
  const addEvent = (type: SimEvent['type'], msg: string, pnl?: number) => {
    t.events = [{ id: Date.now() + Math.random(), type, ltp, message: msg, pnl }, ...t.events];
  };

  // SL check (always first)
  if (ltp <= t.sl) {
    const remainPnl = (ltp - t.entryPrice) * t.remainingQty;
    const finalPnl = Math.round((t.bookedPnl + remainPnl) * 100) / 100;
    addEvent('SL_HIT', `SL hit at ₹${ltp} — all ${t.remainingQty} qty exited`, finalPnl);
    return { ...t, status: 'SL_HIT', slHit: true, exitPrice: ltp, realisedPnl: finalPnl, remainingBuckets: 0, remainingQty: 0 };
  }

  // ── PROTECTOR ─────────────────────────────────────────────────────────────
  if (t.protocol === 'PROTECTOR') {
    // T1 → exit 1 bucket, trail SL to entry
    if (!t.t1Hit && ltp >= t.t1) {
      const bPnl = Math.round(((t.t1 - t.entryPrice) * t.qtyPerBucket + t.bookedPnl) * 100) / 100;
      addEvent('T1_HIT', `T1 ₹${t.t1} hit — 1 bucket sold, SL → entry ₹${t.entryPrice}`, bPnl - t.bookedPnl);
      addEvent('SL_TRAILED', `SL trailed to breakeven ₹${t.entryPrice}`);
      t = { ...t, t1Hit: true, bookedPnl: bPnl, sl: t.entryPrice, remainingBuckets: t.remainingBuckets - 1, remainingQty: t.remainingQty - t.qtyPerBucket };
    }
    // T2 → NO exit, trail SL to T1
    if (t.t1Hit && !t.t2Hit && ltp >= t.t2) {
      addEvent('T2_HIT', `T2 ₹${t.t2} reached — no exit, SL → T1 ₹${t.t1}`);
      addEvent('SL_TRAILED', `SL trailed to ₹${t.t1}`);
      t = { ...t, t2Hit: true, sl: t.t1 };
    }
    // T3 → exit ALL remaining 2 buckets
    if (t.t1Hit && t.t2Hit && !t.t3Hit && ltp >= t.t3) {
      const remPnl = (t.t3 - t.entryPrice) * t.remainingQty;
      const finalPnl = Math.round((t.bookedPnl + remPnl) * 100) / 100;
      addEvent('T3_HIT', `T3 ₹${t.t3} hit — remaining ${t.remainingQty} qty exited`, finalPnl - t.bookedPnl);
      t = { ...t, t3Hit: true, bookedPnl: finalPnl, status: 'CLOSED', exitPrice: t.t3, realisedPnl: finalPnl, remainingBuckets: 0, remainingQty: 0 };
      addEvent('CLOSED', `Trade CLOSED — Total P&L ₹${finalPnl}`);
    }
  }

  // ── HALF_AND_HALF ─────────────────────────────────────────────────────────
  if (t.protocol === 'HALF_AND_HALF') {
    // T1 → mark only, trail SL to entry
    if (!t.t1Hit && ltp >= t.t1) {
      addEvent('T1_HIT', `T1 ₹${t.t1} marked — no exit yet, SL → entry ₹${t.entryPrice}`);
      addEvent('SL_TRAILED', `SL trailed to breakeven ₹${t.entryPrice}`);
      t = { ...t, t1Hit: true, sl: t.entryPrice };
    }
    // T2 → exit bucket 1 of 2
    if (t.t1Hit && !t.t2Hit && ltp >= t.t2) {
      const bPnl = Math.round(((t.t2 - t.entryPrice) * t.qtyPerBucket + t.bookedPnl) * 100) / 100;
      addEvent('T2_HIT', `T2 ₹${t.t2} hit — 1 bucket sold, SL → T1 ₹${t.t1}`, bPnl - t.bookedPnl);
      addEvent('SL_TRAILED', `SL trailed to ₹${t.t1}`);
      t = { ...t, t2Hit: true, bookedPnl: bPnl, sl: t.t1, remainingBuckets: t.remainingBuckets - 1, remainingQty: t.remainingQty - t.qtyPerBucket };
    }
    // T3 → exit remaining
    if (t.t2Hit && !t.t3Hit && ltp >= t.t3) {
      const remPnl = (t.t3 - t.entryPrice) * t.remainingQty;
      const finalPnl = Math.round((t.bookedPnl + remPnl) * 100) / 100;
      addEvent('T3_HIT', `T3 ₹${t.t3} hit — remaining ${t.remainingQty} qty exited`, remPnl);
      t = { ...t, t3Hit: true, bookedPnl: finalPnl, status: 'CLOSED', exitPrice: t.t3, realisedPnl: finalPnl, remainingBuckets: 0, remainingQty: 0 };
      addEvent('CLOSED', `Trade CLOSED — Total P&L ₹${finalPnl}`);
    }
  }

  // ── DOUBLE_SCALPER ────────────────────────────────────────────────────────
  if (t.protocol === 'DOUBLE_SCALPER') {
    // T1 → exit bucket 1
    if (!t.t1Hit && ltp >= t.t1) {
      const bPnl = Math.round(((t.t1 - t.entryPrice) * t.qtyPerBucket + t.bookedPnl) * 100) / 100;
      addEvent('T1_HIT', `T1 ₹${t.t1} hit — 1 bucket sold (scalp 1)`, bPnl - t.bookedPnl);
      t = { ...t, t1Hit: true, bookedPnl: bPnl, remainingBuckets: t.remainingBuckets - 1, remainingQty: t.remainingQty - t.qtyPerBucket };
    }
    // T2 → exit bucket 2
    if (t.t1Hit && !t.t2Hit && ltp >= t.t2) {
      const bPnl = Math.round(((t.t2 - t.entryPrice) * t.qtyPerBucket + t.bookedPnl) * 100) / 100;
      addEvent('T2_HIT', `T2 ₹${t.t2} hit — 2nd bucket sold (scalp 2)`, bPnl - t.bookedPnl);
      t = { ...t, t2Hit: true, bookedPnl: bPnl, remainingBuckets: t.remainingBuckets - 1, remainingQty: t.remainingQty - t.qtyPerBucket };
      if (t.remainingQty <= 0) {
        t = { ...t, status: 'CLOSED', exitPrice: t.t2, realisedPnl: bPnl };
        addEvent('CLOSED', `Trade CLOSED — Total P&L ₹${bPnl}`);
      }
    }
    // T3 → if any remaining (shouldn't happen with 2 buckets, guard)
    if (t.t2Hit && !t.t3Hit && t.remainingQty > 0 && ltp >= t.t3) {
      const remPnl = (t.t3 - t.entryPrice) * t.remainingQty;
      const finalPnl = Math.round((t.bookedPnl + remPnl) * 100) / 100;
      addEvent('T3_HIT', `T3 ₹${t.t3} hit — remaining qty exited`, remPnl);
      t = { ...t, t3Hit: true, bookedPnl: finalPnl, status: 'CLOSED', exitPrice: t.t3, realisedPnl: finalPnl, remainingBuckets: 0, remainingQty: 0 };
      addEvent('CLOSED', `Trade CLOSED — Total P&L ₹${finalPnl}`);
    }
  }

  // ── SINGLE_SCALPER ────────────────────────────────────────────────────────
  if (t.protocol === 'SINGLE_SCALPER') {
    // T1 → trail SL to entry (breakeven)
    if (!t.t1Hit && ltp >= t.t1) {
      addEvent('T1_HIT', `T1 ₹${t.t1} reached — SL trailed to entry ₹${t.entryPrice}`);
      addEvent('SL_TRAILED', `SL trailed to breakeven ₹${t.entryPrice}`);
      t = { ...t, t1Hit: true, sl: t.entryPrice };
    }
    // T2 → trail SL to T1
    if (t.t1Hit && !t.t2Hit && ltp >= t.t2) {
      addEvent('T2_HIT', `T2 ₹${t.t2} reached — SL trailed to T1 ₹${t.t1}`);
      addEvent('SL_TRAILED', `SL trailed to ₹${t.t1}`);
      t = { ...t, t2Hit: true, sl: t.t1 };
    }
    // T3 → exit ALL lots
    if (t.t1Hit && t.t2Hit && !t.t3Hit && ltp >= t.t3) {
      const finalPnl = Math.round(((t.t3 - t.entryPrice) * t.remainingQty + t.bookedPnl) * 100) / 100;
      addEvent('T3_HIT', `T3 ₹${t.t3} hit — ALL ${t.remainingQty} qty exited at once`, finalPnl);
      t = { ...t, t3Hit: true, bookedPnl: finalPnl, status: 'CLOSED', exitPrice: t.t3, realisedPnl: finalPnl, remainingBuckets: 0, remainingQty: 0 };
      addEvent('CLOSED', `Trade CLOSED — Total P&L ₹${finalPnl}`);
    }
  }

  return t;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildSimTrade(
  signal: ParsedSignal,
  protocol: Protocol,
  lots: number,
  targetMode: 'MANUAL' | 'MOMENTUM',
): SimTrade {
  const lotSize = LOT_SIZES[signal.symbol] ?? 1;
  let { t1, t2, t3 } = signal;
  if (targetMode === 'MOMENTUM') {
    const m = calcMomentumTargets(protocol, signal.entryPrice);
    t1 = m.t1; t2 = m.t2; t3 = m.t3;
  }
  const { buckets, qtyPerBucket, totalQty } = calcBucketQuantity(protocol, lots, lotSize);
  const entry: SimEvent = {
    id: Date.now(),
    type: 'ENTRY',
    ltp: signal.entryPrice,
    message: `Trade opened — ${signal.symbol} ${signal.strike} | Entry ₹${signal.entryPrice} | ${totalQty} qty (${lots} lots × ${lotSize}) | ${PROTOCOL_META[protocol].label}`,
  };
  return {
    protocol, symbol: signal.symbol, strike: signal.strike,
    entryPrice: signal.entryPrice, sl: signal.sl, initialSl: signal.sl,
    t1, t2, t3,
    lots, lotSize, qtyPerBucket,
    remainingBuckets: buckets, remainingQty: totalQty,
    t1Hit: false, t2Hit: false, t3Hit: false, slHit: false,
    bookedPnl: 0, status: 'ACTIVE', exitPrice: null, realisedPnl: null,
    ltp: signal.entryPrice,
    events: [entry],
  };
}

const PROTOCOLS: Protocol[] = ['PROTECTOR', 'HALF_AND_HALF', 'DOUBLE_SCALPER', 'SINGLE_SCALPER'];

const EVENT_ICON: Record<SimEvent['type'], { icon: React.ReactNode; color: string }> = {
  ENTRY:      { icon: <Zap size={12} />,          color: 'text-accent-cyan' },
  T1_HIT:     { icon: <CheckCircle2 size={12} />, color: 'text-profit' },
  T2_HIT:     { icon: <CheckCircle2 size={12} />, color: 'text-profit' },
  T3_HIT:     { icon: <CheckCircle2 size={12} />, color: 'text-profit' },
  SL_HIT:     { icon: <AlertTriangle size={12} />, color: 'text-loss' },
  SL_TRAILED: { icon: <TrendingUp size={12} />,   color: 'text-yellow-400' },
  CLOSED:     { icon: <StopCircle size={12} />,   color: 'text-muted' },
};

// ── Component ────────────────────────────────────────────────────────────────
export default function Simulator() {
  const [signalText, setSignalText] = useState('');
  const [parsedSignal, setParsedSignal] = useState<ParsedSignal | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<Protocol>('PROTECTOR');
  const [lots, setLots] = useState(1);
  const [targetMode, setTargetMode] = useState<'MANUAL' | 'MOMENTUM'>('MANUAL');
  const [trade, setTrade] = useState<SimTrade | null>(null);
  const [ltpInput, setLtpInput] = useState('');
  const [stepSize, setStepSize] = useState(1);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [autoDir, setAutoDir] = useState<'UP' | 'DOWN' | null>(null);

  // Parse signal
  const handleParse = useCallback(() => {
    const result = parseSignal(signalText);
    if (!result) {
      setParseError('Could not parse signal. Try: "NIFTY 25100 CE Above 70 TGT 85/100/120 SL 55"');
      setParsedSignal(null);
    } else {
      setParsedSignal(result);
      setParseError(null);
      setLtpInput(String(result.entryPrice));
    }
  }, [signalText]);

  // Start sim
  const handleStart = useCallback(() => {
    if (!parsedSignal) return;
    setTrade(buildSimTrade(parsedSignal, protocol, lots, targetMode));
    setLtpInput(String(parsedSignal.entryPrice));
  }, [parsedSignal, protocol, lots, targetMode]);

  // Reset
  const handleReset = useCallback(() => {
    if (autoRef.current) clearInterval(autoRef.current);
    setAutoDir(null);
    setTrade(null);
  }, []);

  // Tick LTP
  const tickLtp = useCallback((newLtp: number) => {
    setTrade(prev => prev ? runProtocolTick(prev, Math.round(newLtp * 100) / 100) : null);
    setLtpInput(String(Math.round(newLtp * 100) / 100));
  }, []);

  const handleLtpSet = () => {
    const v = parseFloat(ltpInput);
    if (!isNaN(v) && v > 0) tickLtp(v);
  };

  const nudge = (dir: 1 | -1) => {
    const current = trade?.ltp ?? parsedSignal?.entryPrice ?? 0;
    tickLtp(current + dir * stepSize);
  };

  // Auto-run
  const startAuto = (dir: 'UP' | 'DOWN') => {
    if (autoRef.current) clearInterval(autoRef.current);
    setAutoDir(dir);
    autoRef.current = setInterval(() => {
      setTrade(prev => {
        if (!prev || prev.status !== 'ACTIVE') {
          clearInterval(autoRef.current!);
          setAutoDir(null);
          return prev;
        }
        const next = runProtocolTick(prev, Math.round((prev.ltp + (dir === 'UP' ? stepSize : -stepSize)) * 100) / 100);
        setLtpInput(String(next.ltp));
        return next;
      });
    }, 400);
  };

  const stopAuto = () => {
    if (autoRef.current) clearInterval(autoRef.current);
    setAutoDir(null);
  };

  const unrealisedPnl = trade && trade.status === 'ACTIVE'
    ? Math.round(((trade.ltp - trade.entryPrice) * trade.remainingQty + trade.bookedPnl) * 100) / 100
    : null;

  const pnlDisplay = trade?.realisedPnl ?? unrealisedPnl ?? 0;
  const isProfit = pnlDisplay > 0;
  const isLoss = pnlDisplay < 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <PlayCircle size={20} className="text-accent-cyan" />
            Protocol Simulator
          </h1>
          <p className="text-sm text-muted mt-0.5">Test all 4 protocols — no broker, no Supabase writes, fully in-memory</p>
        </div>
        {trade && (
          <button onClick={handleReset} className="btn-secondary flex items-center gap-1.5 text-xs">
            <RotateCcw size={14} /> Reset
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── LEFT: Setup ── */}
        <div className="space-y-4">

          {/* Signal Input */}
          <div className="panel p-4 space-y-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">1. Paste Signal</p>
            <textarea
              className="input-base resize-none h-20 font-mono text-xs"
              placeholder={'NIFTY 25100 CE Above 70 TGT 85/100/120 SL 55\nBANKNIFTY 52000 PE Buy 120 Target 135/155/180 SL 95'}
              value={signalText}
              onChange={e => setSignalText(e.target.value)}
            />
            <button onClick={handleParse} className="btn-primary w-full text-sm">Parse Signal</button>
            {parseError && <p className="text-xs text-loss">{parseError}</p>}
            {parsedSignal && (
              <div className="bg-profit/5 border border-profit/20 rounded-lg p-3 space-y-1">
                <p className="text-xs font-semibold text-profit">✓ Parsed</p>
                <div className="grid grid-cols-3 gap-1 text-xs font-mono">
                  <span className="text-muted">Symbol</span><span className="col-span-2 text-foreground">{parsedSignal.symbol} {parsedSignal.strike}</span>
                  <span className="text-muted">Entry</span><span className="col-span-2 text-accent-cyan">₹{parsedSignal.entryPrice}</span>
                  <span className="text-muted">T1 / T2 / T3</span><span className="col-span-2 text-foreground">₹{parsedSignal.t1} / ₹{parsedSignal.t2} / ₹{parsedSignal.t3}</span>
                  <span className="text-muted">SL</span><span className="col-span-2 text-loss">₹{parsedSignal.sl}</span>
                </div>
              </div>
            )}
          </div>

          {/* Protocol + Settings */}
          <div className="panel p-4 space-y-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">2. Protocol & Settings</p>

            <div className="grid grid-cols-2 gap-2">
              {PROTOCOLS.map(p => {
                const meta = PROTOCOL_META[p];
                const buckets = PROTOCOL_BUCKETS[p];
                const selected = protocol === p;
                return (
                  <button
                    key={p}
                    onClick={() => setProtocol(p)}
                    className={cn(
                      'rounded-lg border p-2.5 text-left transition-all',
                      selected
                        ? 'border-opacity-60 bg-opacity-10'
                        : 'border-border bg-panel-mid hover:border-border/80',
                    )}
                    style={selected ? { borderColor: meta.color, backgroundColor: meta.color + '18' } : {}}
                  >
                    <p className="text-xs font-bold" style={selected ? { color: meta.color } : { color: '#9CA3AF' }}>
                      {meta.label}
                    </p>
                    <p className="text-[10px] text-muted mt-0.5">{buckets} bucket{buckets > 1 ? 's' : ''}</p>
                    <p className="text-[10px] text-muted/70 mt-0.5 leading-tight">{meta.description.split('—')[1]?.trim()}</p>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted mb-1 block">Lots</label>
                <input
                  type="number" min={1} max={50}
                  className="input-base"
                  value={lots}
                  onChange={e => setLots(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">Target Mode</label>
                <div className="flex rounded-lg overflow-hidden border border-border">
                  {(['MANUAL', 'MOMENTUM'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setTargetMode(m)}
                      className={cn(
                        'flex-1 py-2 text-xs font-medium transition-colors',
                        targetMode === m ? 'bg-accent-cyan text-navy' : 'bg-panel-mid text-muted hover:text-foreground',
                      )}
                    >
                      {m === 'MANUAL' ? 'Manual' : 'Momentum'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {targetMode === 'MOMENTUM' && parsedSignal && (
              <div className="bg-accent-cyan/5 border border-accent-cyan/20 rounded-lg p-2">
                <p className="text-[10px] text-accent-cyan flex items-center gap-1">
                  <Info size={10} /> Momentum targets override signal targets using protocol deltas
                </p>
                {(() => {
                  const m = calcMomentumTargets(protocol, parsedSignal.entryPrice);
                  return (
                    <p className="text-xs font-mono text-muted mt-1">
                      T1 ₹{m.t1} · T2 ₹{m.t2} · T3 ₹{m.t3}
                    </p>
                  );
                })()}
              </div>
            )}

            <button
              onClick={handleStart}
              disabled={!parsedSignal}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <PlayCircle size={16} />
              {trade ? 'Restart Simulation' : 'Start Simulation'}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Live Sim ── */}
        <div className="space-y-4">
          {!trade ? (
            <div className="panel p-10 flex flex-col items-center justify-center text-center space-y-3 h-full min-h-[300px]">
              <PlayCircle size={40} className="text-muted/30" />
              <p className="text-muted text-sm">Parse a signal and start the simulation to see the live protocol behaviour</p>
            </div>
          ) : (
            <>
              {/* Trade Status Card */}
              <div
                className={cn('panel p-4 space-y-3', {
                  'glow-cyan': trade.status === 'ACTIVE',
                  'glow-green': trade.status === 'CLOSED',
                  'glow-red': trade.status === 'SL_HIT',
                })}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-foreground">{trade.symbol} {trade.strike}</p>
                    <p className="text-xs text-muted">{PROTOCOL_META[trade.protocol].label} · {trade.lots} lots × {trade.lotSize}</p>
                  </div>
                  <div className={cn('badge text-xs font-bold', {
                    'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30': trade.status === 'ACTIVE',
                    'bg-profit/10 text-profit border-profit/30': trade.status === 'CLOSED',
                    'bg-loss/10 text-loss border-loss/30': trade.status === 'SL_HIT',
                  })}>
                    {trade.status}
                  </div>
                </div>

                {/* P&L */}
                <div className="text-center py-2 border-y border-border">
                  <p className="text-xs text-muted mb-0.5">{trade.status === 'ACTIVE' ? 'Unrealised P&L' : 'Realised P&L'}</p>
                  <p className={cn('text-2xl font-mono font-bold', isProfit ? 'text-profit' : isLoss ? 'text-loss' : 'text-muted')}>
                    {pnlDisplay >= 0 ? '+' : ''}₹{pnlDisplay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted font-mono mt-0.5">LTP ₹{trade.ltp}</p>
                </div>

                {/* Key levels */}
                <div className="grid grid-cols-5 gap-1 text-center text-xs">
                  {[
                    { label: 'SL', val: trade.sl, cls: 'text-loss', changed: trade.sl !== trade.initialSl },
                    { label: 'Entry', val: trade.entryPrice, cls: 'text-muted' },
                    { label: 'T1', val: trade.t1, cls: trade.t1Hit ? 'text-profit' : 'text-foreground', hit: trade.t1Hit },
                    { label: 'T2', val: trade.t2, cls: trade.t2Hit ? 'text-profit' : 'text-foreground', hit: trade.t2Hit },
                    { label: 'T3', val: trade.t3, cls: trade.t3Hit ? 'text-profit' : 'text-foreground', hit: trade.t3Hit },
                  ].map(({ label, val, cls, hit, changed }) => (
                    <div key={label} className="bg-panel-mid rounded-lg p-1.5 relative">
                      <p className="text-[10px] text-muted/70">{label}</p>
                      <p className={cn('font-mono font-bold text-[11px]', cls)}>₹{val}</p>
                      {hit && <span className="absolute -top-1 -right-1 text-[8px] bg-profit text-navy rounded-full px-0.5 font-bold">✓</span>}
                      {changed && label === 'SL' && <span className="absolute -top-1 -right-1 text-[8px] bg-yellow-400 text-navy rounded-full px-0.5 font-bold">↑</span>}
                    </div>
                  ))}
                </div>

                {/* Bucket Progress */}
                <div>
                  <div className="flex justify-between text-xs text-muted mb-1">
                    <span>Buckets remaining</span>
                    <span className="font-mono">{trade.remainingBuckets} / {PROTOCOL_BUCKETS[trade.protocol]}</span>
                  </div>
                  <div className="flex gap-1">
                    {Array.from({ length: PROTOCOL_BUCKETS[trade.protocol] }).map((_, i) => (
                      <div
                        key={i}
                        className={cn('h-2 flex-1 rounded-full transition-all duration-300', {
                          'bg-profit': i >= (PROTOCOL_BUCKETS[trade.protocol] - trade.remainingBuckets),
                          'bg-panel-mid border border-border': i < (PROTOCOL_BUCKETS[trade.protocol] - trade.remainingBuckets),
                        })}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-muted mt-1">
                    <span>Booked P&L</span>
                    <span className={cn('font-mono', trade.bookedPnl > 0 ? 'text-profit' : trade.bookedPnl < 0 ? 'text-loss' : 'text-muted')}>
                      {trade.bookedPnl >= 0 ? '+' : ''}₹{trade.bookedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* LTP Control */}
              {trade.status === 'ACTIVE' && (
                <div className="panel p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider">LTP Control</p>

                  {/* Manual set */}
                  <div className="flex gap-2">
                    <input
                      type="number"
                      className="input-base flex-1"
                      value={ltpInput}
                      onChange={e => setLtpInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleLtpSet()}
                      placeholder="Set LTP..."
                    />
                    <button onClick={handleLtpSet} className="btn-primary px-3 text-sm whitespace-nowrap">Set LTP</button>
                  </div>

                  {/* Step size */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">Step</span>
                    {[0.5, 1, 2, 5, 10].map(s => (
                      <button
                        key={s}
                        onClick={() => setStepSize(s)}
                        className={cn('px-2 py-1 rounded text-xs font-mono transition-colors',
                          stepSize === s ? 'bg-accent-cyan text-navy font-bold' : 'bg-panel-mid text-muted hover:text-foreground border border-border'
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  {/* Nudge + Auto */}
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => nudge(1)} className="btn-primary flex items-center justify-center gap-1 py-2.5">
                      <ChevronUp size={16} /> +{stepSize}
                    </button>
                    <button onClick={() => nudge(-1)} className="btn-secondary flex items-center justify-center gap-1 py-2.5 border-loss/30 text-loss hover:bg-loss/10">
                      <ChevronDown size={16} /> -{stepSize}
                    </button>
                    <button
                      onClick={() => autoDir === 'UP' ? stopAuto() : startAuto('UP')}
                      className={cn('flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors',
                        autoDir === 'UP'
                          ? 'bg-profit/20 text-profit border-profit/40 animate-pulse'
                          : 'bg-panel-mid border-border text-muted hover:text-profit hover:border-profit/30'
                      )}
                    >
                      <TrendingUp size={14} />
                      {autoDir === 'UP' ? 'Stop Auto ▲' : 'Auto ▲ Rally'}
                    </button>
                    <button
                      onClick={() => autoDir === 'DOWN' ? stopAuto() : startAuto('DOWN')}
                      className={cn('flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors',
                        autoDir === 'DOWN'
                          ? 'bg-loss/20 text-loss border-loss/40 animate-pulse'
                          : 'bg-panel-mid border-border text-muted hover:text-loss hover:border-loss/30'
                      )}
                    >
                      <TrendingDown size={14} />
                      {autoDir === 'DOWN' ? 'Stop Auto ▼' : 'Auto ▼ Crash'}
                    </button>
                  </div>
                </div>
              )}

              {/* Event Log */}
              <div className="panel p-4 space-y-2">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Event Log</p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {trade.events.map(ev => {
                    const { icon, color } = EVENT_ICON[ev.type];
                    return (
                      <div key={ev.id} className="flex items-start gap-2 text-xs">
                        <span className={cn('mt-0.5 flex-shrink-0', color)}>{icon}</span>
                        <span className="text-foreground flex-1 leading-relaxed">{ev.message}</span>
                        {ev.pnl !== undefined && (
                          <span className={cn('font-mono flex-shrink-0 font-bold', ev.pnl >= 0 ? 'text-profit' : 'text-loss')}>
                            {ev.pnl >= 0 ? '+' : ''}₹{ev.pnl}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Protocol reference table */}
      <div className="panel p-4 space-y-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
          <Info size={12} /> Protocol Behaviour Reference
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted text-left">
                <th className="pb-2 pr-4 font-medium">Protocol</th>
                <th className="pb-2 pr-4 font-medium">Buckets</th>
                <th className="pb-2 pr-4 font-medium">T1</th>
                <th className="pb-2 pr-4 font-medium">T2</th>
                <th className="pb-2 pr-4 font-medium">T3</th>
                <th className="pb-2 font-medium">SL Hit</th>
              </tr>
            </thead>
            <tbody className="space-y-1">
              {([
                ['PROTECTOR',      '3', 'Exit 1 bucket + SL→entry', 'No exit + SL→T1', 'Exit ALL 2 remaining', 'Exit all remaining'],
                ['HALF_AND_HALF',  '2', 'Mark only + SL→entry',     'Exit 1 bucket + SL→T1', 'Exit remaining 1 bucket', 'Exit all remaining'],
                ['DOUBLE_SCALPER', '2', 'Exit 1 bucket (scalp)',     'Exit 2nd bucket (scalp)', 'Guard exit', 'Exit all remaining'],
                ['SINGLE_SCALPER', '1', 'SL→entry (hold)',           'SL→T1 (hold)',    'Exit ALL lots at once', 'Exit all remaining'],
              ] as const).map(([p, b, t1, t2, t3, sl]) => {
                const meta = PROTOCOL_META[p as Protocol];
                return (
                  <tr key={p} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-bold" style={{ color: meta.color }}>{meta.label}</td>
                    <td className="py-2 pr-4 text-muted font-mono">{b}</td>
                    <td className="py-2 pr-4 text-foreground/80">{t1}</td>
                    <td className="py-2 pr-4 text-foreground/80">{t2}</td>
                    <td className="py-2 pr-4 text-foreground/80">{t3}</td>
                    <td className="py-2 text-loss/80">{sl}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
