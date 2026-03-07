/**
 * dhan-option-chain-expiry.ts
 * POST /v2/optionchain/expirylist — All active expiry dates for an underlying.
 * Pass-through: no DB storage.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, DHAN_LIVE } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId, UnderlyingScrip, UnderlyingSeg } = req.body as {
    brokerId: string;
    UnderlyingScrip: number;
    UnderlyingSeg: string;
  };

  if (!brokerId)        return res.status(400).json({ error: 'brokerId required' });
  if (!UnderlyingScrip) return res.status(400).json({ error: 'UnderlyingScrip required' });
  if (!UnderlyingSeg)   return res.status(400).json({ error: 'UnderlyingSeg required' });

  const { data: broker, error } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, api_key, mode, user_id, health_status')
    .eq('id', brokerId)
    .single();

  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });
  // Always use LIVE endpoint — expiry list is market data, not available in sandbox
  const dhanBase = DHAN_LIVE;

  try {
    const dhanRes = await fetch(`${dhanBase}/optionchain/expirylist`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'access-token':  broker.access_token ?? broker.api_key,
        'client-id':     broker.client_id,
      },
      body: JSON.stringify({ UnderlyingScrip, UnderlyingSeg }),
    });

    if (!dhanRes.ok) {
      const body = await dhanRes.json().catch(() => ({}));
      return res.status(dhanRes.status).json({
        error: (body as { errorMessage?: string }).errorMessage ?? 'Expiry list fetch failed',
      });
    }

    const data = await dhanRes.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
