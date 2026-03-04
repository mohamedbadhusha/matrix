/**
 * TraderControl.tsx
 * Kill Switch + P&L Exit controls.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { BrokerAccount, DhanKillSwitchResponse, DhanPnlExitConfig, DhanPnlExitResponse } from '@/types';
import { ChevronDown, RefreshCw, ShieldOff, TrendingUp, AlertTriangle } from 'lucide-react';

// ── Main page ───────────────────────────────────────────────────────────────
export default function TraderControl() {
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
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ShieldOff size={20} className="text-loss" /> Trader's Control
          </h1>
          <p className="text-xs text-muted mt-0.5">Kill Switch & P&L-based auto-exit controls</p>
        </div>
        <div className="relative">
          <select value={selectedBroker} onChange={e => setSelectedBroker(e.target.value)} className="input-base pr-8 text-sm min-w-[160px]">
            {brokers.length === 0 && <option value="">No brokers</option>}
            {brokers.map(b => <option key={b.id} value={b.id}>{b.broker_name} · {b.client_id}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        </div>
      </div>

      {/* Warning banner */}
      <div className="rounded-xl bg-loss/10 border border-loss/30 p-4 flex items-start gap-3">
        <AlertTriangle size={16} className="text-loss shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-loss">Danger Zone</p>
          <p className="text-xs text-muted mt-0.5">Kill Switch blocks all new orders for the trading account. P&L Exit squares off all positions when profit/loss limits are breached. Use with caution.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <KillSwitchCard brokerId={selectedBroker} />
        <PnlExitCard brokerId={selectedBroker} />
      </div>
    </div>
  );
}

// ── Kill Switch ─────────────────────────────────────────────────────────────

function KillSwitchCard({ brokerId }: { brokerId: string }) {
  const [status, setStatus]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!brokerId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/dhan-killswitch?brokerId=${brokerId}`);
      const data = await res.json() as DhanKillSwitchResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch');
      setStatus(data.killSwitchStatus);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
    setLoading(false);
  }, [brokerId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const toggle = async () => {
    const next = status === 'ACTIVATE' ? 'DEACTIVATE' : 'ACTIVATE';
    if (next === 'ACTIVATE' && !confirm('ACTIVATE Kill Switch? This will block all new orders for this account.')) return;
    if (next === 'DEACTIVATE' && !confirm('DEACTIVATE Kill Switch? Trading will resume for this account.')) return;
    setToggling(true);
    try {
      const res  = await fetch('/api/dhan-killswitch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brokerId, killSwitchStatus: next }) });
      const data = await res.json() as DhanKillSwitchResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setStatus(data.killSwitchStatus);
      toast.success(`Kill Switch ${data.killSwitchStatus}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
    setToggling(false);
  };

  const active = status === 'ACTIVATE';

  return (
    <div className={cn('panel p-5 space-y-5 border-l-4', active ? 'border-loss' : 'border-profit/50')}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2"><ShieldOff size={15} className={active ? 'text-loss' : 'text-muted'} /> Kill Switch</h2>
          <p className="text-[10px] text-muted mt-0.5">Blocks all new orders for the account</p>
        </div>
        <button onClick={fetchStatus} disabled={loading || !brokerId} className="btn-secondary p-1.5">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex items-center justify-between bg-border/10 rounded-xl p-4">
        <div>
          <p className="text-[10px] text-muted font-semibold uppercase tracking-wide mb-1">Current Status</p>
          <div className={cn('flex items-center gap-2', active ? 'text-loss' : 'text-profit')}>
            <div className={cn('w-2 h-2 rounded-full', active ? 'bg-loss animate-pulse' : 'bg-profit')} />
            <span className="text-lg font-bold">{!brokerId ? '--' : status ?? (loading ? '...' : '?')}</span>
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={toggling || !brokerId || status === null}
          className={cn(
            'px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all disabled:opacity-50',
            active
              ? 'bg-profit/10 text-profit border-profit/30 hover:bg-profit/20'
              : 'bg-loss/10 text-loss border-loss/30 hover:bg-loss/20'
          )}>
          {toggling ? 'Processing…' : active ? 'Deactivate' : 'Activate'}
        </button>
      </div>

      <p className="text-[10px] text-muted border-t border-border pt-3">
        {active
          ? '⚠ Kill switch is ACTIVE — no new orders can be placed. Click Deactivate to resume trading.'
          : 'Kill switch is inactive. Trading is allowed. Activate to block all new orders instantly.'}
      </p>
    </div>
  );
}

// ── P&L Exit ────────────────────────────────────────────────────────────────

function PnlExitCard({ brokerId }: { brokerId: string }) {
  const [config, setConfig]   = useState<DhanPnlExitConfig>({ profitValue: 0, lossValue: 0, productType: ['INTRADAY'], enableKillSwitch: false });
  const [current, setCurrent] = useState<DhanPnlExitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [stopping, setStopping] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!brokerId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/dhan-pnl-exit?brokerId=${brokerId}`);
      const data = await res.json() as DhanPnlExitResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setCurrent(data);
      if (data.profit !== undefined || data.loss !== undefined) {
        setConfig(c => ({
          ...c,
          profitValue: Number(data.profit ?? c.profitValue),
          lossValue:   Number(data.loss ?? c.lossValue),
          productType: (data.productType as ['INTRADAY'] | ['DELIVERY'] | ['INTRADAY','DELIVERY']) ?? c.productType,
          enableKillSwitch: data.enableKillSwitch ?? c.enableKillSwitch,
        }));
      }
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
    setLoading(false);
  }, [brokerId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const configure = async () => {
    if (!brokerId) return;
    if (config.profitValue <= 0 && config.lossValue <= 0) { toast.error('Set at least one of Profit / Loss exit value'); return; }
    setSaving(true);
    try {
      const res  = await fetch('/api/dhan-pnl-exit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brokerId, ...config }) });
      const data = await res.json() as DhanPnlExitResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setCurrent(data);
      toast.success(`P&L Exit configured · Status: ${data.pnlExitStatus}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
    setSaving(false);
  };

  const stop = async () => {
    if (!brokerId || !confirm('Stop P&L Exit? Auto-exit triggers will be disabled.')) return;
    setStopping(true);
    try {
      const res  = await fetch('/api/dhan-pnl-exit', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brokerId }) });
      const data = await res.json() as DhanPnlExitResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setCurrent(data);
      toast.success('P&L Exit stopped');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
    setStopping(false);
  };

  const isActive  = current?.pnlExitStatus === 'ACTIVE';
  const prodTypes: ['INTRADAY', 'DELIVERY'] = ['INTRADAY', 'DELIVERY'];

  return (
    <div className={cn('panel p-5 space-y-4 border-l-4', isActive ? 'border-accent-purple' : 'border-border')}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2"><TrendingUp size={15} className="text-accent-purple" /> P&amp;L Exit</h2>
          <p className="text-[10px] text-muted mt-0.5">Auto-square-off on profit/loss threshold</p>
        </div>
        <button onClick={fetchStatus} disabled={loading || !brokerId} className="btn-secondary p-1.5">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Current status */}
      {current && (
        <div className="flex items-center gap-2 rounded-xl bg-border/10 px-3 py-2">
          <div className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-accent-purple animate-pulse' : 'bg-muted')} />
          <span className="text-xs font-semibold">{current.pnlExitStatus}</span>
          {current.profit && <span className="text-[10px] text-muted ml-2">Profit limit: <span className="text-profit">₹{current.profit}</span></span>}
          {current.loss && <span className="text-[10px] text-muted">  Loss limit: <span className="text-loss">₹{current.loss}</span></span>}
        </div>
      )}

      {/* Config form */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <label className="block text-xs text-muted mb-1.5">Profit Exit (₹)</label>
          <input type="number" min={0} step={100} className="input-base font-mono text-profit" value={config.profitValue} onChange={e => setConfig(c => ({ ...c, profitValue: Number(e.target.value) }))} />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Loss Exit (₹)</label>
          <input type="number" min={0} step={100} className="input-base font-mono text-loss" value={config.lossValue} onChange={e => setConfig(c => ({ ...c, lossValue: Number(e.target.value) }))} />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted">Product Type</p>
        <div className="flex gap-4">
          {prodTypes.map(pt => (
            <label key={pt} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={config.productType.includes(pt)} onChange={e => setConfig(c => ({ ...c, productType: e.target.checked ? [...c.productType, pt] as typeof c.productType : c.productType.filter(x => x !== pt) as typeof c.productType }))} className="accent-accent-purple" />
              {pt}
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input type="checkbox" checked={config.enableKillSwitch} onChange={e => setConfig(c => ({ ...c, enableKillSwitch: e.target.checked }))} className="accent-loss" />
        <span>Also activate Kill Switch on trigger</span>
      </label>

      <div className="flex gap-3 pt-1">
        {isActive && (
          <button onClick={stop} disabled={stopping || !brokerId} className="btn-secondary flex-1 text-loss border-loss/30 hover:bg-loss/10">
            {stopping ? 'Stopping…' : 'Stop P&L Exit'}
          </button>
        )}
        <button onClick={configure} disabled={saving || !brokerId} className="btn-primary flex-1 bg-accent-purple/10 border-accent-purple/30 text-accent-purple hover:bg-accent-purple/20">
          {saving ? 'Configuring…' : 'Configure'}
        </button>
      </div>
    </div>
  );
}
