/**
 * POST   /api/dhan-pnl-exit  { brokerId, profitValue, lossValue, productType, enableKillSwitch }
 * DELETE /api/dhan-pnl-exit  { brokerId }
 * GET    /api/dhan-pnl-exit?brokerId=xxx
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkEnv, getBroker, dhanHeaders, supabaseAdmin, DHAN_BASE } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['POST', 'DELETE', 'GET'].includes(req.method ?? '')) return res.status(405).json({ error: 'Method not allowed' });
  if (checkEnv(res)) return;

  const brokerId = req.method === 'GET'
    ? (req.query as Record<string, string>).brokerId
    : req.body?.brokerId;

  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });

  const { broker, error } = await getBroker(brokerId);
  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });

  // P&L exit is not supported for paper/sandbox accounts
  if (broker.mode === 'PAPER') {
    return res.status(200).json({ pnlExitStatus: 'PAPER_ACCOUNT', paperAccount: true });
  }

  const headers = dhanHeaders(broker);

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
      await supabaseAdmin.from('dhan_pnl_exit_config').delete().eq('broker_account_id', brokerId);

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
    await supabaseAdmin.from('dhan_pnl_exit_config').upsert({
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
