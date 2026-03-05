/**
 * dhan-option-chain.ts
 * POST /v2/optionchain — Real-time option chain for an underlying + expiry.
 * Rate limit: 1 unique request per 3 seconds (Dhan side).
 * Pass-through: no DB storage (pure real-time data).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, DHAN_BASE } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId, UnderlyingScrip, UnderlyingSeg, Expiry } = req.body as {
    brokerId: string;
    UnderlyingScrip: number;
    UnderlyingSeg: string;
    Expiry: string;
  };

  if (!brokerId)        return res.status(400).json({ error: 'brokerId required' });
  if (!UnderlyingScrip) return res.status(400).json({ error: 'UnderlyingScrip required' });
  if (!UnderlyingSeg)   return res.status(400).json({ error: 'UnderlyingSeg required' });
  if (!Expiry)          return res.status(400).json({ error: 'Expiry required (YYYY-MM-DD)' });

  const { data: broker, error } = await supabase
    .from('broker_accounts')
    .select('access_token, api_key, client_id')
    .eq('id', brokerId)
    .single();

  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });

  try {
    const dhanRes = await fetch(`${DHAN_BASE}/optionchain`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'access-token':  broker.access_token ?? broker.api_key,
        'client-id':     broker.client_id,
      },
      body: JSON.stringify({ UnderlyingScrip, UnderlyingSeg, Expiry }),
    });

    if (!dhanRes.ok) {
      const body = await dhanRes.json().catch(() => ({}));
      return res.status(dhanRes.status).json({
        error: (body as { errorMessage?: string }).errorMessage ?? 'Option chain fetch failed',
      });
    }

    const data = await dhanRes.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
