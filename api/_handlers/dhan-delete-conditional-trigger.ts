import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId, alertId } = req.body ?? {};
  if (!brokerId || !alertId) return res.status(400).json({ error: 'brokerId and alertId required' });

  const { data: broker, error } = await supabase
    .from('broker_accounts')
    .select('access_token, api_key, client_id, user_id')
    .eq('id', brokerId)
    .single();

  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });
  const dhanBase = getDhanBase(broker);

  try {
    const dhanRes = await fetch(`${dhanBase}/alerts/orders/${alertId}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'access-token': broker.access_token ?? broker.api_key,
        'client-id': broker.client_id,
      },
    });

    const data = await dhanRes.json() as { alertId?: string; alertStatus?: string; errorMessage?: string };
    if (!dhanRes.ok) return res.status(dhanRes.status).json({ error: data.errorMessage ?? 'Delete conditional trigger failed' });

    await supabase
      .from('dhan_conditional_triggers')
      .update({ alert_status: 'CANCELLED', updated_at: new Date().toISOString() })
      .eq('broker_account_id', brokerId)
      .eq('alert_id', alertId);

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
