/**
 * tokenManager.ts
 * Auto-renews Dhan access tokens that will expire within TOKEN_RENEW_WINDOW_MS.
 * Called periodically from tickEngine.
 *
 * Logic:
 *  1. Query broker_accounts WHERE is_active = true
 *     AND auth_method IN ('oauth', 'totp')   -- manual tokens are user-managed
 *     AND token_expires_at IS NOT NULL
 *     AND token_expires_at < now() + TOKEN_RENEW_WINDOW_MS
 *     AND token_expires_at > now()            -- not already expired (can't renew)
 *  2. For each: POST /v2/RenewToken → update access_token + token_expires_at in DB
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

const DHAN_BASE = process.env.DHAN_BASE_URL ?? 'https://api.dhan.co/v2';

/** Renew tokens expiring within this window (default: 30 minutes) */
const TOKEN_RENEW_WINDOW_MS = 30 * 60 * 1_000;

interface BrokerRow {
  id: string;
  client_id: string;
  access_token: string;
  token_expires_at: string;
  auth_method: string;
}

interface RenewTokenResponse {
  tokenType?: string;
  accessToken?: string;
  expiryTime?: string;
  errorCode?: string;
  errorMessage?: string;
}

async function renewOneDhanToken(broker: BrokerRow, supabase: SupabaseClient): Promise<void> {
  try {
    const res = await fetch(`${DHAN_BASE}/RenewToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-token': broker.access_token,
        'dhanClientId': broker.client_id,
      },
    });

    const data = await res.json() as RenewTokenResponse;

    if (!res.ok || !data.accessToken) {
      logger.warn('tokenManager: renewal failed', {
        brokerId: broker.id,
        clientId: broker.client_id,
        status: res.status,
        error: data.errorMessage ?? data.errorCode,
      });

      // Mark broker as needing attention
      await supabase
        .from('broker_accounts')
        .update({
          health_status:   'ERROR',
          last_checked_at: new Date().toISOString(),
        })
        .eq('id', broker.id);
      return;
    }

    const expiresAt = data.expiryTime
      ? new Date(data.expiryTime).toISOString()
      : new Date(Date.now() + 24 * 60 * 60_000).toISOString();

    await supabase
      .from('broker_accounts')
      .update({
        access_token: data.accessToken,
        token_expires_at: expiresAt,
        health_status: 'OK',
        failure_count: 0,
        last_checked_at: new Date().toISOString(),
      })
      .eq('id', broker.id);

    logger.info('tokenManager: token renewed', {
      brokerId: broker.id,
      clientId: broker.client_id,
      expiresAt,
    });
  } catch (err) {
    logger.error('tokenManager: unexpected error during renewal', {
      brokerId: broker.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Check all non-manual broker accounts and renew tokens expiring soon.
 * Safe to call frequently — only acts on accounts within the renewal window.
 */
export async function checkAndRenewTokens(supabase: SupabaseClient): Promise<void> {
  const windowEnd = new Date(Date.now() + TOKEN_RENEW_WINDOW_MS).toISOString();
  const now = new Date().toISOString();

  const { data: brokers, error } = await supabase
    .from('broker_accounts')
    .select('id, client_id, access_token, token_expires_at, auth_method')
    .eq('is_active', true)
    .in('auth_method', ['oauth', 'totp'])
    .not('token_expires_at', 'is', null)
    .gt('token_expires_at', now)          // not expired yet
    .lt('token_expires_at', windowEnd);   // but expires within the window

  if (error) {
    logger.error('tokenManager: failed to query brokers', { error: error.message });
    return;
  }

  if (!brokers || brokers.length === 0) return;

  logger.info(`tokenManager: renewing ${brokers.length} token(s) expiring within 30m`);

  // Renew serially to avoid rate-limiting
  for (const broker of brokers as BrokerRow[]) {
    await renewOneDhanToken(broker, supabase);
  }
}
