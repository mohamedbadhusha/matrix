import { DAILY_TRADE_LIMITS } from './constants';
import type { UserTier, TradeMode, Protocol } from '@/types';

export interface TierCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if a user can deploy a new trade given their tier and daily usage.
 */
export function canDeployTrade(
  tier: UserTier,
  dailyUsed: number,
  mode: TradeMode,
): TierCheckResult {
  // Free tier: PAPER only
  if (tier === 'free' && mode === 'LIVE') {
    return { allowed: false, reason: 'Free tier is restricted to PAPER mode. Upgrade to Pro or Elite for LIVE trading.' };
  }

  // Daily trade limit
  const limit = DAILY_TRADE_LIMITS[tier];
  if (dailyUsed >= limit) {
    return {
      allowed: false,
      reason: `Daily trade limit reached (${limit} trades). ${
        tier === 'free' ? 'Upgrade to Pro for 15 trades/day.' : 'Resets at midnight.'
      }`,
    };
  }

  return { allowed: true };
}

/**
 * Check if a user can access copy trading based on their tier.
 */
export function canUseCopyTrading(tier: UserTier): TierCheckResult {
  if (tier === 'free') {
    return { allowed: false, reason: 'Copy trading is available on Pro and Elite tiers.' };
  }
  return { allowed: true };
}

/**
 * Check if a user can use a given lot multiplier.
 * Pro: 1.0x only. Elite: 0.25–5.0x.
 */
export function canUseMultiplier(tier: UserTier, multiplier: number): TierCheckResult {
  if (tier === 'free') {
    return { allowed: false, reason: 'Copy trading not available on free tier.' };
  }
  if (tier === 'pro' && multiplier !== 1.0) {
    return { allowed: false, reason: 'Pro tier is fixed at 1.0x multiplier. Upgrade to Elite for custom multipliers.' };
  }
  if (tier === 'elite' && (multiplier < 0.25 || multiplier > 5.0)) {
    return { allowed: false, reason: 'Multiplier must be between 0.25x and 5.0x.' };
  }
  return { allowed: true };
}

/**
 * Returns the allowed multiplier range for a given tier.
 */
export function getMultiplierRange(tier: UserTier): { min: number; max: number; step: number } {
  if (tier === 'elite') return { min: 0.25, max: 5.0, step: 0.25 };
  return { min: 1.0, max: 1.0, step: 1.0 };
}

/**
 * Check if a given protocol is accessible for a tier (currently all tiers access all protocols).
 */
export function canUseProtocol(_tier: UserTier, _protocol: Protocol): TierCheckResult {
  return { allowed: true };
}
