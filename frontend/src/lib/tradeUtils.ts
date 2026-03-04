import { LOT_SIZES, MOMENTUM_DELTA, PROTOCOL_BUCKETS } from './constants';
import type { Protocol, TargetMode, TradeMode, DeployTradeInput } from '@/types';

export interface TradeNodeInsert {
  user_id: string;
  broker_account_id: string | null;
  symbol: string;
  strike: string;
  trading_symbol: string;
  security_id: string | null;
  exchange: string;
  protocol: Protocol;
  target_mode: TargetMode;
  mode: TradeMode;
  entry_price: number;
  sl: number;
  initial_sl: number;
  t1: number;
  t2: number;
  t3: number;
  lots: number;
  lot_size: number;
  remaining_quantity: number;
  remaining_buckets: number;
  lots_per_bucket: number;
  qty_per_bucket: number;
  booked_pnl: number;
  is_processing: boolean;
  status: 'ACTIVE';
  ltp_source: 'SIM' | 'BROKER';
  is_master_signal: boolean;
  is_copy_trade: boolean;
}

/**
 * Calculate T1/T2/T3 targets from entry price in MOMENTUM mode.
 * Adds protocol-specific deltas to the entry price.
 */
export function calcMomentumTargets(
  protocol: Protocol,
  entryPrice: number,
): { t1: number; t2: number; t3: number } {
  const delta = MOMENTUM_DELTA[protocol];
  return {
    t1: Math.round((entryPrice + delta.T1) * 100) / 100,
    t2: Math.round((entryPrice + delta.T2) * 100) / 100,
    t3: Math.round((entryPrice + delta.T3) * 100) / 100,
  };
}

/**
 * Calculate per-bucket quantity. Floors to whole lots to avoid fractional orders.
 * Remaining quantity = totalLots × lotSize rounded to bucket size.
 */
export function calcBucketQuantity(
  protocol: Protocol,
  lots: number,
  lotSize: number,
): { buckets: number; lotsPerBucket: number; qtyPerBucket: number; totalQty: number } {
  const buckets = PROTOCOL_BUCKETS[protocol];
  const lotsPerBucket = Math.max(1, Math.floor(lots / buckets)); // whole lots, min 1
  const qtyPerBucket = lotsPerBucket * lotSize;
  const totalQty = qtyPerBucket * buckets;
  return { buckets, lotsPerBucket, qtyPerBucket, totalQty };
}

/**
 * Build a complete TradeNode insert object from deploy form inputs.
 */
export function buildTradeNodeInsert(
  userId: string,
  input: DeployTradeInput,
): TradeNodeInsert {
  const lotSize = LOT_SIZES[input.symbol] ?? 1;

  let t1 = input.t1;
  let t2 = input.t2;
  let t3 = input.t3;

  if (input.targetMode === 'MOMENTUM') {
    const targets = calcMomentumTargets(input.protocol, input.entryPrice);
    t1 = targets.t1;
    t2 = targets.t2;
    t3 = targets.t3;
  }

  const { buckets, lotsPerBucket, qtyPerBucket, totalQty } = calcBucketQuantity(
    input.protocol,
    input.lots,
    lotSize,
  );

  return {
    user_id: userId,
    broker_account_id: input.mode === 'LIVE' ? input.brokerAccountId : null,
    symbol: input.symbol,
    strike: input.strike,
    trading_symbol: input.tradingSymbol,
    security_id: input.securityId || null,
    exchange: input.exchange || 'NSE_FNO',
    protocol: input.protocol,
    target_mode: input.targetMode,
    mode: input.mode,
    entry_price: input.entryPrice,
    sl: input.sl,
    initial_sl: input.sl,
    t1,
    t2,
    t3,
    lots: input.lots,
    lot_size: lotSize,
    remaining_quantity: totalQty,
    remaining_buckets: buckets,
    lots_per_bucket: lotsPerBucket,
    qty_per_bucket: qtyPerBucket,
    booked_pnl: 0,
    is_processing: false,
    status: 'ACTIVE',
    ltp_source: input.mode === 'LIVE' ? 'BROKER' : 'SIM',
    is_master_signal: false,
    is_copy_trade: false,
  };
}

/**
 * Calculate follower lot count from admin lots × multiplier.
 * Blueprint formula: floor(adminLots × multiplier), minimum 1 lot.
 */
export function calcFollowerLots(adminLots: number, multiplier: number): number {
  return Math.max(1, Math.floor(adminLots * multiplier));
}

/**
 * Calculate unrealised P&L for an active trade.
 */
export function calcUnrealisedPnl(
  entryPrice: number,
  ltp: number,
  remainingQty: number,
): number {
  return Math.round((ltp - entryPrice) * remainingQty * 100) / 100;
}

/**
 * Calculate total P&L (booked partial exits + current unrealised).
 */
export function calcTotalPnl(
  bookedPnl: number,
  entryPrice: number,
  ltp: number,
  remainingQty: number,
): number {
  return Math.round((bookedPnl + calcUnrealisedPnl(entryPrice, ltp, remainingQty)) * 100) / 100;
}
