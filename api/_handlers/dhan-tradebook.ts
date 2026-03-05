/**
 * GET /api/dhan-tradebook?brokerId=xxx
 * Fetches today's trade book from Dhan GET /v2/trades.
 * Upserts results into dhan_trades for local history.
 *
 * Optional: ?orderId=xxx — fetches trades for a specific order (GET /v2/trades/{order-id})
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkEnv, getBroker, supabaseAdmin, DHAN_BASE } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (checkEnv(res)) return;

  const { brokerId, orderId } = req.query;
  if (!brokerId) return res.status(400).json({ error: 'brokerId query param required' });

  const { broker, error: bErr } = await getBroker(brokerId as string);
  if (bErr || !broker) return res.status(404).json({ error: 'Broker account not found' });
  if (!broker.access_token) return res.status(400).json({ error: 'No access token configured' });

  const url = orderId
    ? `${DHAN_BASE}/trades/${orderId as string}`
    : `${DHAN_BASE}/trades`;

  try {
    const dhanRes = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'access-token': broker.access_token as string,
      },
    });

    const raw = await dhanRes.json();

    if (!dhanRes.ok) {
      return res.status(dhanRes.status).json({ error: 'Dhan API error', raw });
    }

    // Normalise to array
    const trades = Array.isArray(raw) ? raw : [raw];
    const data = trades.filter(Boolean) as Array<Record<string, unknown>>;

    // Upsert into dhan_trades (deduped on exchange_trade_id)
    if (data.length > 0) {
      const rows = data
        .filter((t) => t.exchangeTradeId)
        .map((t) => ({
          user_id:           broker.user_id as string,
          broker_account_id: broker.id as string,
          dhan_client_id:    String(t.dhanClientId ?? broker.client_id),
          order_id:          String(t.orderId ?? ''),
          exchange_order_id: t.exchangeOrderId ? String(t.exchangeOrderId) : null,
          exchange_trade_id: String(t.exchangeTradeId),
          transaction_type:  String(t.transactionType),
          exchange_segment:  String(t.exchangeSegment),
          product_type:      String(t.productType),
          order_type:        String(t.orderType),
          trading_symbol:    t.tradingSymbol ? String(t.tradingSymbol) : null,
          security_id:       t.securityId ? String(t.securityId) : null,
          traded_quantity:   Number(t.tradedQuantity ?? 0),
          traded_price:      Number(t.tradedPrice ?? 0),
          dhan_create_time:  t.createTime ? String(t.createTime) : null,
          dhan_update_time:  t.updateTime ? String(t.updateTime) : null,
          dhan_exchange_time: t.exchangeTime ? String(t.exchangeTime) : null,
          drv_expiry_date:   t.drvExpiryDate ? String(t.drvExpiryDate) : null,
          drv_option_type:   t.drvOptionType ? String(t.drvOptionType) : null,
          drv_strike_price:  t.drvStrikePrice ? Number(t.drvStrikePrice) : null,
          raw_response:      t,
        }));

      await supabaseAdmin.from('dhan_trades').upsert(rows, {
        onConflict: 'exchange_trade_id',
        ignoreDuplicates: false,
      });
    }

    return res.status(200).json(data);
  } catch (e) {
    console.error('dhan-tradebook error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
