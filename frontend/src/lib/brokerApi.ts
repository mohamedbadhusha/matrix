/**
 * Client-side Dhan broker API wrapper.
 * All calls are proxied through Vercel serverless functions so the
 * API key is never exposed to the browser.
 */

export interface PlaceOrderParams {
  brokerId: string;
  tradingSymbol: string;
  securityId: string;
  exchange: string;
  transactionType: 'BUY' | 'SELL';
  orderType: 'LIMIT' | 'MARKET';
  quantity: number;
  price: number;
  correlationId: string;
}

export interface LtpParams {
  securityIds: string[];
}

export async function placeOrder(params: PlaceOrderParams): Promise<{ orderId: string } | null> {
  const res = await fetch('/api/dhan-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchLtp(securityIds: string[]): Promise<Record<string, number>> {
  const res = await fetch('/api/dhan-ltp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ securityIds }),
  });
  if (!res.ok) return {};
  return res.json();
}

export async function fetchPositions(brokerId: string): Promise<unknown[]> {
  const res = await fetch(`/api/dhan-positions?brokerId=${brokerId}`);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchOrderBook(brokerId: string): Promise<unknown[]> {
  const res = await fetch(`/api/dhan-orderbook?brokerId=${brokerId}`);
  if (!res.ok) return [];
  return res.json();
}
