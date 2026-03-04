import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

const DAILY_LOSS_CAP = Number(process.env.CIRCUIT_BREAKER_CAP ?? 100000); // ₹1L default

export class CircuitBreaker {
  private supabase: SupabaseClient;
  private triggered = false;
  private dailyPnl = 0;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async sync() {
    // Check DB flag first
    const { data: flagRow } = await this.supabase
      .from('system_flags')
      .select('flag_value')
      .eq('flag_key', 'CIRCUIT_BREAKER')
      .single();

    if (flagRow?.flag_value) {
      this.triggered = true;
      return;
    }

    // Compute today's realised P&L across all LIVE trades
    const today = new Date().toISOString().slice(0, 10);
    const { data: trades } = await this.supabase
      .from('trade_nodes')
      .select('realised_pnl, mode')
      .eq('mode', 'LIVE')
      .not('realised_pnl', 'is', null)
      .gte('closed_at', `${today}T00:00:00`);

    this.dailyPnl = (trades ?? []).reduce((s: number, t: any) => s + (t.realised_pnl ?? 0), 0);

    if (this.dailyPnl <= -DAILY_LOSS_CAP) {
      logger.warn('Circuit breaker triggered', { dailyPnl: this.dailyPnl, cap: DAILY_LOSS_CAP });
      this.triggered = true;
      await this.supabase.from('system_flags').upsert({
        flag_key: 'CIRCUIT_BREAKER',
        flag_value: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'flag_key' });
    } else {
      this.triggered = false;
    }
  }

  isTriggered(): boolean {
    return this.triggered;
  }

  getDailyPnl(): number {
    return this.dailyPnl;
  }

  async reset() {
    this.triggered = false;
    await this.supabase.from('system_flags').upsert({
      flag_key: 'CIRCUIT_BREAKER',
      flag_value: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'flag_key' });
    logger.info('Circuit breaker reset');
  }
}
