-- ============================================================
-- Migration 004: dhan_positions
-- Run on existing projects after 003_super_forever_orders.sql
-- ============================================================

-- ── Table ────────────────────────────────────────────────────
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
  buy_qty                   INT           NOT NULL DEFAULT 0,
  sell_qty                  INT           NOT NULL DEFAULT 0,
  net_qty                   INT           NOT NULL DEFAULT 0,

  realized_profit           NUMERIC(14,4) NOT NULL DEFAULT 0,
  unrealized_profit         NUMERIC(14,4) NOT NULL DEFAULT 0,

  rbi_reference_rate        NUMERIC(12,4) NOT NULL DEFAULT 1,
  multi_lot_quantity        INT           NOT NULL DEFAULT 1,
  carry_forward_buy_qty     INT           NOT NULL DEFAULT 0,
  carry_forward_sell_qty    INT           NOT NULL DEFAULT 0,
  carry_forward_buy_value   NUMERIC(14,4) NOT NULL DEFAULT 0,
  carry_forward_sell_value  NUMERIC(14,4) NOT NULL DEFAULT 0,
  day_buy_qty               INT           NOT NULL DEFAULT 0,
  day_sell_qty              INT           NOT NULL DEFAULT 0,
  day_buy_value             NUMERIC(14,4) NOT NULL DEFAULT 0,
  day_sell_value            NUMERIC(14,4) NOT NULL DEFAULT 0,

  cross_currency            BOOLEAN       NOT NULL DEFAULT false,
  drv_expiry_date           DATE,
  drv_option_type           TEXT CHECK (drv_option_type IN ('CALL','PUT')),
  drv_strike_price          NUMERIC(12,4) NOT NULL DEFAULT 0,

  ltp                       NUMERIC(12,4),
  raw_response              JSONB,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, broker_account_id, security_id, product_type, exchange_segment)
);

-- ── Trigger ───────────────────────────────────────────────────
DROP TRIGGER IF EXISTS dhan_positions_touch ON public.dhan_positions;

CREATE OR REPLACE FUNCTION public.touch_dhan_positions()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER dhan_positions_touch
  BEFORE UPDATE ON public.dhan_positions
  FOR EACH ROW EXECUTE FUNCTION public.touch_dhan_positions();

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS dhan_positions_user_idx        ON public.dhan_positions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS dhan_positions_broker_idx      ON public.dhan_positions(broker_account_id);
CREATE INDEX IF NOT EXISTS dhan_positions_security_idx    ON public.dhan_positions(security_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.dhan_positions ENABLE ROW LEVEL SECURITY;

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

-- ── Realtime ─────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.dhan_positions;
