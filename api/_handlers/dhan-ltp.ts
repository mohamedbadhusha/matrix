import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase, type BrokerRow } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId, securityIds } = req.body ?? {};

  if (!brokerId || !securityIds?.length) {
    return res.status(400).json({ error: 'brokerId and securityIds required' });
  }

  const { data: broker, error } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, api_key, mode, user_id, health_status')
    .eq('id', brokerId)
    .single();

  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });
  const dhanBase = getDhanBase(broker as BrokerRow);

  try {
    const dhanRes = await fetch(`${dhanBase}/marketfeed/ltp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-token': broker.access_token ?? broker.api_key,
      },
      body: JSON.stringify({
        NSE_FNO: securityIds,
      }),
    });

    if (!dhanRes.ok) {
      const body = await dhanRes.json().catch(() => ({}));
      return res.status(dhanRes.status).json({ error: body.errorMessage ?? 'LTP fetch failed' });
    }

    const data = await dhanRes.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
