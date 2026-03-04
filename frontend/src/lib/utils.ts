import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Protocol, TradeNode, UserTier } from '@/types';
import { MOMENTUM_DELTA, PROTOCOL_BUCKETS, LOT_SIZES, DAILY_TRADE_LIMITS } from './constants';

// ── Tailwind class merge utility ─────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── P&L calculation (lot-size aware) ────────────────────────────────────
export function calcPnl(
  entryPrice: number,
  exitPrice: number,
  qty: number, // in units (lots * lotSize)
): number {
  return parseFloat(((exitPrice - entryPrice) * qty).toFixed(2));
}

// ── Format currency ───────────────────────────────────────────────────────
export function formatCurrency(value: number, showSign = false): string {
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs);
  if (showSign) {
    return value >= 0 ? `+₹${formatted}` : `-₹${formatted}`;
  }
  return `₹${formatted}`;
}

// ── Format P&L with sign and color class ─────────────────────────────────
export function getPnlClass(pnl: number): string {
  if (pnl > 0) return 'pnl-positive';
  if (pnl < 0) return 'pnl-negative';
  return 'pnl-neutral';
}

// ── Format price (2 decimal places) ─────────────────────────────────────
export function formatPrice(price: number): string {
  return price.toFixed(2);
}

// ── Format percentage ────────────────────────────────────────────────────
export function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

// ── Compute T1/T2/T3 from entry price + protocol (MOMENTUM mode) ─────────
export function computeTargets(
  entryPrice: number,
  protocol: Protocol,
): { t1: number; t2: number; t3: number } {
  const delta = MOMENTUM_DELTA[protocol];
  return {
    t1: parseFloat((entryPrice + delta.T1).toFixed(2)),
    t2: parseFloat((entryPrice + delta.T2).toFixed(2)),
    t3: parseFloat((entryPrice + delta.T3).toFixed(2)),
  };
}

// ── Compute bucket quantities ────────────────────────────────────────────
export function computeBuckets(
  lots: number,
  protocol: Protocol,
  lotSize: number,
): {
  buckets: number;
  lotsPerBucket: number;
  qtyPerBucket: number;
  totalQty: number;
} {
  const buckets = PROTOCOL_BUCKETS[protocol];
  const lotsPerBucket = Math.max(1, Math.floor(lots / buckets)); // floor to whole lots, min 1
  const qtyPerBucket = lotsPerBucket * lotSize;
  const totalQty = qtyPerBucket * buckets; // use actual floored total, not raw lots * lotSize
  return { buckets, lotsPerBucket, qtyPerBucket, totalQty };
}

// ── Get lot size for a symbol ────────────────────────────────────────────
export function getLotSize(symbol: string): number {
  return LOT_SIZES[symbol.toUpperCase()] ?? 1;
}

// ── Check if user can deploy trade ───────────────────────────────────────
export function canDeployTrade(
  tier: UserTier,
  dailyTradesUsed: number,
): { allowed: boolean; reason?: string } {
  const limit = DAILY_TRADE_LIMITS[tier];
  if (dailyTradesUsed >= limit) {
    return {
      allowed: false,
      reason: `Daily limit of ${limit} trades reached for ${tier} tier`,
    };
  }
  return { allowed: true };
}

// ── Compute follower lots from multiplier ────────────────────────────────
export function calcFollowerLots(
  adminLots: number,
  multiplier: number,
): number {
  return Math.max(1, Math.floor(adminLots * multiplier));
}

// ── Trade progress percentage for price bar ──────────────────────────────
export function tradePriceProgress(trade: TradeNode): number {
  const { entry_price, t3, ltp } = trade;
  if (!ltp) return 0;
  const total = t3 - entry_price;
  if (total <= 0) return 0;
  const current = Math.min(Math.max(ltp - entry_price, 0), total);
  return (current / total) * 100;
}

// ── Relative time formatter ───────────────────────────────────────────────
export function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// ── Format datetime for IST display ─────────────────────────────────────
export function formatDateIST(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ── Truncate string ──────────────────────────────────────────────────────
export function truncate(str: string, maxLen = 20): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

// ── Validate entry > SL, T1 > entry ─────────────────────────────────────
export function validateTradeParams(
  entryPrice: number,
  sl: number,
  t1: number,
  t2: number,
  t3: number,
): { valid: boolean; error?: string } {
  if (entryPrice <= 0) return { valid: false, error: 'Entry price must be > 0' };
  if (sl <= 0) return { valid: false, error: 'Stop loss must be > 0' };
  if (sl >= entryPrice) return { valid: false, error: 'Stop loss must be below entry price' };
  if (t1 <= entryPrice) return { valid: false, error: 'T1 must be above entry price' };
  if (t2 <= t1) return { valid: false, error: 'T2 must be above T1' };
  if (t3 <= t2) return { valid: false, error: 'T3 must be above T2' };
  return { valid: true };
}

// ── Clamp number between min and max ────────────────────────────────────
export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}
