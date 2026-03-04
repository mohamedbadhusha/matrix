import { logger } from './logger';

const DHAN_BASE = process.env.DHAN_BASE_URL ?? 'https://api.dhan.co/v2';

export interface BrokerCredentials {
  clientId: string;
  accessToken: string;
}

export interface OrderPayload {
  tradingSymbol: string;
  securityId: string;
  exchange: string;
  transactionType: 'BUY' | 'SELL';
  orderType: 'LIMIT' | 'MARKET';
  quantity: number;
  price: number;
  correlationId: string;
}

export async function placeOrder(
  creds: BrokerCredentials,
  payload: OrderPayload,
): Promise<{ orderId: string } | null> {
  try {
    const body = {
      dhanClientId: creds.clientId,
      correlationId: payload.correlationId,
      transactionType: payload.transactionType,
      exchangeSegment: payload.exchange,
      productType: 'I',
      orderType: payload.orderType,
      validity: 'DAY',
      tradingSymbol: payload.tradingSymbol,
      securityId: payload.securityId,
      quantity: payload.quantity,
      price: payload.price,
      triggerPrice: 0,
      disclosedQuantity: 0,
      afterMarketOrder: false,
    };

    const res = await fetch(`${DHAN_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-token': creds.accessToken,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('Order placement failed', { status: res.status, err });
      return null;
    }

    const data = await res.json() as { orderId: string };
    logger.info('Order placed', { orderId: data.orderId, symbol: payload.tradingSymbol });
    return { orderId: data.orderId };
  } catch (e) {
    logger.error('placeOrder exception', e);
    return null;
  }
}

export async function fetchLtp(
  creds: BrokerCredentials,
  securityIds: string[],
): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${DHAN_BASE}/marketfeed/ltp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-token': creds.accessToken,
      },
      body: JSON.stringify({ NSE_FNO: securityIds }),
    });

    if (!res.ok) return {};

    const data = await res.json() as { data?: { NSE_FNO?: Record<string, { ltp?: number }> } };
    const result: Record<string, number> = {};
    // Dhan returns { data: { NSE_FNO: { "secId": { ltp: price } } } }
    const nse = data?.data?.NSE_FNO ?? {};
    Object.entries(nse).forEach(([id, val]: [string, any]) => {
      result[id] = val?.ltp ?? 0;
    });
    return result;
  } catch (e) {
    logger.error('fetchLtp exception', e);
    return {};
  }
}

export async function cancelOrder(
  creds: BrokerCredentials,
  orderId: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${DHAN_BASE}/orders/${orderId}`, {
      method: 'DELETE',
      headers: { 'access-token': creds.accessToken },
    });
    return res.ok;
  } catch {
    return false;
  }
}
