import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase, type BrokerRow } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId, condition, orders } = req.body ?? {};
  if (!brokerId || !condition || !orders) {
    return res.status(400).json({ error: 'brokerId, condition and orders required' });
  }

  const { data: broker, error } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, api_key, mode, user_id, health_status')
    .eq('id', brokerId)
    .single();

  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });
  const dhanBase = getDhanBase(broker as BrokerRow);

  try {
    const dhanRes = await fetch(`${dhanBase}/alerts/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'access-token': broker.access_token ?? broker.api_key,
        'client-id': broker.client_id,
      },
      body: JSON.stringify({ dhanClientId: broker.client_id, condition, orders }),
    });

    const data = await dhanRes.json() as { alertId?: string; alertStatus?: string; errorMessage?: string };
    if (!dhanRes.ok) return res.status(dhanRes.status).json({ error: data.errorMessage ?? 'Place conditional trigger failed' });

    // Persist to DB
    await supabase.from('dhan_conditional_triggers').insert({
      user_id: broker.user_id,
      broker_account_id: brokerId,
      dhan_client_id: broker.client_id,
      alert_id: data.alertId,
      alert_status: data.alertStatus ?? 'ACTIVE',
      condition,
      orders,
    });

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
