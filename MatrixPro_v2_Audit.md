# Matrix Pro v2 — Build Audit
> Cross-checks all built files against blueprint spec.
> Legend: ✅ Complete | ⚠️ Partial/Gap | ❌ Missing/Bug

---

## Overall Status

| Layer | Status | Notes |
|---|---|---|
| TypeScript | ✅ Exit=0 | All files pass `npx tsc --noEmit` |
| Frontend pages | ✅ | 15 member pages + 5 admin pages — all routed + in sidebar |
| Vercel API functions | ✅ | 30 files covering all Dhan API groups |
| DB migrations | ✅ | Migrations 001–006, all tables with RLS + indexes |
| Dhan annexure constants | ✅ | `constants/dhan.ts` — all 14 constant groups |
| TypeScript types | ✅ | `types/index.ts` ~940 lines, all interfaces present |
| WebSocket hook | ✅ | `useOrderUpdateWs.ts` — auto-reconnect, ring buffer |
| Option chain | ✅ | Rate limiting, auto-refresh, ATM, Greeks, OI bars |
| Railway worker | ⚠️ Functional | Critical bugs in protocolHandlers.ts — NOT safe for LIVE |

---

## Section A — Pages and Routes

| Page | Route | Status | Notes |
|---|---|---|---|
| Dashboard | /dashboard | ✅ | Active trades + P&L summary |
| Deploy | /deploy | ✅ | Signal + manual tabs, LIVE warning modal |
| Trade History | /trades | ✅ | Filters by date/protocol/status |
| Orders | /orders | ✅ | 4 tabs: Live / Super / Forever / History |
| Positions | /positions | ✅ | Convert position inline |
| Holdings | /holdings | ✅ | |
| Alerts | /alerts | ✅ | Conditional triggers full CRUD |
| Trader Control | /trader-control | ✅ | Kill switch + P&L exit config |
| Funds | /funds | ✅ | Fund limit + single + multi margin calculators |
| Statement | /statement | ✅ | Ledger + trade history tabs |
| Live Orders | /live-orders | ✅ | WebSocket real-time feed |
| Option Chain | /option-chain | ✅ | Full OC with Greeks/OI/ATM |
| Broker | /broker | ✅ | Dhan account connect |
| Copy Trading | /copy-trading | ✅ | Tier-locked (Pro/Elite) |
| Subscription | /subscription | ✅ | Razorpay billing |
| Admin: Users | /admin/users | ✅ | |
| Admin: All Trades | /admin/trades | ✅ | |
| Admin: Deploy | /admin/deploy | ✅ | Triggers copy fan-out |
| Admin: System | /admin/system | ✅ | super_admin only |
| Admin: Analytics | /admin/analytics | ✅ | |

---

## Section B — Vercel API Functions

| File | Status | Method | Notes |
|---|---|---|---|
| `dhan-orders.ts` | ✅ | GET | upsert dhan_orders |
| `dhan-order.ts` | ✅ | POST | insert dhan_orders |
| `dhan-modify-order.ts` | ✅ | PUT | update dhan_orders |
| `dhan-cancel-order.ts` | ✅ | DELETE | update status |
| `dhan-trades.ts` | ✅ | GET | upsert dhan_trades |
| `dhan-super-orders.ts` | ✅ | GET | upsert |
| `dhan-super-order.ts` | ✅ | POST | insert |
| `dhan-forever-orders.ts` | ✅ | GET/POST/PUT/DELETE | full CRUD |
| `dhan-positions.ts` | ✅ | GET | upsert dhan_positions |
| `dhan-holdings.ts` | ✅ | GET | upsert dhan_holdings |
| `dhan-convert-position.ts` | ✅ | POST | pass-through |
| `dhan-exit-positions.ts` | ✅ | DELETE | clears dhan_positions |
| `dhan-conditional-triggers.ts` | ✅ | GET | upsert |
| `dhan-conditional-trigger.ts` | ✅ | POST | insert |
| `dhan-modify-conditional-trigger.ts` | ✅ | PUT | update |
| `dhan-delete-conditional-trigger.ts` | ✅ | DELETE | update status |
| `dhan-killswitch.ts` | ✅ | GET/POST | updates health_status |
| `dhan-pnl-exit.ts` | ✅ | GET/POST/DELETE | upsert dhan_pnl_exit_config |
| `dhan-fund-limit.ts` | ✅ | GET | pass-through |
| `dhan-margin-calculator.ts` | ✅ | POST | pass-through |
| `dhan-margin-calculator-multi.ts` | ✅ | POST | pass-through |
| `dhan-ledger.ts` | ✅ | GET | delete+insert dhan_ledger |
| `dhan-trade-history.ts` | ✅ | GET | upsert dhan_trade_history |
| `dhan-postback.ts` | ✅ | POST | insert dhan_postback_logs |
| `dhan-option-chain.ts` | ✅ | POST | pass-through |
| `dhan-option-chain-expiry.ts` | ✅ | POST | pass-through |
| `dhan-ltp.ts` | ✅ | POST | LTP batch for worker |
| `dhan-orderbook.ts` | ✅ | GET | legacy order book |
| `razorpay-webhook.ts` | ✅ | POST | subscription events |
| `admin-action.ts` | ✅ | POST | kill/close/flag commands |

---

## Section C — Database Tables

| Table | Migration | Status | Known Gaps |
|---|---|---|---|
| `profiles` | 001 | ✅ | `daily_reset_at` vs `daily_trades_reset_at` name mismatch |
| `broker_accounts` | 001 | ✅ | API key stored as plain TEXT (not pgcrypto encrypted) |
| `trade_nodes` | 001 | ⚠️ | Missing 5 columns: is_processing, booked_pnl, max_price_reached, broker_order_id, sl_order_id |
| `copy_subscriptions` | 001 | ✅ | |
| `order_logs` | 001 | ✅ | |
| `trade_events` | 001 | ⚠️ | `notes TEXT` should be `payload JSONB`; missing `user_id` column |
| `subscriptions` | 001 | ⚠️ | Field names differ from Razorpay spec |
| `system_flags` | 001 | ✅ | |
| `system_stats` | 001 | ✅ | |
| `broker_health` | 001 | ⚠️ | Exists inline on broker_accounts, not as separate table as specified |
| `dhan_orders` | 002 | ✅ | |
| `dhan_trades` | 002 | ✅ | |
| `dhan_super_orders` | 002 | ✅ | |
| `dhan_forever_orders` | 002 | ✅ | |
| `dhan_positions` | 003 | ✅ | |
| `dhan_holdings` | 003 | ✅ | |
| `dhan_conditional_triggers` | 004 | ✅ | |
| `dhan_pnl_exit_config` | 004 | ✅ | |
| `dhan_ledger` | 006 | ✅ | |
| `dhan_trade_history` | 006 | ✅ | |
| `dhan_postback_logs` | 006 | ✅ | |

---

## Section D — TypeScript Types (`types/index.ts`)

| Type Group | Status | Notes |
|---|---|---|
| UserRole, UserTier | ✅ | |
| DhanAuth | ✅ | |
| DhanOrder, DhanTrade | ✅ | |
| DhanSuperOrder, DhanForeverOrder | ✅ | |
| DhanPosition, DhanHolding, ConvertPositionPayload | ✅ | |
| DhanConditionalTrigger + sub-types | ✅ | AlertCondition, AlertOrder, AlertStatus, etc. |
| DhanKillSwitchResponse | ✅ | |
| DhanPnlExitConfig, DhanPnlExitResponse | ✅ | |
| DhanFundLimit | ✅ | |
| MarginCalculatorPayload, DhanMarginResult | ✅ | |
| MultiMarginScript, MultiMarginPayload, DhanMultiMarginResult | ✅ | |
| DhanLedgerEntry, DhanTradeHistoryEntry | ✅ | |
| DhanPostbackStatus, DhanPostbackPayload | ✅ | |
| DhanOrderUpdateData, DhanOrderUpdateMessage | ✅ | |
| OptionGreeks, OptionLeg, OptionStrike | ✅ | |
| OptionChainOC, OptionChainData, OptionChainResponse | ✅ | |
| OptionChainRequest, ExpiryListRequest, ExpiryListResponse | ✅ | |
| DashboardStats | ✅ | |
| Protocol type | ⚠️ | Uses PROTECTOR/BANYAN/PHOENIX/TITAN (internal names, not blueprint names) |
| TradeNode fields | ⚠️ | is_processing, booked_pnl, sl_order_id defined in types but NOT in schema.sql CREATE TABLE |

---

## Section E — Dhan Annexure Constants (`constants/dhan.ts`)

All 14 constant groups present and TypeScript-valid:

| Constant Group | Status |
|---|---|
| `EXCHANGE_SEGMENT` (8 segments + labels + options) | ✅ |
| `PRODUCT_TYPE` (6 types + intraday-only list + options) | ✅ |
| `ORDER_STATUS` (9 statuses + open/closed groups) | ✅ |
| `AMO_TIME` (4 values + labels + options) | ✅ |
| `EXPIRY_CODE` (0/1/2 + labels) | ✅ |
| `INSTRUMENT` (10 types + labels) | ✅ |
| `FEED_REQUEST_CODE` (10 codes + labels) | ✅ |
| `FEED_RESPONSE_CODE` (8 codes + labels) | ✅ |
| `TRADING_ERROR_CODE` (DH-901 to DH-910 + messages) | ✅ |
| `DATA_ERROR_CODE` (800, 804–814 + messages) | ✅ |
| `COMPARISON_TYPE` (4 types + labels + required fields map) | ✅ |
| `INDICATOR_NAME` (21 indicators + labels + options) | ✅ |
| `TRIGGER_OPERATOR` (9 operators + labels + options) | ✅ |
| `ALERT_STATUS` (4 statuses + labels + color map) | ✅ |

---

## Section F — Worker / Tick Engine

| Feature | Status | Notes |
|---|---|---|
| 1-second tick interval | ✅ | |
| Kill switch via Supabase Realtime | ✅ | Reacts ~200ms |
| DB sync every 30s | ✅ | |
| Graceful shutdown | ✅ | |
| In-memory trade cache (Map) | ⚠️ | DB query each tick instead of Map cache — functional but slower |
| `isProcessing` lock | ❌ | Not implemented — race condition risk on concurrent ticks |
| **PROTECTOR T2 no-exit bug** | ❌ | T2 incorrectly calls `executeBucketSell` — MUST be no-op + SL trail only |
| **PROTECTOR T3 exits 2 buckets** | ❌ | Currently exits 1 bucket — should exit `remainingQuantity` |
| **T3 t1Hit guard** | ❌ | Missing `if (!trade.t1Hit) return` guard in handleT3 |
| **SL cancel at T3** | ❌ | `sl_order_id` not in DB schema; never passed to `cancelOrder()` |
| Real Dhan Market Feed (LIVE) | ⚠️ | `ltpFeed.ts` exists; paper simulation used; live feed not fully wired |
| Order fill confirmation + MARKET fallback | ⚠️ | `ORDER_FILL_TIMEOUT_MS` defined; verify brokerClient.ts polls fill status |
| Idempotency (`correlationId`) | ⚠️ | Verify all Dhan order payloads include `correlationId` |

---

## Section G — Security

| Item | Status | Notes |
|---|---|---|
| Supabase Auth + JWT | ✅ | |
| RLS on all tables | ✅ | |
| Service role key server-side only | ✅ | Railway + Vercel API only, never frontend |
| All Dhan calls proxied | ✅ | Key never in browser |
| Postback always returns 200 | ✅ | Prevents Dhan retry storms |
| Broker API key encryption (pgcrypto) | ❌ | Stored as plain TEXT — blueprint requires encrypted storage |
| User UPDATE on trade_nodes allowed | ⚠️ | Users should NOT update trade_nodes directly — service role only |
| Kill switch + circuit breaker | ✅ | Worker enforces both |
| LIVE mode warning modal | ✅ | Deploy.tsx |
| Lot multiplier clamped 0.25–5.0 | ✅ | CopyTrading.tsx |
| Zod input validation | ✅ | Deploy form |

---

## Section H — UI Quality

| Item | Status | Notes |
|---|---|---|
| Dark trading theme (Deep Navy + Cyan) | ✅ | index.css + Tailwind config |
| JetBrains Mono for prices/P&L | ✅ | Font imported |
| Profit/loss color classes | ✅ | `text-profit`, `text-loss` utility classes |
| TradeCard: protocol color left border | ✅ | |
| TradeCard: price bar progress visualization | ⚠️ | Basic version — no entry→LTP→T3 visual bar |
| TradeCard: bucket circles (grey/green/yellow) | ⚠️ | Not implemented as circles |
| Dashboard: bottom stats strip | ⚠️ | Stats shown in grid cards, not bottom strip |
| Mobile responsive | ⚠️ | Sidebar collapses; some tables may overflow on phone |

---

## Section I — Testing

| Item | Status |
|---|---|
| Vitest unit tests | ❌ Not created |
| `signalParser` tests | ❌ |
| `protocolHandlers` tests | ❌ |
| PROTECTOR T2 must NOT sell test | ❌ |
| TITAN T1 exits all, T2 is no-op test | ❌ |
| `calcPnl()` lot size multiply test | ❌ |
| Daily limit enforcement test | ❌ |

---

## Priority Fix List

### 🔴 CRITICAL — Must Fix Before LIVE Trading

| # | Location | Fix |
|---|---|---|
| 1 | `worker/src/protocolHandlers.ts` handleT2 | PROTECTOR: remove `executeBucketSell`; only `UPDATE sl = t1_price` |
| 2 | `worker/src/protocolHandlers.ts` handleT3 | PROTECTOR: exit `remainingQuantity`, not `qtyPerBucket` |
| 3 | `worker/src/protocolHandlers.ts` handleT3 | Add `if (!trade.t1Hit) return;` guard at top |
| 4 | `supabase/schema.sql` + `protocolHandlers.ts` | Add `sl_order_id` column; store on entry; call `cancelOrder(sl_order_id)` at T3 |
| 5 | `worker/src/tickEngine.ts` | Add `is_processing` column; set `true` before processing, clear in `finally` |

### 🟠 HIGH

| # | Item | Fix |
|---|---|---|
| 6 | `supabase/schema.sql` trade_nodes | Add: `is_processing BOOLEAN DEFAULT false`, `booked_pnl NUMERIC(12,2) DEFAULT 0`, `max_price_reached NUMERIC(10,2)`, `broker_order_id TEXT`, `sl_order_id TEXT` |
| 7 | RLS `trade_nodes` UPDATE | Remove user UPDATE policy — service role only |
| 8 | `worker/src/ltpFeed.ts` | Wire real Dhan Market Feed for LIVE mode |
| 9 | `profiles` schema | Align `daily_reset_at` → `daily_trades_reset_at` across schema + types |

### 🟡 MEDIUM

| # | Item |
|---|---|
| 10 | Implement `pgcrypto` encryption for broker API keys in `broker_accounts` |
| 11 | Change `trade_events.notes TEXT` → `payload JSONB`, add `user_id UUID` column |
| 12 | Create separate `broker_health` table per blueprint spec |
| 13 | Align `subscriptions` field names with Razorpay |
| 14 | Confirm `correlationId` in all Dhan order payloads |
| 15 | Verify `calcPnl()` is correct — qty is in units (lots × lotSize) |

### 🟢 LOW / POLISH

| # | Item |
|---|---|
| 16 | TradeCard: visual price progress bar entry → LTP → T1 → T2 → T3 |
| 17 | TradeCard: bucket circles (grey=pending, green=exited, yellow=active) |
| 18 | Dashboard: bottom stats strip layout |
| 19 | Vitest unit test suite |
| 20 | Mobile responsive audit and fixes |
| 21 | Telegram/WhatsApp notifications on T1/T2/T3/SL hit |
| 22 | Optional Dockerfile for Railway |

---

## Complete File Inventory

### Frontend Pages (15 member + 6 admin)
`Dashboard.tsx` `Deploy.tsx` `Trades.tsx` `Orders.tsx` `Positions.tsx` `Holdings.tsx`
`Alerts.tsx` `TraderControl.tsx` `Funds.tsx` `Statement.tsx` `LiveOrders.tsx`
`OptionChain.tsx` `Broker.tsx` `CopyTrading.tsx` `Subscription.tsx`
`admin/AdminLayout.tsx` `admin/Users.tsx` `admin/AllTrades.tsx`
`admin/DeployAdmin.tsx` `admin/System.tsx` `admin/Analytics.tsx`

### Frontend Components / Hooks
`layout/AppLayout.tsx` `layout/Sidebar.tsx` `layout/TopBar.tsx`
`TradeCard.tsx` `SignalParser.tsx` `ProtocolSelector.tsx`
`hooks/useOrderUpdateWs.ts`

### Frontend Types / Constants / Lib
`types/index.ts` (~940 lines, all Dhan interfaces)
`constants/dhan.ts` (14 annexure constant groups)
`lib/constants.ts` `lib/supabase.ts` `lib/signalParser.ts` `lib/utils.ts`

### Vercel API Functions (30)
All 30 files listed in Section B above.

### Railway Worker (8)
`index.ts` `tickEngine.ts` `protocolHandlers.ts` `brokerClient.ts`
`ltpFeed.ts` `copyTrading.ts` `circuitBreaker.ts` `logger.ts`

### Supabase
`schema.sql` (full schema)
`migrations/001_init.sql` through `migrations/006_ledger_tradehistory_postback.sql`

---

*Audit last updated: March 2026 — TypeScript Exit=0*
