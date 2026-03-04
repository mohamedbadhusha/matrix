import { useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { SUBSCRIPTION_PRICES, TIER_FEATURES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { UserTier } from '@/types';
import { toast } from 'sonner';
import { CheckCircle, Crown, Zap, Shield } from 'lucide-react';

const TIERS: { id: UserTier; label: string; icon: typeof Shield; color: string; description: string }[] = [
  { id: 'free', label: 'Free', icon: Shield, color: 'text-muted border-border', description: 'Get started with basic trading' },
  { id: 'pro', label: 'Pro', icon: Zap, color: 'text-warning border-warning/40', description: 'For active daily traders' },
  { id: 'elite', label: 'Elite', icon: Crown, color: 'text-accent-cyan border-accent-cyan/40', description: 'Unlimited with all protocols' },
];

const FEATURES_LIST = [
  { key: 'dailyTrades', label: 'Daily Trades' },
  { key: 'protocols', label: 'Protocols' },
  { key: 'copyTrading', label: 'Copy Trading' },
  { key: 'manualTargets', label: 'Manual Targets' },
  { key: 'maxLots', label: 'Max Lots' },
] as const;

function featureValue(tier: UserTier, key: typeof FEATURES_LIST[number]['key']): string {
  const f = TIER_FEATURES[tier];
  switch (key) {
    case 'dailyTrades':
      return tier === 'free' ? '3/day' : tier === 'pro' ? '15/day' : '∞ Unlimited';
    case 'protocols':
      return f.protocols.join(', ');
    case 'copyTrading':
      return f.copyTrading ? '✓' : '✗';
    case 'manualTargets':
      return f.manualTargets ? '✓' : '✗';
    case 'maxLots':
      return `${f.maxLots} lots`;
  }
}

declare const Razorpay: any;

export default function Subscription() {
  const { profile, refreshProfile } = useAuth();
  const [paying, setPaying] = useState<UserTier | null>(null);

  const currentTier = profile?.tier ?? 'free';

  const handleUpgrade = async (tier: UserTier) => {
    if (tier === currentTier || tier === 'free') return;

    setPaying(tier);

    try {
      // Create Razorpay order via API
      const res = await fetch('/api/razorpay-create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, userId: profile!.id }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Payment initiation failed');
      }

      const order = await res.json();

      // Open Razorpay modal
      const rzp = new Razorpay({
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        order_id: order.id,
        amount: order.amount,
        currency: 'INR',
        name: 'Matrix Pro',
        description: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan — Monthly`,
        prefill: {
          email: profile?.email ?? '',
          name: profile?.full_name ?? '',
        },
        theme: { color: '#00D4FF' },
        handler: async (response: any) => {
          // Webhook handles tier update, just refresh profile after a moment
          toast.success('Payment successful! Activating your plan…');
          setTimeout(() => {
            refreshProfile();
          }, 2000);
          setPaying(null);
        },
        modal: {
          ondismiss: () => {
            setPaying(null);
          },
        },
      });
      rzp.open();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment failed');
      setPaying(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Plans & Pricing</h1>
        <p className="text-muted">Choose the plan that fits your trading style</p>
      </div>

      {/* Current plan badge */}
      <div className="flex justify-center">
        <div className="flex items-center gap-2 bg-panel-mid border border-border rounded-full px-4 py-2">
          <span className="text-xs text-muted">Current plan:</span>
          <span className={cn('badge', `tier-${currentTier}`)}>
            {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
          </span>
        </div>
      </div>

      {/* Pricing cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TIERS.map((t) => {
          const price = SUBSCRIPTION_PRICES[t.id];
          const isCurrentTier = t.id === currentTier;
          const isHigher = (
            t.id === 'elite' ||
            (t.id === 'pro' && currentTier === 'free')
          );

          return (
            <div
              key={t.id}
              className={cn(
                'panel p-6 space-y-5 flex flex-col transition-all',
                t.id === 'elite' ? 'border-accent-cyan/40 shadow-glow-cyan' :
                t.id === 'pro' ? 'border-warning/30' : 'border-border',
                isCurrentTier && 'ring-2 ring-accent-cyan/30',
              )}
            >
              {/* Header */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <t.icon size={18} className={t.color.split(' ')[0]} />
                  <h3 className={cn('font-bold text-lg', t.color.split(' ')[0])}>{t.label}</h3>
                  {isCurrentTier && (
                    <span className="ml-auto text-[10px] bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 rounded-full px-2 py-0.5">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted">{t.description}</p>
              </div>

              {/* Price */}
              <div>
                {price === 0 ? (
                  <p className="text-3xl font-bold text-foreground">Free</p>
                ) : (
                  <div>
                    <p className="text-3xl font-bold text-foreground">
                      ₹{price.toLocaleString('en-IN')}
                    </p>
                    <p className="text-xs text-muted">/month</p>
                  </div>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-2 flex-1">
                {FEATURES_LIST.map((f) => {
                  const val = featureValue(t.id, f.key);
                  const isEnabled = val !== '✗';
                  return (
                    <li key={f.key} className="flex items-start gap-2 text-xs">
                      <CheckCircle
                        size={13}
                        className={cn('mt-0.5 flex-shrink-0', isEnabled ? 'text-profit' : 'text-muted/30')}
                      />
                      <span className={isEnabled ? 'text-foreground' : 'text-muted/40 line-through'}>
                        {f.label}: <strong>{val}</strong>
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* CTA */}
              {isCurrentTier ? (
                <button className="btn-secondary w-full" disabled>Current Plan</button>
              ) : t.id === 'free' ? (
                <button className="btn-secondary w-full" disabled>Downgrade</button>
              ) : (
                <button
                  onClick={() => handleUpgrade(t.id)}
                  disabled={paying === t.id || !isHigher}
                  className={cn(
                    'w-full py-3 rounded-xl font-semibold text-sm border transition-all',
                    t.id === 'elite'
                      ? 'bg-accent-cyan text-navy hover:bg-accent-cyan/90 border-transparent'
                      : 'bg-warning/10 text-warning border-warning/30 hover:bg-warning/20',
                    !isHigher && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {paying === t.id ? 'Opening…' :
                   isHigher ? `Upgrade to ${t.label}` : 'Contact Support'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* FAQ */}
      <div className="panel p-6 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Common Questions</h3>
        <div className="space-y-3">
          {[
            ['Is there a refund policy?', 'Payments are non-refundable. Please use the Free plan to evaluate before upgrading.'],
            ['How are payments processed?', 'Payments are securely processed via Razorpay. We do not store card details.'],
            ['Can I downgrade?', 'Plans expire at end of billing period. Contact support for manual downgrade requests.'],
            ['What happens to my trades if I downgrade?', 'Existing trades continue. You simply lose access to restricted features for new trades.'],
          ].map(([q, a]) => (
            <div key={q} className="space-y-1">
              <p className="text-xs font-medium text-foreground">{q}</p>
              <p className="text-xs text-muted">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
