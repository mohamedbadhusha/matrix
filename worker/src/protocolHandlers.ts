import { SupabaseClient } from '@supabase/supabase-js';
import { placeOrder, cancelOrder } from './brokerClient';
import { logger } from './logger';

export interface TradeNode {
  id: string;
  user_id: string;
  broker_account_id: string | null;
  symbol: string;
  strike: string;
  trading_symbol: string;
  security_id: string | null;
  exchange: string;
  protocol: 'PROTECTOR' | 'HALF_AND_HALF' | 'DOUBLE_SCALPER' | 'SINGLE_SCALPER';
  target_mode: 'MOMENTUM' | 'MANUAL';
  mode: 'LIVE' | 'PAPER';
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
  t1_hit: boolean;
  t2_hit: boolean;
  t3_hit: boolean;
  sl_hit: boolean;
  ltp: number | null;
  // Critical fields added per blueprint
  is_processing: boolean;
  booked_pnl: number;
  max_price_reached: number | null;
  broker_order_id: string | null;
  sl_order_id: string | null;
  status: string;
}

interface BrokerCreds {
  clientId: string;
  accessToken: string;
}

async function getBrokerCreds(
  supabase: SupabaseClient,
  brokerId: string,
): Promise<BrokerCreds | null> {
  const { data } = await supabase
    .from('broker_accounts')
    .select('client_id, access_token, api_key')
    .eq('id', brokerId)
    .single();
  if (!data) return null;
  return { clientId: data.client_id, accessToken: data.access_token ?? data.api_key };
}

async function updateTrade(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<TradeNode> & Record<string, any>,
) {
  const { error } = await supabase.from('trade_nodes').update(patch).eq('id', id);
  if (error) logger.error('updateTrade failed', { id, error: error.message });
}

/**
 * Cancel the standing SL order at the broker (e.g. before placing T3 exit).
 * Safe to call even if sl_order_id is null or already cancelled.
 */
async function cancelSlOrder(supabase: SupabaseClient, trade: TradeNode): Promise<void> {
  if (!trade.sl_order_id || trade.mode !== 'LIVE' || !trade.broker_account_id) return;
  const creds = await getBrokerCreds(supabase, trade.broker_account_id);
  if (!creds) return;
  const cancelled = await cancelOrder(creds, trade.sl_order_id);
  logger.info('SL order cancel', { tradeId: trade.id, slOrderId: trade.sl_order_id, cancelled });
}

/**
 * Close the entire trade (SL_HIT or force-close).
 * Exits remaining_quantity, cancels pending SL order.
 * P&L = already-booked partial exits + remaining position P&L.
 */
async function closeTrade(
  supabase: SupabaseClient,
  trade: TradeNode,
  exitPrice: number,
  reason: 'SL_HIT' | 'CLOSED',
) {
  // Cancel standing broker SL order to avoid double-exit
  await cancelSlOrder(supabase, trade);

  // P&L = locked-in booked P&L + remaining position P&L
  const remainingPnl = (exitPrice - trade.entry_price) * trade.remaining_quantity;
  const finalPnl = Math.round(((trade.booked_pnl ?? 0) + remainingPnl) * 100) / 100;

  await updateTrade(supabase, trade.id, {
    status: reason,
    exit_price: exitPrice,
    realised_pnl: finalPnl,
    closed_at: new Date().toISOString(),
    ltp: exitPrice,
    remaining_quantity: 0,
    remaining_buckets: 0,
    sl_hit: reason === 'SL_HIT',
    sl_order_id: null,
  });
  logger.info(`Trade ${reason}`, { id: trade.id, exitPrice, finalPnl });
}

async function executeBucketSell(
  supabase: SupabaseClient,
  trade: TradeNode,
  triggerPrice: number,
  targetLevel: 'T1' | 'T2' | 'T3',
) {
  if (trade.mode === 'LIVE' && trade.broker_account_id) {
    const creds = await getBrokerCreds(supabase, trade.broker_account_id);
    if (creds) {
      await placeOrder(creds, {
        tradingSymbol: trade.trading_symbol,
        securityId: trade.security_id ?? '',
        exchange: trade.exchange,
        transactionType: 'SELL',
        orderType: 'LIMIT',
        quantity: trade.qty_per_bucket,
        price: triggerPrice,
        correlationId: `${trade.id}-${targetLevel}`,
      });
    }
  }

  const bucketPnl = (triggerPrice - trade.entry_price) * trade.qty_per_bucket;
  const newBookedPnl = Math.round(((trade.booked_pnl ?? 0) + bucketPnl) * 100) / 100;
  const newBuckets = trade.remaining_buckets - 1;
  const newQty = trade.remaining_quantity - trade.qty_per_bucket;
  const allDone = newBuckets <= 0;

  await updateTrade(supabase, trade.id, {
    [`${targetLevel.toLowerCase()}_hit`]: true,
    remaining_buckets: newBuckets,
    remaining_quantity: newQty,
    booked_pnl: newBookedPnl,
    ltp: triggerPrice,
    ...(allDone ? {
      status: 'CLOSED',
      exit_price: triggerPrice,
      realised_pnl: newBookedPnl,
      closed_at: new Date().toISOString(),
      sl_order_id: null,
    } : {}),
  });

  logger.info(`${targetLevel} hit — bucket sold`, {
    id: trade.id, triggerPrice, remaining: newBuckets, bookedPnl: newBookedPnl,
  });
}

/**
 * PROTECTOR T3 — cancel SL order and exit ALL remaining 2 buckets at limit price.
 */
async function executeProtectorT3Exit(supabase: SupabaseClient, trade: TradeNode): Promise<void> {
  await cancelSlOrder(supabase, trade);

  if (trade.mode === 'LIVE' && trade.broker_account_id) {
    const creds = await getBrokerCreds(supabase, trade.broker_account_id);
    if (creds) {
      await placeOrder(creds, {
        tradingSymbol: trade.trading_symbol,
        securityId: trade.security_id ?? '',
        exchange: trade.exchange,
        transactionType: 'SELL',
        orderType: 'LIMIT',
        quantity: trade.remaining_quantity,
        price: trade.t3,
        correlationId: `${trade.id}-T3`,
      });
    }
  }

  const remainingPnl = (trade.t3 - trade.entry_price) * trade.remaining_quantity;
  const finalPnl = Math.round(((trade.booked_pnl ?? 0) + remainingPnl) * 100) / 100;

  await updateTrade(supabase, trade.id, {
    t3_hit: true,
    remaining_buckets: 0,
    remaining_quantity: 0,
    ltp: trade.t3,
    booked_pnl: finalPnl,
    status: 'CLOSED',
    exit_price: trade.t3,
    realised_pnl: finalPnl,
    closed_at: new Date().toISOString(),
    sl_order_id: null,
  });

  logger.info('PROTECTOR T3 — all 2 remaining buckets exited', { id: trade.id, exitPrice: trade.t3, finalPnl });
}

// ═══════════════════════════════════════════════════════════════════
// PROTECTOR (3 buckets)
//   T1 → exit 1 bucket, trail SL to entry (breakeven)
//   T2 → NO EXIT — trail SL to T1 only
//   T3 → exit remaining 2 buckets, cancel SL order
//   SL → exit all remaining at market
// ═══════════════════════════════════════════════════════════════════
export async function handleProtector(
  supabase: SupabaseClient,
  trade: TradeNode,
  ltp: number,
) {
  await updateTrade(supabase, trade.id, { ltp });

  // SL hit — exit all remaining at market
  if (ltp <= trade.sl) {
    await closeTrade(supabase, trade, ltp, 'SL_HIT');
    return;
  }

  // T1 — exit 1 bucket, trail SL to entry (breakeven)
  if (!trade.t1_hit && ltp >= trade.t1) {
    await executeBucketSell(supabase, trade, trade.t1, 'T1');
    await updateTrade(supabase, trade.id, { sl: trade.entry_price });
    logger.info('PROTECTOR T1 — SL trailed to entry', { id: trade.id });
    return;
  }

  // T2 — NO SELL; trail SL to T1 only
  if (trade.t1_hit && !trade.t2_hit && ltp >= trade.t2) {
    await updateTrade(supabase, trade.id, { t2_hit: true, sl: trade.t1 });
    logger.info('PROTECTOR T2 — SL trailed to T1, no exit', { id: trade.id });
    return;
  }

  // T3 — guard: t1 must be hit; exit ALL remaining 2 buckets
  if (trade.t1_hit && trade.t2_hit && !trade.t3_hit && ltp >= trade.t3) {
    await executeProtectorT3Exit(supabase, trade);
    return;
  }
}

// ═══════════════════════════════════════════════════════════════════
// HALF_AND_HALF (2 buckets)
//   T1 → mark only (no exit), trail SL to entry
//   T2 → exit 1 bucket, trail SL to T1
//   T3 → exit remaining 1 bucket
//   SL → exit all remaining
// ═══════════════════════════════════════════════════════════════════
export async function handleHalfAndHalf(
  supabase: SupabaseClient,
  trade: TradeNode,
  ltp: number,
) {
  await updateTrade(supabase, trade.id, { ltp });

  if (ltp <= trade.sl) {
    await closeTrade(supabase, trade, ltp, 'SL_HIT');
    return;
  }

  // T1 just marks but does NOT sell — SL moves to breakeven
  if (!trade.t1_hit && ltp >= trade.t1) {
    await updateTrade(supabase, trade.id, {
      t1_hit: true,
      sl: trade.entry_price,
    });
    logger.info('HALF_AND_HALF T1 mark — SL moved to entry', { id: trade.id });
    return;
  }

  // T2 — exit bucket 1 of 2
  if (trade.t1_hit && !trade.t2_hit && ltp >= trade.t2) {
    await executeBucketSell(supabase, trade, trade.t2, 'T2');
    await updateTrade(supabase, trade.id, { sl: trade.t1 });
    return;
  }

  // T3 — sell remaining
  if (trade.t2_hit && !trade.t3_hit && ltp >= trade.t3) {
    await executeBucketSell(supabase, trade, trade.t3, 'T3');
    return;
  }
}

// ═══════════════════════════════════════════════════════════════════
// DOUBLE_SCALPER (2 buckets)
//   T1 → exit bucket 1 (scalp quickly)
//   T2 → exit bucket 2
//   SL → exit all remaining
// ═══════════════════════════════════════════════════════════════════
export async function handleDoubleScalper(
  supabase: SupabaseClient,
  trade: TradeNode,
  ltp: number,
) {
  await updateTrade(supabase, trade.id, { ltp });

  if (ltp <= trade.sl) {
    await closeTrade(supabase, trade, ltp, 'SL_HIT');
    return;
  }

  if (!trade.t1_hit && ltp >= trade.t1) {
    await executeBucketSell(supabase, trade, trade.t1, 'T1');
    // SL moves to initial_sl (no trail)
    return;
  }

  if (trade.t1_hit && !trade.t2_hit && ltp >= trade.t2) {
    await executeBucketSell(supabase, trade, trade.t2, 'T2');
    return;
  }

  if (trade.t2_hit && !trade.t3_hit && ltp >= trade.t3) {
    await executeBucketSell(supabase, trade, trade.t3, 'T3');
    return;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SINGLE_SCALPER (1 bucket — all-or-nothing)
//   T1 → trail SL to entry (breakeven lock-in)
//   T2 → trail SL to T1
//   T3 → exit ALL lots at T3, cancel SL order
//   SL → exit all at market
// ═══════════════════════════════════════════════════════════════════
export async function handleSingleScalper(
  supabase: SupabaseClient,
  trade: TradeNode,
  ltp: number,
) {
  await updateTrade(supabase, trade.id, { ltp });

  if (ltp <= trade.sl) {
    await closeTrade(supabase, trade, ltp, 'SL_HIT');
    return;
  }

  if (!trade.t1_hit && ltp >= trade.t1) {
    await updateTrade(supabase, trade.id, { t1_hit: true, sl: trade.entry_price });
    return;
  }

  if (trade.t1_hit && !trade.t2_hit && ltp >= trade.t2) {
    await updateTrade(supabase, trade.id, { t2_hit: true, sl: trade.t1 });
    return;
  }

  // T3 — cancel SL order + sell ALL lots at once (guard: t1 must be hit)
  if (trade.t1_hit && trade.t2_hit && !trade.t3_hit && ltp >= trade.t3) {
    await cancelSlOrder(supabase, trade);

    if (trade.mode === 'LIVE' && trade.broker_account_id) {
      const creds = await getBrokerCreds(supabase, trade.broker_account_id);
      if (creds) {
        await placeOrder(creds, {
          tradingSymbol: trade.trading_symbol,
          securityId: trade.security_id ?? '',
          exchange: trade.exchange,
          transactionType: 'SELL',
          orderType: 'LIMIT',
          quantity: trade.remaining_quantity,
          price: trade.t3,
          correlationId: `${trade.id}-T3-ALL`,
        });
      }
    }

    const finalPnl = Math.round(
      ((trade.booked_pnl ?? 0) + (trade.t3 - trade.entry_price) * trade.remaining_quantity) * 100,
    ) / 100;

    await updateTrade(supabase, trade.id, {
      t3_hit: true,
      remaining_buckets: 0,
      remaining_quantity: 0,
      ltp: trade.t3,
      booked_pnl: finalPnl,
      status: 'CLOSED',
      exit_price: trade.t3,
      realised_pnl: finalPnl,
      closed_at: new Date().toISOString(),
      sl_order_id: null,
    });
    logger.info('SINGLE_SCALPER T3 — all lots exited', { id: trade.id, finalPnl });
    return;
  }
}
