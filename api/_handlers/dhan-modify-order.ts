/**
 * PUT /api/dhan-modify-order
 * Modifies a pending order via Dhan PUT /v2/orders/{order-id}.
 * Updates the record in dhan_orders.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, DHAN_BASE } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const {
    brokerId,
    orderId,
    orderType,
    legName,
    quantity,
    price,
    disclosedQuantity,
    triggerPrice,
    validity = 'DAY',
  } = (req.body ?? {}) as {
    brokerId: string;
    orderId: string;
    orderType: string;
    legName?: string;
    quantity?: number;
    price?: number;
    disclosedQuantity?: number;
    triggerPrice?: number;
    validity?: string;
  };

  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });
  if (!orderId)  return res.status(400).json({ error: 'orderId required' });
  if (!orderType) return res.status(400).json({ error: 'orderType required' });

  const { data: broker, error: bErr } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, user_id')
    .eq('id', brokerId)
    .single();

  if (bErr || !broker) return res.status(404).json({ error: 'Broker account not found' });
  if (!broker.access_token) return res.status(400).json({ error: 'No access token configured' });

  const payload: Record<string, unknown> = {
    dhanClientId:      broker.client_id,
    orderId:           orderId,
    orderType:         orderType,
    legName:           legName ?? '',
    quantity:          quantity != null ? String(quantity) : '',
    price:             price != null ? String(price) : '',
    disclosedQuantity: disclosedQuantity != null ? String(disclosedQuantity) : '',
    triggerPrice:      triggerPrice != null ? String(triggerPrice) : '',
    validity:          validity,
  };

  try {
    const dhanRes = await fetch(`${DHAN_BASE}/orders/${orderId}`, {
      method: 'PUT',
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

    // Update local record
    await supabase
      .from('dhan_orders')
      .update({
        order_status:  data.orderStatus ?? null,
        order_type:    orderType,
        quantity:      quantity ?? undefined,
        price:         price ?? undefined,
        trigger_price: triggerPrice ?? undefined,
        validity:      validity,
        raw_response:  data,
      })
      .eq('order_id', orderId)
      .eq('user_id', broker.user_id as string);

    return res.status(200).json({ orderId: data.orderId, orderStatus: data.orderStatus });
  } catch (e) {
    console.error('dhan-modify-order error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
