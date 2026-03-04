-- ============================================================
-- Migration 003: Super Orders + Forever Orders
-- Run this on existing projects to add the new order type tables.
-- ============================================================

-- ── dhan_super_orders ────────────────────────────────────────────────────────
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
  leg_details          JSONB NOT NULL DEFAULT '[]',
  raw_response         JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, order_id)
);

CREATE OR REPLACE FUNCTION public.touch_dhan_super_orders()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS dhan_super_orders_touch ON public.dhan_super_orders;
CREATE TRIGGER dhan_super_orders_touch
  BEFORE UPDATE ON public.dhan_super_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_dhan_super_orders();

CREATE INDEX IF NOT EXISTS dhan_super_orders_user_idx     ON public.dhan_super_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dhan_super_orders_order_id_idx ON public.dhan_super_orders(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dhan_super_orders_status_idx   ON public.dhan_super_orders(order_status);

ALTER TABLE public.dhan_super_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own super orders"
  ON public.dhan_super_orders FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own super orders"
  ON public.dhan_super_orders FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own super orders"
  ON public.dhan_super_orders FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own super orders"
  ON public.dhan_super_orders FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all super orders"
  ON public.dhan_super_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

-- ── dhan_forever_orders ──────────────────────────────────────────────────────
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

DROP TRIGGER IF EXISTS dhan_forever_orders_touch ON public.dhan_forever_orders;
CREATE TRIGGER dhan_forever_orders_touch
  BEFORE UPDATE ON public.dhan_forever_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_dhan_forever_orders();

CREATE INDEX IF NOT EXISTS dhan_forever_orders_user_idx     ON public.dhan_forever_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dhan_forever_orders_order_id_idx ON public.dhan_forever_orders(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dhan_forever_orders_status_idx   ON public.dhan_forever_orders(order_status);

ALTER TABLE public.dhan_forever_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own forever orders"
  ON public.dhan_forever_orders FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own forever orders"
  ON public.dhan_forever_orders FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own forever orders"
  ON public.dhan_forever_orders FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own forever orders"
  ON public.dhan_forever_orders FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all forever orders"
  ON public.dhan_forever_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

-- ── Realtime ──────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.dhan_super_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dhan_forever_orders;
