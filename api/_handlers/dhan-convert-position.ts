import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId, fromProductType, exchangeSegment, positionType, securityId, tradingSymbol, convertQty, toProductType } = req.body ?? {};
  if (!brokerId || !fromProductType || !exchangeSegment || !positionType || !securityId || !convertQty || !toProductType) {
    return res.status(400).json({ error: 'brokerId, fromProductType, exchangeSegment, positionType, securityId, convertQty, toProductType required' });
  }

  const { data: broker, error } = await supabase
    .from('broker_accounts')
    .select('access_token, api_key, client_id')
    .eq('id', brokerId)
    .single();

  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });

  try {
    const dhanRes = await fetch(`${dhanBase}/positions/convert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'access-token': broker.access_token ?? broker.api_key,
        'client-id': broker.client_id,
      },
      body: JSON.stringify({
        dhanClientId: broker.client_id,
        fromProductType,
        exchangeSegment,
        positionType,
        securityId,
        tradingSymbol: tradingSymbol ?? '',
        convertQty,
        toProductType,
      }),
    });

    // Dhan returns 202 Accepted with no body on success
    if (dhanRes.status === 202) return res.status(202).json({ status: 'ACCEPTED', message: 'Position conversion submitted' });
    if (!dhanRes.ok) {
      const body = await dhanRes.json().catch(() => ({}));
      return res.status(dhanRes.status).json({ error: (body as { errorMessage?: string }).errorMessage ?? 'Position conversion failed' });
    }

    const data = await dhanRes.json().catch(() => ({}));
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
