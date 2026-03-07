/**
 * DELETE /api/dhan-cancel-forever-order
 * Cancels a pending Forever Order via Dhan DELETE /v2/forever/orders/{order-id}.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId, orderId } = (req.body ?? {}) as { brokerId: string; orderId: string };

  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });
  if (!orderId)  return res.status(400).json({ error: 'orderId required' });

  const { data: broker, error: bErr } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, api_key, mode, user_id, health_status')
    .eq('id', brokerId)
    .single();

  if (bErr || !broker) return res.status(404).json({ error: 'Broker account not found' });
  const dhanBase = getDhanBase(broker);
  if (!broker.access_token) return res.status(400).json({ error: 'No access token configured' });

  try {
    const dhanRes = await fetch(`${dhanBase}/forever/orders/${orderId}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'access-token': broker.access_token as string,
      },
    });

    // Dhan returns 200 with JSON on success
    let data: { orderId?: string; orderStatus?: string; errorMessage?: string } = { orderId, orderStatus: 'CANCELLED' };
    try { data = await dhanRes.json() as typeof data; } catch { /* no body */ }

    if (!dhanRes.ok) {
      return res.status(dhanRes.status).json({ error: data.errorMessage ?? 'Dhan API error', raw: data });
    }

    await supabase
      .from('dhan_forever_orders')
      .update({ order_status: 'CANCELLED', updated_at: new Date().toISOString() })
      .eq('order_id', orderId)
      .eq('user_id', broker.user_id as string);

    return res.status(200).json({ orderId, orderStatus: data.orderStatus ?? 'CANCELLED' });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
