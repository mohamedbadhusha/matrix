import { PROTOCOL_META, TIER_FEATURES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { Protocol, UserTier } from '@/types';
import { Lock } from 'lucide-react';

interface ProtocolSelectorProps {
  value: Protocol;
  onChange: (p: Protocol) => void;
  tier: UserTier;
}

const protocols: Protocol[] = ['PROTECTOR', 'HALF_AND_HALF', 'DOUBLE_SCALPER', 'SINGLE_SCALPER'];

export default function ProtocolSelector({ value, onChange, tier }: ProtocolSelectorProps) {
  const allowed = TIER_FEATURES[tier].protocols;

  return (
    <div className="grid grid-cols-2 gap-3">
      {protocols.map((p) => {
        const meta = PROTOCOL_META[p];
        const isAllowed = allowed.includes(p);
        const isSelected = value === p;

        return (
          <button
            key={p}
            type="button"
            disabled={!isAllowed}
            onClick={() => isAllowed && onChange(p)}
            className={cn(
              'relative text-left p-3 rounded-xl border-2 transition-all duration-200',
              isSelected
                ? 'border-current/60 bg-current/5'
                : 'border-border bg-panel-mid hover:border-border/80',
              !isAllowed && 'opacity-40 cursor-not-allowed',
            )}
            style={isSelected ? { borderColor: meta.color, backgroundColor: meta.color + '15' } : {}}
          >
            {/* Lock for locked tiers */}
            {!isAllowed && (
              <div className="absolute top-2 right-2">
                <Lock size={12} className="text-muted" />
              </div>
            )}

            <div className="flex items-center gap-2 mb-1.5">
              {/* Color dot */}
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: meta.color }}
              />
              <span
                className={cn('text-sm font-semibold', isSelected ? '' : 'text-foreground')}
                style={{ color: isSelected ? meta.color : undefined }}
              >
                {meta.label}
              </span>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">{meta.description}</p>
          </button>
        );
      })}
    </div>
  );
}
