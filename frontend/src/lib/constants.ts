import type { Protocol, UserTier } from '@/types';

// ── Protocol momentum deltas ─────────────────────────────────────────────
export const MOMENTUM_DELTA: Record<Protocol, { T1: number; T2: number; T3: number }> = {
  PROTECTOR:      { T1: 15, T2: 30,  T3: 50  },
  HALF_AND_HALF:  { T1: 20, T2: 40,  T3: 70  },
  DOUBLE_SCALPER: { T1: 25, T2: 50,  T3: 80  },
  SINGLE_SCALPER: { T1: 12, T2: 24,  T3: 36  },
};

// ── Protocol bucket counts ──────────────────────────────────────────────
export const PROTOCOL_BUCKETS: Record<Protocol, number> = {
  PROTECTOR:      3,
  HALF_AND_HALF:  2,
  DOUBLE_SCALPER: 2,
  SINGLE_SCALPER: 1,
};

// ── Lot sizes (NSE/BSE F&O) ──────────────────────────────────────────────
export const LOT_SIZES: Record<string, number> = {
  NIFTY:      65,   // blueprint spec (NSE revises periodically)
  BANKNIFTY:  15,
  FINNIFTY:   40,
  MIDCPNIFTY: 75,
  SENSEX:     20,   // BSE_FNO
  BANKEX:     15,
};

// ── Daily trade limits by tier ───────────────────────────────────────────
export const DAILY_TRADE_LIMITS: Record<UserTier, number> = {
  free:  3,
  pro:   15,
  elite: Infinity,
};

// ── Subscription prices (INR) ────────────────────────────────────────────
export const SUBSCRIPTION_PRICES = {
  pro:   { monthly: 999,  annual: 9990  },
  elite: { monthly: 2499, annual: 24990 },
};

// ── Timing constants ─────────────────────────────────────────────────────
export const ORDER_FILL_TIMEOUT_MS = 30_000;   // 30s before MARKET fallback
export const BROKER_MAX_FAILURES   = 3;         // failures → broker DOWN
export const KILL_SWITCH_POLL_MS   = 5_000;     // fallback polling interval

// ── Protocol display metadata ────────────────────────────────────────────
export const PROTOCOL_META: Record<Protocol, {
  label: string;
  description: string;
  color: string;
  glowClass: string;
  tagClass: string;
}> = {
  PROTECTOR: {
    label: 'Protector',
    description: '3 buckets • Defensive — exit 1/3 at T1, trail SL, exit 2/3 at T3',
    color: '#00D4FF',
    glowClass: 'glow-cyan',
    tagClass: 'bg-cyan-400/10 text-cyan-400 border-cyan-400/30',
  },
  HALF_AND_HALF: {
    label: 'Half & Half',
    description: '2 buckets • Balanced — exit 50% at T1, exit 50% at T2',
    color: '#7B2FBE',
    glowClass: 'glow-purple',
    tagClass: 'bg-purple-400/10 text-purple-400 border-purple-400/30',
  },
  DOUBLE_SCALPER: {
    label: 'Double Scalper',
    description: '2 buckets • Aggressive — wider targets for bigger moves',
    color: '#FF6B35',
    glowClass: 'glow-orange',
    tagClass: 'bg-orange-400/10 text-orange-400 border-orange-400/30',
  },
  SINGLE_SCALPER: {
    label: 'Single Scalper',
    description: '1 bucket • All-in — hold to T3 for maximum scalp',
    color: '#00C896',
    glowClass: 'glow-green',
    tagClass: 'bg-green-400/10 text-green-400 border-green-400/30',
  },
};

// ── Supported symbols ────────────────────────────────────────────────────
export const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'] as const;
export type Symbol = typeof SYMBOLS[number];

// ── Exchange map ─────────────────────────────────────────────────────────
export const SYMBOL_EXCHANGE: Record<string, string> = {
  NIFTY:      'NSE_FNO',
  BANKNIFTY:  'NSE_FNO',
  FINNIFTY:   'NSE_FNO',
  MIDCPNIFTY: 'NSE_FNO',
  SENSEX:     'BSE_FNO',
  BANKEX:     'BSE_FNO',
};

// ── Tier features ────────────────────────────────────────────────────────
export const TIER_FEATURES: Record<UserTier, {
  protocols: Protocol[];
  copyTrading: boolean;
  manualTargets: boolean;
  maxLots: number;
}> = {
  free: {
    protocols: ['SINGLE_SCALPER'],
    copyTrading: false,
    manualTargets: false,
    maxLots: 5,
  },
  pro: {
    protocols: ['PROTECTOR', 'HALF_AND_HALF', 'DOUBLE_SCALPER', 'SINGLE_SCALPER'],
    copyTrading: true,
    manualTargets: true,
    maxLots: 20,
  },
  elite: {
    protocols: ['PROTECTOR', 'HALF_AND_HALF', 'DOUBLE_SCALPER', 'SINGLE_SCALPER'],
    copyTrading: true,
    manualTargets: true,
    maxLots: 50,
  },
};
