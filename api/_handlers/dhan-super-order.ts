/**
 * POST /api/dhan-super-order
 * Places a new Super Order via Dhan POST /v2/super/orders.
 * Saves entry to dhan_super_orders table.
 * Requires: IP whitelisting on the Dhan dashboard.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase } from '../_lib/supabase-admin.js';

interface PlaceSuperOrderBody {
  brokerId: string;
  transactionType: 'BUY' | 'SELL';
  exchangeSegment: string;
  productType: string;
  orderType: 'LIMIT' | 'MARKET';
  securityId: string;
  tradingSymbol?: string;
  quantity: number;
  price: number;
  targetPrice: number;
  stopLossPrice: number;
  trailingJump: number;
  correlationId?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = (req.body ?? {}) as PlaceSuperOrderBody;
  const {
    brokerId,
    transactionType,
    exchangeSegment,
    productType,
    orderType,
    securityId,
    tradingSymbol,
    quantity,
    price,
    targetPrice,
    stopLossPrice,
    trailingJump,
    correlationId,
  } = body;

  if (!brokerId)       return res.status(400).json({ error: 'brokerId required' });
  if (!securityId)     return res.status(400).json({ error: 'securityId required' });
  if (!transactionType) return res.status(400).json({ error: 'transactionType required' });
  if (quantity < 1)    return res.status(400).json({ error: 'quantity must be >= 1' });

  const { data: broker, error: bErr } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, user_id')
    .eq('id', brokerId)
    .single();

  if (bErr || !broker) return res.status(404).json({ error: 'Broker account not found' });
  const dhanBase = getDhanBase(broker);
  if (!broker.access_token) return res.status(400).json({ error: 'No access token configured' });

  const payload = {
    dhanClientId:    broker.client_id,
    correlationId:   correlationId ?? '',
    transactionType,
    exchangeSegment,
    productType,
    orderType,
    securityId,
    quantity,
    price,
    targetPrice,
    stopLossPrice,
    trailingJump,
  };

  try {
    const dhanRes = await fetch(`${dhanBase}/super/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-token': broker.access_token as string,
      },
      body: JSON.stringify(payload),
    });

    const data = await dhanRes.json() as {
      orderId?: string;
      orderStatus?: string;
      errorMessage?: string;
    };

    if (!dhanRes.ok) {
      return res.status(dhanRes.status).json({ error: data.errorMessage ?? 'Dhan API error', raw: data });
    }

    // Persist to dhan_super_orders
    await supabase.from('dhan_super_orders').insert({
      user_id:           broker.user_id,
      broker_account_id: broker.id,
      dhan_client_id:    broker.client_id as string,
      order_id:          data.orderId ?? null,
      correlation_id:    correlationId ?? null,
      transaction_type:  transactionType,
      exchange_segment:  exchangeSegment,
      product_type:      productType,
      order_type:        orderType,
      security_id:       securityId,
      trading_symbol:    tradingSymbol ?? null,
      quantity,
      price,
      target_price:      targetPrice,
      stop_loss_price:   stopLossPrice,
      trailing_jump:     trailingJump,
      order_status:      data.orderStatus ?? 'TRANSIT',
      raw_response:      data,
    });

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
