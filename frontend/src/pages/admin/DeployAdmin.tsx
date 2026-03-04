import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/app/providers/AuthProvider';
import ProtocolSelector from '@/components/ProtocolSelector';
import SignalParserInput from '@/components/SignalParser';
import { computeTargets, computeBuckets, getLotSize, validateTradeParams, formatCurrency, cn } from '@/lib/utils';
import { SYMBOLS, TIER_FEATURES } from '@/lib/constants';
import type { Protocol, TargetMode, ParsedSignal } from '@/types';
import { toast } from 'sonner';
import { Users, ChevronRight } from 'lucide-react';

export default function DeployAdmin() {
  const { profile } = useAuth();
  const [form, setForm] = useState({
    symbol: 'NIFTY',
    strike: '',
    protocol: 'PROTECTOR' as Protocol,
    targetMode: 'MOMENTUM' as TargetMode,
    entryPrice: '',
    sl: '',
    t1: '',
    t2: '',
    t3: '',
    lots: '1',
  });
  const [loading, setLoading] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);

  useEffect(() => {
    supabase
      .from('copy_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('leader_id', profile!.id)
      .eq('is_active', true)
      .then(({ count }) => setFollowerCount(count ?? 0));
  }, [profile]);

  const handleParsed = useCallback((signal: ParsedSignal | null) => {
    if (signal) {
      setForm((f) => ({
        ...f,
        symbol: signal.symbol,
        strike: signal.strike,
        entryPrice: String(signal.entryPrice),
        sl: String(signal.sl),
        t1: String(signal.t1),
        t2: String(signal.t2),
        t3: String(signal.t3),
        targetMode: 'MANUAL',
      }));
    }
  }, []);

  useEffect(() => {
    if (form.targetMode === 'MOMENTUM' && form.entryPrice && !isNaN(Number(form.entryPrice))) {
      const targets = computeTargets(Number(form.entryPrice), form.protocol);
      setForm((f) => ({ ...f, t1: String(targets.t1), t2: String(targets.t2), t3: String(targets.t3) }));
    }
  }, [form.entryPrice, form.protocol, form.targetMode]);

  const lotSize = getLotSize(form.symbol);
  const lots = parseInt(form.lots) || 1;
  const { buckets, qtyPerBucket } = computeBuckets(lots, form.protocol, lotSize);
  const maxLoss = Number(form.entryPrice) > 0 && Number(form.sl) > 0
    ? (Number(form.entryPrice) - Number(form.sl)) * lots * lotSize : 0;
  const maxGain = Number(form.entryPrice) > 0 && Number(form.t3) > 0
    ? (Number(form.t3) - Number(form.entryPrice)) * lots * lotSize : 0;

  const handleDeploy = async () => {
    const validation = validateTradeParams(
      Number(form.entryPrice), Number(form.sl),
      Number(form.t1), Number(form.t2), Number(form.t3),
    );
    if (!validation.valid) { toast.error(validation.error ?? 'Invalid parameters'); return; }
    if (!form.strike.trim()) { toast.error('Strike is required'); return; }

    setLoading(true);
    try {
      const { error } = await supabase.from('trade_nodes').insert({
        user_id: profile!.id,
        symbol: form.symbol,
        strike: form.strike,
        trading_symbol: `${form.symbol}${form.strike.replace(' ', '')}`,
        exchange: form.symbol === 'SENSEX' || form.symbol === 'BANKEX' ? 'BSE_FNO' : 'NSE_FNO',
        protocol: form.protocol,
        target_mode: form.targetMode,
        mode: 'LIVE',
        entry_price: Number(form.entryPrice),
        sl: Number(form.sl),
        initial_sl: Number(form.sl),
        t1: Number(form.t1),
        t2: Number(form.t2),
        t3: Number(form.t3),
        lots,
        lot_size: lotSize,
        remaining_quantity: qtyPerBucket * buckets,
        remaining_buckets: buckets,
        lots_per_bucket: Math.floor(lots / buckets),
        qty_per_bucket: qtyPerBucket,
        is_master_signal: true,
        ltp_source: 'BROKER',
        status: 'ACTIVE',
        booked_pnl: 0,
        is_processing: false,
      });
      if (error) throw new Error(error.message);
      toast.success(`Signal deployed! ${followerCount > 0 ? `Auto-copying to ${followerCount} followers.` : ''}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deploy failed');
    }
    setLoading(false);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Follower count */}
      <div className="flex items-center gap-2 panel px-4 py-3">
        <Users size={16} className="text-accent-purple" />
        <span className="text-sm text-muted">
          This signal will be auto-copied to{' '}
          <strong className="text-accent-purple">{followerCount}</strong> active follower{followerCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Signal paste */}
      <div className="panel p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Paste Signal (optional)</h3>
        <SignalParserInput onParsed={handleParsed} />
      </div>

      {/* Protocol */}
      <div className="panel p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Exit Protocol</h3>
        <ProtocolSelector value={form.protocol} onChange={(p) => setForm((f) => ({ ...f, protocol: p }))} tier="elite" />
      </div>

      {/* Parameters */}
      <div className="panel p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Trade Parameters</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">Symbol</label>
            <select className="input-base" value={form.symbol} onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}>
              {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Strike</label>
            <input className="input-base font-mono" placeholder="25100 CE" value={form.strike}
              onChange={(e) => setForm((f) => ({ ...f, strike: e.target.value.toUpperCase() }))} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Entry Price</label>
            <input type="number" step="0.05" className="input-base font-mono" placeholder="70.00" value={form.entryPrice}
              onChange={(e) => setForm((f) => ({ ...f, entryPrice: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Stop Loss</label>
            <input type="number" step="0.05" className="input-base font-mono" placeholder="55.00" value={form.sl}
              onChange={(e) => setForm((f) => ({ ...f, sl: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Lots</label>
            <input type="number" min="1" className="input-base font-mono" value={form.lots}
              onChange={(e) => setForm((f) => ({ ...f, lots: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Target Mode</label>
            <div className="flex gap-2">
              {(['MOMENTUM', 'MANUAL'] as TargetMode[]).map((m) => (
                <button key={m} type="button" onClick={() => setForm((f) => ({ ...f, targetMode: m }))}
                  className={cn('flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
                    form.targetMode === m ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30' : 'bg-panel-mid text-muted border-border')}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* Targets */}
        {(form.targetMode === 'MANUAL' || form.t1) && (
          <div className="grid grid-cols-3 gap-3">
            {(['t1', 't2', 't3'] as const).map((key, i) => (
              <div key={key}>
                <label className="block text-xs text-muted mb-1.5">T{i + 1}</label>
                <input type="number" step="0.05" readOnly={form.targetMode === 'MOMENTUM'}
                  className={cn('input-base font-mono', form.targetMode === 'MOMENTUM' && 'opacity-60 cursor-not-allowed')}
                  value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review */}
      {Number(form.entryPrice) > 0 && Number(form.sl) > 0 && (
        <div className="panel p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Review</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-muted">Total Qty</p><p className="font-bold">{lots * lotSize} ({lots} lots)</p></div>
            <div><p className="text-xs text-muted">Per Bucket</p><p className="font-bold">{qtyPerBucket} units ({buckets} buckets)</p></div>
            <div><p className="text-xs text-muted">Max Loss</p><p className="font-bold text-loss">-{formatCurrency(maxLoss)}</p></div>
            <div><p className="text-xs text-muted">Max Gain</p><p className="font-bold text-profit">+{formatCurrency(maxGain)}</p></div>
          </div>
        </div>
      )}

      <button onClick={handleDeploy} disabled={loading || !form.entryPrice || !form.sl || !form.strike}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base">
        {loading ? 'Deploying…' : <><span>⚡ Deploy LIVE Signal</span><ChevronRight size={18} /></>}
      </button>
    </div>
  );
}
