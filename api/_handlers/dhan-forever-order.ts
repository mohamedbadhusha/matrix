/**
 * POST /api/dhan-forever-order
 * Creates a new Forever Order via Dhan POST /v2/forever/orders.
 * Supports both SINGLE (GTT) and OCO (one-cancels-other) modes.
 * Saves entry to dhan_forever_orders table.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase } from '../_lib/supabase-admin.js';

interface PlaceForeverBody {
  brokerId: string;
  orderFlag: 'SINGLE' | 'OCO';
  transactionType: 'BUY' | 'SELL';
  exchangeSegment: string;
  productType: string;
  orderType: 'LIMIT' | 'MARKET';
  validity?: string;
  securityId: string;
  tradingSymbol?: string;
  quantity: number;
  price: number;
  triggerPrice: number;
  disclosedQuantity?: number;
  correlationId?: string;
  // OCO
  price1?: number;
  triggerPrice1?: number;
  quantity1?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = (req.body ?? {}) as PlaceForeverBody;
  const {
    brokerId,
    orderFlag,
    transactionType,
    exchangeSegment,
    productType,
    orderType,
    validity = 'DAY',
    securityId,
    tradingSymbol,
    quantity,
    price,
    triggerPrice,
    disclosedQuantity,
    correlationId,
    price1,
    triggerPrice1,
    quantity1,
  } = body;

  if (!brokerId)        return res.status(400).json({ error: 'brokerId required' });
  if (!securityId)      return res.status(400).json({ error: 'securityId required' });
  if (!orderFlag)       return res.status(400).json({ error: 'orderFlag required' });
  if (!transactionType) return res.status(400).json({ error: 'transactionType required' });

  if (orderFlag === 'OCO' && (price1 == null || triggerPrice1 == null || quantity1 == null)) {
    return res.status(400).json({ error: 'price1, triggerPrice1, quantity1 required for OCO order' });
  }

  const { data: broker, error: bErr } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, user_id')
    .eq('id', brokerId)
    .single();

  if (bErr || !broker) return res.status(404).json({ error: 'Broker account not found' });
  const dhanBase = getDhanBase(broker);
  if (!broker.access_token) return res.status(400).json({ error: 'No access token configured' });

  const payload: Record<string, unknown> = {
    dhanClientId:      broker.client_id,
    correlationId:     correlationId ?? '',
    orderFlag,
    transactionType,
    exchangeSegment,
    productType,
    orderType,
    validity,
    securityId,
    quantity,
    price,
    triggerPrice,
  };

  if (disclosedQuantity != null) payload.disclosedQuantity = disclosedQuantity;
  if (orderFlag === 'OCO') {
    payload.price1        = price1;
    payload.triggerPrice1 = triggerPrice1;
    payload.quantity1     = quantity1;
  }

  try {
    const dhanRes = await fetch(`${dhanBase}/forever/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-token': broker.access_token as string,
      },
      body: JSON.stringify(payload),
    });

    const data = await dhanRes.json() as { orderId?: string; orderStatus?: string; errorMessage?: string };

    if (!dhanRes.ok) {
      return res.status(dhanRes.status).json({ error: data.errorMessage ?? 'Dhan API error', raw: data });
    }

    await supabase.from('dhan_forever_orders').insert({
      user_id:           broker.user_id,
      broker_account_id: broker.id,
      dhan_client_id:    broker.client_id as string,
      order_id:          data.orderId ?? null,
      order_flag:        orderFlag,
      correlation_id:    correlationId ?? null,
      transaction_type:  transactionType,
      exchange_segment:  exchangeSegment,
      product_type:      productType,
      order_type:        orderType,
      security_id:       securityId,
      trading_symbol:    tradingSymbol ?? null,
      quantity,
      price,
      trigger_price:     triggerPrice,
      disclosed_quantity: disclosedQuantity ?? 0,
      price1:            price1 ?? null,
      trigger_price1:    triggerPrice1 ?? null,
      quantity1:         quantity1 ?? null,
      order_status:      data.orderStatus ?? 'TRANSIT',
      raw_response:      data,
    });

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
