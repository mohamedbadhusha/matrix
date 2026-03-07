/**
 * GET /api/dhan-forever-orderbook?brokerId=
 * Retrieves all Forever Orders via Dhan GET /v2/forever/all.
 * Upserts results into dhan_forever_orders table.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase } from '../_lib/supabase-admin.js';

interface DhanForeverOrderRaw {
  dhanClientId: string;
  orderId: string;
  orderStatus: string;
  transactionType: string;
  exchangeSegment: string;
  productType: string;
  orderType: string;
  tradingSymbol?: string;
  securityId: string;
  quantity: number;
  price: number;
  triggerPrice: number;
  legName: string;
  createTime: string;
  updateTime: string | null;
  exchangeTime: string | null;
  drvExpiryDate: string | null;
  drvOptionType: string | null;
  drvStrikePrice: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const brokerId = req.query.brokerId as string | undefined;
  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });

  const { data: broker, error: bErr } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, api_key, mode, user_id, health_status')
    .eq('id', brokerId)
    .single();

  if (bErr || !broker) return res.status(404).json({ error: 'Broker account not found' });
  const dhanBase = getDhanBase(broker);
  if (!broker.access_token) return res.status(400).json({ error: 'No access token configured' });

  try {
    const dhanRes = await fetch(`${dhanBase}/forever/all`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'access-token': broker.access_token as string,
      },
    });

    if (!dhanRes.ok) {
      // Dhan returns 404 when no forever orders exist — treat as empty
      if (dhanRes.status === 404) return res.status(200).json([]);
      const err = await dhanRes.json() as { errorMessage?: string };
      return res.status(dhanRes.status).json({ error: err.errorMessage ?? 'Dhan API error' });
    }

    const orders = await dhanRes.json() as DhanForeverOrderRaw[];

    if (Array.isArray(orders) && orders.length > 0) {
      const rows = orders.map((o) => ({
        user_id:            broker.user_id,
        broker_account_id:  broker.id,
        dhan_client_id:     o.dhanClientId,
        order_id:           o.orderId,
        order_status:       o.orderStatus,
        transaction_type:   o.transactionType,
        exchange_segment:   o.exchangeSegment,
        product_type:       o.productType,
        order_type:         o.orderType,
        trading_symbol:     o.tradingSymbol ?? null,
        security_id:        o.securityId,
        quantity:           o.quantity,
        price:              o.price,
        trigger_price:      o.triggerPrice,
        leg_name:           o.legName ?? null,
        dhan_create_time:   o.createTime ?? null,
        dhan_update_time:   o.updateTime ?? null,
        dhan_exchange_time: o.exchangeTime ?? null,
        drv_expiry_date:    o.drvExpiryDate ?? null,
        drv_option_type:    o.drvOptionType ?? null,
        drv_strike_price:   o.drvStrikePrice ?? 0,
        raw_response:       o,
        updated_at:         new Date().toISOString(),
      }));

      await supabase
        .from('dhan_forever_orders')
        .upsert(rows, { onConflict: 'user_id,order_id', ignoreDuplicates: false });
    }

    return res.status(200).json(orders);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
