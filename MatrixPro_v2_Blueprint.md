# MATRIX PRO v2
## System Blueprint — Current Build State
### Multi-User Dhan Trading Dashboard — NSE/BSE F&O

| | |
|---|---|
| **Version** | 2.1.0 |
| **Updated** | March 2026 |
| **Stack** | React 19 + TypeScript + Vite + Supabase + Vercel + Railway |
| **Broker** | Dhan HQ API v2 |
| **Market** | Indian F&O — NSE/BSE |

---

## 1. What Matrix Pro v2 Is

Matrix Pro v2 is a production-grade, multi-user options trading execution and monitoring platform for Indian markets. It provides:

- **Protocol-based automated exits** — 4 structured exit protocols with trailing SL
- **Full Dhan API dashboard** — Orders, Positions, Holdings, Funds, Option Chain, Alerts, Statement, Live Feed
- **Multi-user system** — Roles (super_admin / admin / member / viewer) + tiers (free / pro / elite)
- **Copy trading** — Admin trades fan out to subscribed Pro/Elite members
- **Backend tick engine** — Railway worker handles all trade processing, never browser-dependent

---

## 2. Infrastructure

| Layer | Provider | URL |
|---|---|---|
| Frontend | Vercel | https://matrix-pro-v2.vercel.app |
| API Functions | Vercel Serverless | /api/*.ts |
| Background Worker | Railway | wss://matrix-pro-worker.railway.app |
| Database | Supabase PostgreSQL | https://xiqcaidlqkmhrndrcmcb.supabase.co |
| Broker API | Dhan HQ v2 | https://api.dhan.co/v2 |
| Payments | Razorpay | INR subscriptions |

---

## 3. User Roles and Tiers

### Roles
| Role | Capabilities |
|---|---|
| `super_admin` | Everything — kill switch, impersonate, all data |
| `admin` | Deploy trades (triggers copy), manage users, all trades view |
| `member` | Deploy own trades, connect broker, copy admin trades (Pro/Elite) |
| `viewer` | Read-only — own P&L and trade history only |

### Subscription Tiers
| Tier | Daily Trades | Protocols | Copy Trading | Price |
|---|---|---|---|---|
| Free | 3 | TITAN only | No | Free |
| Pro | 15 | All 4 | Yes (1x multiplier) | ₹999/mo |
| Elite | Unlimited | All 4 + custom deltas | Yes (0.25–5x) | ₹2499/mo |

---

## 4. Database Schema

> All tables have RLS enabled. Service role key (Railway + Vercel API only) bypasses RLS. All timestamps UTC.

### 4.1 Core Tables (Migration 001)

| Table | Purpose |
|---|---|
| `profiles` | Extends auth.users — role, tier, daily trade tracking |
| `broker_accounts` | Dhan credentials per user (client_id, access_token) |
| `trade_nodes` | Core trading table — one row per deployed trade |
| `copy_subscriptions` | Follower → leader relationships |
| `order_logs` | Every broker order placed (entry/exit/SL/cancel) |
| `trade_events` | Trade lifecycle events (T1_HIT, SL_HIT, etc.) |
| `subscriptions` | Razorpay billing records |
| `system_flags` | kill_switch, circuit_breaker, trading_enabled etc. |
| `system_stats` | Platform-wide aggregated stats |
| `broker_health` | Per-broker health state and failure count |

### 4.2 Dhan API Data Tables (Migrations 002–006)

| Table | Migration | Purpose |
|---|---|---|
| `dhan_orders` | 002 | Live order book (upserted on GET /v2/orders) |
| `dhan_trades` | 002 | Executed trades |
| `dhan_super_orders` | 002 | Super orders (entry + target + SL legs) |
| `dhan_forever_orders` | 002 | GTT-style forever orders |
| `dhan_positions` | 003 | Current open positions |
| `dhan_holdings` | 003 | Long-term equity holdings |
| `dhan_conditional_triggers` | 004 | Technical/price alert orders |
| `dhan_pnl_exit_config` | 004 | P&L-based auto-exit config per user |
| `dhan_ledger` | 006 | Ledger report entries (date-range synced) |
| `dhan_trade_history` | 006 | Paginated historical trade records |
| `dhan_postback_logs` | 006 | Inbound Dhan webhook events |

### 4.3 Key `trade_nodes` Columns

| Column | Type | Purpose |
|---|---|---|
| `protocol` | text | PROTECTOR / BANYAN / PHOENIX / TITAN |
| `target_mode` | text | MOMENTUM / MANUAL |
| `mode` | text | PAPER / LIVE |
| `entry_price / ltp / sl` | numeric | Price tracking |
| `t1 / t2 / t3` | numeric | Target prices |
| `t1_hit / t2_hit / t3_hit / sl_hit` | boolean | Prevents double-execution |
| `is_processing` | boolean | Race condition lock (set true during tick, cleared in finally) |
| `booked_pnl` | numeric | Realized P&L (entry × qty units) |
| `max_price_reached` | numeric | Highest LTP seen in trade lifetime |
| `broker_order_id` | text | Entry order ID from Dhan |
| `sl_order_id` | text | SL order ID — needed to cancel at T3 |
| `status` | text | ACTIVE / CLOSED / KILLED |

---

## 5. The 4 Trading Protocols

> Internal names (BANYAN/PHOENIX/TITAN) differ from original blueprint names. Both shown below.

| Internal Name | Blueprint Name | Buckets | T1 Δ | T2 Δ | T3 Δ |
|---|---|---|---|---|---|
| PROTECTOR | PROTECTOR | 3 | +15 | +30 | +50 |
| BANYAN | HALF_AND_HALF | 2 | +20 | +40 | +70 |
| PHOENIX | DOUBLE_SCALPER | 2 | +25 | +50 | +80 |
| TITAN | SINGLE_SCALPER | 1 | +12 | +24 | +36 |

### PROTECTOR Logic — T2 is a STRICT NO-OP
| Event | Action | SL Change |
|---|---|---|
| T1 Hit | Exit 1 bucket at LIMIT(T1) | Trail SL → entry_price (breakeven) |
| T2 Hit | **NO EXIT** — trail SL only | Trail SL → T1 price |
| T3 Hit | Exit remaining 2 buckets, cancel sl_order_id | — |
| SL Hit | Exit ALL remaining at MARKET | — |

### BANYAN / PHOENIX Logic
| Event | Action |
|---|---|
| T1 Hit | Exit 1 bucket at LIMIT(T1), trail SL → entry |
| T2 Hit | Exit final bucket at LIMIT(T2), cancel SL |
| SL Hit | Exit ALL remaining at MARKET |

### TITAN Logic
| Event | Action |
|---|---|
| T1 Hit | Exit ALL lots at LIMIT(T1), cancel SL |
| SL Hit | Exit ALL at MARKET |

---

## 6. Tick Engine — Railway Worker

Persistent Node.js process on Railway. Never runs in the browser.

### Worker Files
| File | Purpose |
|---|---|
| `worker/src/index.ts` | Entry — starts tick loop + Realtime kill switch subscription |
| `worker/src/tickEngine.ts` | 1-second setInterval — LTP fetch → T1/T2/T3/SL checks |
| `worker/src/protocolHandlers.ts` | handleT1 / handleT2 / handleT3 / handleSL |
| `worker/src/brokerClient.ts` | Dhan order placement, cancel, modify |
| `worker/src/ltpFeed.ts` | Dhan Market Feed LTP polling |
| `worker/src/copyTrading.ts` | Fan-out copy trades to eligible followers |
| `worker/src/circuitBreaker.ts` | Daily loss cap circuit breaker |
| `worker/src/logger.ts` | Structured logging |

### Startup Sequence
1. Connect to Supabase with `SERVICE_ROLE_KEY`
2. Subscribe to `system_flags` via Supabase Realtime (kill switch reacts ~200ms)
3. Load all `ACTIVE` trade_nodes into in-memory Map
4. Start `setInterval(tick, 1000)`
5. Every 30s: re-sync from DB to refresh the Map

---

## 7. Frontend Pages and Routes

### Member Pages (sidebar nav order)
| Page | Route | Icon | Purpose |
|---|---|---|---|
| Dashboard | /dashboard | LayoutDashboard | Active trades + booked P&L summary |
| Deploy Trade | /deploy | Zap | Signal paste + manual deploy form |
| Trade History | /trades | List | All closed trades with filters |
| Orders | /orders | ClipboardList | 4 tabs: Live / Super / Forever / History |
| Positions | /positions | Activity | Open positions + convert position |
| Holdings | /holdings | Package | Long-term equity holdings |
| Alerts | /alerts | Bell | Conditional trigger orders (technical/price) |
| Trader Control | /trader-control | ShieldOff | Kill Switch + P&L-based auto-exit |
| Funds | /funds | Wallet | Fund limit + margin calculators (single + multi) |
| Statement | /statement | FileText | Ledger report + trade history (paginated) |
| Live Orders | /live-orders | Radio | WebSocket real-time order update feed |
| Option Chain | /option-chain | Layers | Full OC with Greeks, OI bars, ATM detection |
| Broker | /broker | Wifi | Connect/manage Dhan broker account |
| Copy Trading | /copy-trading | Copy | Follow admin trades (Pro/Elite only) |
| Subscription | /subscription | CreditCard | Tier upgrade + billing |

### Admin Pages
| Page | Route | Role | Purpose |
|---|---|---|---|
| Users | /admin/users | admin+ | Manage all users — role/tier/status |
| All Trades | /admin/trades | admin+ | Platform-wide trade view |
| Deploy Admin | /admin/deploy | admin+ | Admin trade entry (triggers copy fan-out) |
| System | /admin/system | super_admin | Kill switch + circuit breaker flags |
| Analytics | /admin/analytics | admin+ | Platform-wide P&L, win rate, protocol stats |

---

## 8. Vercel API Functions (/api/)

### Orders
| File | Method | Endpoint | DB Write |
|---|---|---|---|
| `dhan-orders.ts` | GET | /v2/orders | upsert dhan_orders |
| `dhan-order.ts` | POST | /v2/orders | insert dhan_orders |
| `dhan-modify-order.ts` | PUT | /v2/orders/{id} | update dhan_orders |
| `dhan-cancel-order.ts` | DELETE | /v2/orders/{id} | update status |
| `dhan-trades.ts` | GET | /v2/trades | upsert dhan_trades |

### Super and Forever Orders
| File | Method | Purpose |
|---|---|---|
| `dhan-super-orders.ts` | GET | List + upsert super orders |
| `dhan-super-order.ts` | POST | Place super order |
| `dhan-forever-orders.ts` | GET/POST/PUT/DELETE | Full CRUD forever orders |

### Positions and Holdings
| File | Method | Purpose |
|---|---|---|
| `dhan-positions.ts` | GET | Fetch + upsert dhan_positions |
| `dhan-holdings.ts` | GET | Fetch + upsert dhan_holdings |
| `dhan-convert-position.ts` | POST | Convert intraday ↔ delivery |
| `dhan-exit-positions.ts` | DELETE | Exit all positions — clears dhan_positions |

### Alerts and Controls
| File | Method | Purpose |
|---|---|---|
| `dhan-conditional-triggers.ts` | GET | List all triggers |
| `dhan-conditional-trigger.ts` | POST | Create trigger |
| `dhan-modify-conditional-trigger.ts` | PUT | Modify trigger |
| `dhan-delete-conditional-trigger.ts` | DELETE | Cancel/delete trigger |
| `dhan-killswitch.ts` | GET/POST | Read/toggle Dhan kill switch |
| `dhan-pnl-exit.ts` | GET/POST/DELETE | P&L auto-exit config CRUD |

### Funds and Margins
| File | Method | Purpose |
|---|---|---|
| `dhan-fund-limit.ts` | GET | Available + utilized margin (pass-through) |
| `dhan-margin-calculator.ts` | POST | Single instrument margin (pass-through) |
| `dhan-margin-calculator-multi.ts` | POST | Multi-instrument basket margin (pass-through) |

### Statement and Feed
| File | Method | Purpose |
|---|---|---|
| `dhan-ledger.ts` | GET | Ledger report — delete+insert dhan_ledger |
| `dhan-trade-history.ts` | GET | Paginated trade history — upsert |
| `dhan-postback.ts` | POST | Receive Dhan webhooks — insert dhan_postback_logs |

### Option Chain
| File | Method | Purpose |
|---|---|---|
| `dhan-option-chain.ts` | POST | Full OC (OI, Greeks, IV, Bid/Ask) — pass-through |
| `dhan-option-chain-expiry.ts` | POST | Expiry date list for underlying — pass-through |

### Other
| File | Method | Purpose |
|---|---|---|
| `dhan-ltp.ts` | POST | Real-time LTP batch (used by Railway worker) |
| `dhan-orderbook.ts` | GET | Order book (legacy) |
| `razorpay-webhook.ts` | POST | Razorpay payment/subscription events |
| `admin-action.ts` | POST | Super-admin: kill trade, close trade, set flags |

---

## 9. Frontend Source Structure

```
frontend/src/
├── app/
│   ├── App.tsx                      # Root router, auth guard, all 20 routes
│   └── providers/
│       ├── AuthProvider.tsx         # Supabase session + profile state
│       └── TradeProvider.tsx        # Active trades + Realtime subscription
├── constants/
│   └── dhan.ts                      # ALL Dhan annexure enums (canonical)
├── pages/
│   ├── Dashboard.tsx
│   ├── Deploy.tsx
│   ├── Trades.tsx
│   ├── Orders.tsx                   # 4-tab order management
│   ├── Positions.tsx                # Positions + inline convert
│   ├── Holdings.tsx
│   ├── Alerts.tsx                   # Conditional triggers CRUD
│   ├── TraderControl.tsx            # Kill switch + P&L exit config
│   ├── Funds.tsx                    # Fund limit + 2 margin calculators
│   ├── Statement.tsx                # Ledger + trade history tabs
│   ├── LiveOrders.tsx               # WebSocket order feed (useOrderUpdateWs)
│   ├── OptionChain.tsx              # Full option chain viewer
│   ├── Broker.tsx
│   ├── CopyTrading.tsx              # Tier-locked Pro/Elite
│   ├── Subscription.tsx
│   └── admin/
│       ├── AdminLayout.tsx
│       ├── Users.tsx
│       ├── AllTrades.tsx
│       ├── DeployAdmin.tsx
│       ├── System.tsx
│       └── Analytics.tsx
├── components/layout/
│   ├── AppLayout.tsx
│   ├── Sidebar.tsx
│   └── TopBar.tsx
├── hooks/
│   └── useOrderUpdateWs.ts          # Dhan WSS live order updates
├── types/
│   └── index.ts                     # All TypeScript interfaces (~940 lines)
└── lib/
    ├── supabase.ts
    ├── constants.ts                 # MOMENTUM_DELTA, LOT_SIZES, tier limits
    ├── signalParser.ts              # Signal text → trade params
    └── utils.ts
```

---

## 10. Constants and Reference Data

### Trading Constants (`frontend/src/lib/constants.ts`)

```typescript
export const MOMENTUM_DELTA = {
  PROTECTOR: { T1: 15, T2: 30, T3: 50 },
  BANYAN:    { T1: 20, T2: 40, T3: 70 },   // blueprint name: HALF_AND_HALF
  PHOENIX:   { T1: 25, T2: 50, T3: 80 },   // blueprint name: DOUBLE_SCALPER
  TITAN:     { T1: 12, T2: 24, T3: 36 },   // blueprint name: SINGLE_SCALPER
};

export const LOT_SIZES: Record<string, number> = {
  NIFTY: 65, BANKNIFTY: 15, FINNIFTY: 40,
  MIDCPNIFTY: 75, SENSEX: 20, BANKEX: 15,
};

export const PROTOCOL_BUCKETS: Record<string, number> = {
  PROTECTOR: 3, BANYAN: 2, PHOENIX: 2, TITAN: 1,
};

export const DAILY_TRADE_LIMITS = { free: 3, pro: 15, elite: Infinity };

export const SUBSCRIPTION_PRICES = {
  pro:   { monthly: 999,  annual: 9990  },
  elite: { monthly: 2499, annual: 24990 },
};

export const ORDER_FILL_TIMEOUT_MS = 30000;
export const BROKER_MAX_FAILURES   = 3;
export const KILL_SWITCH_POLL_MS   = 5000;
```

### Dhan Annexure Constants (`frontend/src/constants/dhan.ts`)

All exported as typed `as const` objects with companion `_LABEL` / `_OPTIONS` helpers. Import via `@/constants/dhan`.

| Export | Values |
|---|---|
| `EXCHANGE_SEGMENT` | IDX_I=0, NSE_EQ=1, NSE_FNO=2, NSE_CURRENCY=3, BSE_EQ=4, MCX_COMM=5, BSE_CURRENCY=7, BSE_FNO=8 |
| `PRODUCT_TYPE` | CNC, INTRADAY, MARGIN, MTF, CO, BO |
| `ORDER_STATUS` | TRANSIT, PENDING, CLOSED, TRIGGERED, REJECTED, CANCELLED, PART_TRADED, TRADED, EXPIRED |
| `AMO_TIME` | PRE_OPEN, OPEN, OPEN_30, OPEN_60 |
| `EXPIRY_CODE` | 0=Near, 1=Next, 2=Far |
| `INSTRUMENT` | INDEX, FUTIDX, OPTIDX, EQUITY, FUTSTK, OPTSTK, FUTCOM, OPTFUT, FUTCUR, OPTCUR |
| `FEED_REQUEST_CODE` | 11=Connect, 12=Disconnect, 15–24 Subscribe/Unsubscribe variants |
| `FEED_RESPONSE_CODE` | 1=Index, 2=Ticker, 4=Quote, 5=OI, 6=PrevClose, 7=MarketStatus, 8=Full, 50=Disconnect |
| `TRADING_ERROR_CODE` | DH-901 through DH-910 with messages |
| `DATA_ERROR_CODE` | 800, 804–814 with messages |
| `COMPARISON_TYPE` | TECHNICAL_WITH_VALUE/INDICATOR/CLOSE, PRICE_WITH_VALUE + required fields map |
| `INDICATOR_NAME` | SMA/EMA 5/10/20/50/100/200, BB_UPPER/LOWER, RSI_14, ATR_14, STOCHASTIC, STOCHRSI_14, MACD_26/12/HIST |
| `TRIGGER_OPERATOR` | CROSSING_UP/DOWN/ANY_SIDE, GREATER_THAN, LESS_THAN, EQUAL, NOT_EQUAL + _EQUAL variants |
| `ALERT_STATUS` | ACTIVE, TRIGGERED, EXPIRED, CANCELLED + color map |

---

## 11. WebSocket Hook — Live Order Updates

**File:** `frontend/src/hooks/useOrderUpdateWs.ts`

- Connects to `wss://api-order-update.dhan.co`
- Auth: `{ LoginReq: { MsgCode: 42, ClientId, Token }, UserType: "SELF" }`
- Auto-reconnects on close/error (5s delay)
- Returns `{ status, messages, lastMsg, clearMessages, connect, disconnect }`
- Max 200 messages buffered (FIFO ring — oldest discarded)

---

## 12. Option Chain Page

**File:** `frontend/src/pages/OptionChain.tsx`

| Feature | Detail |
|---|---|
| Underlying presets | NIFTY(13), BANKNIFTY(25), FINNIFTY(27), MIDCAP(442), SENSEX(51), BANKEX(20), Custom |
| Rate limiting | 1 request / 3 seconds — enforced by `useRef<number>` timestamp |
| Auto-refresh | `setInterval` every 3050ms (3000 + 50ms buffer) |
| ATM detection | Strike closest to `last_price` — highlighted with badge |
| ITM shading | CE rows when `last_price > strike`; PE rows when `last_price < strike` |
| OI bars | CE: right-to-left (loss color); PE: left-to-right (profit color); scaled to max OI |
| PCR display | `totalPeOI / totalCeOI` |
| CE columns (left) | Δ θ γ ν \| Bid/Ask \| Volume \| OI bar \| IV \| LTP |
| PE columns (right) | LTP \| IV \| OI bar \| Volume \| Bid/Ask \| Δ θ γ ν |

---

## 13. Database Migrations

| File | Tables Created / Changed |
|---|---|
| `001_init.sql` | profiles, broker_accounts, trade_nodes, copy_subscriptions, order_logs, trade_events, subscriptions, system_flags, system_stats, broker_health + all RLS policies |
| `002_dhan_orders.sql` | dhan_orders, dhan_trades, dhan_super_orders, dhan_forever_orders |
| `003_positions_holdings.sql` | dhan_positions, dhan_holdings |
| `004_alerts_tradercontrol.sql` | dhan_conditional_triggers, dhan_pnl_exit_config |
| `005_funds.sql` | (no new tables — fund limit is pure pass-through) |
| `006_ledger_tradehistory_postback.sql` | dhan_ledger, dhan_trade_history, dhan_postback_logs |

---

## 14. Environment Variables

### Vercel
| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Frontend Supabase client |
| `VITE_SUPABASE_ANON_KEY` | Frontend Supabase client (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | API functions — bypasses RLS (**secret**) |
| `DHAN_BASE_URL` | https://api.dhan.co |
| `RAZORPAY_KEY_ID` | Razorpay public key |
| `RAZORPAY_KEY_SECRET` | Razorpay secret (**secret**) |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook signature verification (**secret**) |

### Railway Worker
| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Full DB access — bypasses RLS |
| `DHAN_BASE_URL` | https://api.dhan.co |
| `TICK_INTERVAL_MS` | Default: 1000 |
| `DB_SYNC_INTERVAL_MS` | Default: 30000 |
| `LOG_LEVEL` | info / debug / error |
| `NODE_ENV` | production |

---

## 15. Security Model

| Area | Implementation |
|---|---|
| Auth | Supabase Auth — JWT with refresh rotation |
| RLS | Enabled on all tables — only service role can UPDATE `trade_nodes` |
| Broker keys | Proxied through Vercel serverless — never in browser |
| Tier enforcement | Server-side (RLS + worker) — client is UI-only |
| Kill switch | Supabase Realtime → worker reacts ~200ms |
| Circuit breaker | Daily loss cap in `worker/circuitBreaker.ts` |
| LIVE mode guard | Warning modal + requires broker account connected |
| Duplicate orders | `correlationId` idempotency key on all Dhan order payloads |
| Postback webhook | Always returns HTTP 200 to prevent Dhan retry storms |

---

## 16. Critical Bug List — Pre-LIVE Checklist

### 🔴 CRITICAL — Must Fix Before Any LIVE Trade

| # | Bug | Location | Fix Required |
|---|---|---|---|
| 1 | PROTECTOR T2 must NOT exit — only trail SL to T1 price | `worker/src/protocolHandlers.ts` handleT2 | Remove `executeBucketSell` call. Only `UPDATE trade_nodes SET sl = t1_price`. |
| 2 | PROTECTOR T3 must exit 2 buckets, not 1 | `worker/src/protocolHandlers.ts` handleT3 | Change exit qty from `qtyPerBucket` to `remainingQuantity` (all remaining lots) |
| 3 | T3 missing `t1Hit` guard for PROTECTOR | `worker/src/protocolHandlers.ts` handleT3 | Add `if (!trade.t1Hit) return;` at top of handleT3 |
| 4 | SL order not cancelled at T3 | `schema.sql` + `protocolHandlers.ts` | Store `sl_order_id` on entry; call `cancelOrder(sl_order_id)` in handleT3 |
| 5 | No `isProcessing` lock — race condition | `worker/src/tickEngine.ts` | Add `is_processing` DB column; set `true` before tick, clear in `finally` block |

### 🟠 HIGH PRIORITY

| # | Item | Fix |
|---|---|---|
| 6 | 5 columns missing from `schema.sql` trade_nodes | Add `is_processing`, `booked_pnl`, `max_price_reached`, `broker_order_id`, `sl_order_id` to migration |
| 7 | User UPDATE RLS on trade_nodes | Remove — only service role should ever update trade state |
| 8 | Real Dhan Market Feed not wired for LIVE | `worker/src/ltpFeed.ts` — integrate live Dhan feed (currently paper simulation) |
| 9 | `profiles.daily_reset_at` name mismatch | Align to `daily_trades_reset_at` across schema + types |

### 🟡 MEDIUM

| # | Item |
|---|---|
| 10 | Broker API key encryption — currently plain TEXT in broker_accounts |
| 11 | `trade_events.notes` should be `payload JSONB` with `user_id` column |
| 12 | `broker_health` should be a separate table (currently inline on broker_accounts) |
| 13 | `subscriptions` field names differ from Razorpay spec |
| 14 | Confirm `correlationId` present in all Dhan order payloads |

### 🟢 LOW / POLISH

| # | Item |
|---|---|
| 15 | TradeCard: visual price bar entry → LTP → T1 → T2 → T3 |
| 16 | TradeCard: bucket circles (grey=pending, green=exited, yellow=active) |
| 17 | Dashboard: bottom stats strip instead of cards grid |
| 18 | Vitest unit tests (signalParser, protocolHandlers, calcPnl) |
| 19 | Mobile responsive audit — table overflow on small screens |
| 20 | Notifications on T1/T2/T3/SL hit (Telegram/WhatsApp) |

---

## 17. Dhan API Endpoints Reference

### Trading Orders
| Endpoint | Method | Purpose |
|---|---|---|
| /v2/orders | POST | Place order |
| /v2/orders/{id} | PUT | Modify order |
| /v2/orders/{id} | DELETE | Cancel order |
| /v2/orders | GET | Order book |
| /v2/trades | GET | Executed trades |
| /v2/super/orders | GET/POST | Super orders |
| /v2/forever/orders | GET/POST/PUT/DELETE | Forever (GTT) orders |

### Portfolio
| Endpoint | Method | Purpose |
|---|---|---|
| /v2/positions | GET | Open positions |
| /v2/positions/convert | POST | Convert position type |
| /v2/positions | DELETE | Exit all positions |
| /v2/holdings | GET | Holdings |

### Market Data
| Endpoint | Method | Purpose |
|---|---|---|
| /v2/marketfeed/ltp | POST | Real-time LTP batch |
| /v2/optionchain | POST | Full option chain (OI, Greeks, IV, Bid/Ask) |
| /v2/optionchain/expirylist | POST | Expiry dates for underlying |

### Account and Funds
| Endpoint | Method | Purpose |
|---|---|---|
| /v2/fundlimit | GET | Available + used margin |
| /v2/margincalculator | POST | Single instrument margin |
| /v2/margincalculator/multi | POST | Multi-instrument basket margin |
| /v2/ledger | GET | Ledger report (from-date / to-date) |
| /v2/trades/{from}/{to}/{page} | GET | Trade history (paginated) |

### Controls
| Endpoint | Method | Purpose |
|---|---|---|
| /v2/alerts/orders | GET/POST/PUT/DELETE | Conditional triggers |
| /v2/killswitch | GET/POST | Dhan kill switch |
| /v2/pnlExit | GET/POST/DELETE | P&L auto-exit config |
| /v2/dhan-postback (inbound) | POST | Dhan webhook events |
| wss://api-order-update.dhan.co | WS | Live order update stream |

---

## 18. TypeScript Validation

```powershell
cd "D:\store\Mohamed\Trading\Matrix pro\frontend"
npx tsc --noEmit
Write-Host "Exit=$LASTEXITCODE"
```

**Expected:** `Exit=0`

---

## 19. Postback Webhook Setup

Register `https://<your-vercel-domain>/api/dhan-postback` in:
**web.dhan.co → Access Token Settings → Postback URL**

Handler always returns `{ received: true }` with HTTP 200 to prevent Dhan retry storms.

---

## 20. What To Work On Next

Based on current audit state, recommended priority order:

1. **Fix PROTECTOR T2 bug** in `protocolHandlers.ts` — remove bucket sell, trail SL only (🔴 #1)
2. **Fix PROTECTOR T3 qty + t1Hit guard** (🔴 #2, #3)
3. **Add `sl_order_id`** to schema + store on entry + cancel at T3 (🔴 #4)
4. **Add `isProcessing` lock** to tick engine (🔴 #5)
5. **Add missing columns** to `schema.sql` migration (🟠 #6)
6. **Wire real Dhan Market Feed** for LIVE mode (🟠 #8)
7. **Continue adding Dhan API groups** as user pastes new docs
