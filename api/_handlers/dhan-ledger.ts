import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase } from '../_lib/supabase-admin.js';

interface DhanLedgerRow {
  dhanClientId: string;
  narration: string;
  voucherdate: string;
  exchange: string;
  voucherdesc: string;
  vouchernumber: string;
  debit: string;
  credit: string;
  runbal: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId, fromDate, toDate } = req.query as Record<string, string>;
  if (!brokerId)  return res.status(400).json({ error: 'brokerId required' });
  if (!fromDate)  return res.status(400).json({ error: 'fromDate required (YYYY-MM-DD)' });
  if (!toDate)    return res.status(400).json({ error: 'toDate required (YYYY-MM-DD)' });

  const { data: broker, error } = await supabase
    .from('broker_accounts')
    .select('access_token, api_key, client_id, user_id')
    .eq('id', brokerId)
    .single();

  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });

  try {
    const url = `${dhanBase}/ledger?from-date=${fromDate}&to-date=${toDate}`;
    const dhanRes = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'access-token': broker.access_token ?? broker.api_key,
        'client-id': broker.client_id,
      },
    });

    if (!dhanRes.ok) {
      const body = await dhanRes.json().catch(() => ({}));
      return res.status(dhanRes.status).json({ error: (body as { errorMessage?: string }).errorMessage ?? 'Ledger fetch failed' });
    }

    const data = await dhanRes.json() as DhanLedgerRow[];

    // Store / refresh in DB
    if (Array.isArray(data) && data.length > 0) {
      const rows = data.map((e) => ({
        user_id: broker.user_id,
        broker_account_id: brokerId,
        dhan_client_id: broker.client_id,
        from_date: fromDate,
        to_date: toDate,
        narration: e.narration,
        voucherdate: e.voucherdate,
        exchange: e.exchange ?? null,
        voucherdesc: e.voucherdesc ?? null,
        vouchernumber: e.vouchernumber,
        debit: e.debit ?? '0',
        credit: e.credit ?? '0',
        runbal: e.runbal ?? '0',
      }));

      // Delete old entries for same date range + broker, then insert fresh
      await supabase
        .from('dhan_ledger')
        .delete()
        .eq('broker_account_id', brokerId)
        .eq('from_date', fromDate)
        .eq('to_date', toDate);

      await supabase.from('dhan_ledger').insert(rows);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
