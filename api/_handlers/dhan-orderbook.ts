/**
 * GET /api/dhan-orderbook?brokerId=xxx
 * Fetches today's complete order book from Dhan GET /v2/orders.
 * Upserts results into dhan_orders for local cache and history.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkEnv, getBroker, supabaseAdmin, DHAN_BASE } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (checkEnv(res)) return;

  const { brokerId } = req.query;
  if (!brokerId) return res.status(400).json({ error: 'brokerId query param required' });

  const { broker, error: bErr } = await getBroker(brokerId as string);
  if (bErr || !broker) return res.status(404).json({ error: 'Broker account not found' });
  if (!broker.access_token) return res.status(400).json({ error: 'No access token configured' });

  try {
    const dhanRes = await fetch(`${DHAN_BASE}/orders`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'access-token': broker.access_token,
      },
    });

    const data = await dhanRes.json() as Array<Record<string, unknown>>;

    if (!dhanRes.ok) {
      return res.status(dhanRes.status).json({ error: 'Dhan API error', raw: data });
    }

    // Upsert into dhan_orders for local history (best-effort, non-blocking)
    if (Array.isArray(data) && data.length > 0) {
      const rows = data
        .filter((o) => o.orderId)     // only orders with a real order id
        .map((o) => ({
          user_id:              broker.user_id as string,
          broker_account_id:    broker.id as string,
          dhan_client_id:       String(o.dhanClientId ?? broker.client_id),
          order_id:             String(o.orderId),
          correlation_id:       o.correlationId ? String(o.correlationId) : null,
          transaction_type:     String(o.transactionType),
          exchange_segment:     String(o.exchangeSegment),
          product_type:         String(o.productType),
          order_type:           String(o.orderType),
          validity:             String(o.validity ?? 'DAY'),
          trading_symbol:       o.tradingSymbol ? String(o.tradingSymbol) : null,
          security_id:          String(o.securityId ?? ''),
          quantity:             Number(o.quantity ?? 0),
          disclosed_quantity:   Number(o.disclosedQuantity ?? 0),
          price:                Number(o.price ?? 0),
          trigger_price:        Number(o.triggerPrice ?? 0),
          after_market_order:   Boolean(o.afterMarketOrder),
          bo_profit_value:      Number(o.boProfitValue ?? 0),
          bo_stop_loss_value:   Number(o.boStopLossValue ?? 0),
          leg_name:             o.legName ? String(o.legName) : null,
          order_status:         o.orderStatus ? String(o.orderStatus) : null,
          remaining_quantity:   Number(o.remainingQuantity ?? 0),
          average_traded_price: Number(o.averageTradedPrice ?? 0),
          filled_qty:           Number(o.filledQty ?? 0),
          oms_error_code:       o.omsErrorCode ? String(o.omsErrorCode) : null,
          oms_error_desc:       o.omsErrorDescription ? String(o.omsErrorDescription) : null,
          algo_id:              o.algoId ? String(o.algoId) : null,
          dhan_create_time:     o.createTime ? String(o.createTime) : null,
          dhan_update_time:     o.updateTime ? String(o.updateTime) : null,
          dhan_exchange_time:   o.exchangeTime ? String(o.exchangeTime) : null,
          drv_expiry_date:      o.drvExpiryDate ? String(o.drvExpiryDate) : null,
          drv_option_type:      o.drvOptionType ? String(o.drvOptionType) : null,
          drv_strike_price:     o.drvStrikePrice ? Number(o.drvStrikePrice) : null,
          source:               'MANUAL',
          raw_response:         o,
        }));

      // Upsert on natural key (user_id, order_id)
      await supabaseAdmin.from('dhan_orders').upsert(rows, {
        onConflict: 'user_id,order_id',
        ignoreDuplicates: false,
      });
    }

    return res.status(200).json(data);
  } catch (e) {
    console.error('dhan-orderbook error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
