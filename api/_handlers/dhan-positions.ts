import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DHAN_BASE = process.env.DHAN_BASE_URL ?? 'https://api.dhan.co/v2';

interface DhanPositionRow {
  dhanClientId: string;
  tradingSymbol: string;
  securityId: string;
  positionType: string;
  exchangeSegment: string;
  productType: string;
  buyAvg: number;
  sellAvg: number;
  costPrice: number;
  buyQty: number;
  sellQty: number;
  netQty: number;
  realizedProfit: number;
  unrealizedProfit: number;
  rbiReferenceRate: number;
  multiLotQuantity: number;
  carryForwardBuyQty: number;
  carryForwardSellQty: number;
  carryForwardBuyValue: number;
  carryForwardSellValue: number;
  dayBuyQty: number;
  daySellQty: number;
  dayBuyValue: number;
  daySellValue: number;
  crossCurrency: boolean;
  drvExpiryDate: string | null;
  drvOptionType: string | null;
  drvStrikePrice: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId } = req.body ?? {};
  if (!brokerId) return res.status(400).json({ error: 'brokerId required' });

  const { data: broker, error } = await supabase
    .from('broker_accounts')
    .select('access_token, api_key, client_id, user_id')
    .eq('id', brokerId)
    .single();

  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });

  try {
    const dhanRes = await fetch(`${DHAN_BASE}/positions`, {
      headers: {
        'access-token': broker.access_token ?? broker.api_key,
        'client-id': broker.client_id,
      },
    });

    if (!dhanRes.ok) {
      const body = await dhanRes.json().catch(() => ({}));
      await supabase
        .from('broker_accounts')
        .update({ health_status: 'ERROR', last_checked_at: new Date().toISOString() })
        .eq('id', brokerId);
      return res.status(dhanRes.status).json({ error: (body as { errorMessage?: string }).errorMessage ?? 'Positions fetch failed' });
    }

    const data = await dhanRes.json() as DhanPositionRow[];

    // Update health status
    await supabase
      .from('broker_accounts')
      .update({ health_status: 'OK', failure_count: 0, last_checked_at: new Date().toISOString() })
      .eq('id', brokerId);

    // Upsert all positions for this broker
    if (Array.isArray(data) && data.length > 0) {
      const rows = data.map((p) => ({
        user_id:                  broker.user_id,
        broker_account_id:        brokerId,
        dhan_client_id:           p.dhanClientId,
        security_id:              p.securityId,
        trading_symbol:           p.tradingSymbol,
        exchange_segment:         p.exchangeSegment,
        product_type:             p.productType,
        position_type:            p.positionType,
        buy_avg:                  p.buyAvg,
        sell_avg:                 p.sellAvg,
        cost_price:               p.costPrice,
        buy_qty:                  p.buyQty,
        sell_qty:                 p.sellQty,
        net_qty:                  p.netQty,
        realized_profit:          p.realizedProfit,
        unrealized_profit:        p.unrealizedProfit,
        rbi_reference_rate:       p.rbiReferenceRate,
        multi_lot_quantity:       p.multiLotQuantity,
        carry_forward_buy_qty:    p.carryForwardBuyQty,
        carry_forward_sell_qty:   p.carryForwardSellQty,
        carry_forward_buy_value:  p.carryForwardBuyValue,
        carry_forward_sell_value: p.carryForwardSellValue,
        day_buy_qty:              p.dayBuyQty,
        day_sell_qty:             p.daySellQty,
        day_buy_value:            p.dayBuyValue,
        day_sell_value:           p.daySellValue,
        cross_currency:           p.crossCurrency,
        drv_expiry_date:          p.drvExpiryDate ?? null,
        drv_option_type:          p.drvOptionType ?? null,
        drv_strike_price:         p.drvStrikePrice ?? 0,
        raw_response:             p as unknown as Record<string, unknown>,
      }));

      await supabase
        .from('dhan_positions')
        .upsert(rows, { onConflict: 'user_id,broker_account_id,security_id,product_type,exchange_segment' });
    } else if (Array.isArray(data) && data.length === 0) {
      // Flat position — delete stale rows for this broker
      await supabase
        .from('dhan_positions')
        .delete()
        .eq('broker_account_id', brokerId);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
