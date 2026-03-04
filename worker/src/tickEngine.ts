import { SupabaseClient } from '@supabase/supabase-js';
import { LtpFeed, TradeMapEntry } from './ltpFeed';
import { CircuitBreaker } from './circuitBreaker';
import { createCopyTrades } from './copyTrading';
import {
  handleProtector,
  handleHalfAndHalf,
  handleDoubleScalper,
  handleSingleScalper,
  TradeNode,
} from './protocolHandlers';
import { checkAndRenewTokens } from './tokenManager';
import { logger } from './logger';

const TICK_INTERVAL_MS = 1000;
const BROKER_REFRESH_INTERVAL = 60;   // ticks
const CIRCUIT_BREAKER_INTERVAL = 30;  // ticks
const TOKEN_RENEW_INTERVAL = 300;     // ticks (~5 min)

export class TickEngine {
  private supabase: SupabaseClient;
  private ltpFeed: LtpFeed;
  private circuitBreaker: CircuitBreaker;
  private tickCount = 0;
  private running = false;
  private interval: NodeJS.Timeout | null = null;
  /** In-memory lock set — prevents processing the same trade twice if a tick takes >1s */
  private processingLocks = new Set<string>();

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.ltpFeed = new LtpFeed(supabase);
    this.circuitBreaker = new CircuitBreaker(supabase);
  }

  async start() {
    this.running = true;
    logger.info('Tick engine starting…');

    // Initial setup
    await this.ltpFeed.refreshBrokers();
    await this.circuitBreaker.sync();

    // Listen for new master signals via Realtime
    this.supabase
      .channel('master-signals')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trade_nodes', filter: 'is_master_signal=eq.true' },
        async (payload) => {
          logger.info('New master signal — spawning copy trades', { id: payload.new.id });
          await createCopyTrades(this.supabase, payload.new as Record<string, any>);
        },
      )
      .subscribe();

    this.interval = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    logger.info('Tick engine started — 1s interval');
  }

  stop() {
    this.running = false;
    if (this.interval) clearInterval(this.interval);
    this.ltpFeed.destroy();
    logger.info('Tick engine stopped');
  }

  private async tick() {
    if (!this.running) return;
    this.tickCount++;

    // Periodic refreshes
    if (this.tickCount % BROKER_REFRESH_INTERVAL === 0) {
      await this.ltpFeed.refreshBrokers();
    }
    if (this.tickCount % CIRCUIT_BREAKER_INTERVAL === 0) {
      await this.circuitBreaker.sync();
    }
    if (this.tickCount % TOKEN_RENEW_INTERVAL === 0) {
      await checkAndRenewTokens(this.supabase);
    }

    // Check kill switch
    if (this.circuitBreaker.isTriggered()) {
      if (this.tickCount % 60 === 0)  // log once per minute
        logger.warn('Circuit breaker active — skipping tick');
      return;
    }

    // Fetch kill switch flag
    if (this.tickCount % 10 === 0) {
      const { data: killFlag } = await this.supabase
        .from('system_flags')
        .select('flag_value')
        .eq('flag_key', 'KILL_SWITCH')
        .single();
      if (killFlag?.flag_value) {
        if (this.tickCount % 60 === 0)
          logger.warn('Kill switch active — skipping tick');
        return;
      }
    }

    // Fetch all ACTIVE trades
    const { data: trades, error } = await this.supabase
      .from('trade_nodes')
      .select('*')
      .eq('status', 'ACTIVE');

    if (error) {
      logger.error('Failed to fetch active trades', error.message);
      return;
    }

    if (!trades?.length) return;

    // Build LTP subscription map (exchange included so WS can use correct segment)
    const tradeMap = new Map<string, TradeMapEntry>();
    (trades as TradeNode[]).forEach((t) => {
      if (t.security_id) tradeMap.set(t.id, {
        securityId: t.security_id,
        userId:     t.user_id,
        exchange:   t.exchange ?? 'NSE_FNO',
      });
    });

    // Refresh LTPs from broker
    await this.ltpFeed.refresh(tradeMap);

    // Process each trade — skip trades currently being processed (race condition lock)
    const promises = (trades as TradeNode[])
      .filter((t) => !this.processingLocks.has(t.id))
      .map(async (trade) => {
        this.processingLocks.add(trade.id);
        try {
          let ltp: number | null = null;

          if (trade.mode === 'PAPER') {
            // Simulate LTP for paper trades
            const lastLtp = trade.ltp ?? trade.entry_price;
            ltp = this.ltpFeed.simulate(lastLtp);
          } else {
            ltp = trade.security_id ? this.ltpFeed.get(trade.security_id) : null;
          }

          if (ltp === null || ltp <= 0) return;

          switch (trade.protocol) {
            case 'PROTECTOR':
              await handleProtector(this.supabase, trade, ltp);
              break;
            case 'HALF_AND_HALF':
              await handleHalfAndHalf(this.supabase, trade, ltp);
              break;
            case 'DOUBLE_SCALPER':
              await handleDoubleScalper(this.supabase, trade, ltp);
              break;
            case 'SINGLE_SCALPER':
              await handleSingleScalper(this.supabase, trade, ltp);
              break;
          }
        } finally {
          this.processingLocks.delete(trade.id);
        }
      });

    await Promise.allSettled(promises);

    if (this.tickCount % 60 === 0) {
      logger.info('Tick heartbeat', {
        tick: this.tickCount,
        activeTrades: trades.length,
        circuitPnl: this.circuitBreaker.getDailyPnl(),
      });
    }
  }
}
