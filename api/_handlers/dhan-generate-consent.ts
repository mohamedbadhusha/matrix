/**
 * POST /api/dhan-generate-consent
 * Step 1 of Dhan OAuth flow for individual traders.
 * Validates app_id + app_secret and returns a consentAppId.
 *
 * Body: { brokerId: string }   — fetches credentials from broker_accounts
 * Response: { consentAppId: string }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DHAN_AUTH = 'https://auth.dhan.co';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId } = req.body ?? {};
  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });

  // Fetch broker credentials
  const { data: broker, error: bErr } = await supabase
    .from('broker_accounts')
    .select('id, client_id, api_key, app_secret, auth_method')
    .eq('id', brokerId)
    .single();

  if (bErr || !broker) return res.status(404).json({ error: 'Broker account not found' });
  if (broker.auth_method !== 'oauth') return res.status(400).json({ error: 'Broker is not configured for OAuth auth_method' });
  if (!broker.api_key || !broker.app_secret) return res.status(400).json({ error: 'app_id (api_key) and app_secret are required for OAuth' });

  try {
    const dhanRes = await fetch(
      `${DHAN_AUTH}/app/generate-consent?client_id=${broker.client_id}`,
      {
        method: 'POST',
        headers: {
          'app_id': broker.api_key,
          'app_secret': broker.app_secret,
        },
      },
    );

    const data = await dhanRes.json() as {
      consentAppId?: string;
      consentAppStatus?: string;
      status?: string;
      errorMessage?: string;
    };

    if (!dhanRes.ok || !data.consentAppId) {
      return res.status(dhanRes.status).json({
        error: data.errorMessage ?? 'Failed to generate consent',
        raw: data,
      });
    }

    return res.status(200).json({
      consentAppId: data.consentAppId,
      consentAppStatus: data.consentAppStatus,
      // Build the browser login URL the frontend will open in a popup
      loginUrl: `${DHAN_AUTH}/login/consentApp-login?consentAppId=${data.consentAppId}`,
    });
  } catch (e) {
    console.error('dhan-generate-consent error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
