import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase, DHAN_BASE } from '../_lib/supabase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { brokerId, fromDate, toDate, page: pageStr } = req.query as Record<string, string>;
  if (!brokerId)  return res.status(400).json({ error: 'brokerId required' });
  if (!fromDate)  return res.status(400).json({ error: 'fromDate required (YYYY-MM-DD)' });
  if (!toDate)    return res.status(400).json({ error: 'toDate required (YYYY-MM-DD)' });
  const page = pageStr ?? '0';

  const { data: broker, error } = await supabase
    .from('broker_accounts')
    .select('access_token, api_key, client_id, user_id')
    .eq('id', brokerId)
    .single();

  if (error || !broker) return res.status(404).json({ error: 'Broker not found' });

  try {
    const url = `${DHAN_BASE}/trades/${fromDate}/${toDate}/${page}`;
    const dhanRes = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'access-token': broker.access_token ?? broker.api_key,
        'client-id': broker.client_id,
      },
    });

    if (!dhanRes.ok) {
      const body = await dhanRes.json().catch(() => ({}));
      return res.status(dhanRes.status).json({ error: (body as { errorMessage?: string }).errorMessage ?? 'Trade history fetch failed' });
    }

    const data = await dhanRes.json() as object[];

    // Cache page 0 in DB (overwrite); for subsequent pages append/upsert by trade ID
    if (Array.isArray(data) && data.length > 0) {
      type TradeRow = {
        orderId: string; exchangeTradeId: string; transactionType: string;
        exchangeSegment: string; productType: string; orderType: string;
        tradingSymbol: string | null; customSymbol: string; securityId: string;
        tradedQuantity: number; tradedPrice: number; isin: string;
        instrument: string; sebiTax: number; stt: number;
        brokerageCharges: number; serviceTax: number;
        exchangeTransactionCharges: number; stampDuty: number;
        createTime: string; updateTime: string; exchangeTime: string;
        drvExpiryDate: string; drvOptionType: string | null; drvStrikePrice: number;
      };

      const rows = (data as TradeRow[]).map((t) => ({
        user_id: broker.user_id,
        broker_account_id: brokerId,
        dhan_client_id: broker.client_id,
        from_date: fromDate,
        to_date: toDate,
        page_number: Number(page),
        order_id: t.orderId,
        exchange_trade_id: t.exchangeTradeId,
        transaction_type: t.transactionType,
        exchange_segment: t.exchangeSegment,
        product_type: t.productType,
        order_type: t.orderType,
        trading_symbol: t.tradingSymbol ?? null,
        custom_symbol: t.customSymbol ?? null,
        security_id: t.securityId,
        traded_quantity: t.tradedQuantity,
        traded_price: t.tradedPrice,
        isin: t.isin ?? null,
        instrument: t.instrument ?? null,
        sebi_tax: t.sebiTax ?? 0,
        stt: t.stt ?? 0,
        brokerage_charges: t.brokerageCharges ?? 0,
        service_tax: t.serviceTax ?? 0,
        exchange_transaction_charges: t.exchangeTransactionCharges ?? 0,
        stamp_duty: t.stampDuty ?? 0,
        exchange_time: t.exchangeTime,
        drv_expiry_date: t.drvExpiryDate !== 'NA' ? t.drvExpiryDate : null,
        drv_option_type: t.drvOptionType !== 'NA' ? t.drvOptionType : null,
        drv_strike_price: t.drvStrikePrice ?? 0,
      }));

      await supabase
        .from('dhan_trade_history')
        .upsert(rows, { onConflict: 'broker_account_id,order_id,exchange_trade_id' });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
