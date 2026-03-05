/**
 * dhan-postback.ts
 * Receives Dhan Postback (webhook) order-status callbacks.
 * Dhan sends a raw JSON POST to this URL whenever an order status changes.
 *
 * URL to register in Dhan web.dhan.co → access token settings:
 *   https://<your-domain>/api/dhan-postback
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase } from '../_lib/supabase-admin.js';

interface PostbackPayload {
  dhanClientId: string;
  orderId: string;
  correlationId?: string;
  orderStatus: string;
  transactionType: string;
  exchangeSegment: string;
  productType: string;
  orderType: string;
  validity: string;
  tradingSymbol: string;
  securityId: string;
  quantity: number;
  disclosedQuantity: number;
  price: number;
  triggerPrice: number;
  afterMarketOrder: boolean;
  boProfitValue: number;
  boStopLossValue: number;
  legName?: string | null;
  createTime: string;
  updateTime: string;
  exchangeTime: string;
  drvExpiryDate?: string | null;
  drvOptionType?: string | null;
  drvStrikePrice: number;
  omsErrorCode?: string | null;
  omsErrorDescription?: string | null;
  filled_qty: number;
  algoId?: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  // Dhan sends POST only
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const payload = req.body as PostbackPayload;

    if (!payload?.dhanClientId || !payload?.orderId) {
      return res.status(400).json({ error: 'Invalid postback payload' });
    }

    // Lookup broker account by dhan client_id
    const { data: broker } = await supabase
      .from('broker_accounts')
      .select('id, user_id, client_id')
      .eq('client_id', payload.dhanClientId)
      .maybeSingle();

    // Store in dhan_postback_logs regardless of whether broker is found
    await supabase.from('dhan_postback_logs').insert({
      broker_account_id: broker?.id ?? null,
      user_id:           broker?.user_id ?? null,
      dhan_client_id:    payload.dhanClientId,
      order_id:          payload.orderId,
      correlation_id:    payload.correlationId ?? null,
      order_status:      payload.orderStatus,
      transaction_type:  payload.transactionType,
      exchange_segment:  payload.exchangeSegment,
      product_type:      payload.productType,
      order_type:        payload.orderType,
      validity:          payload.validity,
      trading_symbol:    payload.tradingSymbol ?? null,
      security_id:       payload.securityId,
      quantity:          payload.quantity,
      price:             payload.price,
      trigger_price:     payload.triggerPrice,
      filled_qty:        payload.filled_qty ?? 0,
      oms_error_code:    payload.omsErrorCode ?? null,
      oms_error_desc:    payload.omsErrorDescription ?? null,
      drv_option_type:   payload.drvOptionType ?? null,
      drv_strike_price:  payload.drvStrikePrice ?? 0,
      drv_expiry_date:   payload.drvExpiryDate ?? null,
      algo_id:           payload.algoId ?? null,
      create_time:       payload.createTime,
      update_time:       payload.updateTime,
      exchange_time:     payload.exchangeTime,
      raw_payload:       payload,
    });

    // Also update the dhan_orders table if order_id matches
    if (broker?.id) {
      await supabase
        .from('dhan_orders')
        .update({
          order_status: payload.orderStatus,
          filled_qty:   payload.filled_qty ?? 0,
          updated_at:   new Date().toISOString(),
        })
        .eq('broker_account_id', broker.id)
        .eq('order_id', payload.orderId);
    }

    // Dhan expects a 200 OK
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[dhan-postback] error:', err);
    // Still return 200 so Dhan doesn't retry endlessly
    return res.status(200).json({ received: true, warning: 'Processing error' });
  }
}
