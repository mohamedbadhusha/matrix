/**
 * PUT /api/dhan-modify-forever-order
 * Modifies an existing Forever Order via Dhan PUT /v2/forever/orders/{order-id}.
 * Fields modifiable: price, quantity, orderType, disclosedQuantity, triggerPrice, validity.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, DHAN_BASE } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const {
    brokerId,
    orderId,
    orderFlag,
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
    orderFlag: 'SINGLE' | 'OCO';
    orderType: string;
    legName: 'TARGET_LEG' | 'STOP_LOSS_LEG';
    quantity: number;
    price: number;
    disclosedQuantity?: number;
    triggerPrice: number;
    validity?: string;
  };

  if (!brokerId)  return res.status(400).json({ error: 'brokerId required' });
  if (!orderId)   return res.status(400).json({ error: 'orderId required' });
  if (!orderFlag) return res.status(400).json({ error: 'orderFlag required' });
  if (!legName)   return res.status(400).json({ error: 'legName required' });

  const { data: broker, error: bErr } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, user_id')
    .eq('id', brokerId)
    .single();

  if (bErr || !broker) return res.status(404).json({ error: 'Broker account not found' });
  if (!broker.access_token) return res.status(400).json({ error: 'No access token configured' });

  const payload: Record<string, unknown> = {
    dhanClientId:      broker.client_id,
    orderId,
    orderFlag,
    orderType,
    legName,
    quantity,
    price,
    triggerPrice,
    validity,
  };

  if (disclosedQuantity != null) payload.disclosedQuantity = disclosedQuantity;

  try {
    const dhanRes = await fetch(`${DHAN_BASE}/forever/orders/${orderId}`, {
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

    await supabase
      .from('dhan_forever_orders')
      .update({
        order_status:    data.orderStatus,
        price,
        trigger_price:   triggerPrice,
        quantity,
        updated_at:      new Date().toISOString(),
      })
      .eq('order_id', orderId)
      .eq('user_id', broker.user_id as string);

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
