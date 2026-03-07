import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useTrades } from '@/app/providers/TradeProvider';
import ProtocolSelector from '@/components/ProtocolSelector';
import SignalParserInput from '@/components/SignalParser';
import { supabase } from '@/lib/supabase';
import {
  computeTargets,
  computeBuckets,
  getLotSize,
  validateTradeParams,
  formatCurrency,
  canDeployTrade,
  cn,
} from '@/lib/utils';
import { SYMBOLS, TIER_FEATURES, DAILY_TRADE_LIMITS, PROTOCOL_META } from '@/lib/constants';
import type { Protocol, TargetMode, TradeMode, ParsedSignal, DeployTradeInput } from '@/types';
import { toast } from 'sonner';
import { AlertTriangle, ChevronRight, Info } from 'lucide-react';

type Tab = 'signal' | 'manual';

const defaultForm = {
  symbol: 'NIFTY',
  strike: '',
  tradingSymbol: '',
  securityId: '',
  protocol: 'PROTECTOR' as Protocol,
  targetMode: 'MOMENTUM' as TargetMode,
  mode: 'PAPER' as TradeMode,
  entryPrice: '',
  sl: '',
  t1: '',
  t2: '',
  t3: '',
  lots: '1',
};

export default function Deploy() {
  const { profile } = useAuth();
  const { refetchTrades } = useTrades();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('signal');
  const [form, setForm] = useState(defaultForm);
  const [parsedSignal, setParsedSignal] = useState<ParsedSignal | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLiveWarning, setShowLiveWarning] = useState(false);
  const [brokerAccounts, setBrokerAccounts] = useState<{ id: string; client_id: string }[]>([]);
  const [selectedBroker, setSelectedBroker] = useState<string | null>(null);

  const tier = profile?.tier ?? 'free';
  const allowedProtocols = profile
    ? TIER_FEATURES[profile.tier].protocols
    : (['PROTECTOR', 'HALF_AND_HALF', 'DOUBLE_SCALPER', 'SINGLE_SCALPER'] as Protocol[]);
  const canManualTargets = TIER_FEATURES[tier].manualTargets;
  const dailyLimit = DAILY_TRADE_LIMITS[tier];
  const tradesUsed = profile?.daily_trades_used ?? 0;
  const { allowed, reason } = canDeployTrade(tier, tradesUsed);

  useEffect(() => {
    supabase
      .from('broker_accounts')
      .select('id, client_id')
      .eq('is_active', true)
      .then(({ data }) => {
        if (data) setBrokerAccounts(data);
      });
  }, []);

  // When signal is parsed, populate form
  const handleParsed = useCallback((signal: ParsedSignal | null) => {
    setParsedSignal(signal);
    if (signal) {
      setForm((f) => ({
        ...f,
        symbol: signal.symbol,
        strike: signal.strike,
        tradingSymbol: buildTradingSymbol(signal.symbol, signal.strike),
        entryPrice: String(signal.entryPrice),
        sl: String(signal.sl),
        t1: String(signal.t1),
        t2: String(signal.t2),
        t3: String(signal.t3),
        targetMode: 'MANUAL',
      }));
    }
  }, []);

  // Auto-compute MOMENTUM targets when entry/protocol changes
  useEffect(() => {
    if (form.targetMode === 'MOMENTUM' && form.entryPrice && !isNaN(Number(form.entryPrice))) {
      const targets = computeTargets(Number(form.entryPrice), form.protocol);
      setForm((f) => ({
        ...f,
        t1: String(targets.t1),
        t2: String(targets.t2),
        t3: String(targets.t3),
      }));
    }
  }, [form.entryPrice, form.protocol, form.targetMode]);

  const lotSize = getLotSize(form.symbol);
  const lots = parseInt(form.lots) || 1;
  const { qtyPerBucket, buckets, lotsPerBucket, totalQty } = computeBuckets(lots, form.protocol, lotSize);
  const totalLots = lotsPerBucket * buckets; // actual lots deployed (may differ from input if lots < buckets)
  const numEntry = Number(form.entryPrice);
  const numSl = Number(form.sl);
  const numT3 = Number(form.t3);

  // Use actual deployed qty (totalQty) — not raw lots×lotSize which ignores min-per-bucket clamp
  const maxLoss = numEntry > 0 && numSl > 0
    ? (numEntry - numSl) * totalQty
    : 0;
  const maxGain = numEntry > 0 && numT3 > 0
    ? (numT3 - numEntry) * totalQty
    : 0;

  const handleDeploy = async () => {
    if (!allowed) {
      toast.error(reason ?? 'Cannot deploy trade');
      return;
    }

    const validation = validateTradeParams(
      Number(form.entryPrice),
      Number(form.sl),
      Number(form.t1),
      Number(form.t2),
      Number(form.t3),
    );
    if (!validation.valid) {
      toast.error(validation.error ?? 'Invalid trade parameters');
      return;
    }

    if (form.mode === 'LIVE') {
      setShowLiveWarning(true);
      return;
    }

    await executeDeploy();
  };

  const executeDeploy = async () => {
    setShowLiveWarning(false);
    setLoading(true);

    try {
      const lotSize = getLotSize(form.symbol);
      const lots = parseInt(form.lots);
      const { buckets: numBuckets, lotsPerBucket, qtyPerBucket } = computeBuckets(lots, form.protocol, lotSize);

      const payload: DeployTradeInput = {
        symbol: form.symbol,
        strike: form.strike,
        tradingSymbol: form.tradingSymbol || buildTradingSymbol(form.symbol, form.strike),
        securityId: form.securityId,
        exchange: form.symbol === 'SENSEX' || form.symbol === 'BANKEX' ? 'BSE_FNO' : 'NSE_FNO',
        protocol: form.protocol,
        targetMode: form.targetMode,
        mode: form.mode,
        entryPrice: Number(form.entryPrice),
        sl: Number(form.sl),
        t1: Number(form.t1),
        t2: Number(form.t2),
        t3: Number(form.t3),
        lots,
        brokerAccountId: selectedBroker,
      };

      const { error } = await supabase.from('trade_nodes').insert({
        user_id: profile!.id,
        broker_account_id: payload.brokerAccountId,
        symbol: payload.symbol,
        strike: payload.strike,
        trading_symbol: payload.tradingSymbol,
        security_id: payload.securityId || null,
        exchange: payload.exchange,
        protocol: payload.protocol,
        target_mode: payload.targetMode,
        mode: payload.mode,
        entry_price: payload.entryPrice,
        sl: payload.sl,
        initial_sl: payload.sl,
        t1: payload.t1,
        t2: payload.t2,
        t3: payload.t3,
        lots,
        lot_size: lotSize,
        remaining_quantity: qtyPerBucket * numBuckets,
        remaining_buckets: numBuckets,
        lots_per_bucket: lotsPerBucket,
        qty_per_bucket: qtyPerBucket,
        ltp_source: payload.mode === 'LIVE' ? 'BROKER' : 'SIM',
        status: 'ACTIVE',
        booked_pnl: 0,
        is_processing: false,
      });

      if (error) throw new Error(error.message);

      // Increment daily trades used
      await supabase
        .from('profiles')
        .update({ daily_trades_used: tradesUsed + 1 })
        .eq('id', profile!.id);

      toast.success(`Trade deployed! ${payload.symbol} ${payload.strike} — ${payload.mode} mode`);
      await refetchTrades();
      navigate('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deploy failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Deploy Trade</h1>
        <p className="text-sm text-muted mt-0.5">
          {tradesUsed}/{dailyLimit === Infinity ? '∞' : dailyLimit} trades used today
        </p>
      </div>

      {/* Daily limit warning */}
      {!allowed && (
        <div className="flex items-center gap-2 bg-loss/10 border border-loss/30 rounded-xl p-3">
          <AlertTriangle size={16} className="text-loss flex-shrink-0" />
          <p className="text-sm text-loss">{reason}</p>
        </div>
      )}

      {/* Protocol selector — first so user picks BEFORE pasting signal */}
      <div className="panel p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Exit Protocol</h3>
        <ProtocolSelector
          value={form.protocol}
          onChange={(p) => {
            if (profile && !allowedProtocols.includes(p)) {
              toast.error(`${p} requires Pro or Elite tier`);
              return;
            }
            setForm((f) => ({ ...f, protocol: p }));
          }}
          tier={tier}
          allowedOverride={allowedProtocols}
        />
      </div>

      {/* Tabs */}
      <div className="flex bg-panel-mid rounded-xl p-1 border border-border">
        {(['signal', 'manual'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2 text-sm font-medium rounded-lg transition-all',
              tab === t ? 'bg-accent-cyan text-navy' : 'text-muted hover:text-foreground',
            )}
          >
            {t === 'signal' ? '📋 Paste Signal' : '✏️ Manual Entry'}
          </button>
        ))}
      </div>

      {/* Signal tab */}
      {tab === 'signal' && (
        <div className="panel p-5 space-y-4 animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground">Paste Trading Signal</h3>
          <SignalParserInput onParsed={handleParsed} />
        </div>
      )}

      {/* Trade parameters */}
      <div className="panel p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Trade Parameters</h3>

        <div className="grid grid-cols-2 gap-4">
          {/* Symbol */}
          <div>
            <label className="block text-xs text-muted mb-1.5">Symbol</label>
            <select
              className="input-base"
              value={form.symbol}
              onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
            >
              {SYMBOLS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Strike */}
          <div>
            <label className="block text-xs text-muted mb-1.5">
              Strike <span className="text-muted/50">(e.g. 25100 CE)</span>
            </label>
            <input
              className="input-base font-mono"
              placeholder="25100 CE"
              value={form.strike}
              onChange={(e) => setForm((f) => ({ ...f, strike: e.target.value.toUpperCase() }))}
            />
          </div>

          {/* Entry */}
          <div>
            <label className="block text-xs text-muted mb-1.5">Entry Price</label>
            <input
              type="number"
              step="0.05"
              className="input-base font-mono"
              placeholder="70.00"
              value={form.entryPrice}
              onChange={(e) => setForm((f) => ({ ...f, entryPrice: e.target.value }))}
            />
          </div>

          {/* SL */}
          <div>
            <label className="block text-xs text-muted mb-1.5">Stop Loss</label>
            <input
              type="number"
              step="0.05"
              className="input-base font-mono"
              placeholder="55.00"
              value={form.sl}
              onChange={(e) => setForm((f) => ({ ...f, sl: e.target.value }))}
            />
          </div>

          {/* Lots */}
          <div>
            <label className="block text-xs text-muted mb-1.5">
              Lots <span className="text-muted/50">(1 lot = {lotSize} units)</span>
            </label>
            <input
              type="number"
              min="1"
              max={TIER_FEATURES[tier].maxLots}
              className="input-base font-mono"
              value={form.lots}
              onChange={(e) => setForm((f) => ({ ...f, lots: e.target.value }))}
            />
          </div>

          {/* Target Mode */}
          <div>
            <label className="block text-xs text-muted mb-1.5">Target Mode</label>
            <div className="flex gap-2">
              {(['MOMENTUM', 'MANUAL'] as TargetMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={m === 'MANUAL' && !canManualTargets}
                  onClick={() => setForm((f) => ({ ...f, targetMode: m }))}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
                    form.targetMode === m
                      ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30'
                      : 'bg-panel-mid text-muted border-border hover:text-foreground',
                    m === 'MANUAL' && !canManualTargets && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Targets (shown in MANUAL mode or when set) */}
        {(form.targetMode === 'MANUAL' || form.t1) && (
          <div className="grid grid-cols-3 gap-3">
            {(['t1', 't2', 't3'] as const).map((key, i) => (
              <div key={key}>
                <label className="block text-xs text-muted mb-1.5">
                  T{i + 1}
                </label>
                <input
                  type="number"
                  step="0.05"
                  readOnly={form.targetMode === 'MOMENTUM'}
                  className={cn('input-base font-mono', form.targetMode === 'MOMENTUM' && 'opacity-60 cursor-not-allowed')}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}

        {/* Mode */}
        <div>
          <label className="block text-xs text-muted mb-1.5">Execution Mode</label>
          <div className="flex gap-2">
            {(['PAPER', 'LIVE'] as TradeMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setForm((f) => ({ ...f, mode: m }))}
                className={cn(
                  'flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
                  form.mode === m
                    ? m === 'LIVE'
                      ? 'bg-profit/10 text-profit border-profit/30'
                      : 'bg-warning/10 text-warning border-warning/30'
                    : 'bg-panel-mid text-muted border-border hover:text-foreground',
                )}
              >
                {m === 'LIVE' ? '⚡ LIVE' : '📄 PAPER'}
              </button>
            ))}
          </div>
          {form.mode === 'LIVE' && (
            <p className="text-[10px] text-warning mt-1 flex items-center gap-1">
              <Info size={10} /> Real orders will be placed on your broker account.
            </p>
          )}
        </div>

        {/* Broker selector (LIVE mode) */}
        {form.mode === 'LIVE' && (
          <div>
            <label className="block text-xs text-muted mb-1.5">Broker Account</label>
            {brokerAccounts.length === 0 ? (
              <p className="text-xs text-loss">
                No broker connected.{' '}
                <button onClick={() => navigate('/broker')} className="text-accent-cyan underline">
                  Add broker
                </button>
              </p>
            ) : (
              <select
                className="input-base"
                value={selectedBroker ?? ''}
                onChange={(e) => setSelectedBroker(e.target.value || null)}
              >
                <option value="">Select broker account</option>
                {brokerAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{b.client_id}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Review panel */}
      {numEntry > 0 && numSl > 0 && (
        <div className="panel p-5 space-y-3 animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground">Trade Review</h3>
          {/* Minimum lots warning */}
          {lots < buckets && (
            <div className="flex items-start gap-2 bg-warning/5 border border-warning/20 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="text-warning flex-shrink-0 mt-0.5" />
              <p className="text-xs text-warning/90">
                <strong>{PROTOCOL_META[form.protocol].label}</strong> needs min {buckets} lots (1 per bucket).
                Your input of {lots} lot{lots > 1 ? 's' : ''} will be rounded up — <strong>{totalLots} lots total</strong> will actually be deployed.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted">Total Deployed</p>
              <p className="price font-bold">{totalQty} units</p>
              <p className="text-[10px] text-muted font-mono mt-0.5">
                {lotsPerBucket} lot/bucket × {buckets} buckets = {totalLots} lots
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Per Bucket</p>
              <p className="price font-bold">{qtyPerBucket} units ({lotsPerBucket} lot{lotsPerBucket > 1 ? 's' : ''})</p>
              <p className="text-[10px] text-muted font-mono mt-0.5">{buckets} bucket{buckets > 1 ? 's' : ''} total</p>
            </div>
            <div>
              <p className="text-xs text-muted">Max Loss (SL hit)</p>
              <p className="price font-bold text-loss">-{formatCurrency(maxLoss)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Max Gain (T3 hit)</p>
              <p className="price font-bold text-profit">+{formatCurrency(maxGain)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Deploy Button */}
      <button
        onClick={handleDeploy}
        disabled={loading || !allowed || !form.entryPrice || !form.sl || !form.strike}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
      >
        {loading ? 'Deploying…' : (
          <>
            Deploy {form.mode === 'LIVE' ? '⚡ LIVE' : '📄 PAPER'} Trade
            <ChevronRight size={18} />
          </>
        )}
      </button>

      {/* Live confirmation modal */}
      {showLiveWarning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="panel p-6 max-w-sm w-full space-y-4 animate-slide-up">
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} className="text-warning" />
              <h3 className="font-semibold text-foreground">Confirm LIVE Order</h3>
            </div>
            <p className="text-sm text-muted">
              This will place <strong className="text-foreground">real money orders</strong> on your broker account.
              {' '}{lots * lotSize} units of{' '}
              <strong className="text-foreground">{form.symbol} {form.strike}</strong> at ~₹{form.entryPrice}.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLiveWarning(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={executeDeploy}
                className="btn-danger flex-1"
              >
                Confirm LIVE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildTradingSymbol(symbol: string, strike: string): string {
  return `${symbol}${strike.replace(' ', '')}`;
}
