/**
 * POST   /api/dhan-pnl-exit  { brokerId, profitValue, lossValue, productType, enableKillSwitch }
 * DELETE /api/dhan-pnl-exit  { brokerId }
 * GET    /api/dhan-pnl-exit?brokerId=xxx
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
  if (!['POST', 'DELETE', 'GET'].includes(req.method ?? '')) return res.status(405).json({ error: 'Method not allowed' });

  const brokerId = req.method === 'GET'
    ? (req.query as Record<string, string>).brokerId
    : req.body?.brokerId;

  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });

  const { data: broker, error } = await supabase
    .from('broker_accounts')
    .select('access_token, api_key, client_id, user_id')
    .eq('id', brokerId)
    .single();

  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'access-token': broker.access_token ?? broker.api_key,
    'client-id': broker.client_id,
  };

  try {
    if (req.method === 'GET') {
      const dhanRes = await fetch(`${DHAN_BASE}/pnlExit`, { headers });
      const data = await dhanRes.json() as { pnlExitStatus?: string; errorMessage?: string };
      if (!dhanRes.ok) return res.status(dhanRes.status).json({ error: data.errorMessage ?? 'Get P&L exit failed' });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const dhanRes = await fetch(`${DHAN_BASE}/pnlExit`, { method: 'DELETE', headers });
      const data = await dhanRes.json() as { pnlExitStatus?: string; message?: string; errorMessage?: string };
      if (!dhanRes.ok) return res.status(dhanRes.status).json({ error: data.errorMessage ?? 'Stop P&L exit failed' });

      // Clear DB config
      await supabase.from('dhan_pnl_exit_config').delete().eq('broker_account_id', brokerId);

      return res.status(200).json(data);
    }

    // POST — configure
    const { profitValue, lossValue, productType, enableKillSwitch } = req.body ?? {};
    if (!profitValue || !lossValue || !productType) {
      return res.status(400).json({ error: 'profitValue, lossValue and productType required' });
    }

    const dhanRes = await fetch(`${DHAN_BASE}/pnlExit`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ profitValue, lossValue, productType, enableKillSwitch: enableKillSwitch ?? false }),
    });

    const data = await dhanRes.json() as { pnlExitStatus?: string; message?: string; errorMessage?: string };
    if (!dhanRes.ok) return res.status(dhanRes.status).json({ error: data.errorMessage ?? 'Configure P&L exit failed' });

    // Upsert config in DB
    await supabase.from('dhan_pnl_exit_config').upsert({
      user_id: broker.user_id,
      broker_account_id: brokerId,
      profit_value: Number(profitValue),
      loss_value: Number(lossValue),
      product_type: productType,
      enable_kill_switch: enableKillSwitch ?? false,
      status: data.pnlExitStatus ?? 'ACTIVE',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'broker_account_id' });

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
