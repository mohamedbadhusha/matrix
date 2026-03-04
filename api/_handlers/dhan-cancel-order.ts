/**
 * DELETE /api/dhan-cancel-order
 * Cancels a pending order via Dhan DELETE /v2/orders/{order-id}.
 * Updates order_status to CANCELLED in dhan_orders.
 *
 * Body: { brokerId: string; orderId: string }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DHAN_BASE = process.env.DHAN_BASE_URL ?? 'https://api.dhan.co/v2';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId, orderId } = (req.body ?? {}) as { brokerId: string; orderId: string };

  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });
  if (!orderId)  return res.status(400).json({ error: 'orderId required' });

  const { data: broker, error: bErr } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, user_id')
    .eq('id', brokerId)
    .single();

  if (bErr || !broker) return res.status(404).json({ error: 'Broker account not found' });
  if (!broker.access_token) return res.status(400).json({ error: 'No access token configured' });

  try {
    const dhanRes = await fetch(`${DHAN_BASE}/orders/${orderId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'access-token': broker.access_token as string,
      },
    });

    // Dhan returns 202 Accepted with body on success
    const data = await dhanRes.json().catch(() => ({})) as {
      orderId?: string;
      orderStatus?: string;
      errorMessage?: string;
    };

    if (!dhanRes.ok && dhanRes.status !== 202) {
      return res.status(dhanRes.status).json({ error: data.errorMessage ?? 'Cancel failed', raw: data });
    }

    // Update local record
    await supabase
      .from('dhan_orders')
      .update({ order_status: 'CANCELLED', raw_response: data })
      .eq('order_id', orderId)
      .eq('user_id', broker.user_id as string);

    return res.status(200).json({
      orderId: data.orderId ?? orderId,
      orderStatus: data.orderStatus ?? 'CANCELLED',
    });
  } catch (e) {
    console.error('dhan-cancel-order error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
