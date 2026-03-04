-- ============================================================
-- Matrix Pro v2 — Migration 001: Dhan Auth Enhancements
-- Run this in Supabase SQL Editor AFTER the initial schema.sql
-- ============================================================

-- Add app_secret column (for OAuth key+secret flow)
ALTER TABLE public.broker_accounts
  ADD COLUMN IF NOT EXISTS app_secret       TEXT,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auth_method      TEXT NOT NULL DEFAULT 'manual'
    CHECK (auth_method IN ('manual', 'oauth', 'totp'));

-- Rename: client_id is already the Dhan Client ID, api_key is the app_id (Dhan naming)
-- No rename needed — we keep api_key as the field that holds
-- the API Key / app_id from Dhan. When using manual mode it holds a
-- legacy key; for OAuth mode it holds the app_id.

COMMENT ON COLUMN public.broker_accounts.api_key IS
  'In OAuth mode: holds the Dhan app_id (API Key). In manual mode: any identifier.';
COMMENT ON COLUMN public.broker_accounts.app_secret IS
  'OAuth only: the Dhan app_secret. Encrypted at rest via pgcrypto in production.';
COMMENT ON COLUMN public.broker_accounts.token_expires_at IS
  'UTC expiry time of the current access_token. Worker auto-renews 30 min before expiry.';
COMMENT ON COLUMN public.broker_accounts.auth_method IS
  'manual = token pasted directly; oauth = 3-step API key flow; totp = pin+totp auto-login.';

-- Index for worker token renewal query
CREATE INDEX IF NOT EXISTS broker_accounts_expires_idx
  ON public.broker_accounts(token_expires_at)
  WHERE is_active = true AND auth_method != 'manual';

-- Done
