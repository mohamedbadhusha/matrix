import WebSocket from 'ws';
import { SupabaseClient } from '@supabase/supabase-js';
import { fetchLtp } from './brokerClient';
import { logger } from './logger';

// ─── Dhan Market Feed — binary protocol constants ────────────────────────────
//
// Endpoint : wss://api-feed.dhan.co
// Protocol : binary (Dhan v2 Market Feed specification)
//
// Auth packet  : [0]     uint8    = 11 (CONNECT)
//                [1..30]          = clientId     (null-padded to 30 bytes)
//                [31..530]        = accessToken  (null-padded to 500 bytes)
//                Total            = 531 bytes
//
// Subscribe    : [0]     uint8    = 15 (SUBSCRIBE_TICKER)
//                [1..2]  uint16LE = instrument count
//                Per instrument (5 bytes):
//                  [0]   uint8    = exchange segment code
//                  [1..4] uint32LE = securityId
//
// Ticker resp  : [0]     uint8    = 2  (TICKER_PACKET)
//                [1..4]  uint32LE = securityId
//                [5..8]  int32LE  = ltp × 100  → divide by 100 for real price
//                [9..12] uint32LE = last-trade unix timestamp
//                Total            = 13 bytes

const DHAN_FEED_URL = process.env.DHAN_FEED_URL ?? 'wss://api-feed.dhan.co';

/** Dhan exchange segment byte codes */
const SEGMENT: Record<string, number> = {
  NSE_EQ:  1,
  NSE_FNO: 2,
  BSE_EQ:  3,
  BSE_FNO: 4,
  MCX:     5,
  NSE_CD:  6,
};

const REQ_CODE  = { CONNECT: 11, SUBSCRIBE: 15, UNSUBSCRIBE: 16 } as const;
const RESP_CODE = { TICKER: 2, FEED_DISCONNECT: 50 } as const;

const AUTH_PACKET_SIZE    = 531;  // 1 + 30 + 500
const MAX_SUBSCRIBE_BATCH = 100;  // Dhan limit per subscribe packet

function segmentByte(exchange: string): number {
  return SEGMENT[exchange] ?? SEGMENT.NSE_FNO;
}

function buildAuthPacket(clientId: string, accessToken: string): Buffer {
  const buf = Buffer.alloc(AUTH_PACKET_SIZE, 0);
  buf.writeUInt8(REQ_CODE.CONNECT, 0);
  Buffer.from(clientId).copy(buf, 1, 0, Math.min(clientId.length, 30));
  Buffer.from(accessToken).copy(buf, 31, 0, Math.min(accessToken.length, 500));
  return buf;
}

function buildSubscribePacket(
  instruments: Array<{ securityId: number; exchange: string }>,
  requestCode: number = REQ_CODE.SUBSCRIBE,
): Buffer {
  const buf = Buffer.alloc(3 + instruments.length * 5, 0);
  buf.writeUInt8(requestCode, 0);
  buf.writeUInt16LE(instruments.length, 1);
  instruments.forEach(({ securityId, exchange }, i) => {
    const off = 3 + i * 5;
    buf.writeUInt8(segmentByte(exchange), off);
    buf.writeUInt32LE(securityId >>> 0, off + 1); // treat as unsigned
  });
  return buf;
}

function parseTickerPacket(buf: Buffer): { securityId: string; ltp: number } | null {
  if (buf.length < 13) return null;
  if (buf.readUInt8(0) !== RESP_CODE.TICKER) return null;
  const securityId = buf.readUInt32LE(1).toString();
  const ltp = buf.readInt32LE(5) / 100;
  return ltp > 0 ? { securityId, ltp } : null;
}

// ─── Per-broker WebSocket feed connection ────────────────────────────────────

class DhanFeedConnection {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private _connected = false;
  private _destroyed = false;
  private reconnectAttempts = 0;

  /** securityId → exchange string — all instruments this connection should stream */
  private subscribedIds = new Map<string, string>();

  constructor(
    private readonly creds: { clientId: string; accessToken: string },
    private readonly cache: Map<string, number>,
    private readonly userId: string,
  ) {}

  connect(): void {
    if (this._destroyed) return;
    try {
      const ws = new WebSocket(DHAN_FEED_URL);
      this.ws = ws;
      ws.binaryType = 'nodebuffer';
      ws.on('open',    ()    => this._onOpen());
      ws.on('message', (d)   => this._onMessage(d as Buffer));
      ws.on('close',   ()    => this._onClose());
      ws.on('error',   (err) =>
        logger.warn('DhanFeed WS error', { userId: this.userId, err: err.message }),
      );
    } catch (e) {
      logger.error('DhanFeed connect threw', { userId: this.userId, e });
      this._scheduleReconnect();
    }
  }

  /** Ensure this securityId is subscribed; no-op if already registered */
  subscribe(securityId: string, exchange: string): void {
    if (this.subscribedIds.has(securityId)) return;
    this.subscribedIds.set(securityId, exchange);
    if (this._connected && this.ws?.readyState === WebSocket.OPEN) {
      this._sendSubscribe([{ securityId: parseInt(securityId, 10), exchange }]);
    }
    // Not yet connected → will be bulk-subscribed inside _onOpen()
  }

  isHealthy(): boolean {
    return this._connected && this.ws?.readyState === WebSocket.OPEN;
  }

  destroy(): void {
    this._destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _onOpen(): void {
    logger.info('DhanFeed WS connected', { userId: this.userId });
    this._connected = true;
    this.reconnectAttempts = 0;

    // Authenticate
    this.ws!.send(buildAuthPacket(this.creds.clientId, this.creds.accessToken));

    // Re-subscribe all tracked instruments after (re)connect
    if (this.subscribedIds.size > 0) {
      const instruments = Array.from(this.subscribedIds.entries()).map(
        ([securityId, exchange]) => ({ securityId: parseInt(securityId, 10), exchange }),
      );
      for (let i = 0; i < instruments.length; i += MAX_SUBSCRIBE_BATCH) {
        this._sendSubscribe(instruments.slice(i, i + MAX_SUBSCRIBE_BATCH));
      }
      logger.debug('DhanFeed re-subscribed', { userId: this.userId, count: instruments.length });
    }
  }

  private _onMessage(buf: Buffer): void {
    if (!Buffer.isBuffer(buf) || buf.length < 1) return;
    const code = buf.readUInt8(0);

    if (code === RESP_CODE.TICKER) {
      const tick = parseTickerPacket(buf);
      if (tick) this.cache.set(tick.securityId, tick.ltp);
    } else if (code === RESP_CODE.FEED_DISCONNECT) {
      logger.warn('DhanFeed server disconnect packet', { userId: this.userId });
      this._connected = false;
      this._scheduleReconnect();
    }
    // Quote / Full / OI / PrevClose packets are silently discarded —
    // the tick engine only needs LTP (ticker).
  }

  private _onClose(): void {
    this._connected = false;
    if (!this._destroyed) {
      logger.warn('DhanFeed WS closed unexpectedly', { userId: this.userId });
      this._scheduleReconnect();
    }
  }

  private _scheduleReconnect(): void {
    if (this._destroyed) return;
    const delay = Math.min(5_000 * Math.pow(2, this.reconnectAttempts), 60_000); // exp backoff, cap 60s
    this.reconnectAttempts++;
    logger.info('DhanFeed scheduling reconnect', {
      userId: this.userId,
      delayMs: delay,
      attempt: this.reconnectAttempts,
    });
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private _sendSubscribe(instruments: Array<{ securityId: number; exchange: string }>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(buildSubscribePacket(instruments));
    } catch (e) {
      logger.warn('DhanFeed subscribe send failed', { userId: this.userId, e });
    }
  }
}

// ─── LtpFeed — public interface used by TickEngine ───────────────────────────

export interface TradeMapEntry {
  securityId: string;
  userId: string;
  exchange?: string; // defaults to 'NSE_FNO' when omitted
}

export class LtpFeed {
  /** securityId → latest LTP (pushed by WS events or REST fallback) */
  private cache: Map<string, number> = new Map();

  /** userId → broker credentials */
  private brokersByUser: Map<string, { clientId: string; accessToken: string }> = new Map();

  /** userId → live WebSocket feed connection */
  private connections: Map<string, DhanFeedConnection> = new Map();

  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Called every BROKER_REFRESH_INTERVAL ticks (~60 s).
   * Fetches active broker accounts, opens new WS connections, tears down stale ones.
   */
  async refreshBrokers(): Promise<void> {
    const { data } = await this.supabase
      .from('broker_accounts')
      .select('user_id, client_id, access_token, api_key')
      .eq('is_active', true)
      .eq('health_status', 'OK');

    const newBrokers = new Map<string, { clientId: string; accessToken: string }>();
    (data ?? []).forEach((b: any) => {
      newBrokers.set(b.user_id, {
        clientId:    b.client_id,
        accessToken: b.access_token ?? b.api_key,
      });
    });

    // Open WS for newly added accounts
    for (const [userId, creds] of newBrokers) {
      if (!this.connections.has(userId)) {
        const conn = new DhanFeedConnection(creds, this.cache, userId);
        this.connections.set(userId, conn);
        conn.connect();
        logger.info('DhanFeed opened connection', { userId });
      }
    }

    // Destroy WS for removed / inactive accounts
    for (const [userId, conn] of this.connections) {
      if (!newBrokers.has(userId)) {
        conn.destroy();
        this.connections.delete(userId);
        logger.info('DhanFeed closed stale connection', { userId });
      }
    }

    this.brokersByUser = newBrokers;
  }

  /**
   * Called every tick for all ACTIVE trades.
   *
   * LIVE mode:
   *   - Subscribes each instrument to the user's WS feed.
   *   - WS events update the cache in real-time; no REST call needed.
   *   - If the WS is unhealthy (connecting / reconnecting) and the cache
   *     has no value yet, falls back to a single REST poll batch.
   *
   * PAPER mode:
   *   - Cache is not used; `simulate()` generates the LTP instead.
   *   - No WS subscription or REST call is made.
   */
  async refresh(tradeMap: Map<string, TradeMapEntry>): Promise<void> {
    if (tradeMap.size === 0) return;

    // brokerKey → { creds, ids[] } for REST fallback
    const restFallback = new Map<string, { creds: { clientId: string; accessToken: string }; ids: string[] }>();

    tradeMap.forEach(({ securityId, userId, exchange }) => {
      if (!securityId) return;
      const creds = this.brokersByUser.get(userId);
      if (!creds) return;

      const exch = exchange ?? 'NSE_FNO';
      const conn = this.connections.get(userId);

      if (conn?.isHealthy()) {
        // Happy path — subscribe and let WS events fill the cache
        conn.subscribe(securityId, exch);
      } else {
        // WS not ready — register subscription (will fire once reconnected)
        conn?.subscribe(securityId, exch);
        // REST fallback only for instruments with no cached value yet
        if (!this.cache.has(securityId)) {
          const key = `${creds.clientId}::${creds.accessToken}`;
          if (!restFallback.has(key)) restFallback.set(key, { creds, ids: [] });
          restFallback.get(key)!.ids.push(securityId);
        }
      }
    });

    if (restFallback.size > 0) {
      await Promise.allSettled(
        Array.from(restFallback.values()).map(async ({ creds, ids }) => {
          try {
            const ltps = await fetchLtp(creds, ids);
            Object.entries(ltps).forEach(([id, price]) => this.cache.set(id, price));
            logger.debug('LTP REST fallback', { count: ids.length });
          } catch (e) {
            logger.warn('LTP REST fallback failed', { e });
          }
        }),
      );
    }

    logger.debug('LTP feed refresh', {
      wsConnections: this.connections.size,
      healthy: Array.from(this.connections.values()).filter((c) => c.isHealthy()).length,
      cacheSize: this.cache.size,
      restFallbacks: restFallback.size,
    });
  }

  /** Get the latest cached LTP for a security ID. Returns null if not yet received. */
  get(securityId: string): number | null {
    return this.cache.get(securityId) ?? null;
  }

  /**
   * Simulate LTP for PAPER mode trades.
   * Applies a small symmetric random walk (±0.25) on the current price.
   */
  simulate(currentLtp: number): number {
    const drift = (Math.random() - 0.5) * 0.5;
    return Math.max(0.05, Math.round((currentLtp + drift) * 20) / 20);
  }

  /** Graceful shutdown — closes all WebSocket connections. */
  destroy(): void {
    for (const conn of this.connections.values()) conn.destroy();
    this.connections.clear();
    logger.info('LtpFeed: all connections closed');
  }
}
