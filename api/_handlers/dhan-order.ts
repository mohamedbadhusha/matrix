/**
 * POST /api/dhan-order
 * Places a new order via Dhan POST /v2/orders.
 * Supports two modes:
 *   - Manual / UI-driven: full order body passed directly
 *   - Protocol-driven:  tradeId provided, order params derived from trade_node
 *
 * Saves a record to dhan_orders and order_logs on success.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase } from '../_lib/supabase-admin.js';

interface PlaceOrderBody {
  brokerId: string;
  // Protocol mode — derive from trade_node
  tradeId?: string;
  // Manual / UI mode — pass full order params
  transactionType?: 'BUY' | 'SELL';
  exchangeSegment?: string;
  productType?: string;
  orderType?: string;
  validity?: string;
  securityId?: string;
  tradingSymbol?: string;
  quantity?: number;
  price?: number;
  triggerPrice?: number;
  disclosedQuantity?: number;
  afterMarketOrder?: boolean;
  amoTime?: string;
  boProfitValue?: number;
  boStopLossValue?: number;
  correlationId?: string;
  // slicing flag
  slicing?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = (req.body ?? {}) as PlaceOrderBody;
  const { brokerId, tradeId, slicing = false } = body;

  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });

  const { data: broker, error: bErr } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, user_id, failure_count, health_status')
    .eq('id', brokerId)
    .single();

  if (bErr || !broker) return res.status(404).json({ error: 'Broker account not found' });
  const dhanBase = getDhanBase(broker);
  if (!broker.access_token) return res.status(400).json({ error: 'No access token configured' });

  // ── Resolve order parameters ────────────────────────────────────────────
  let orderParams: Record<string, unknown>;
  let tradeUserId: string = broker.user_id as string;
  let resolvedTradeId: string | null = tradeId ?? null;

  if (tradeId) {
    // Protocol mode
    const { data: trade, error: tErr } = await supabase
      .from('trade_nodes')
      .select('id, user_id, exchange, trading_symbol, security_id, qty_per_bucket, entry_price')
      .eq('id', tradeId)
      .single();

    if (tErr || !trade) return res.status(404).json({ error: 'Trade not found' });
    tradeUserId = trade.user_id as string;

    orderParams = {
      dhanClientId:      broker.client_id,
      correlationId:     trade.id,
      transactionType:   body.transactionType ?? 'BUY',
      exchangeSegment:   trade.exchange,
      productType:       body.productType ?? 'INTRADAY',
      orderType:         body.orderType ?? 'MARKET',
      validity:          body.validity ?? 'DAY',
      tradingSymbol:     trade.trading_symbol,
      securityId:        trade.security_id ?? '',
      quantity:          String(trade.qty_per_bucket),
      price:             body.price != null ? String(body.price) : '',
      triggerPrice:      body.triggerPrice != null ? String(body.triggerPrice) : '',
      disclosedQuantity: '',
      afterMarketOrder:  false,
      amoTime:           '',
      boProfitValue:     '',
      boStopLossValue:   '',
    };
  } else {
    // Manual mode — validate required fields
    const required = ['transactionType', 'exchangeSegment', 'productType', 'orderType', 'securityId', 'quantity'];
    for (const f of required) {
      if (!body[f as keyof PlaceOrderBody]) {
        return res.status(400).json({ error: `${f} is required` });
      }
    }
    orderParams = {
      dhanClientId:      broker.client_id,
      correlationId:     body.correlationId ?? '',
      transactionType:   body.transactionType,
      exchangeSegment:   body.exchangeSegment,
      productType:       body.productType,
      orderType:         body.orderType,
      validity:          body.validity ?? 'DAY',
      tradingSymbol:     body.tradingSymbol ?? '',
      securityId:        body.securityId,
      quantity:          String(body.quantity),
      price:             body.price != null ? String(body.price) : '',
      triggerPrice:      body.triggerPrice != null ? String(body.triggerPrice) : '',
      disclosedQuantity: body.disclosedQuantity != null ? String(body.disclosedQuantity) : '',
      afterMarketOrder:  body.afterMarketOrder ?? false,
      amoTime:           body.amoTime ?? '',
      boProfitValue:     body.boProfitValue != null ? String(body.boProfitValue) : '',
      boStopLossValue:   body.boStopLossValue != null ? String(body.boStopLossValue) : '',
    };
  }

  try {
    const endpoint = slicing ? `${dhanBase}/orders/slicing` : `${dhanBase}/orders`;
    const dhanRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-token': broker.access_token as string,
      },
      body: JSON.stringify(orderParams),
    });

    const data = await dhanRes.json() as { orderId?: string; orderStatus?: string; errorMessage?: string };

    if (!dhanRes.ok) {
      await supabase
        .from('broker_accounts')
        .update({
          failure_count: (broker.failure_count as number) + 1,
          health_status: (broker.failure_count as number) + 1 >= 3 ? 'ERROR' : broker.health_status,
          last_checked_at: new Date().toISOString(),
        })
        .eq('id', brokerId);

      return res.status(dhanRes.status).json({ error: data.errorMessage ?? 'Dhan API error', raw: data });
    }

    const orderId = data.orderId ?? null;

    // ── Persist to dhan_orders & order_logs ──────────────────────────────
    await supabase.from('dhan_orders').insert({
      user_id:           tradeUserId,
      broker_account_id: broker.id,
      trade_node_id:     resolvedTradeId,
      dhan_client_id:    broker.client_id,
      order_id:          orderId,
      correlation_id:    orderParams.correlationId ? String(orderParams.correlationId) : null,
      transaction_type:  String(orderParams.transactionType),
      exchange_segment:  String(orderParams.exchangeSegment),
      product_type:      String(orderParams.productType),
      order_type:        String(orderParams.orderType),
      validity:          String(orderParams.validity ?? 'DAY'),
      trading_symbol:    orderParams.tradingSymbol ? String(orderParams.tradingSymbol) : null,
      security_id:       String(orderParams.securityId ?? ''),
      quantity:          Number(orderParams.quantity),
      price:             Number(orderParams.price ?? 0),
      trigger_price:     Number(orderParams.triggerPrice ?? 0),
      after_market_order: Boolean(orderParams.afterMarketOrder),
      order_status:      data.orderStatus ?? 'TRANSIT',
      source:            resolvedTradeId ? 'PROTOCOL' : 'MANUAL',
      raw_response:      data,
    });

    if (resolvedTradeId) {
      await supabase.from('order_logs').insert({
        trade_id:        resolvedTradeId,
        user_id:         tradeUserId,
        broker_order_id: orderId,
        order_type:      String(orderParams.orderType),
        transaction_type: String(orderParams.transactionType),
        quantity:        Number(orderParams.quantity),
        price:           Number(orderParams.price ?? 0),
        status:          data.orderStatus ?? 'TRANSIT',
        raw_response:    data,
      });
    }

    return res.status(200).json({ orderId, orderStatus: data.orderStatus ?? 'TRANSIT' });
  } catch (err) {
    console.error('dhan-order error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
