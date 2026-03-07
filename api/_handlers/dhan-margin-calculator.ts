import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId, exchangeSegment, transactionType, quantity, productType, securityId, price, triggerPrice } = req.body ?? {};
  if (!brokerId || !exchangeSegment || !transactionType || !quantity || !productType || !securityId || price === undefined) {
    return res.status(400).json({ error: 'brokerId, exchangeSegment, transactionType, quantity, productType, securityId, price required' });
  }

  const { data: broker, error } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, api_key, mode, user_id, health_status')
    .eq('id', brokerId)
    .single();

  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });
  const dhanBase = getDhanBase(broker);

  try {
    const body: Record<string, unknown> = {
      dhanClientId: broker.client_id,
      exchangeSegment,
      transactionType,
      quantity,
      productType,
      securityId,
      price,
    };
    if (triggerPrice !== undefined) body.triggerPrice = triggerPrice;

    const dhanRes = await fetch(`${dhanBase}/margincalculator`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'access-token': broker.access_token ?? broker.api_key,
        'client-id': broker.client_id,
      },
      body: JSON.stringify(body),
    });

    if (!dhanRes.ok) {
      const errBody = await dhanRes.json().catch(() => ({}));
      return res.status(dhanRes.status).json({ error: (errBody as { errorMessage?: string }).errorMessage ?? 'Margin calculation failed' });
    }

    const data = await dhanRes.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
