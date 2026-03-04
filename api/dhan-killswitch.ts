/**
 * POST /api/dhan-killswitch   { brokerId, action: 'ACTIVATE' | 'DEACTIVATE' }
 * GET  /api/dhan-killswitch?brokerId=xxx
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
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const brokerId = req.method === 'GET'
    ? (req.query as Record<string, string>).brokerId
    : req.body?.brokerId;

  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });

  const { data: broker, error } = await supabase
    .from('broker_accounts')
    .select('access_token, api_key, client_id')
    .eq('id', brokerId)
    .single();

  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });

  try {
    if (req.method === 'GET') {
      const dhanRes = await fetch(`${DHAN_BASE}/killswitch`, {
        headers: {
          'Accept': 'application/json',
          'access-token': broker.access_token ?? broker.api_key,
          'client-id': broker.client_id,
        },
      });
      const data = await dhanRes.json() as { dhanClientId?: string; killSwitchStatus?: string; errorMessage?: string };
      if (!dhanRes.ok) return res.status(dhanRes.status).json({ error: data.errorMessage ?? 'Kill switch status failed' });
      return res.status(200).json(data);
    }

    // POST — activate or deactivate
    const action: string = req.body?.action ?? 'ACTIVATE';
    if (action !== 'ACTIVATE' && action !== 'DEACTIVATE') {
      return res.status(400).json({ error: 'action must be ACTIVATE or DEACTIVATE' });
    }

    const dhanRes = await fetch(`${DHAN_BASE}/killswitch?killSwitchStatus=${action}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'access-token': broker.access_token ?? broker.api_key,
        'client-id': broker.client_id,
      },
    });

    const data = await dhanRes.json() as { dhanClientId?: string; killSwitchStatus?: string; errorMessage?: string };
    if (!dhanRes.ok) return res.status(dhanRes.status).json({ error: data.errorMessage ?? 'Kill switch action failed' });

    // Update broker health record
    if (action === 'ACTIVATE') {
      await supabase.from('broker_accounts').update({ health_status: 'KILL_SWITCH' }).eq('id', brokerId);
    } else {
      await supabase.from('broker_accounts').update({ health_status: 'OK' }).eq('id', brokerId);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
