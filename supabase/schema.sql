-- ============================================================
-- Matrix Pro v2 — Supabase Schema
-- Run this in Supabase SQL Editor (Database > SQL Editor)
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT,
  full_name             TEXT,
  avatar_url            TEXT,
  role                  TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin', 'super_admin')),
  tier                  TEXT NOT NULL DEFAULT 'free'   CHECK (tier IN ('free', 'pro', 'elite')),
  is_active             BOOLEAN NOT NULL DEFAULT true,
  daily_trades_used     INT NOT NULL DEFAULT 0,
  daily_trades_reset_at TIMESTAMPTZ,
  subscription_expires_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Daily trade reset at midnight IST (UTC+5:30 = 18:30 UTC)
CREATE OR REPLACE FUNCTION public.reset_daily_trades()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles
  SET daily_trades_used = 0, daily_trades_reset_at = now()
  WHERE daily_trades_reset_at IS NULL
     OR daily_trades_reset_at < now() - INTERVAL '24 hours';
END;
$$;

-- ============================================================
-- BROKER ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.broker_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker          TEXT NOT NULL DEFAULT 'DHAN',
  client_id       TEXT NOT NULL,
  api_key         TEXT NOT NULL,
  access_token    TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  mode            TEXT NOT NULL DEFAULT 'LIVE' CHECK (mode IN ('LIVE', 'PAPER')),
  -- Authentication method
  auth_method     TEXT NOT NULL DEFAULT 'manual' CHECK (auth_method IN ('manual', 'oauth', 'totp')),
  -- api_key holds app_id (OAuth) or legacy API key (manual)
  app_secret      TEXT,                    -- OAuth only: the Dhan app_secret
  token_expires_at TIMESTAMPTZ,            -- UTC expiry; worker auto-renews 30 min before
  health_status   TEXT DEFAULT 'UNKNOWN' CHECK (health_status IN ('OK', 'ERROR', 'UNKNOWN')),
  failure_count   INT NOT NULL DEFAULT 0,
  last_checked_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TRADE NODES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trade_nodes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker_account_id   UUID REFERENCES public.broker_accounts(id) ON DELETE SET NULL,

  -- Instrument
  symbol              TEXT NOT NULL,
  strike              TEXT NOT NULL,
  trading_symbol      TEXT NOT NULL,
  security_id         TEXT,
  exchange            TEXT NOT NULL DEFAULT 'NSE_FNO',

  -- Protocol & mode
  protocol            TEXT NOT NULL CHECK (protocol IN ('PROTECTOR', 'HALF_AND_HALF', 'DOUBLE_SCALPER', 'SINGLE_SCALPER')),
  target_mode         TEXT NOT NULL DEFAULT 'MOMENTUM' CHECK (target_mode IN ('MOMENTUM', 'MANUAL')),
  mode                TEXT NOT NULL DEFAULT 'PAPER' CHECK (mode IN ('LIVE', 'PAPER')),

  -- Prices
  entry_price         NUMERIC(10,2) NOT NULL,
  sl                  NUMERIC(10,2) NOT NULL,
  initial_sl          NUMERIC(10,2) NOT NULL,
  t1                  NUMERIC(10,2) NOT NULL,
  t2                  NUMERIC(10,2) NOT NULL,
  t3                  NUMERIC(10,2) NOT NULL,
  exit_price          NUMERIC(10,2),
  ltp                 NUMERIC(10,2),

  -- Quantities
  lots                INT NOT NULL DEFAULT 1,
  lot_size            INT NOT NULL,
  remaining_quantity  INT NOT NULL,
  remaining_buckets   INT NOT NULL DEFAULT 3,
  lots_per_bucket     INT NOT NULL DEFAULT 1,
  qty_per_bucket      INT NOT NULL,

  -- Protocol state
  t1_hit              BOOLEAN NOT NULL DEFAULT false,
  t2_hit              BOOLEAN NOT NULL DEFAULT false,
  t3_hit              BOOLEAN NOT NULL DEFAULT false,
  sl_hit              BOOLEAN NOT NULL DEFAULT false,
  is_processing       BOOLEAN NOT NULL DEFAULT false,

  -- P&L tracking
  realised_pnl        NUMERIC(12,2),
  booked_pnl          NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_price_reached   NUMERIC(10,2),

  -- Broker order IDs (critical for SL cancel at T3)
  broker_order_id     TEXT,
  sl_order_id         TEXT,

  -- Trade metadata
  status              TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'CLOSED', 'SL_HIT', 'KILLED')),
  ltp_source          TEXT NOT NULL DEFAULT 'SIM' CHECK (ltp_source IN ('BROKER', 'SIM')),
  is_master_signal    BOOLEAN NOT NULL DEFAULT false,
  origin              TEXT NOT NULL DEFAULT 'SELF' CHECK (origin IN ('SELF', 'COPY')),
  parent_trade_id     UUID REFERENCES public.trade_nodes(id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at           TIMESTAMPTZ
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trade_nodes_touch
  BEFORE UPDATE ON public.trade_nodes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS trade_nodes_user_status_idx ON public.trade_nodes(user_id, status);
CREATE INDEX IF NOT EXISTS trade_nodes_status_idx ON public.trade_nodes(status);
CREATE INDEX IF NOT EXISTS trade_nodes_master_idx ON public.trade_nodes(is_master_signal) WHERE is_master_signal = true;

-- ============================================================
-- BROKER HEALTH (separate table per blueprint spec)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.broker_health (
  broker_id       TEXT PRIMARY KEY,
  state           TEXT NOT NULL DEFAULT 'UNKNOWN'
                    CHECK (state IN ('OK', 'DEGRADED', 'DOWN', 'UNKNOWN')),
  failure_count   INT NOT NULL DEFAULT 0,
  last_checked_at TIMESTAMPTZ,
  last_error      TEXT
);

-- ============================================================
-- COPY SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.copy_subscriptions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leader_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  lot_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (follower_id, leader_id)
);

-- ============================================================
-- DHAN ORDERS  (order book cache + manual/protocol order log)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dhan_orders (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker_account_id    UUID REFERENCES public.broker_accounts(id) ON DELETE SET NULL,
  trade_node_id        UUID REFERENCES public.trade_nodes(id) ON DELETE SET NULL,

  -- Dhan identifiers
  dhan_client_id       TEXT NOT NULL,
  order_id             TEXT,                          -- set once Dhan returns it
  correlation_id       TEXT,

  -- Order parameters (exactly as sent / received from Dhan)
  transaction_type     TEXT NOT NULL CHECK (transaction_type IN ('BUY','SELL')),
  exchange_segment     TEXT NOT NULL,
  product_type         TEXT NOT NULL CHECK (product_type IN ('CNC','INTRADAY','MARGIN','MTF','CO','BO')),
  order_type           TEXT NOT NULL CHECK (order_type IN ('LIMIT','MARKET','STOP_LOSS','STOP_LOSS_MARKET')),
  validity             TEXT NOT NULL DEFAULT 'DAY' CHECK (validity IN ('DAY','IOC')),
  trading_symbol       TEXT,
  security_id          TEXT NOT NULL,
  quantity             INT NOT NULL,
  disclosed_quantity   INT NOT NULL DEFAULT 0,
  price                NUMERIC(10,2) NOT NULL DEFAULT 0,
  trigger_price        NUMERIC(10,2) NOT NULL DEFAULT 0,
  after_market_order   BOOLEAN NOT NULL DEFAULT false,
  amo_time             TEXT,
  bo_profit_value      NUMERIC(10,2) DEFAULT 0,
  bo_stop_loss_value   NUMERIC(10,2) DEFAULT 0,
  leg_name             TEXT CHECK (leg_name IN ('ENTRY_LEG','TARGET_LEG','STOP_LOSS_LEG')),

  -- Status fields (synced from Dhan order book)
  order_status         TEXT CHECK (order_status IN ('TRANSIT','PENDING','REJECTED','CANCELLED','PART_TRADED','TRADED','EXPIRED')),
  remaining_quantity   INT DEFAULT 0,
  average_traded_price NUMERIC(10,2) DEFAULT 0,
  filled_qty           INT DEFAULT 0,
  oms_error_code       TEXT,
  oms_error_desc       TEXT,
  algo_id              TEXT,

  -- Dhan timestamps (stored as TEXT per API response format)
  dhan_create_time     TEXT,
  dhan_update_time     TEXT,
  dhan_exchange_time   TEXT,

  -- F&O fields
  drv_expiry_date      TEXT,
  drv_option_type      TEXT CHECK (drv_option_type IN ('CALL','PUT')),
  drv_strike_price     NUMERIC(10,2),

  -- Source
  source               TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','PROTOCOL')),
  raw_response         JSONB,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER dhan_orders_touch
  BEFORE UPDATE ON public.dhan_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS dhan_orders_user_idx        ON public.dhan_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dhan_orders_order_id_idx    ON public.dhan_orders(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dhan_orders_status_idx      ON public.dhan_orders(order_status);
CREATE INDEX IF NOT EXISTS dhan_orders_broker_idx      ON public.dhan_orders(broker_account_id);

-- ============================================================
-- DHAN TRADES  (trade book cache — executed fills)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dhan_trades (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker_account_id    UUID REFERENCES public.broker_accounts(id) ON DELETE SET NULL,

  -- Dhan identifiers
  dhan_client_id       TEXT NOT NULL,
  order_id             TEXT NOT NULL,
  exchange_order_id    TEXT,
  exchange_trade_id    TEXT UNIQUE,             -- dedupe key

  -- Trade details
  transaction_type     TEXT NOT NULL CHECK (transaction_type IN ('BUY','SELL')),
  exchange_segment     TEXT NOT NULL,
  product_type         TEXT NOT NULL,
  order_type           TEXT NOT NULL,
  trading_symbol       TEXT,
  security_id          TEXT,
  traded_quantity      INT NOT NULL,
  traded_price         NUMERIC(10,2) NOT NULL,

  -- Dhan timestamps
  dhan_create_time     TEXT,
  dhan_update_time     TEXT,
  dhan_exchange_time   TEXT,

  -- F&O fields
  drv_expiry_date      TEXT,
  drv_option_type      TEXT CHECK (drv_option_type IN ('CALL','PUT')),
  drv_strike_price     NUMERIC(10,2),

  raw_response         JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dhan_trades_user_idx        ON public.dhan_trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dhan_trades_order_id_idx    ON public.dhan_trades(order_id);
CREATE INDEX IF NOT EXISTS dhan_trades_broker_idx      ON public.dhan_trades(broker_account_id);

-- ============================================================
-- DHAN SUPER ORDERS (entry + nested target/stoploss legs)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dhan_super_orders (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker_account_id    UUID REFERENCES public.broker_accounts(id) ON DELETE SET NULL,
  dhan_client_id       TEXT NOT NULL,
  order_id             TEXT,
  correlation_id       TEXT,
  transaction_type     TEXT NOT NULL CHECK (transaction_type IN ('BUY','SELL')),
  exchange_segment     TEXT NOT NULL,
  product_type         TEXT NOT NULL CHECK (product_type IN ('CNC','INTRADAY','MARGIN','MTF')),
  order_type           TEXT NOT NULL CHECK (order_type IN ('LIMIT','MARKET')),
  validity             TEXT NOT NULL DEFAULT 'DAY',
  security_id          TEXT NOT NULL,
  trading_symbol       TEXT,
  quantity             INT NOT NULL,
  remaining_quantity   INT NOT NULL DEFAULT 0,
  price                NUMERIC(10,2) NOT NULL DEFAULT 0,
  target_price         NUMERIC(10,2) NOT NULL DEFAULT 0,
  stop_loss_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  trailing_jump        NUMERIC(10,2) NOT NULL DEFAULT 0,
  ltp                  NUMERIC(10,2),
  after_market_order   BOOLEAN NOT NULL DEFAULT false,
  leg_name             TEXT CHECK (leg_name IN ('ENTRY_LEG','TARGET_LEG','STOP_LOSS_LEG')),
  exchange_order_id    TEXT,
  order_status         TEXT CHECK (order_status IN (
                         'TRANSIT','PENDING','CLOSED','REJECTED',
                         'CANCELLED','PART_TRADED','TRADED','TRIGGERED','EXPIRED'
                       )),
  average_traded_price NUMERIC(10,2) DEFAULT 0,
  filled_qty           INT DEFAULT 0,
  oms_error_desc       TEXT,
  dhan_create_time     TEXT,
  dhan_update_time     TEXT,
  dhan_exchange_time   TEXT,
  leg_details          JSONB NOT NULL DEFAULT '[]',  -- nested DhanSuperOrderLegDetail[]
  raw_response         JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, order_id)
);

CREATE OR REPLACE FUNCTION public.touch_dhan_super_orders()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER dhan_super_orders_touch
  BEFORE UPDATE ON public.dhan_super_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_dhan_super_orders();

CREATE INDEX IF NOT EXISTS dhan_super_orders_user_idx     ON public.dhan_super_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dhan_super_orders_order_id_idx ON public.dhan_super_orders(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dhan_super_orders_status_idx   ON public.dhan_super_orders(order_status);

-- ============================================================
-- DHAN FOREVER ORDERS (GTT / OCO — Good-Till-Triggered)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dhan_forever_orders (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker_account_id    UUID REFERENCES public.broker_accounts(id) ON DELETE SET NULL,
  dhan_client_id       TEXT NOT NULL,
  order_id             TEXT,
  order_flag           TEXT NOT NULL CHECK (order_flag IN ('SINGLE','OCO')),
  correlation_id       TEXT,
  transaction_type     TEXT NOT NULL CHECK (transaction_type IN ('BUY','SELL')),
  exchange_segment     TEXT NOT NULL,
  product_type         TEXT NOT NULL,
  order_type           TEXT NOT NULL,
  security_id          TEXT NOT NULL,
  trading_symbol       TEXT,
  quantity             INT NOT NULL,
  price                NUMERIC(10,2) NOT NULL DEFAULT 0,
  trigger_price        NUMERIC(10,2) NOT NULL DEFAULT 0,
  disclosed_quantity   INT NOT NULL DEFAULT 0,
  leg_name             TEXT,
  order_status         TEXT CHECK (order_status IN (
                         'TRANSIT','PENDING','REJECTED','CANCELLED',
                         'TRADED','EXPIRED','CONFIRM'
                       )),
  -- OCO second leg
  price1               NUMERIC(10,2),
  trigger_price1       NUMERIC(10,2),
  quantity1            INT,
  -- Derivatives
  drv_expiry_date      TEXT,
  drv_option_type      TEXT CHECK (drv_option_type IN ('CALL','PUT')),
  drv_strike_price     NUMERIC(10,2),
  dhan_create_time     TEXT,
  dhan_update_time     TEXT,
  dhan_exchange_time   TEXT,
  raw_response         JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, order_id)
);

CREATE OR REPLACE FUNCTION public.touch_dhan_forever_orders()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER dhan_forever_orders_touch
  BEFORE UPDATE ON public.dhan_forever_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_dhan_forever_orders();

CREATE INDEX IF NOT EXISTS dhan_forever_orders_user_idx     ON public.dhan_forever_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dhan_forever_orders_order_id_idx ON public.dhan_forever_orders(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dhan_forever_orders_status_idx   ON public.dhan_forever_orders(order_status);

-- ============================================================
-- POSITIONS (snapshot per broker refresh)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dhan_positions (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker_account_id         UUID NOT NULL REFERENCES public.broker_accounts(id) ON DELETE CASCADE,
  dhan_client_id            TEXT NOT NULL,

  security_id               TEXT NOT NULL,
  trading_symbol            TEXT NOT NULL,
  exchange_segment          TEXT NOT NULL,
  product_type              TEXT NOT NULL CHECK (product_type IN ('CNC','INTRADAY','MARGIN','MTF','CO','BO')),
  position_type             TEXT NOT NULL CHECK (position_type IN ('LONG','SHORT')),

  buy_avg                   NUMERIC(12,4) NOT NULL DEFAULT 0,
  sell_avg                  NUMERIC(12,4) NOT NULL DEFAULT 0,
  cost_price                NUMERIC(12,4) NOT NULL DEFAULT 0,
  buy_qty                   INT          NOT NULL DEFAULT 0,
  sell_qty                  INT          NOT NULL DEFAULT 0,
  net_qty                   INT          NOT NULL DEFAULT 0,

  realized_profit           NUMERIC(14,4) NOT NULL DEFAULT 0,
  unrealized_profit         NUMERIC(14,4) NOT NULL DEFAULT 0,

  rbi_reference_rate        NUMERIC(12,4) NOT NULL DEFAULT 1,
  multi_lot_quantity        INT          NOT NULL DEFAULT 1,
  carry_forward_buy_qty     INT          NOT NULL DEFAULT 0,
  carry_forward_sell_qty    INT          NOT NULL DEFAULT 0,
  carry_forward_buy_value   NUMERIC(14,4) NOT NULL DEFAULT 0,
  carry_forward_sell_value  NUMERIC(14,4) NOT NULL DEFAULT 0,
  day_buy_qty               INT          NOT NULL DEFAULT 0,
  day_sell_qty              INT          NOT NULL DEFAULT 0,
  day_buy_value             NUMERIC(14,4) NOT NULL DEFAULT 0,
  day_sell_value            NUMERIC(14,4) NOT NULL DEFAULT 0,

  cross_currency            BOOLEAN      NOT NULL DEFAULT false,
  drv_expiry_date           DATE,
  drv_option_type           TEXT CHECK (drv_option_type IN ('CALL','PUT')),
  drv_strike_price          NUMERIC(12,4) NOT NULL DEFAULT 0,

  ltp                       NUMERIC(12,4),
  raw_response              JSONB,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, broker_account_id, security_id, product_type, exchange_segment)
);

CREATE OR REPLACE FUNCTION public.touch_dhan_positions()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER dhan_positions_touch
  BEFORE UPDATE ON public.dhan_positions
  FOR EACH ROW EXECUTE FUNCTION public.touch_dhan_positions();

CREATE INDEX IF NOT EXISTS dhan_positions_user_idx        ON public.dhan_positions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS dhan_positions_broker_idx      ON public.dhan_positions(broker_account_id);
CREATE INDEX IF NOT EXISTS dhan_positions_security_idx    ON public.dhan_positions(security_id);

-- ============================================================
-- HOLDINGS (demat snapshot per broker refresh)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dhan_holdings (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker_account_id   UUID NOT NULL REFERENCES public.broker_accounts(id) ON DELETE CASCADE,
  dhan_client_id      TEXT NOT NULL,
  exchange            TEXT NOT NULL,
  trading_symbol      TEXT NOT NULL,
  security_id         TEXT NOT NULL,
  isin                TEXT,
  total_qty           INT          NOT NULL DEFAULT 0,
  dp_qty              INT          NOT NULL DEFAULT 0,
  t1_qty              INT          NOT NULL DEFAULT 0,
  available_qty       INT          NOT NULL DEFAULT 0,
  collateral_qty      INT          NOT NULL DEFAULT 0,
  avg_cost_price      NUMERIC(12,4) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, broker_account_id, security_id)
);

CREATE OR REPLACE FUNCTION public.touch_dhan_holdings()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER dhan_holdings_touch
  BEFORE UPDATE ON public.dhan_holdings
  FOR EACH ROW EXECUTE FUNCTION public.touch_dhan_holdings();

CREATE INDEX IF NOT EXISTS dhan_holdings_user_idx     ON public.dhan_holdings(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS dhan_holdings_broker_idx   ON public.dhan_holdings(broker_account_id);
CREATE INDEX IF NOT EXISTS dhan_holdings_security_idx ON public.dhan_holdings(security_id);

-- ============================================================
-- CONDITIONAL TRIGGERS (Dhan alerts/orders)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dhan_conditional_triggers (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker_account_id   UUID NOT NULL REFERENCES public.broker_accounts(id) ON DELETE CASCADE,
  dhan_client_id      TEXT NOT NULL,
  alert_id            TEXT NOT NULL,
  alert_status        TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (alert_status IN ('ACTIVE','TRIGGERED','CANCELLED','EXPIRED','INACTIVE')),
  condition           JSONB NOT NULL DEFAULT '{}',
  orders              JSONB NOT NULL DEFAULT '[]',
  last_price          NUMERIC(12,4),
  dhan_created_time   TIMESTAMPTZ,
  triggered_time      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, alert_id)
);

CREATE OR REPLACE FUNCTION public.touch_dhan_conditional_triggers()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER dhan_conditional_triggers_touch
  BEFORE UPDATE ON public.dhan_conditional_triggers
  FOR EACH ROW EXECUTE FUNCTION public.touch_dhan_conditional_triggers();

CREATE INDEX IF NOT EXISTS dhan_cond_triggers_user_idx     ON public.dhan_conditional_triggers(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dhan_cond_triggers_broker_idx   ON public.dhan_conditional_triggers(broker_account_id);
CREATE INDEX IF NOT EXISTS dhan_cond_triggers_status_idx   ON public.dhan_conditional_triggers(alert_status);

-- ============================================================
-- P&L EXIT CONFIG (per broker, one active config)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dhan_pnl_exit_config (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker_account_id   UUID NOT NULL REFERENCES public.broker_accounts(id) ON DELETE CASCADE,
  profit_value        NUMERIC(14,4) NOT NULL DEFAULT 0,
  loss_value          NUMERIC(14,4) NOT NULL DEFAULT 0,
  product_type        JSONB NOT NULL DEFAULT '["INTRADAY"]',
  enable_kill_switch  BOOLEAN NOT NULL DEFAULT false,
  status              TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE','INACTIVE','DISABLED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (broker_account_id)
);

CREATE OR REPLACE FUNCTION public.touch_dhan_pnl_exit_config()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER dhan_pnl_exit_config_touch
  BEFORE UPDATE ON public.dhan_pnl_exit_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_dhan_pnl_exit_config();

CREATE INDEX IF NOT EXISTS dhan_pnl_exit_config_user_idx ON public.dhan_pnl_exit_config(user_id);

-- ============================================================
-- ORDER LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.order_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trade_id          UUID NOT NULL REFERENCES public.trade_nodes(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker_order_id   TEXT,
  order_type        TEXT,
  transaction_type  TEXT,
  quantity          INT,
  price             NUMERIC(10,2),
  status            TEXT,
  error_message     TEXT,
  raw_response      JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TRADE EVENTS (Realtime log of price triggers)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trade_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trade_id    UUID NOT NULL REFERENCES public.trade_nodes(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  price       NUMERIC(10,2),
  quantity    INT,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SUBSCRIPTIONS (Razorpay payment records)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier                     TEXT NOT NULL,
  razorpay_subscription_id TEXT,
  payment_ref              TEXT UNIQUE,
  amount                   NUMERIC(10,2),
  status                   TEXT NOT NULL DEFAULT 'trial'
                             CHECK (status IN ('active', 'cancelled', 'expired', 'trial')),
  starts_at                TIMESTAMPTZ,
  expires_at               TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SYSTEM FLAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_flags (
  flag_key    TEXT PRIMARY KEY,
  flag_value  BOOLEAN NOT NULL DEFAULT false,
  updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default flags
INSERT INTO public.system_flags (flag_key, flag_value) VALUES
  ('KILL_SWITCH',       false),
  ('CIRCUIT_BREAKER',   false),
  ('MAINTENANCE_MODE',  false),
  ('PAPER_ONLY_MODE',   false)
ON CONFLICT (flag_key) DO NOTHING;

-- ============================================================
-- DHAN LEDGER
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dhan_ledger (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker_account_id   UUID NOT NULL REFERENCES public.broker_accounts(id) ON DELETE CASCADE,
  dhan_client_id      TEXT NOT NULL,
  from_date           DATE NOT NULL,
  to_date             DATE NOT NULL,
  narration           TEXT,
  voucherdate         TEXT,
  exchange            TEXT,
  voucherdesc         TEXT,
  vouchernumber       TEXT,
  debit               NUMERIC(16,2) DEFAULT 0,
  credit              NUMERIC(16,2) DEFAULT 0,
  runbal              NUMERIC(16,2) DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dhan_ledger_user_idx    ON public.dhan_ledger(user_id);
CREATE INDEX IF NOT EXISTS dhan_ledger_broker_idx  ON public.dhan_ledger(broker_account_id);
CREATE INDEX IF NOT EXISTS dhan_ledger_dates_idx   ON public.dhan_ledger(broker_account_id, from_date, to_date);

-- ============================================================
-- DHAN TRADE HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dhan_trade_history (
  id                             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker_account_id              UUID NOT NULL REFERENCES public.broker_accounts(id) ON DELETE CASCADE,
  dhan_client_id                 TEXT NOT NULL,
  from_date                      DATE NOT NULL,
  to_date                        DATE NOT NULL,
  page_number                    INT NOT NULL DEFAULT 0,
  order_id                       TEXT NOT NULL,
  exchange_trade_id              TEXT NOT NULL,
  transaction_type               TEXT,
  exchange_segment               TEXT,
  product_type                   TEXT,
  order_type                     TEXT,
  trading_symbol                 TEXT,
  custom_symbol                  TEXT,
  security_id                    TEXT,
  traded_quantity                INT,
  traded_price                   NUMERIC(12,4),
  isin                           TEXT,
  instrument                     TEXT,
  sebi_tax                       NUMERIC(12,6) DEFAULT 0,
  stt                            NUMERIC(12,6) DEFAULT 0,
  brokerage_charges              NUMERIC(12,6) DEFAULT 0,
  service_tax                    NUMERIC(12,6) DEFAULT 0,
  exchange_transaction_charges   NUMERIC(12,6) DEFAULT 0,
  stamp_duty                     NUMERIC(12,6) DEFAULT 0,
  exchange_time                  TEXT,
  drv_expiry_date                TEXT,
  drv_option_type                TEXT,
  drv_strike_price               NUMERIC(12,2) DEFAULT 0,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(broker_account_id, order_id, exchange_trade_id)
);

CREATE INDEX IF NOT EXISTS dhan_trade_history_user_idx    ON public.dhan_trade_history(user_id);
CREATE INDEX IF NOT EXISTS dhan_trade_history_broker_idx  ON public.dhan_trade_history(broker_account_id);
CREATE INDEX IF NOT EXISTS dhan_trade_history_dates_idx   ON public.dhan_trade_history(broker_account_id, from_date, to_date);

-- ============================================================
-- DHAN POSTBACK LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dhan_postback_logs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broker_account_id   UUID REFERENCES public.broker_accounts(id) ON DELETE SET NULL,
  user_id             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  dhan_client_id      TEXT NOT NULL,
  order_id            TEXT NOT NULL,
  correlation_id      TEXT,
  order_status        TEXT NOT NULL,
  transaction_type    TEXT,
  exchange_segment    TEXT,
  product_type        TEXT,
  order_type          TEXT,
  validity            TEXT,
  trading_symbol      TEXT,
  security_id         TEXT,
  quantity            INT,
  price               NUMERIC(12,4),
  trigger_price       NUMERIC(12,4) DEFAULT 0,
  filled_qty          INT DEFAULT 0,
  oms_error_code      TEXT,
  oms_error_desc      TEXT,
  drv_option_type     TEXT,
  drv_strike_price    NUMERIC(12,2) DEFAULT 0,
  drv_expiry_date     TEXT,
  algo_id             TEXT,
  create_time         TEXT,
  update_time         TEXT,
  exchange_time       TEXT,
  raw_payload         JSONB,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dhan_postback_user_idx    ON public.dhan_postback_logs(user_id);
CREATE INDEX IF NOT EXISTS dhan_postback_broker_idx  ON public.dhan_postback_logs(broker_account_id);
CREATE INDEX IF NOT EXISTS dhan_postback_order_idx   ON public.dhan_postback_logs(dhan_client_id, order_id);
CREATE INDEX IF NOT EXISTS dhan_postback_status_idx  ON public.dhan_postback_logs(order_status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_nodes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dhan_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dhan_trades         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dhan_super_orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dhan_forever_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dhan_positions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dhan_holdings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dhan_conditional_triggers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dhan_pnl_exit_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dhan_ledger                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dhan_trade_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dhan_postback_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_logs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_flags        ENABLE ROW LEVEL SECURITY;

-- ── profiles ──────────────────────────────
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

-- ── broker_accounts ──────────────────────
CREATE POLICY "Users can CRUD own broker accounts"
  ON public.broker_accounts FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all broker accounts"
  ON public.broker_accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

-- ── trade_nodes ──────────────────────────
CREATE POLICY "Users can read own trades"
  ON public.trade_nodes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trades"
  ON public.trade_nodes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users CANNOT update trades directly; only the Railway worker (service role) can.
-- This prevents users from manipulating trade state (e.g. fake-closing a losing trade).

CREATE POLICY "Admins can read all trades"
  ON public.trade_nodes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can update all trades"
  ON public.trade_nodes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

-- ── copy_subscriptions ────────────────────
CREATE POLICY "Users can manage own copy subscriptions"
  ON public.copy_subscriptions FOR ALL
  USING (auth.uid() = follower_id);

CREATE POLICY "Users can view subscriptions where they are leader"
  ON public.copy_subscriptions FOR SELECT
  USING (auth.uid() = leader_id);

-- ── dhan_orders ──────────────────────────
CREATE POLICY "Users can read own dhan orders"
  ON public.dhan_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dhan orders"
  ON public.dhan_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own dhan orders"
  ON public.dhan_orders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own dhan orders"
  ON public.dhan_orders FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all dhan orders"
  ON public.dhan_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

-- ── dhan_super_orders ───────────────────
CREATE POLICY "Users can read own super orders"
  ON public.dhan_super_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own super orders"
  ON public.dhan_super_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own super orders"
  ON public.dhan_super_orders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own super orders"
  ON public.dhan_super_orders FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all super orders"
  ON public.dhan_super_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

-- ── dhan_forever_orders ──────────────────
CREATE POLICY "Users can read own forever orders"
  ON public.dhan_forever_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own forever orders"
  ON public.dhan_forever_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own forever orders"
  ON public.dhan_forever_orders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own forever orders"
  ON public.dhan_forever_orders FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all forever orders"
  ON public.dhan_forever_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

-- ── dhan_holdings ─────────────────────────
CREATE POLICY "Users can read own holdings"
  ON public.dhan_holdings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own holdings"
  ON public.dhan_holdings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own holdings"
  ON public.dhan_holdings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own holdings"
  ON public.dhan_holdings FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all holdings"
  ON public.dhan_holdings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

-- ── dhan_conditional_triggers ──────────────────
CREATE POLICY "Users can read own triggers"
  ON public.dhan_conditional_triggers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own triggers"
  ON public.dhan_conditional_triggers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own triggers"
  ON public.dhan_conditional_triggers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own triggers"
  ON public.dhan_conditional_triggers FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all triggers"
  ON public.dhan_conditional_triggers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

-- ── dhan_pnl_exit_config ───────────────────────
CREATE POLICY "Users can read own pnl exit config"
  ON public.dhan_pnl_exit_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own pnl exit config"
  ON public.dhan_pnl_exit_config FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── dhan_positions ─────────────────────────
CREATE POLICY "Users can read own positions"
  ON public.dhan_positions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own positions"
  ON public.dhan_positions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own positions"
  ON public.dhan_positions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own positions"
  ON public.dhan_positions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all positions"
  ON public.dhan_positions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

-- ── dhan_trades ──────────────────────────
CREATE POLICY "Users can read own dhan trades"
  ON public.dhan_trades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dhan trades"
  ON public.dhan_trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all dhan trades"
  ON public.dhan_trades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

-- ── order_logs ───────────────────────────
CREATE POLICY "Users read own order logs"
  ON public.order_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all order logs"
  ON public.order_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

-- ── trade_events ─────────────────────────
CREATE POLICY "Users read own trade events"
  ON public.trade_events FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.trade_nodes t
      WHERE t.id = trade_events.trade_id AND t.user_id = auth.uid()
    )
  );

-- ── subscriptions ─────────────────────────
CREATE POLICY "Users read own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- ── system_flags ──────────────────────────
CREATE POLICY "Anyone can read system flags"
  ON public.system_flags FOR SELECT
  USING (true);

CREATE POLICY "Admins can upsert system flags"
  ON public.system_flags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

-- ── dhan_ledger ───────────────────────────
CREATE POLICY "Users read own ledger"
  ON public.dhan_ledger FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manage ledger"
  ON public.dhan_ledger FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── dhan_trade_history ───────────────────
CREATE POLICY "Users read own trade history"
  ON public.dhan_trade_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manage trade history"
  ON public.dhan_trade_history FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── dhan_postback_logs ───────────────────
CREATE POLICY "Users read own postback logs"
  ON public.dhan_postback_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manage postback logs"
  ON public.dhan_postback_logs FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- REALTIME publications
-- ============================================================
-- Enable realtime for trade_nodes (for live LTP updates in UI)
ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_nodes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_flags;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dhan_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dhan_super_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dhan_forever_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dhan_positions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dhan_holdings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dhan_conditional_triggers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dhan_postback_logs;

-- ============================================================
-- Done!
-- ============================================================
