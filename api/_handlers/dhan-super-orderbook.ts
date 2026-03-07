/**
 * GET /api/dhan-super-orderbook?brokerId=
 * Retrieves all super orders for the day via Dhan GET /v2/super/orders.
 * Upserts results into dhan_super_orders (with legDetails as JSON).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase } from '../_lib/supabase-admin.js';

interface DhanSuperOrderRaw {
  dhanClientId: string;
  orderId: string;
  correlationId?: string;
  orderStatus: string;
  transactionType: string;
  exchangeSegment: string;
  productType: string;
  orderType: string;
  validity: string;
  tradingSymbol: string;
  securityId: string;
  quantity: number;
  remainingQuantity: number;
  ltp: number;
  price: number;
  afterMarketOrder: boolean;
  legName: string;
  exchangeOrderId: string;
  createTime: string;
  updateTime: string;
  exchangeTime: string;
  omsErrorDescription: string;
  averageTradedPrice: number;
  filledQty: number;
  legDetails: unknown[];
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
    const dhanRes = await fetch(`${dhanBase}/super/orders`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'access-token': broker.access_token as string,
      },
    });

    if (!dhanRes.ok) {
      // Dhan returns 404 when no super orders exist for the day — treat as empty
      if (dhanRes.status === 404) return res.status(200).json([]);
      const err = await dhanRes.json() as { errorMessage?: string };
      return res.status(dhanRes.status).json({ error: err.errorMessage ?? 'Dhan API error' });
    }

    const orders = await dhanRes.json() as DhanSuperOrderRaw[];

    if (Array.isArray(orders) && orders.length > 0) {
      const rows = orders.map((o) => ({
        user_id:            broker.user_id,
        broker_account_id:  broker.id,
        dhan_client_id:     o.dhanClientId,
        order_id:           o.orderId,
        correlation_id:     o.correlationId ?? null,
        order_status:       o.orderStatus,
        transaction_type:   o.transactionType,
        exchange_segment:   o.exchangeSegment,
        product_type:       o.productType,
        order_type:         o.orderType,
        validity:           o.validity,
        trading_symbol:     o.tradingSymbol ?? null,
        security_id:        o.securityId,
        quantity:           o.quantity,
        remaining_quantity: o.remainingQuantity,
        ltp:                o.ltp,
        price:              o.price,
        after_market_order: o.afterMarketOrder ?? false,
        leg_name:           o.legName ?? null,
        exchange_order_id:  o.exchangeOrderId ?? null,
        oms_error_desc:     o.omsErrorDescription ?? null,
        average_traded_price: o.averageTradedPrice ?? 0,
        filled_qty:         o.filledQty ?? 0,
        dhan_create_time:   o.createTime ?? null,
        dhan_update_time:   o.updateTime ?? null,
        dhan_exchange_time: o.exchangeTime ?? null,
        leg_details:        o.legDetails ?? [],
        raw_response:       o,
        updated_at:         new Date().toISOString(),
      }));

      await supabase
        .from('dhan_super_orders')
        .upsert(rows, { onConflict: 'user_id,order_id', ignoreDuplicates: false });
    }

    return res.status(200).json(orders);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
