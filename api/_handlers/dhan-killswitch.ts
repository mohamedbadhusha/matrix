/**
 * POST /api/dhan-killswitch   { brokerId, action: 'ACTIVATE' | 'DEACTIVATE' }
 * GET  /api/dhan-killswitch?brokerId=xxx
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkEnv, getBroker, dhanHeaders, supabaseAdmin, DHAN_BASE } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (checkEnv(res)) return;

  const brokerId = req.method === 'GET'
    ? (req.query as Record<string, string>).brokerId
    : req.body?.brokerId;

  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });

  const { broker, error } = await getBroker(brokerId);
  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });

  // Kill switch is not supported for paper/sandbox accounts
  if (broker.mode === 'PAPER') {
    return res.status(200).json({ dhanClientId: broker.client_id, killSwitchStatus: 'PAPER_ACCOUNT', paperAccount: true });
  }

  try {
    if (req.method === 'GET') {
      const dhanRes = await fetch(`${DHAN_BASE}/killswitch`, {
        headers: dhanHeaders(broker),
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
      headers: dhanHeaders(broker),
    });

    const data = await dhanRes.json() as { dhanClientId?: string; killSwitchStatus?: string; errorMessage?: string };
    if (!dhanRes.ok) return res.status(dhanRes.status).json({ error: data.errorMessage ?? 'Kill switch action failed' });

    // Update broker health record
    if (action === 'ACTIVATE') {
      await supabaseAdmin.from('broker_accounts').update({ health_status: 'KILL_SWITCH' }).eq('id', brokerId);
    } else {
      await supabaseAdmin.from('broker_accounts').update({ health_status: 'OK' }).eq('id', brokerId);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
