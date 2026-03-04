-- ============================================================
-- Migration 005: Holdings, Conditional Triggers, P&L Exit Config
-- Run on existing projects after 004_positions.sql
-- ============================================================

-- ── Holdings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dhan_holdings (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker_account_id   UUID NOT NULL REFERENCES public.broker_accounts(id) ON DELETE CASCADE,
  dhan_client_id      TEXT NOT NULL,
  exchange            TEXT NOT NULL,
  trading_symbol      TEXT NOT NULL,
  security_id         TEXT NOT NULL,
  isin                TEXT,
  total_qty           INT           NOT NULL DEFAULT 0,
  dp_qty              INT           NOT NULL DEFAULT 0,
  t1_qty              INT           NOT NULL DEFAULT 0,
  available_qty       INT           NOT NULL DEFAULT 0,
  collateral_qty      INT           NOT NULL DEFAULT 0,
  avg_cost_price      NUMERIC(12,4) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, broker_account_id, security_id)
);

DROP TRIGGER IF EXISTS dhan_holdings_touch ON public.dhan_holdings;
CREATE OR REPLACE FUNCTION public.touch_dhan_holdings()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER dhan_holdings_touch
  BEFORE UPDATE ON public.dhan_holdings
  FOR EACH ROW EXECUTE FUNCTION public.touch_dhan_holdings();

CREATE INDEX IF NOT EXISTS dhan_holdings_user_idx     ON public.dhan_holdings(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS dhan_holdings_broker_idx   ON public.dhan_holdings(broker_account_id);
CREATE INDEX IF NOT EXISTS dhan_holdings_security_idx ON public.dhan_holdings(security_id);

ALTER TABLE public.dhan_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own holdings"    ON public.dhan_holdings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own holdings"  ON public.dhan_holdings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own holdings"  ON public.dhan_holdings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own holdings"  ON public.dhan_holdings FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all holdings"   ON public.dhan_holdings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));

-- ── Conditional Triggers ─────────────────────────────────────
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

DROP TRIGGER IF EXISTS dhan_conditional_triggers_touch ON public.dhan_conditional_triggers;
CREATE OR REPLACE FUNCTION public.touch_dhan_conditional_triggers()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER dhan_conditional_triggers_touch
  BEFORE UPDATE ON public.dhan_conditional_triggers
  FOR EACH ROW EXECUTE FUNCTION public.touch_dhan_conditional_triggers();

CREATE INDEX IF NOT EXISTS dhan_cond_triggers_user_idx   ON public.dhan_conditional_triggers(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dhan_cond_triggers_broker_idx ON public.dhan_conditional_triggers(broker_account_id);
CREATE INDEX IF NOT EXISTS dhan_cond_triggers_status_idx ON public.dhan_conditional_triggers(alert_status);

ALTER TABLE public.dhan_conditional_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own triggers"    ON public.dhan_conditional_triggers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own triggers"  ON public.dhan_conditional_triggers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own triggers"  ON public.dhan_conditional_triggers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own triggers"  ON public.dhan_conditional_triggers FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all triggers"   ON public.dhan_conditional_triggers FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')));

-- ── P&L Exit Config ──────────────────────────────────────────
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

DROP TRIGGER IF EXISTS dhan_pnl_exit_config_touch ON public.dhan_pnl_exit_config;
CREATE OR REPLACE FUNCTION public.touch_dhan_pnl_exit_config()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER dhan_pnl_exit_config_touch
  BEFORE UPDATE ON public.dhan_pnl_exit_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_dhan_pnl_exit_config();

CREATE INDEX IF NOT EXISTS dhan_pnl_exit_config_user_idx ON public.dhan_pnl_exit_config(user_id);

ALTER TABLE public.dhan_pnl_exit_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own pnl exit config"   ON public.dhan_pnl_exit_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert own pnl exit config" ON public.dhan_pnl_exit_config FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Realtime ─────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.dhan_holdings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dhan_conditional_triggers;
