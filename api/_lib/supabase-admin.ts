/**
 * Shared Supabase admin client for all API handlers.
 * Uses service role key (bypasses RLS).
 * Checks both SUPABASE_URL and VITE_SUPABASE_URL so the same
 * Vercel env var works regardless of which name the user set.
 */
import { createClient } from '@supabase/supabase-js';
import type { VercelResponse } from '@vercel/node';

const url =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  '';

const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  '';

export const supabaseAdmin = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder');

/**
 * Returns true (and sends a 500) if required env vars are missing.
 * Usage:  if (checkEnv(res)) return;
 */
export function checkEnv(res: VercelResponse): boolean {
  if (!url || !key) {
    res.status(500).json({
      error: 'Server misconfiguration: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in Vercel environment variables.',
    });
    return true;
  }
  return false;
}

/**
 * Fetches a broker account and validates it exists.
 * Returns { broker, error } — broker is typed loosely.
 */
export async function getBroker(brokerId: string) {
  const { data, error } = await supabaseAdmin
    .from('broker_accounts')
    .select('id, access_token, api_key, client_id, mode, user_id, health_status')
    .eq('id', brokerId)
    .single();
  return { broker: data as BrokerRow | null, error };
}

export interface BrokerRow {
  id: string;
  access_token: string | null;
  api_key: string;
  client_id: string;
  mode: 'LIVE' | 'PAPER';
  user_id: string;
  health_status: string | null;
}

/** Standard Dhan request headers */
export function dhanHeaders(broker: BrokerRow): Record<string, string> {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'access-token': broker.access_token ?? broker.api_key,
    'client-id': broker.client_id,
  };
}

export const DHAN_BASE = process.env.DHAN_BASE_URL ?? 'https://api.dhan.co/v2';
