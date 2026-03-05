/**
 * GET /api/dhan-profile?brokerId=xxx
 * Calls Dhan GET /v2/profile to verify token validity and fetch account details.
 * Also updates health_status and last_checked_at in broker_accounts.
 *
 * Response: Dhan profile object + matrixPro health fields
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId } = req.query;
  if (!brokerId) return res.status(400).json({ error: 'brokerId query param required' });

  const { data: broker, error: bErr } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, failure_count, token_expires_at')
    .eq('id', brokerId as string)
    .single();

  if (bErr || !broker) return res.status(404).json({ error: 'Broker account not found' });
  const dhanBase = getDhanBase(broker);
  if (!broker.access_token) return res.status(400).json({ error: 'No access token configured' });

  // Check if token is expired before making the call
  if (broker.token_expires_at) {
    const expiresAt = new Date(broker.token_expires_at);
    if (expiresAt < new Date()) {
      await supabase
        .from('broker_accounts')
        .update({ health_status: 'ERROR', last_checked_at: new Date().toISOString() })
        .eq('id', brokerId as string);
      return res.status(401).json({ error: 'Access token expired. Please renew.' });
    }
  }

  try {
    const dhanRes = await fetch(`${dhanBase}/profile`, {
      method: 'GET',
      headers: { 'access-token': broker.access_token },
    });

    const data = await dhanRes.json() as {
      dhanClientId?: string;
      tokenValidity?: string;
      activeSegment?: string;
      ddpi?: string;
      mtf?: string;
      dataPlan?: string;
      dataValidity?: string;
      errorMessage?: string;
    };

    if (!dhanRes.ok) {
      await supabase
        .from('broker_accounts')
        .update({
          health_status: 'ERROR',
          failure_count: broker.failure_count + 1,
          last_checked_at: new Date().toISOString(),
        })
        .eq('id', brokerId as string);

      return res.status(dhanRes.status).json({
        error: data.errorMessage ?? 'Profile fetch failed',
        raw: data,
      });
    }

    // Update health status
    await supabase
      .from('broker_accounts')
      .update({
        health_status: 'OK',
        failure_count: 0,
        last_checked_at: new Date().toISOString(),
      })
      .eq('id', brokerId as string);

    return res.status(200).json({
      ...data,
      tokenExpiresAt: broker.token_expires_at,
    });
  } catch (e) {
    console.error('dhan-profile error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
