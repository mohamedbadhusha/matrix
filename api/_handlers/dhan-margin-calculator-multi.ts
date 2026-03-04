import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DHAN_BASE = process.env.DHAN_BASE_URL ?? 'https://api.dhan.co/v2';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId, includePosition, includeOrders, scripts } = req.body ?? {};
  if (!brokerId || !scripts?.length) return res.status(400).json({ error: 'brokerId and scripts required' });

  const { data: broker, error } = await supabase
    .from('broker_accounts')
    .select('access_token, api_key, client_id')
    .eq('id', brokerId)
    .single();

  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });

  try {
    const dhanRes = await fetch(`${DHAN_BASE}/margincalculator/multi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'access-token': broker.access_token ?? broker.api_key,
        'client-id': broker.client_id,
      },
      body: JSON.stringify({
        dhanClientId: broker.client_id,
        includePosition: includePosition ?? false,
        includeOrders: includeOrders ?? false,
        scripts,
      }),
    });

    if (!dhanRes.ok) {
      const errBody = await dhanRes.json().catch(() => ({}));
      return res.status(dhanRes.status).json({ error: (errBody as { errorMessage?: string }).errorMessage ?? 'Multi margin calculation failed' });
    }

    const data = await dhanRes.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
