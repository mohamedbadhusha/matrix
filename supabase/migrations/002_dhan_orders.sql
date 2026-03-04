-- ============================================================
-- Migration 002: Dhan Orders & Trades tables
-- Run in Supabase SQL Editor for existing projects
-- ============================================================

-- ── dhan_orders ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dhan_orders (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker_account_id    UUID REFERENCES public.broker_accounts(id) ON DELETE SET NULL,
  trade_node_id        UUID REFERENCES public.trade_nodes(id) ON DELETE SET NULL,

  dhan_client_id       TEXT NOT NULL,
  order_id             TEXT,
  correlation_id       TEXT,

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

  order_status         TEXT CHECK (order_status IN ('TRANSIT','PENDING','REJECTED','CANCELLED','PART_TRADED','TRADED','EXPIRED')),
  remaining_quantity   INT DEFAULT 0,
  average_traded_price NUMERIC(10,2) DEFAULT 0,
  filled_qty           INT DEFAULT 0,
  oms_error_code       TEXT,
  oms_error_desc       TEXT,
  algo_id              TEXT,

  dhan_create_time     TEXT,
  dhan_update_time     TEXT,
  dhan_exchange_time   TEXT,

  drv_expiry_date      TEXT,
  drv_option_type      TEXT CHECK (drv_option_type IN ('CALL','PUT')),
  drv_strike_price     NUMERIC(10,2),

  source               TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','PROTOCOL')),
  raw_response         JSONB,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS dhan_orders_touch ON public.dhan_orders;
CREATE TRIGGER dhan_orders_touch
  BEFORE UPDATE ON public.dhan_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS dhan_orders_user_idx        ON public.dhan_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dhan_orders_order_id_idx    ON public.dhan_orders(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dhan_orders_status_idx      ON public.dhan_orders(order_status);
CREATE INDEX IF NOT EXISTS dhan_orders_broker_idx      ON public.dhan_orders(broker_account_id);

-- ── dhan_trades ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dhan_trades (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker_account_id    UUID REFERENCES public.broker_accounts(id) ON DELETE SET NULL,

  dhan_client_id       TEXT NOT NULL,
  order_id             TEXT NOT NULL,
  exchange_order_id    TEXT,
  exchange_trade_id    TEXT UNIQUE,

  transaction_type     TEXT NOT NULL CHECK (transaction_type IN ('BUY','SELL')),
  exchange_segment     TEXT NOT NULL,
  product_type         TEXT NOT NULL,
  order_type           TEXT NOT NULL,
  trading_symbol       TEXT,
  security_id          TEXT,
  traded_quantity      INT NOT NULL,
  traded_price         NUMERIC(10,2) NOT NULL,

  dhan_create_time     TEXT,
  dhan_update_time     TEXT,
  dhan_exchange_time   TEXT,

  drv_expiry_date      TEXT,
  drv_option_type      TEXT CHECK (drv_option_type IN ('CALL','PUT')),
  drv_strike_price     NUMERIC(10,2),

  raw_response         JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dhan_trades_user_idx        ON public.dhan_trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dhan_trades_order_id_idx    ON public.dhan_trades(order_id);
CREATE INDEX IF NOT EXISTS dhan_trades_broker_idx      ON public.dhan_trades(broker_account_id);

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE public.dhan_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dhan_trades  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own dhan orders"
  ON public.dhan_orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own dhan orders"
  ON public.dhan_orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own dhan orders"
  ON public.dhan_orders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own dhan orders"
  ON public.dhan_orders FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all dhan orders"
  ON public.dhan_orders FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));

CREATE POLICY "Users can read own dhan trades"
  ON public.dhan_trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own dhan trades"
  ON public.dhan_trades FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can read all dhan trades"
  ON public.dhan_trades FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));

-- ── Realtime ───────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.dhan_orders;
