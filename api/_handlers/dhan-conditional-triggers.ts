/**
 * GET /api/dhan-conditional-triggers
 *   ?brokerId=xxx            → fetch all
 *   ?brokerId=xxx&alertId=yyy → fetch single
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, DHAN_BASE } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId, alertId } = req.query as Record<string, string>;
  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });

  const { data: broker, error } = await supabase
    .from('broker_accounts')
    .select('access_token, api_key, client_id, user_id')
    .eq('id', brokerId)
    .single();

  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });

  const endpoint = alertId
    ? `${DHAN_BASE}/alerts/orders/${alertId}`
    : `${DHAN_BASE}/alerts/orders`;

  try {
    const dhanRes = await fetch(endpoint, {
      headers: {
        'Accept': 'application/json',
        'access-token': broker.access_token ?? broker.api_key,
        'client-id': broker.client_id,
      },
    });

    const data = await dhanRes.json() as unknown;
    if (!dhanRes.ok) return res.status(dhanRes.status).json({ error: (data as { errorMessage?: string }).errorMessage ?? 'Fetch conditional triggers failed' });

    // Upsert into DB
    const rows = (Array.isArray(data) ? data : [data]) as Array<{
      alertId: string; alertStatus: string; createdTime?: string;
      triggeredTime?: string | null; lastPrice?: string | number;
      condition: object; orders: object[];
    }>;

    await supabase.from('dhan_conditional_triggers').upsert(
      rows.map((r) => ({
        user_id: broker.user_id,
        broker_account_id: brokerId,
        dhan_client_id: broker.client_id,
        alert_id: r.alertId,
        alert_status: r.alertStatus,
        dhan_created_time: r.createdTime ?? null,
        triggered_time: r.triggeredTime ?? null,
        last_price: r.lastPrice ? Number(r.lastPrice) : null,
        condition: r.condition,
        orders: r.orders,
      })),
      { onConflict: 'user_id,alert_id' },
    );

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
