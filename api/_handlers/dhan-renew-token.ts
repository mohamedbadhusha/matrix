/**
 * POST /api/dhan-renew-token
 * Renews an active (not yet expired) Dhan access token for 24 more hours.
 * Only works for tokens generated from Dhan Web (manual / oauth methods).
 * Called automatically by the worker 30 min before expiry.
 *
 * Body: { brokerId: string }
 * Response: { success: true; expiryTime: string }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId } = req.body ?? {};
  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });

  const { data: broker, error: bErr } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, token_expires_at')
    .eq('id', brokerId)
    .single();

  if (bErr || !broker) return res.status(404).json({ error: 'Broker account not found' });
  const dhanBase = getDhanBase(broker);
  if (!broker.access_token) return res.status(400).json({ error: 'No access token to renew' });

  // Safety: don't try to renew an already-expired token
  if (broker.token_expires_at) {
    const expiresAt = new Date(broker.token_expires_at);
    if (expiresAt < new Date()) {
      return res.status(400).json({
        error: 'Token is already expired. Please re-authenticate via OAuth or generate a new token from Dhan Web.',
      });
    }
  }

  try {
    const dhanRes = await fetch(`${dhanBase}/RenewToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-token': broker.access_token,
        'dhanClientId': broker.client_id,
      },
    });

    const data = await dhanRes.json() as {
      accessToken?: string;
      expiryTime?: string;
      errorMessage?: string;
      errorCode?: string;
    };

    if (!dhanRes.ok || !data.accessToken) {
      await supabase
        .from('broker_accounts')
        .update({ health_status: 'ERROR', failure_count: (broker as any).failure_count + 1 })
        .eq('id', brokerId);

      return res.status(dhanRes.status).json({
        error: data.errorMessage ?? 'Token renewal failed',
        raw: data,
      });
    }

    const expiryTime = data.expiryTime
      ? new Date(data.expiryTime).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await supabase
      .from('broker_accounts')
      .update({
        access_token: data.accessToken,
        token_expires_at: expiryTime,
        health_status: 'OK',
        failure_count: 0,
        last_checked_at: new Date().toISOString(),
      })
      .eq('id', brokerId);

    return res.status(200).json({ success: true, expiryTime });
  } catch (e) {
    console.error('dhan-renew-token error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
