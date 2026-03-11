/**
 * GET /api/dhan-get-order?brokerId=xxx&orderId=yyy
 * GET /api/dhan-get-order?brokerId=xxx&correlationId=zzz
 *
 * Retrieves a single order's details and latest status from Dhan.
 *   - By order ID:       GET /v2/orders/{order-id}
 *   - By correlation ID: GET /v2/orders/external/{correlation-id}
 *
 * Upserts the result into dhan_orders for local cache.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkEnv, getBroker, supabaseAdmin, getDhanBase } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (checkEnv(res)) return;

  const { brokerId, orderId, correlationId } = req.query as Record<string, string>;

  if (!brokerId) return res.status(400).json({ error: 'brokerId query param required' });
  if (!orderId && !correlationId) {
    return res.status(400).json({ error: 'orderId or correlationId query param required' });
  }

  const { broker, error: bErr } = await getBroker(brokerId);
  if (bErr || !broker) return res.status(404).json({ error: 'Broker account not found' });
  const dhanBase = getDhanBase(broker);
  if (!broker.access_token) return res.status(400).json({ error: 'No access token configured' });

  const url = correlationId
    ? `${dhanBase}/orders/external/${encodeURIComponent(correlationId)}`
    : `${dhanBase}/orders/${encodeURIComponent(orderId)}`;

  try {
    const dhanRes = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'access-token': broker.access_token,
      },
    });

    const data = await dhanRes.json() as Record<string, unknown>;

    if (!dhanRes.ok) {
      return res.status(dhanRes.status).json({ error: 'Dhan API error', raw: data });
    }

    // Upsert into dhan_orders for local cache (best-effort)
    if (data.orderId) {
      await supabaseAdmin.from('dhan_orders').upsert(
        {
          user_id:              broker.user_id,
          broker_account_id:    broker.id,
          dhan_client_id:       String(data.dhanClientId ?? broker.client_id),
          order_id:             String(data.orderId),
          exchange_order_id:    data.exchangeOrderId ? String(data.exchangeOrderId) : null,
          correlation_id:       data.correlationId ? String(data.correlationId) : null,
          transaction_type:     String(data.transactionType ?? ''),
          exchange_segment:     String(data.exchangeSegment ?? ''),
          product_type:         String(data.productType ?? ''),
          order_type:           String(data.orderType ?? ''),
          validity:             String(data.validity ?? 'DAY'),
          trading_symbol:       data.tradingSymbol ? String(data.tradingSymbol) : null,
          security_id:          String(data.securityId ?? ''),
          quantity:             Number(data.quantity ?? 0),
          disclosed_quantity:   Number(data.disclosedQuantity ?? 0),
          price:                Number(data.price ?? 0),
          trigger_price:        Number(data.triggerPrice ?? 0),
          after_market_order:   Boolean(data.afterMarketOrder),
          bo_profit_value:      Number(data.boProfitValue ?? 0),
          bo_stop_loss_value:   Number(data.boStopLossValue ?? 0),
          leg_name:             data.legName ? String(data.legName) : null,
          order_status:         data.orderStatus ? String(data.orderStatus) : null,
          remaining_quantity:   Number(data.remainingQuantity ?? 0),
          average_traded_price: Number(data.averageTradedPrice ?? 0),
          filled_qty:           Number(data.filledQty ?? 0),
          oms_error_code:       data.omsErrorCode ? String(data.omsErrorCode) : null,
          oms_error_desc:       data.omsErrorDescription ? String(data.omsErrorDescription) : null,
          algo_id:              data.algoId ? String(data.algoId) : null,
          dhan_create_time:     data.createTime ? String(data.createTime) : null,
          dhan_update_time:     data.updateTime ? String(data.updateTime) : null,
          dhan_exchange_time:   data.exchangeTime ? String(data.exchangeTime) : null,
          drv_expiry_date:      data.drvExpiryDate ? String(data.drvExpiryDate) : null,
          drv_option_type:      data.drvOptionType ? String(data.drvOptionType) : null,
          drv_strike_price:     data.drvStrikePrice ? Number(data.drvStrikePrice) : null,
          raw_response:         data,
        },
        { onConflict: 'user_id,order_id', ignoreDuplicates: false },
      );
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('dhan-get-order error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
