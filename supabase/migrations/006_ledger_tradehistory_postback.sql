-- ============================================================
-- Migration 006 — Ledger, Trade History & Postback Logs
-- Generated: 2026-03-04
-- ============================================================

-- ── dhan_ledger ──────────────────────────────────────────────
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

ALTER TABLE public.dhan_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own ledger"
  ON public.dhan_ledger FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role manage ledger"
  ON public.dhan_ledger FOR ALL USING (true) WITH CHECK (true);

-- ── dhan_trade_history ───────────────────────────────────────
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

ALTER TABLE public.dhan_trade_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own trade history"
  ON public.dhan_trade_history FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role manage trade history"
  ON public.dhan_trade_history FOR ALL USING (true) WITH CHECK (true);

-- ── dhan_postback_logs ───────────────────────────────────────
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

ALTER TABLE public.dhan_postback_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own postback logs"
  ON public.dhan_postback_logs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role manage postback logs"
  ON public.dhan_postback_logs FOR ALL USING (true) WITH CHECK (true);

-- Realtime for postback logs (UI can subscribe to new webhook events)
ALTER PUBLICATION supabase_realtime ADD TABLE public.dhan_postback_logs;
