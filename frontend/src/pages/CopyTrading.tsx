import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/app/providers/AuthProvider';
import { TIER_FEATURES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { CopySubscription, Profile } from '@/types';
import { toast } from 'sonner';
import { Copy, Crown, Users, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function CopyTrading() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [leaders, setLeaders] = useState<Profile[]>([]);
  const [mySubscription, setMySubscription] = useState<CopySubscription | null>(null);
  const [multiplier, setMultiplier] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const tier = profile?.tier ?? 'free';
  const canCopy = TIER_FEATURES[tier].copyTrading;

  useEffect(() => {
    if (profile) fetchData();
  }, [profile]);

  const fetchData = async () => {
    setLoading(true);
    const [leadersRes, subRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, tier, role')
        .in('role', ['admin', 'super_admin']),
      supabase
        .from('copy_subscriptions')
        .select('*')
        .eq('follower_id', profile!.id)
        .maybeSingle(),
    ]);

    setLeaders((leadersRes.data as Profile[]) ?? []);
    const sub = subRes.data as CopySubscription | null;
    setMySubscription(sub);
    setMultiplier(sub?.lot_multiplier ?? 1.0);
    setLoading(false);
  };

  const handleToggle = async (leaderId: string) => {
    if (!canCopy) {
      toast.error('Copy trading requires Pro or Elite tier');
      return;
    }

    setToggling(true);
    try {
      if (mySubscription && mySubscription.leader_id === leaderId) {
        // Unsubscribe
        await supabase.from('copy_subscriptions').delete().eq('id', mySubscription.id);
        setMySubscription(null);
        toast.success('Copy trading disabled');
      } else {
        // Upsert subscription
        if (mySubscription) {
          await supabase.from('copy_subscriptions').delete().eq('id', mySubscription.id);
        }
        const { data, error } = await supabase
          .from('copy_subscriptions')
          .insert({
            follower_id: profile!.id,
            leader_id: leaderId,
            is_active: true,
            lot_multiplier: multiplier,
          })
          .select()
          .single();
        if (error) throw error;
        setMySubscription(data as CopySubscription);
        toast.success('Copy trading enabled');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
    setToggling(false);
  };

  const handleMultiplierChange = async (val: number) => {
    setMultiplier(val);
    if (mySubscription) {
      await supabase
        .from('copy_subscriptions')
        .update({ lot_multiplier: val })
        .eq('id', mySubscription.id);
      toast.success(`Multiplier updated to ${val}x`);
    }
  };

  if (!canCopy) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="panel p-12 text-center space-y-4 mt-8">
          <Lock size={32} className="mx-auto text-muted" />
          <h2 className="text-lg font-semibold text-foreground">Copy Trading — Pro & Elite</h2>
          <p className="text-sm text-muted">
            Automatically mirror trades from admin signal providers. Upgrade to unlock this feature.
          </p>
          <button onClick={() => navigate('/subscription')} className="btn-primary">
            <Crown size={16} className="mr-2" /> Upgrade Plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Copy Trading</h1>
        <p className="text-sm text-muted mt-0.5">Mirror trades from signal providers automatically</p>
      </div>

      {/* Current status banner */}
      <div className={cn(
        'panel p-4 border-l-4',
        mySubscription?.is_active ? 'border-l-profit' : 'border-l-muted',
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-2 h-2 rounded-full',
            mySubscription?.is_active ? 'dot-live' : 'dot-paper',
          )} />
          <div>
            <p className="text-sm font-medium text-foreground">
              {mySubscription?.is_active
                ? `Copying active — ${multiplier}x multiplier`
                : 'Copy trading inactive'}
            </p>
            <p className="text-xs text-muted">
              {mySubscription?.is_active
                ? 'New admin trades will be auto-deployed to your account'
                : 'Select a leader below to start copying'}
            </p>
          </div>
        </div>
      </div>

      {/* Multiplier slider */}
      {mySubscription?.is_active && (
        <div className="panel p-5 space-y-3 animate-slide-up">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-foreground">Lot Multiplier</h3>
            <span className="font-mono text-accent-cyan font-bold">{multiplier}x</span>
          </div>
          <input
            type="range"
            min={0.25}
            max={TIER_FEATURES[tier].maxLots}
            step={0.25}
            value={multiplier}
            onChange={(e) => handleMultiplierChange(Number(e.target.value))}
            className="w-full accent-accent-cyan"
          />
          <div className="flex justify-between text-[10px] text-muted">
            <span>0.25x</span>
            <span className="text-center">1x (mirror)</span>
            <span>{TIER_FEATURES[tier].maxLots}x</span>
          </div>
          <p className="text-xs text-muted">
            If admin deploys 1 lot, you will get {multiplier} lot{multiplier !== 1 ? 's' : ''}.
          </p>
        </div>
      )}

      {/* Leaders list */}
      <div className="panel p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Users size={16} className="text-accent-cyan" />
          <h3 className="text-sm font-semibold text-foreground">Signal Providers</h3>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" />
          </div>
        ) : leaders.length === 0 ? (
          <p className="text-xs text-muted text-center py-4">No signal providers available</p>
        ) : (
          <div className="space-y-3">
            {leaders.map((leader) => {
              const isFollowing = mySubscription?.leader_id === leader.id;
              return (
                <div
                  key={leader.id}
                  className={cn(
                    'flex items-center justify-between p-4 rounded-xl border transition-all',
                    isFollowing
                      ? 'bg-profit/5 border-profit/30'
                      : 'bg-panel-mid border-border hover:border-border/80',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center text-sm font-bold text-accent-cyan">
                      {(leader.full_name ?? leader.email ?? 'A')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {leader.full_name ?? 'Signal Provider'}
                      </p>
                      <span className={cn(
                        'badge text-[10px]',
                        leader.role === 'super_admin' ? 'tier-elite' : 'tier-pro',
                      )}>
                        {leader.role === 'super_admin' ? '★ Super Admin' : 'Admin'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggle(leader.id)}
                    disabled={toggling}
                    className={cn(
                      'text-xs px-4 py-2 rounded-lg border font-medium transition-all',
                      isFollowing
                        ? 'bg-profit/10 text-profit border-profit/30 hover:bg-loss/10 hover:text-loss hover:border-loss/30'
                        : 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30 hover:bg-accent-cyan/20',
                    )}
                  >
                    {toggling ? '…' : isFollowing ? 'Stop Copying' : 'Copy Trades'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="panel-mid p-4 rounded-xl border border-border/50 space-y-1">
        <div className="flex items-start gap-2">
          <Copy size={14} className="text-accent-cyan mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted space-y-1">
            <p>When admin deploys a LIVE trade, a copy is created for your account.</p>
            <p>Copy trades always use the same protocol as the original signal.</p>
            <p>Your daily trade limit applies to copied trades.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
