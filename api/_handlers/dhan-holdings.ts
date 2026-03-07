import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase } from '../_lib/supabase-admin.js';

interface DhanHoldingRow {
  exchange: string;
  tradingSymbol: string;
  securityId: string;
  isin: string;
  totalQty: number;
  dpQty: number;
  t1Qty: number;
  availableQty: number;
  collateralQty: number;
  avgCostPrice: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId } = req.query as Record<string, string>;
  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });

  const { data: broker, error } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, api_key, mode, user_id, health_status')
    .eq('id', brokerId)
    .single();

  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });
  const dhanBase = getDhanBase(broker);

  try {
    const dhanRes = await fetch(`${dhanBase}/holdings`, {
      headers: {
        'Content-Type': 'application/json',
        'access-token': broker.access_token ?? broker.api_key,
        'client-id': broker.client_id,
      },
    });

    if (!dhanRes.ok) {
      const body = await dhanRes.json().catch(() => ({}));
      return res.status(dhanRes.status).json({ error: (body as { errorMessage?: string }).errorMessage ?? 'Holdings fetch failed' });
    }

    const data = await dhanRes.json() as DhanHoldingRow[];

    if (Array.isArray(data) && data.length > 0) {
      const rows = data.map((h) => ({
        user_id: broker.user_id,
        broker_account_id: brokerId,
        dhan_client_id: broker.client_id,
        exchange: h.exchange,
        trading_symbol: h.tradingSymbol,
        security_id: h.securityId,
        isin: h.isin ?? null,
        total_qty: h.totalQty,
        dp_qty: h.dpQty,
        t1_qty: h.t1Qty,
        available_qty: h.availableQty,
        collateral_qty: h.collateralQty,
        avg_cost_price: h.avgCostPrice,
      }));

      await supabase
        .from('dhan_holdings')
        .upsert(rows, { onConflict: 'user_id,broker_account_id,security_id' });
    } else if (Array.isArray(data) && data.length === 0) {
      // Wipe stale holdings for this broker when empty
      await supabase.from('dhan_holdings').delete().eq('broker_account_id', brokerId);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
