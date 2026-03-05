/**
 * PUT /api/dhan-modify-super-order
 * Modifies a pending super order leg via Dhan PUT /v2/super/orders/{order-id}.
 * - ENTRY_LEG: can modify qty, price, targetPrice, stopLossPrice, trailingJump
 *   (only when entry status is PENDING or PART_TRADED)
 * - TARGET_LEG: modify price (and trailingJump)
 * - STOP_LOSS_LEG: modify price and trailingJump
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, getDhanBase } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const {
    brokerId,
    orderId,
    legName,
    orderType,
    quantity,
    price,
    targetPrice,
    stopLossPrice,
    trailingJump,
  } = (req.body ?? {}) as {
    brokerId: string;
    orderId: string;
    legName: 'ENTRY_LEG' | 'TARGET_LEG' | 'STOP_LOSS_LEG';
    orderType?: 'LIMIT' | 'MARKET';
    quantity?: number;
    price?: number;
    targetPrice?: number;
    stopLossPrice?: number;
    trailingJump?: number;
  };

  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });
  if (!orderId)  return res.status(400).json({ error: 'orderId required' });
  if (!legName)  return res.status(400).json({ error: 'legName required' });

  const { data: broker, error: bErr } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, user_id')
    .eq('id', brokerId)
    .single();

  if (bErr || !broker) return res.status(404).json({ error: 'Broker account not found' });
  const dhanBase = getDhanBase(broker);
  if (!broker.access_token) return res.status(400).json({ error: 'No access token configured' });

  const payload: Record<string, unknown> = {
    dhanClientId: broker.client_id,
    orderId,
    legName,
  };

  if (orderType !== undefined)  payload.orderType = orderType;
  if (quantity !== undefined)   payload.quantity = String(quantity);
  if (price !== undefined)      payload.price = String(price);
  if (targetPrice !== undefined)   payload.targetPrice = targetPrice;
  if (stopLossPrice !== undefined) payload.stopLossPrice = stopLossPrice;
  if (trailingJump !== undefined)  payload.trailingJump = trailingJump;

  try {
    const dhanRes = await fetch(`${dhanBase}/super/orders/${orderId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'access-token': broker.access_token as string,
      },
      body: JSON.stringify(payload),
    });

    const data = await dhanRes.json() as {
      orderId?: string;
      orderStatus?: string;
      errorMessage?: string;
    };

    if (!dhanRes.ok) {
      return res.status(dhanRes.status).json({ error: data.errorMessage ?? 'Dhan API error', raw: data });
    }

    // Update local record
    await supabase
      .from('dhan_super_orders')
      .update({
        order_status:    data.orderStatus,
        ...(price !== undefined      ? { price }            : {}),
        ...(targetPrice !== undefined   ? { target_price: targetPrice }    : {}),
        ...(stopLossPrice !== undefined ? { stop_loss_price: stopLossPrice } : {}),
        ...(trailingJump !== undefined  ? { trailing_jump: trailingJump }   : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', orderId)
      .eq('user_id', broker.user_id as string);

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
