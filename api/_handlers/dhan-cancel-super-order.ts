/**
 * DELETE /api/dhan-cancel-super-order
 * Cancels a super order leg via Dhan DELETE /v2/super/orders/{order-id}/{order-leg}.
 * Cancelling ENTRY_LEG cancels all legs.
 * Note: once TARGET_LEG or STOP_LOSS_LEG is cancelled, it cannot be re-added.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const {
    brokerId,
    orderId,
    legName = 'ENTRY_LEG',
  } = (req.body ?? {}) as {
    brokerId: string;
    orderId: string;
    legName?: 'ENTRY_LEG' | 'TARGET_LEG' | 'STOP_LOSS_LEG';
  };

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
    const dhanRes = await fetch(`${dhanBase}/super/orders/${orderId}/${legName}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'access-token': broker.access_token as string,
      },
    });

    // 202 Accepted = success (no body), 200 with JSON
    if (!dhanRes.ok && dhanRes.status !== 202) {
      let errData: Record<string, unknown> = {};
      try { errData = await dhanRes.json() as Record<string, unknown>; } catch { /* empty */ }
      return res.status(dhanRes.status).json({ error: (errData.errorMessage as string) ?? 'Dhan API error', raw: errData });
    }

    let data: { orderId?: string; orderStatus?: string } = { orderId, orderStatus: 'CANCELLED' };
    try { data = await dhanRes.json() as typeof data; } catch { /* 202 no body */ }

    const newStatus = legName === 'ENTRY_LEG' ? 'CANCELLED' : data.orderStatus ?? 'CANCELLED';

    await supabase
      .from('dhan_super_orders')
      .update({ order_status: newStatus, updated_at: new Date().toISOString() })
      .eq('order_id', orderId)
      .eq('user_id', broker.user_id as string);

    return res.status(200).json({ orderId, orderStatus: newStatus, legCancelled: legName });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
