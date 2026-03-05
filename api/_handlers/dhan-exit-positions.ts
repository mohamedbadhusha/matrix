import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, DHAN_BASE } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId } = req.body ?? {};
  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });

  const { data: broker, error } = await supabase
    .from('broker_accounts')
    .select('access_token, api_key, client_id, user_id')
    .eq('id', brokerId)
    .single();

  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });

  try {
    const dhanRes = await fetch(`${DHAN_BASE}/positions`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'access-token': broker.access_token ?? broker.api_key,
        'client-id': broker.client_id,
      },
    });

    if (!dhanRes.ok) {
      const body = await dhanRes.json().catch(() => ({}));
      return res.status(dhanRes.status).json({ error: (body as { errorMessage?: string }).errorMessage ?? 'Exit all positions failed' });
    }

    const data = await dhanRes.json() as { status?: string; message?: string };

    // Clear cached positions for this broker on success
    if (data.status === 'SUCCESS' || dhanRes.ok) {
      await supabase.from('dhan_positions').delete().eq('broker_account_id', brokerId);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
