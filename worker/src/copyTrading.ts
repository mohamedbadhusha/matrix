import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

function calcFollowerLots(adminLots: number, multiplier: number): number {
  const raw = adminLots * multiplier;
  const rounded = Math.round(raw * 4) / 4; // nearest 0.25
  return Math.max(1, Math.floor(rounded));
}

/**
 * When a master signal trade is inserted by admin,
 * this creates copy trades for all active followers.
 */
export async function createCopyTrades(
  supabase: SupabaseClient,
  masterTrade: Record<string, any>,
) {
  if (!masterTrade.is_master_signal) return;

  logger.info('Creating copy trades for master signal', { tradeId: masterTrade.id });

  // Fetch all active copy subscriptions for this leader
  const { data: subs, error } = await supabase
    .from('copy_subscriptions')
    .select('follower_id, lot_multiplier')
    .eq('leader_id', masterTrade.user_id)
    .eq('is_active', true);

  if (error || !subs?.length) {
    logger.info('No active followers for this leader', { leaderId: masterTrade.user_id });
    return;
  }

  logger.info(`Copying to ${subs.length} followers`);

  for (const sub of subs) {
    try {
      // Check follower's daily trade limit
      const { data: follower } = await supabase
        .from('profiles')
        .select('tier, daily_trades_used, is_active')
        .eq('id', sub.follower_id)
        .single();

      if (!follower?.is_active) continue;

      const DAILY_LIMITS: Record<string, number> = { free: 3, pro: 15, elite: Infinity };
      const limit = DAILY_LIMITS[follower.tier] ?? 3;
      if (follower.daily_trades_used >= limit) {
        logger.warn('Follower daily limit reached, skipping copy', { followerId: sub.follower_id });
        continue;
      }

      // Fetch follower broker
      const { data: broker } = await supabase
        .from('broker_accounts')
        .select('id')
        .eq('user_id', sub.follower_id)
        .eq('is_active', true)
        .eq('health_status', 'OK')
        .limit(1)
        .single();

      const followerLots = calcFollowerLots(masterTrade.lots, sub.lot_multiplier);
      const lotSize = masterTrade.lot_size;

      const { error: insertErr } = await supabase.from('trade_nodes').insert({
        user_id: sub.follower_id,
        broker_account_id: broker?.id ?? null,
        symbol: masterTrade.symbol,
        strike: masterTrade.strike,
        trading_symbol: masterTrade.trading_symbol,
        security_id: masterTrade.security_id,
        exchange: masterTrade.exchange,
        protocol: masterTrade.protocol,
        target_mode: masterTrade.target_mode,
        mode: masterTrade.mode,
        entry_price: masterTrade.entry_price,
        sl: masterTrade.sl,
        initial_sl: masterTrade.initial_sl,
        t1: masterTrade.t1,
        t2: masterTrade.t2,
        t3: masterTrade.t3,
        lots: followerLots,
        lot_size: lotSize,
        remaining_quantity: followerLots * lotSize,
        remaining_buckets: masterTrade.remaining_buckets,
        lots_per_bucket: Math.floor(followerLots / masterTrade.remaining_buckets),
        qty_per_bucket: Math.floor((followerLots * lotSize) / masterTrade.remaining_buckets),
        origin: 'COPY',
        parent_trade_id: masterTrade.id,
        ltp_source: masterTrade.ltp_source,
        status: 'ACTIVE',
        booked_pnl: 0,
        is_processing: false,
      });

      if (insertErr) {
        logger.error('Failed to insert copy trade', { followerId: sub.follower_id, err: insertErr.message });
        continue;
      }

      // Increment follower's daily trades used
      await supabase
        .from('profiles')
        .update({ daily_trades_used: follower.daily_trades_used + 1 })
        .eq('id', sub.follower_id);

      logger.info('Copy trade created', { followerId: sub.follower_id, lots: followerLots });
    } catch (e) {
      logger.error('Exception creating copy trade', { followerId: sub.follower_id, e });
    }
  }
}
