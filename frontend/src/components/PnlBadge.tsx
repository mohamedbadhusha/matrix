interface PnlBadgeProps {
  value: number;
  /** Display as percentage instead of absolute INR */
  asPercent?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show +/- prefix always */
  showSign?: boolean;
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-sm px-2 py-0.5',
  lg: 'text-base px-2.5 py-1 font-bold',
};

/**
 * Renders a colour-coded P&L badge.
 * Green for profit, red for loss, muted for zero.
 */
export function PnlBadge({
  value,
  asPercent = false,
  size = 'md',
  showSign = true,
  className = '',
}: PnlBadgeProps) {
  const isProfit = value > 0;
  const isLoss = value < 0;

  const colorClass = isProfit
    ? 'text-profit-green bg-profit-green/10 border border-profit-green/30'
    : isLoss
    ? 'text-loss-red bg-loss-red/10 border border-loss-red/30'
    : 'text-muted bg-white/5 border border-white/10';

  const sign = showSign && value > 0 ? '+' : '';
  const formatted = asPercent
    ? `${sign}${value.toFixed(2)}%`
    : `${sign}₹${Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${value < 0 ? '' : ''}`;

  const display = isLoss && !asPercent
    ? `-₹${Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : formatted;

  return (
    <span
      className={`inline-flex items-center font-mono rounded ${SIZE_CLASSES[size]} ${colorClass} ${className}`}
    >
      {display}
    </span>
  );
}
