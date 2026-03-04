import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/app/providers/AuthProvider';
import { cn } from '@/lib/utils';
import type { SystemFlag } from '@/types';
import { toast } from 'sonner';
import { AlertTriangle, ShieldOff, Wrench, Zap } from 'lucide-react';

const FLAGS: { key: SystemFlag['flag_key']; label: string; description: string; icon: typeof ShieldOff; danger: boolean }[] = [
  {
    key: 'KILL_SWITCH',
    label: 'Global Kill Switch',
    description: 'Immediately stops all new order placement across the platform. Existing positions are NOT exited automatically.',
    icon: ShieldOff,
    danger: true,
  },
  {
    key: 'CIRCUIT_BREAKER',
    label: 'Circuit Breaker',
    description: 'Triggers when daily platform loss exceeds the cap. Blocks new LIVE trades until reset.',
    icon: Zap,
    danger: true,
  },
  {
    key: 'MAINTENANCE_MODE',
    label: 'Maintenance Mode',
    description: 'Displays a maintenance banner to all users. Trade deploy is disabled. Admin access continues.',
    icon: Wrench,
    danger: false,
  },
  {
    key: 'PAPER_ONLY_MODE',
    label: 'Paper-Only Mode',
    description: 'Forces all new trade deployments into PAPER mode regardless of user selection.',
    icon: AlertTriangle,
    danger: false,
  },
];

export default function System() {
  const { profile } = useAuth();
  const [flags, setFlags] = useState<Record<string, SystemFlag>>({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const isSuperAdmin = profile?.role === 'super_admin';

  const fetchFlags = async () => {
    setLoading(true);
    const { data } = await supabase.from('system_flags').select('*');
    const map: Record<string, SystemFlag> = {};
    (data as SystemFlag[] ?? []).forEach((f) => { map[f.flag_key] = f; });
    setFlags(map);
    setLoading(false);
  };

  useEffect(() => { fetchFlags(); }, []);

  const handleToggle = async (key: string) => {
    if (key === 'KILL_SWITCH' && !isSuperAdmin) {
      toast.error('Only Super Admin can toggle the Kill Switch');
      return;
    }

    const current = flags[key]?.flag_value ?? false;
    const newValue = !current;

    if (newValue && key === 'KILL_SWITCH') {
      if (!confirm('⚠️ This will stop ALL new orders platform-wide. Are you sure?')) return;
    }

    setToggling(key);
    const { error } = await supabase
      .from('system_flags')
      .upsert({
        flag_key: key,
        flag_value: newValue,
        updated_by: profile!.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'flag_key' });

    if (error) {
      toast.error(error.message);
    } else {
      setFlags((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? { flag_key: key }), flag_value: newValue } as SystemFlag,
      }));
      toast.success(`${key} ${newValue ? 'ENABLED' : 'disabled'}`);
    }
    setToggling(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 bg-loss/10 border border-loss/30 rounded-xl px-4 py-3">
        <AlertTriangle size={16} className="text-loss flex-shrink-0" />
        <p className="text-sm text-loss">Changes here affect all users immediately. Use with caution.</p>
      </div>

      <div className="space-y-4">
        {FLAGS.map(({ key, label, description, icon: Icon, danger }) => {
          const active = flags[key]?.flag_value ?? false;
          const locked = key === 'KILL_SWITCH' && !isSuperAdmin;

          return (
            <div
              key={key}
              className={cn(
                'panel p-5 border transition-all',
                active && danger ? 'border-loss/50 bg-loss/5' : '',
                active && !danger ? 'border-warning/40 bg-warning/5' : '',
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Icon
                    size={18}
                    className={cn(
                      'mt-0.5 flex-shrink-0',
                      active && danger ? 'text-loss' :
                      active && !danger ? 'text-warning' : 'text-muted',
                    )}
                  />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={cn(
                        'text-sm font-semibold',
                        active && danger ? 'text-loss' :
                        active ? 'text-warning' : 'text-foreground',
                      )}>
                        {label}
                      </h3>
                      {active && (
                        <span className={cn(
                          'text-[10px] font-bold px-1.5 py-0.5 rounded border',
                          danger
                            ? 'bg-loss/10 text-loss border-loss/30'
                            : 'bg-warning/10 text-warning border-warning/30',
                        )}>
                          ACTIVE
                        </span>
                      )}
                      {locked && (
                        <span className="text-[10px] text-muted bg-panel-mid border border-border px-1.5 py-0.5 rounded">
                          Super Admin only
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted">{description}</p>
                    {flags[key]?.updated_at && (
                      <p className="text-[10px] text-muted/50 mt-1">
                        Last changed: {new Date(flags[key].updated_at).toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => handleToggle(key)}
                  disabled={toggling === key || locked}
                  className={cn(
                    'relative inline-flex h-6 w-11 rounded-full border-2 transition-colors flex-shrink-0 mt-1',
                    active && danger ? 'bg-loss border-loss' :
                    active ? 'bg-warning border-warning' : 'bg-muted/20 border-border',
                    locked && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow',
                      active && 'translate-x-5',
                    )}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reset daily trades */}
      <div className="panel p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Daily Reset</h3>
        <p className="text-xs text-muted">
          Reset all users' daily trade counters manually. This normally runs automatically at midnight IST.
        </p>
        <button
          onClick={async () => {
            if (!confirm('Reset daily_trades_used for all users?')) return;
            const { error } = await supabase.from('profiles').update({ daily_trades_used: 0 }).neq('id', '00000000-0000-0000-0000-000000000000');
            if (error) toast.error(error.message);
            else toast.success('Daily counters reset for all users');
          }}
          className="btn-secondary text-sm"
        >
          Reset All Daily Counters
        </button>
      </div>
    </div>
  );
}
