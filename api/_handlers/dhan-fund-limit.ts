import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkEnv, getBroker, dhanHeaders, getDhanBase } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (checkEnv(res)) return;

  const { brokerId } = req.query as Record<string, string>;
  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });

  const { broker, error } = await getBroker(brokerId);
  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });

  // Dhan paper/sandbox accounts do not support fund-limit API
  if (broker.mode === 'PAPER') {
    return res.status(200).json({ paperAccount: true, availabelBalance: 0, sodLimit: 0, collateralAmount: 0, receiveableAmount: 0, utiliziedAmount: 0, blockedPayoutAmount: 0, withdrawableBalance: 0 });
  }

  try {
    const dhanRes = await fetch(`${dhanBase}/fundlimit`, {
      headers: dhanHeaders(broker),
    });

    if (!dhanRes.ok) {
      const body = await dhanRes.json().catch(() => ({}));
      return res.status(dhanRes.status).json({ error: (body as { errorMessage?: string }).errorMessage ?? 'Fund limit fetch failed' });
    }

    const data = await dhanRes.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
