import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import type { BrokerHealthState } from '@/types';

interface BrokerStatusProps {
  state: BrokerHealthState | 'UNKNOWN';
  label?: string;
  showLabel?: boolean;
  className?: string;
}

const CONFIG: Record<string, { icon: typeof Wifi; color: string; dot: string; text: string }> = {
  HEALTHY: {
    icon: Wifi,
    color: 'text-profit-green',
    dot: 'bg-profit-green shadow-[0_0_6px_#00C896]',
    text: 'Connected',
  },
  DEGRADED: {
    icon: AlertTriangle,
    color: 'text-warning-orange',
    dot: 'bg-warning-orange shadow-[0_0_6px_#FF6B35]',
    text: 'Degraded',
  },
  DOWN: {
    icon: WifiOff,
    color: 'text-loss-red',
    dot: 'bg-loss-red shadow-[0_0_6px_#FF4757]',
    text: 'Down',
  },
  UNKNOWN: {
    icon: WifiOff,
    color: 'text-muted',
    dot: 'bg-gray-500',
    text: 'Unknown',
  },
};

export function BrokerStatus({ state, label, showLabel = true, className = '' }: BrokerStatusProps) {
  const cfg = CONFIG[state] ?? CONFIG.UNKNOWN;
  const Icon = cfg.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <Icon size={13} className={cfg.color} />
      {showLabel && (
        <span className={`text-xs font-medium ${cfg.color}`}>
          {label ?? cfg.text}
        </span>
      )}
    </span>
  );
}
