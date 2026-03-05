/**
 * POST /api/dhan-consume-consent
 * Step 3 of Dhan OAuth flow.
 * Exchanges tokenId (from browser redirect) for a real access token,
 * then persists it to broker_accounts.
 *
 * Body: { brokerId: string; tokenId: string }
 * Response: { success: true; expiryTime: string }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase } from '../_lib/supabase-admin.js';

const DHAN_AUTH = 'https://auth.dhan.co';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId, tokenId } = req.body ?? {};
  if (!brokerId || !tokenId) return res.status(400).json({ error: 'brokerId and tokenId are required' });

  // Fetch broker credentials
  const { data: broker, error: bErr } = await supabase
    .from('broker_accounts')
    .select('id, api_key, app_secret, auth_method')
    .eq('id', brokerId)
    .single();

  if (bErr || !broker) return res.status(404).json({ error: 'Broker account not found' });
  if (!broker.api_key || !broker.app_secret) return res.status(400).json({ error: 'api_key and app_secret missing on broker account' });

  try {
    const dhanRes = await fetch(
      `${DHAN_AUTH}/app/consumeApp-consent?tokenId=${encodeURIComponent(tokenId)}`,
      {
        method: 'GET',
        headers: {
          'app_id': broker.api_key,
          'app_secret': broker.app_secret,
        },
      },
    );

    const data = await dhanRes.json() as {
      accessToken?: string;
      expiryTime?: string;
      dhanClientId?: string;
      dhanClientName?: string;
      givenPowerOfAttorney?: boolean;
      errorMessage?: string;
    };

    if (!dhanRes.ok || !data.accessToken) {
      return res.status(dhanRes.status).json({
        error: data.errorMessage ?? 'Failed to consume consent',
        raw: data,
      });
    }

    // Parse expiry time — Dhan returns ISO string in IST, convert to UTC
    const expiryTime = data.expiryTime
      ? new Date(data.expiryTime).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Persist access token + expiry
    const { error: updateErr } = await supabase
      .from('broker_accounts')
      .update({
        access_token: data.accessToken,
        token_expires_at: expiryTime,
        health_status: 'OK',
        failure_count: 0,
        last_checked_at: new Date().toISOString(),
        // Store dhanClientId if returned (cross-check with client_id)
        ...(data.dhanClientId ? { client_id: data.dhanClientId } : {}),
      })
      .eq('id', brokerId);

    if (updateErr) {
      return res.status(500).json({ error: 'Failed to save access token', detail: updateErr.message });
    }

    return res.status(200).json({
      success: true,
      expiryTime,
      dhanClientName: data.dhanClientName,
      givenPowerOfAttorney: data.givenPowerOfAttorney,
    });
  } catch (e) {
    console.error('dhan-consume-consent error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
