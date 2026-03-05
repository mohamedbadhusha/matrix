# MATRIX PRO v2
## Complete System Design & Development Blueprint
### Multi-User Options Trading Platform — NSE/BSE F&O

| | |
|---|---|
| **Version** | 2.0.0 |
| **Date** | March 2026 |
| **Stack** | React 19 + TypeScript + Supabase + Railway + Vercel |
| **Market** | Indian F&O — NSE/BSE (Dhan HQ API) |

---

## 1. Project Overview & Goals

Matrix Pro v2 is a production-grade, multi-user options trading execution platform for Indian markets (NSE/BSE F&O). It enables users to deploy structured exit protocol trades with fully automated price tracking and staged exits — no manual intervention required.

### 1.1 Core Concept
Each trade is deployed under one of 4 exit protocols. The system splits the total order quantity into equal "buckets" and automatically exits each bucket when predefined price targets are hit. Stop-losses trail upward as targets are reached, locking in profits progressively.

### 1.2 What is New in v2

| Feature | v1 (Old) | v2 (New) |
|---|---|---|
| Users | Single user | Full multi-user with roles & tiers |
| Tick Engine | Runs in browser tab | Railway backend worker (always-on) |
| Copy Trading | Not available | Admin trades, members mirror automatically |
| P&L Calc | Missing lot size multiplier | Correct: (exit-entry) x qty x lotSize |
| SL Cancellation | Incomplete | Full slOrderId tracking + cancel on T3 |
| LTP Feed | Simulated for LIVE | Real Dhan Market Feed API |
| Race Condition | No lock | isProcessing lock per trade |
| Order Fill | Assumed always filled | Confirmation + MARKET fallback |
| Subscriptions | None | Free / Pro / Elite with Razorpay billing |
| Admin Dashboard | None | Full user, trade, system management |

### 1.3 Platform URL & Infrastructure
- **Frontend (Vercel):** https://matrix-pro-v2.vercel.app
- **Backend Worker (Railway):** wss://matrix-pro-worker.railway.app
- **Supabase Project:** https://xiqcaidlqkmhrndrcmcb.supabase.co
- **Broker API:** Dhan HQ v2
- **Payments:** Razorpay (INR)

---

## 2. User Roles, Tiers & Permissions

### 2.1 Roles

| Role | Who | Can Do |
|---|---|---|
| `super_admin` | Platform owner (you) | Everything — manage users, trade on behalf of anyone, access all data, flip kill switch |
| `admin` | Trusted sub-admin | Deploy trades (triggers copy for followers), manage users, view all trades |
| `member` | Paying subscriber | Deploy own trades, connect broker, copy admin trades (Pro/Elite only) |
| `viewer` | Read-only user | See own P&L and trade history only — no trade deployment |

### 2.2 Subscription Tiers

| Tier | Daily Trades | Protocols Available | Copy Trading | Target Mode | Price |
|---|---|---|---|---|---|
| Free | 3 | SINGLE_SCALPER only | No | Momentum only | Free |
| Pro | 15 | All 4 protocols | Yes (mirror admin) | Momentum + Manual | ₹999/mo |
| Elite | Unlimited | All 4 + custom deltas | Yes + priority exec | Momentum + Manual | ₹2499/mo |

### 2.3 Permission Matrix

| Action | viewer | member (free) | member (pro) | member (elite) | admin | super_admin |
|---|---|---|---|---|---|---|
| View own trades | Yes | Yes | Yes | Yes | Yes | Yes |
| Deploy trade | No | Yes (3/day) | Yes (15/day) | Yes (unlimited) | Yes | Yes |
| Connect broker | No | Yes | Yes | Yes | Yes | Yes |
| Copy admin trades | No | No | Yes | Yes | N/A | N/A |
| Manual targets | No | No | Yes | Yes | Yes | Yes |
| View all users | No | No | No | No | Yes | Yes |
| Kill switch | No | No | No | No | No | Yes |
| Impersonate user | No | No | No | No | No | Yes |

---

## 3. Database Schema — Supabase PostgreSQL

> All tables have Row Level Security (RLS) enabled. Users can only access their own data unless they have admin/super_admin role. All timestamps are stored in UTC.

### 3.1 `profiles`
> Extends Supabase `auth.users`. Created automatically on signup via trigger.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, FK auth.users(id) | Matches Supabase Auth user ID |
| email | text | NOT NULL, UNIQUE | User email address |
| full_name | text | | Display name |
| role | text | DEFAULT 'member' | super_admin \| admin \| member \| viewer |
| tier | text | DEFAULT 'free' | free \| pro \| elite |
| is_active | boolean | DEFAULT true | Account enabled/disabled |
| daily_trades_used | int | DEFAULT 0 | Resets at midnight IST |
| daily_trades_reset_at | timestamptz | | Last reset timestamp |
| created_at | timestamptz | DEFAULT now() | Account creation time |
| updated_at | timestamptz | DEFAULT now() | Last profile update |

### 3.2 `broker_accounts`

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK DEFAULT gen_random_uuid() | Unique account ID |
| user_id | uuid | FK profiles(id) | Owner of this broker account |
| broker | text | DEFAULT dhan | dhan \| zerodha \| upstox |
| client_id | text | NOT NULL | Broker client/login ID |
| api_key | text | NOT NULL | Encrypted at rest |
| access_token | text | | JWT/session token, refreshed daily |
| is_active | boolean | DEFAULT true | Whether this account is usable |
| last_verified_at | timestamptz | | Last successful API ping |
| created_at | timestamptz | DEFAULT now() | |

### 3.3 `trade_nodes` (Core Table)

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK | Unique trade ID |
| user_id | uuid | FK profiles(id) | Trade owner |
| broker_account_id | uuid | FK broker_accounts(id) | Which broker to route through |
| origin | text | DEFAULT 'SELF' | SELF \| COPY |
| parent_trade_id | uuid | FK trade_nodes(id) NULLABLE | If COPY, points to admin trade |
| symbol | text | NOT NULL | NIFTY \| BANKNIFTY \| FINNIFTY |
| strike | text | NOT NULL | 25100 CE \| 52000 PE |
| trading_symbol | text | NOT NULL | Broker format: NIFTY21DEC25100CE |
| security_id | text | | Dhan internal security ID |
| exchange | text | DEFAULT 'NSE_FNO' | NSE_FNO \| BSE_FNO |
| protocol | text | NOT NULL | PROTECTOR \| HALF_AND_HALF \| DOUBLE_SCALPER \| SINGLE_SCALPER |
| target_mode | text | DEFAULT 'MOMENTUM' | MOMENTUM \| MANUAL |
| mode | text | DEFAULT 'PAPER' | PAPER \| LIVE |
| entry_price | numeric(10,2) | NOT NULL | Price at which trade was entered |
| ltp | numeric(10,2) | | Last tick price (updated by worker) |
| sl | numeric(10,2) | NOT NULL | Current stop loss (trails up) |
| initial_sl | numeric(10,2) | NOT NULL | Original SL at entry (never changes) |
| t1 | numeric(10,2) | NOT NULL | Target 1 price |
| t2 | numeric(10,2) | NOT NULL | Target 2 price |
| t3 | numeric(10,2) | NOT NULL | Target 3 price |
| lots | int | NOT NULL | Total lots entered |
| lot_size | int | NOT NULL | Lot size for this symbol (e.g. 75 for NIFTY) |
| remaining_quantity | int | NOT NULL | Units still open |
| remaining_buckets | int | NOT NULL | Buckets not yet exited |
| lots_per_bucket | numeric(10,4) | NOT NULL | May be fractional — floor used for orders |
| qty_per_bucket | int | NOT NULL | lots_per_bucket * lot_size (rounded) |
| t1_hit | boolean | DEFAULT false | Prevents double-exit |
| t2_hit | boolean | DEFAULT false | |
| t3_hit | boolean | DEFAULT false | |
| sl_hit | boolean | DEFAULT false | |
| is_processing | boolean | DEFAULT false | Race condition lock (set true during tick) |
| booked_pnl | numeric(12,2) | DEFAULT 0 | Realized P&L so far (includes lot size) |
| max_price_reached | numeric(10,2) | | Highest LTP seen in trade lifetime |
| broker_order_id | text | | Entry order ID from broker |
| sl_order_id | text | | SL order ID (needed to cancel at T3) |
| status | text | DEFAULT 'ACTIVE' | ACTIVE \| CLOSED \| KILLED |
| ltp_source | text | DEFAULT 'SIM' | BROKER \| SIM |
| created_at | timestamptz | DEFAULT now() | Entry timestamp |
| closed_at | timestamptz | | When trade was closed |

### 3.4 `copy_subscriptions`

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Unique subscription ID |
| follower_user_id | uuid FK profiles | The member who is copying |
| leader_user_id | uuid FK profiles | The admin being followed |
| is_active | boolean DEFAULT true | Toggle copy on/off |
| lot_multiplier | numeric DEFAULT 1.0 | 0.5 = half lots, 1 = same lots, 2 = double |
| created_at | timestamptz | |

### 3.5 `order_logs`

| Column | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK profiles | |
| trade_node_id | uuid FK trade_nodes | |
| type | text | ENTRY \| EXIT_T1 \| EXIT_T2 \| EXIT_T3 \| EXIT_SL \| CANCEL_SL \| TRAIL_SL |
| price | numeric(10,2) | Executed or trigger price |
| qty | int | Number of units (not lots) |
| lot_size | int | Lot size at time of order |
| pnl | numeric(12,2) | P&L for this exit (null for entries) |
| broker_order_id | text | Broker-assigned order ID |
| broker_status | text | PENDING \| FILLED \| REJECTED \| CANCELLED |
| error_message | text | If broker rejected, reason here |
| created_at | timestamptz | |

### 3.6 `trade_events`

| Column | Type | Description |
|---|---|---|
| id | uuid PK | |
| trade_id | uuid FK trade_nodes | |
| user_id | uuid FK profiles | |
| event_type | text | T1_HIT \| T2_HIT \| T3_HIT \| SL_HIT \| SL_TRAILED \| TRADE_OPENED \| TRADE_CLOSED \| TRADE_KILLED |
| ltp_at_event | numeric(10,2) | Price when event fired |
| payload | jsonb | Full snapshot of trade state at this moment |
| created_at | timestamptz | |

### 3.7 `subscriptions`

| Column | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK profiles | |
| tier | text | pro \| elite |
| status | text | active \| cancelled \| expired \| trial |
| started_at | timestamptz | |
| expires_at | timestamptz | |
| razorpay_subscription_id | text | For recurring billing management |
| payment_ref | text | Last payment reference |

### 3.8 `system_flags`

| Key | Value Type | Description |
|---|---|---|
| kill_switch | boolean | If true, ALL trading halted. Checked every 5s by worker. |
| maintenance_mode | boolean | Blocks new logins and trade deployments |
| max_daily_loss | number | Platform-wide circuit breaker (INR) |
| current_daily_loss | number | Running total reset at midnight IST |
| trading_enabled | boolean | Master trading on/off (separate from kill switch) |

### 3.9 `broker_health`

| Column | Type | Description |
|---|---|---|
| broker_id | text PK | dhan \| zerodha \| upstox |
| state | text | HEALTHY \| DEGRADED \| DOWN |
| failure_count | int DEFAULT 0 | Consecutive failures — resets on success |
| last_checked_at | timestamptz | |
| last_error | text | Most recent error message |

---

## 4. Supabase Row Level Security (RLS) Policies

> Run all RLS SQL in Supabase SQL Editor. Always enable RLS on a table **BEFORE** adding policies. Service role key bypasses RLS (used by Railway worker only).

### 4.1 profiles

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins read all profiles" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);
CREATE POLICY "Admins update all profiles" ON profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
```

### 4.2 broker_accounts

```sql
ALTER TABLE broker_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own broker accounts" ON broker_accounts
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins read all broker accounts" ON broker_accounts FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);
```

### 4.3 trade_nodes

```sql
ALTER TABLE trade_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own trades" ON trade_nodes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own trades" ON trade_nodes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users cannot update trades directly" ON trade_nodes FOR UPDATE USING (false);
-- Only service role (Railway worker) can UPDATE trade_nodes
CREATE POLICY "Admins read all trades" ON trade_nodes FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);
```

### 4.4 copy_subscriptions

```sql
ALTER TABLE copy_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage own subscriptions" ON copy_subscriptions
  FOR ALL USING (auth.uid() = follower_user_id);
```

### 4.5 order_logs & trade_events

```sql
CREATE POLICY "Users read own logs" ON order_logs FOR SELECT USING (auth.uid() = user_id);
-- Insert/Update only by service role (Railway worker)
CREATE POLICY "Users read own events" ON trade_events FOR SELECT USING (auth.uid() = user_id);
```

### 4.6 system_flags

```sql
-- Only service role and super_admin can write to system_flags
CREATE POLICY "Admins read system flags" ON system_flags FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);
CREATE POLICY "Super admin write system flags" ON system_flags FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
```

### 4.7 Auto-Create Profile on Signup Trigger

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, tier)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'member', 'free');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

### 4.8 Supabase Realtime Config
- Enable Realtime on: `trade_nodes`, `system_flags`, `broker_health`
- `trade_nodes`: Frontend subscribes per `user_id` to get live LTP and status updates
- `system_flags`: Worker subscribes to `kill_switch` — instant response without polling
- `broker_health`: Frontend admin panel shows live broker status

---

## 5. The 4 Trading Protocols — Complete Logic

### 5.1 Protocol Constants (MOMENTUM_DELTA)

| Protocol | Buckets | T1 Delta | T2 Delta | T3 Delta | Use Case |
|---|---|---|---|---|---|
| PROTECTOR | 3 | +15 | +30 | +50 | Most defensive. Protects capital first. |
| HALF_AND_HALF | 2 | +20 | +40 | +70 | Balanced. Exits in 2 equal stages. |
| DOUBLE_SCALPER | 2 | +25 | +50 | +80 | Aggressive scalping. Wider targets. |
| SINGLE_SCALPER | 1 | +12 | +24 | +36 | Quick in/out. All-or-nothing exit at T3. |

### 5.2 PROTECTOR Protocol — Full Logic
> 3 lots split into 3 equal buckets. Most defensive — prioritizes breaking even quickly.

| Event | Action | SL Change | Buckets Remaining |
|---|---|---|---|
| Entry | Place MARKET entry + SL order at initial_sl | SL = initial_sl | 3 of 3 |
| T1 Hit | Exit bucket 1 (1 lot) at LIMIT(T1) | Trail SL to entry_price (breakeven) | 2 of 3 |
| T2 Hit | NO exit. Hold bucket 2 & 3 | Trail SL to T1 price (locks T1 gain) | 2 of 3 |
| T3 Hit | Exit remaining 2 buckets at LIMIT(T3) | Cancel SL order | 0 — CLOSED |
| SL Hit | Exit ALL remaining buckets at MARKET | N/A | 0 — CLOSED |

### 5.3 HALF_AND_HALF Protocol — Full Logic
> 2 lots split into 2 equal buckets. Balanced risk/reward.

| Event | Action | SL Change | Buckets Remaining |
|---|---|---|---|
| Entry | Place MARKET entry + SL order | SL = initial_sl | 2 of 2 |
| T1 Hit | Exit bucket 1 (1 lot) at LIMIT(T1) | Trail SL to entry_price (breakeven) | 1 of 2 |
| T2 Hit | Exit bucket 2 (last lot) at LIMIT(T2). Cancel SL. | Cancel SL order | 0 — CLOSED |
| SL Hit | Exit ALL remaining at MARKET | N/A | 0 — CLOSED |
| T3 | NOT USED in this protocol | — | — |

### 5.4 DOUBLE_SCALPER Protocol — Full Logic
> 2 lots split into 2 buckets. Identical structure to HALF_AND_HALF but with wider targets.

| Event | Action | SL Change | Buckets Remaining |
|---|---|---|---|
| Entry | Place MARKET entry + SL order | SL = initial_sl | 2 of 2 |
| T1 Hit | Exit bucket 1 at LIMIT(T1) | Trail SL to entry_price (breakeven) | 1 of 2 |
| T2 Hit | Exit bucket 2 (last) at LIMIT(T2). Cancel SL. | Cancel SL order | 0 — CLOSED |
| SL Hit | Exit ALL remaining at MARKET | N/A | 0 — CLOSED |

### 5.5 SINGLE_SCALPER Protocol — Full Logic
> No bucket splitting. Single all-in position. Quick scalp to T3 only.

| Event | Action | SL Change | Status |
|---|---|---|---|
| Entry | Place MARKET entry + SL order (ALL lots as 1 block) | SL = initial_sl | ACTIVE |
| T1 Hit | NO action. T1 is just a reference level. | NO change | ACTIVE |
| T2 Hit | NO action. T2 is just a reference level. | NO change | ACTIVE |
| T3 Hit | Exit ALL lots at LIMIT(T3). Cancel SL. | Cancel SL order | CLOSED |
| SL Hit | Exit ALL lots at MARKET. | N/A | CLOSED |

> ⚠ **SINGLE_SCALPER:** T1 and T2 checks in the tick engine must be explicit no-ops. Do NOT trail SL at T1 for this protocol — there is no partial exit to justify a breakeven trail.

---

## 6. Tick Engine — Backend Worker Architecture

> The tick engine is the heart of Matrix Pro. In v2 it runs entirely on Railway as a persistent Node.js process — NOT in the browser. This ensures trades execute even when users close their browser.

### 6.1 Why Railway (Not Vercel Cron)

| Aspect | Vercel Cron | Railway Worker (Chosen) |
|---|---|---|
| Min interval | 1 minute | 1 second (true real-time) |
| State | Stateless — DB round-trip each run | In-memory trade cache for speed |
| Connection | Cold start overhead | Persistent process — always warm |
| Cost | Free tier limited | Simple flat pricing |
| Realtime | No | Supabase Realtime subscription for kill switch |

### 6.2 Worker Process Flow
1. Worker starts → connects to Supabase with `SERVICE_ROLE_KEY`
2. Subscribes to `system_flags` via Supabase Realtime (kill switch)
3. Loads all `ACTIVE` trade_nodes into memory cache
4. Starts 1-second `setInterval` tick loop
5. On each tick: fetch LTP for all active symbols in one batch call
6. For each trade: run protocol checks (T1/T2/T3/SL)
7. On trigger: place broker order → update DB → emit trade_event
8. Every 30s: sync DB state to catch any missed updates

### 6.3 Tick Engine Pseudocode (TypeScript)

```typescript
const activeTrades = new Map<string, TradeNode>(); // in-memory cache
const processingLocks = new Set<string>();         // race condition guard

setInterval(async () => {
  if (killSwitchActive) return;

  // 1. Batch fetch LTP for all unique symbols
  const symbols = [...new Set(activeTrades.values().map(t => t.tradingSymbol))];
  const ltpMap = await batchFetchLTP(symbols); // Dhan Market Feed

  // 2. Process each active trade
  for (const [id, trade] of activeTrades) {
    if (processingLocks.has(id)) continue; // skip if already processing
    processingLocks.add(id);

    try {
      const ltp = trade.mode === 'LIVE' ? ltpMap[trade.tradingSymbol] : simulateLTP(trade);
      if (!ltp) continue;

      if (ltp > trade.maxPriceReached) trade.maxPriceReached = ltp;

      // T1 CHECK
      if (!trade.t1Hit && ltp >= trade.t1) {
        await handleT1(trade, ltp);
      }
      // T2 CHECK (only after T1)
      else if (trade.t1Hit && !trade.t2Hit && ltp >= trade.t2) {
        await handleT2(trade, ltp);
      }
      // T3 CHECK (only after T1, any protocol)
      else if (trade.t1Hit && !trade.t3Hit && ltp >= trade.t3) {
        await handleT3(trade, ltp);
      }
      // SL CHECK (highest priority if price drops)
      if (!trade.slHit && ltp <= trade.sl) {
        await handleSL(trade, ltp);
      }

      // Update LTP in DB (rate limited — every 5s not every tick)
      await throttledUpdateLTP(trade.id, ltp);
    } finally {
      processingLocks.delete(id);
    }
  }
}, 1000);
```

### 6.4 Protocol Handler Functions

```typescript
async function handleT1(trade: TradeNode, ltp: number) {
  if (trade.protocol === 'SINGLE_SCALPER') return; // no-op for single scalper

  const exitQty = trade.qtyPerBucket;
  const orderId = await placeExitOrder(trade, exitQty, trade.t1, 'EXIT_T1');

  await supabase.from('trade_nodes').update({
    t1_hit: true,
    sl: trade.entryPrice,           // trail to breakeven
    remaining_quantity: trade.remainingQuantity - exitQty,
    remaining_buckets: trade.remainingBuckets - 1,
    booked_pnl: trade.bookedPnl + calcPnl(trade.entryPrice, trade.t1, exitQty, trade.lotSize),
  }).eq('id', trade.id);

  await cancelAndReplaceSL(trade, trade.entryPrice); // update SL order at broker
  await logTradeEvent(trade, 'T1_HIT', ltp);
}

// P&L calculation — includes lot size
function calcPnl(entry: number, exit: number, qty: number, lotSize: number): number {
  return (exit - entry) * qty; // qty is already in units (lots * lotSize)
}
```

### 6.5 Order Fill Confirmation & Fallback
- All T1/T2/T3 exits are placed as **LIMIT** orders first
- Worker polls order status every 2 seconds for up to 30 seconds
- If not filled within 30 seconds: cancel LIMIT, place **MARKET** order instead
- If MARKET also fails: log error, mark trade as `NEEDS_ATTENTION`, alert admin

### 6.6 Idempotency & Order Deduplication
- Every order placement generates a unique `idempotency_key`: `trade_id + event_type + timestamp_bucket`
- Key stored in `order_logs` before placing with broker
- On retry: check if key already exists in `order_logs` — skip if found
- Prevents double-orders on network timeout/retry scenarios

---

## 7. Broker Order Management System

### 7.1 Order Types & When to Use

| Order Action | Broker Order Type | Params | Fallback |
|---|---|---|---|
| Entry | MARKET | transactionType=BUY, qty=total_qty | None — must fill |
| Initial SL | STOP_LOSS | triggerPrice=sl, orderType=STOP_LOSS_MARKET | Re-place after 3s if rejected |
| T1/T2/T3 Exit | LIMIT | price=target, transactionType=SELL | MARKET after 30s no-fill |
| SL Triggered | MARKET | transactionType=SELL, qty=remaining | None — emergency fill |
| Cancel SL (at T3) | CANCEL | orderId=sl_order_id | Log warning if already filled |
| Trail SL | MODIFY/CANCEL+REPLACE | new triggerPrice | Cancel old + place new SL |

### 7.2 Dhan v2 Order Payload

```json
// POST https://api.dhan.co/v2/orders
// Headers: access-token: <jwt>, Content-Type: application/json
{
  "dhanClientId": "string",
  "correlationId": "idempotency_key_here",
  "transactionType": "BUY",
  "exchangeSegment": "NSE_FNO",
  "productType": "INTRADAY",
  "orderType": "MARKET",
  "validity": "DAY",
  "tradingSymbol": "NIFTY21DEC25100CE",
  "securityId": "35001",
  "quantity": 75,
  "price": 85.50,
  "triggerPrice": 55.00,
  "afterMarketOrder": false,
  "boProfitValue": 0,
  "boStopLossValue": 0
}
```

### 7.3 Dhan LTP Feed API (Real-time)

```json
// POST /api/dhan-ltp  (Vercel serverless function)
// Called by Railway worker every 1 second for LIVE trades
{
  "NSE_FNO": ["35001", "35002"]
}
// Response:
{
  "35001": { "last_price": 87.50, "change": 2.30, "volume": 123456 },
  "35002": { "last_price": 110.25 }
}
```

### 7.4 Broker Health Monitoring

| State | Failure Count | Behavior |
|---|---|---|
| HEALTHY | 0 | Normal operations |
| DEGRADED | 1-3 | New orders still placed, admin alerted |
| DOWN | 4+ | All new orders blocked, all active trades killed, admin emergency alert |

- Broker health checked on every order placement response
- Resets to HEALTHY on first successful order after degraded state
- Health state written to `broker_health` table — visible in admin dashboard

---

## 8. Copy Trading System

> Copy trading in Matrix Pro uses an **independent execution model** — follower trades run their own protocol logic rather than mirroring admin exits. This is safer and more reliable.

### 8.1 How Copy Trading Works — Step by Step
1. Admin deploys a trade: NIFTY 25100 CE, PROTECTOR, 2 lots, SL 55
2. System detects admin is a leader — queries `copy_subscriptions` where `leader_user_id = admin.id AND is_active = true`
3. For each active follower: check tier is Pro or Elite, check broker account connected, check `daily_trades_used < limit`, check broker health
4. Create a child `TradeNode` for each eligible follower: `origin=COPY`, `parent_trade_id=admin trade`, `lots = admin_lots * lot_multiplier`
5. Place ENTRY + SL orders on each follower's broker account independently
6. Each follower trade now runs in the tick engine independently — same protocol, same target prices, own execution

### 8.2 Independent Execution Model Explained
Why followers run independently (not mirror admin):
- **Network failures:** if admin exit order fails, follower should not be affected
- **Lot differences:** follower may have different lots (0.5x multiplier)
- **Broker differences:** each user may use different broker accounts
- **Slippage:** each account gets its own fill price — more realistic P&L

### 8.3 Copy Trade Eligibility Checks

| Check | Fail Action |
|---|---|
| Follower tier is pro or elite | Skip follower — log reason |
| Follower broker account connected & active | Skip follower — send notification |
| Follower `daily_trades_used < daily_limit` | Skip follower — daily limit reached |
| Broker health state is HEALTHY or DEGRADED | Skip if DOWN |
| Follower `is_active = true` | Skip — account suspended |
| Calculated lots > 0 (after multiplier) | Skip if rounds to 0 |

### 8.4 Lot Multiplier Logic

```typescript
function calcFollowerLots(adminLots: number, multiplier: number, lotSize: number): number {
  const raw = adminLots * multiplier;
  const rounded = Math.max(1, Math.floor(raw)); // minimum 1 lot, floor to whole lots
  return rounded;
}
// Example: admin deploys 3 lots, multiplier 0.5 → floor(1.5) = 1 lot
// Example: admin deploys 2 lots, multiplier 2.0 → floor(4.0) = 4 lots
```

---

## 9. Frontend Architecture — React 19 + TypeScript

### 9.1 Project Structure

```
src/
├── app/
│   ├── App.tsx                  # Root router + auth guard
│   └── providers/
│       ├── AuthProvider.tsx      # Supabase session management
│       └── TradeProvider.tsx     # Global trade state + Realtime sub
├── pages/
│   ├── Login.tsx
│   ├── Dashboard.tsx            # Active trades + P&L summary
│   ├── Deploy.tsx               # Deploy new trade
│   ├── Trades.tsx               # Trade history with filters
│   ├── Broker.tsx               # Broker account management
│   ├── CopyTrading.tsx          # Copy toggle + multiplier
│   ├── Subscription.tsx         # Tier upgrade + billing
│   └── admin/
│       ├── AdminLayout.tsx       # Admin nav wrapper
│       ├── Users.tsx             # User management table
│       ├── AllTrades.tsx         # All platform trades
│       ├── DeployAdmin.tsx       # Admin trade entry (triggers copy)
│       ├── System.tsx            # Kill switch + circuit breaker
│       └── Analytics.tsx         # Platform-wide stats
├── components/
│   ├── TradeCard.tsx            # Single trade live card
│   ├── SignalParser.tsx          # Parse signal text → trade params
│   ├── ProtocolSelector.tsx
│   ├── BrokerStatus.tsx
│   └── PnlBadge.tsx
├── lib/
│   ├── supabase.ts              # Supabase client
│   ├── brokerApi.ts             # Dhan API wrapper
│   ├── signalParser.ts          # Signal text parser
│   ├── constants.ts             # MOMENTUM_DELTA, LOT_SIZES
│   └── utils.ts                 # P&L calc, format helpers
└── types/
    └── index.ts                 # All TypeScript interfaces
```

### 9.2 Page Routes & Guards

| Route | Component | Auth | Role Required |
|---|---|---|---|
| /login | Login.tsx | Public | None |
| /dashboard | Dashboard.tsx | Required | member+ |
| /deploy | Deploy.tsx | Required | member+ (tier check inside) |
| /trades | Trades.tsx | Required | member+ |
| /broker | Broker.tsx | Required | member+ |
| /copy-trading | CopyTrading.tsx | Required | pro/elite only |
| /subscription | Subscription.tsx | Required | member+ |
| /admin | AdminLayout.tsx | Required | admin \| super_admin |
| /admin/users | Users.tsx | Required | admin \| super_admin |
| /admin/trades | AllTrades.tsx | Required | admin \| super_admin |
| /admin/deploy | DeployAdmin.tsx | Required | admin \| super_admin |
| /admin/system | System.tsx | Required | super_admin only |
| /admin/analytics | Analytics.tsx | Required | admin \| super_admin |

### 9.3 Supabase Realtime Subscriptions (Frontend)

```typescript
// In TradeProvider.tsx — subscribe to own active trades
supabase
  .channel('active-trades')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'trade_nodes',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    updateTradeInState(payload.new as TradeNode);
  })
  .subscribe();
```

### 9.4 Key TypeScript Interfaces

```typescript
// types/index.ts
export type Protocol = 'PROTECTOR' | 'HALF_AND_HALF' | 'DOUBLE_SCALPER' | 'SINGLE_SCALPER';
export type TradeStatus = 'ACTIVE' | 'CLOSED' | 'KILLED';
export type TradeMode = 'PAPER' | 'LIVE';
export type UserRole = 'super_admin' | 'admin' | 'member' | 'viewer';
export type UserTier = 'free' | 'pro' | 'elite';

export interface TradeNode {
  id: string;
  userId: string;
  brokerAccountId: string;
  origin: 'SELF' | 'COPY';
  parentTradeId?: string;
  symbol: string;
  strike: string;
  tradingSymbol: string;
  protocol: Protocol;
  targetMode: 'MOMENTUM' | 'MANUAL';
  mode: TradeMode;
  entryPrice: number;
  ltp: number;
  sl: number;
  initialSl: number;
  t1: number; t2: number; t3: number;
  lots: number;
  lotSize: number;
  remainingQuantity: number;
  remainingBuckets: number;
  qtyPerBucket: number;
  t1Hit: boolean; t2Hit: boolean; t3Hit: boolean; slHit: boolean;
  isProcessing: boolean;
  bookedPnl: number;
  maxPriceReached: number;
  brokerOrderId: string;
  slOrderId: string;
  status: TradeStatus;
  createdAt: string;
  closedAt?: string;
}
```

---

## 10. Signal Parser

The signal parser converts text-based trading signals into structured trade parameters. Supports multiple common signal formats used by Telegram-based trading channels.

### 10.1 Supported Signal Formats

```
"NIFTY 25100 CE Above 70 TGT 85/100/120 SL 55"
"BANKNIFTY 52000 PE Buy 120 Target 135/155/180 SL 95"
"NIFTY 25100 CE Above 70 TGT 78/92/110+ SL 55"
"FINNIFTY 21500 CE Entry 45 T1 55 T2 65 T3 80 SL 35"
```

### 10.2 Parser Logic

```typescript
export function parseSignal(input: string): ParsedSignal | null {
  const normalized = input.toUpperCase().trim();

  // Extract symbol
  const symbolMatch = normalized.match(/\b(NIFTY|BANKNIFTY|FINNIFTY)\b/);
  const symbol = symbolMatch?.[1] ?? null;

  // Extract strike (number + CE/PE)
  const strikeMatch = normalized.match(/(\d{4,6})\s*(CE|PE)/);
  const strike = strikeMatch ? `${strikeMatch[1]} ${strikeMatch[2]}` : null;

  // Extract entry price (after Above/Buy/Entry)
  const entryMatch = normalized.match(/(?:ABOVE|BUY|ENTRY)\s+(\d+(?:\.\d+)?)/);
  const entryPrice = entryMatch ? parseFloat(entryMatch[1]) : null;

  // Extract targets: TGT/TARGET 85/100/120 or T1 85 T2 100 T3 120
  let t1, t2, t3;
  const tgtSlash = normalized.match(/(?:TGT|TARGET)\s+(\d+)\/(\d+)\/(\d+)/);
  if (tgtSlash) { t1 = +tgtSlash[1]; t2 = +tgtSlash[2]; t3 = +tgtSlash[3]; }
  else {
    t1 = parseFloat(normalized.match(/T1\s+(\d+)/)?.[1] ?? '0');
    t2 = parseFloat(normalized.match(/T2\s+(\d+)/)?.[1] ?? '0');
    t3 = parseFloat(normalized.match(/T3\s+(\d+)/)?.[1] ?? '0');
  }

  // Extract SL
  const slMatch = normalized.match(/SL\s+(\d+(?:\.\d+)?)/);
  const sl = slMatch ? parseFloat(slMatch[1]) : null;

  if (!symbol || !strike || !entryPrice || !sl || !t1) return null;
  return { symbol, strike, entryPrice, t1, t2, t3, sl, targetMode: 'MANUAL' };
}
```

---

## 11. Vercel Configuration & Serverless Functions

### 11.1 vercel.json

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "functions": {
    "api/**/*.ts": { "maxDuration": 10 }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET, POST, OPTIONS" }
      ]
    }
  ]
}
```

### 11.2 Serverless API Functions

| File | Method | Purpose |
|---|---|---|
| api/dhan-order.ts | POST | Place single order via Dhan v2 API (entry/exit/SL/cancel) |
| api/dhan-ltp.ts | POST | Fetch real-time LTP for array of security IDs |
| api/dhan-positions.ts | GET | Fetch current open positions from Dhan |
| api/dhan-orderbook.ts | GET | Fetch order book for a user |
| api/razorpay-webhook.ts | POST | Handle Razorpay subscription events (payment/cancel) |
| api/admin-action.ts | POST | Super-admin only: kill switch, impersonate user |

### 11.3 Environment Variables (Vercel)

| Variable | Description |
|---|---|
| VITE_SUPABASE_URL | Supabase project URL |
| VITE_SUPABASE_ANON_KEY | Supabase anon key (frontend — public) |
| SUPABASE_SERVICE_ROLE_KEY | Supabase service role (backend only — **secret**) |
| DHAN_BASE_URL | https://api.dhan.co |
| RAZORPAY_KEY_ID | Razorpay key ID |
| RAZORPAY_KEY_SECRET | Razorpay secret (server only) |
| RAZORPAY_WEBHOOK_SECRET | Webhook signature verification |

> ⚠ **NEVER** expose `SUPABASE_SERVICE_ROLE_KEY` or `RAZORPAY_KEY_SECRET` to the frontend. These must only exist in Vercel environment as server-side variables (without `VITE_` prefix).

---

## 12. Railway Worker — Deployment & Configuration

### 12.1 Worker Project Structure

```
worker/
├── src/
│   ├── index.ts            # Entry point — starts tick loop + Realtime sub
│   ├── tickEngine.ts       # Core 1-second interval logic
│   ├── protocolHandlers.ts # handleT1, handleT2, handleT3, handleSL
│   ├── brokerClient.ts     # Dhan API calls (order, cancel, modify)
│   ├── ltpFeed.ts          # Dhan Market Feed polling
│   ├── copyTrading.ts      # Create child trades for followers
│   ├── circuitBreaker.ts   # Daily loss cap logic
│   └── logger.ts           # Structured logging
├── package.json
├── tsconfig.json
└── Dockerfile              # Optional: for Railway Docker deploy
```

### 12.2 Railway Environment Variables

| Variable | Description |
|---|---|
| SUPABASE_URL | Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | Bypasses RLS — full DB access |
| DHAN_BASE_URL | https://api.dhan.co |
| TICK_INTERVAL_MS | 1000 (1 second — adjustable) |
| DB_SYNC_INTERVAL_MS | 30000 (full DB sync every 30s) |
| LOG_LEVEL | info \| debug \| error |
| NODE_ENV | production |

### 12.3 Worker Startup Sequence

```typescript
// worker/src/index.ts
async function main() {
  console.log('Matrix Pro Worker starting...');

  // 1. Connect to Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 2. Subscribe to kill switch via Realtime
  supabase.channel('system')
    .on('postgres_changes', { event: 'UPDATE', table: 'system_flags' },
      (payload) => { if (payload.new.key === 'kill_switch') killSwitchActive = payload.new.value; }
    ).subscribe();

  // 3. Load all active trades into memory
  await syncActiveTradesFromDB();

  // 4. Start tick engine
  startTickEngine();

  // 5. Start periodic DB sync (every 30s)
  setInterval(syncActiveTradesFromDB, 30000);

  console.log('Worker running. Active trades:', activeTrades.size);
}
main().catch(console.error);
```

### 12.4 Railway Deploy Config (railway.toml)

```toml
[build]
builder = "nixpacks"
buildCommand = "npm run build"

[deploy]
startCommand = "node dist/index.js"
restartPolicyType = "always"
restartPolicyMaxRetries = 10
```

---

## 13. UI Design System & Component Library

> Matrix Pro v2 uses **Tailwind CSS + shadcn/ui** for the base component library, with a custom dark-first trading theme. Target aesthetic: professional terminal-grade dashboard.

### 13.1 Color Palette

| Name | Hex | Usage |
|---|---|---|
| Deep Navy | `#1A1A2E` | Primary background, main text |
| Cyan Accent | `#00D4FF` | Active states, live indicators, links |
| Purple | `#7B2FBE` | Section headings, protocol tags |
| Profit Green | `#00C896` | Positive P&L, filled orders, T1/T2/T3 hit |
| Loss Red | `#FF4757` | Negative P&L, SL hit, error states |
| Warning Orange | `#FF6B35` | Degraded health, near-SL warning |
| Panel Dark | `#0F3460` | Card/panel backgrounds |
| Panel Mid | `#16213E` | Secondary panels, sidebar |
| Border | `#2A3A5C` | Subtle borders between elements |
| Text Muted | `#6B7280` | Labels, secondary text |

### 13.2 Typography

| Use | Font | Size | Weight |
|---|---|---|---|
| Page title | Inter | 28px | Bold 700 |
| Section heading | Inter | 20px | SemiBold 600 |
| Card title | Inter | 16px | Medium 500 |
| Body text | Inter | 14px | Regular 400 |
| Price / P&L numbers | JetBrains Mono | 16-24px | Bold 700 |
| Labels / metadata | Inter | 12px | Regular 400, color: muted |
| Code / signals | JetBrains Mono | 13px | Regular 400 |

### 13.3 Key Component Specs

**TradeCard**
- Dark panel card with glowing left border (color = protocol color)
- Shows: Symbol + Strike | Protocol badge | Mode (LIVE/PAPER) | P&L (green/red)
- Price bar: entry → current LTP → T1 → T2 → T3 as visual progress
- Buckets shown as colored circles: grey=pending, green=exited, yellow=active
- SL shown as red dashed line below entry on price bar
- Real-time update via Supabase Realtime — no polling on frontend

**Dashboard Layout**
- Left sidebar: nav (collapsible on mobile)
- Top bar: user avatar, tier badge, P&L today (live), broker status dot
- Main area: Active Trades grid (2 cols desktop, 1 col mobile)
- Bottom strip: Quick stats — Total Booked P&L | Win Rate | Trades Today | Max Drawdown

**Deploy Trade Form**
- Tab 1: Signal Paste — paste signal text, auto-parsed in real time below
- Tab 2: Manual Entry — symbol picker, strike input, entry/SL price, lots
- Protocol selector: 4 cards with visual description of each protocol
- Mode toggle: PAPER (default) / LIVE (requires broker connected + warning modal)
- Review panel: shows T1/T2/T3/SL prices, estimated max P&L and max loss
- Deploy button: disabled if broker not connected for LIVE mode

---

## 14. Build Phases & Development Roadmap

### Phase 1 — Foundation (Week 1–2)

| Task | File/Location | Notes |
|---|---|---|
| Create Supabase tables | Supabase SQL Editor | Run schema SQL from Section 3 |
| Apply RLS policies | Supabase SQL Editor | Run all policies from Section 4 |
| Enable Realtime on tables | Supabase Dashboard → DB → Replication | trade_nodes, system_flags |
| Setup Vite + React 19 project | Frontend repo | `npm create vite@latest` |
| Install: tailwind, shadcn, supabase-js | package.json | |
| Auth pages: Login + Signup | src/pages/Login.tsx | Supabase Auth UI or custom |
| Auth provider + session guard | src/app/providers/AuthProvider.tsx | |
| Profile auto-create trigger | Supabase SQL Editor | From Section 4.7 |
| Broker account connect page | src/pages/Broker.tsx | Store encrypted API key |

### Phase 2 — Core Trading (Week 3–4)

| Task | File/Location | Notes |
|---|---|---|
| Protocol constants + lot sizes | src/lib/constants.ts | MOMENTUM_DELTA, LOT_SIZES map |
| Signal parser | src/lib/signalParser.ts | From Section 10 |
| Deploy trade form | src/pages/Deploy.tsx | Signal + manual tabs |
| TradeNode creation logic | src/lib/tradeUtils.ts | Bucket calc, T1/T2/T3 calc |
| Railway worker project setup | worker/ | Separate repo or monorepo /worker |
| Tick engine (paper mode first) | worker/src/tickEngine.ts | Simulated LTP |
| Protocol handlers | worker/src/protocolHandlers.ts | handleT1/T2/T3/SL |
| Dashboard: TradeCard component | src/components/TradeCard.tsx | Realtime updates |
| Trade history page | src/pages/Trades.tsx | Filter by date/protocol/status |

### Phase 3 — Multiuser + Copy (Week 5–6)

| Task | File/Location | Notes |
|---|---|---|
| Admin route guards | src/app/App.tsx | Check role from profiles |
| Admin: User management page | src/pages/admin/Users.tsx | Table with role/tier edit |
| Admin: All trades view | src/pages/admin/AllTrades.tsx | |
| Admin: Deploy (with copy trigger) | src/pages/admin/DeployAdmin.tsx | |
| Copy subscriptions table | Supabase | Section 3.4 |
| Copy trading page | src/pages/CopyTrading.tsx | Toggle + multiplier |
| Copy trade creation in worker | worker/src/copyTrading.ts | Section 8 |
| Tier enforcement | src/lib/tierGuard.ts | Check tier before deploy |
| Daily trade limit check | worker + frontend | Decrement + check daily_trades_used |

### Phase 4 — Production Hardening (Week 7–8)

| Task | Priority | Notes |
|---|---|---|
| Real Dhan LTP feed | Critical | api/dhan-ltp.ts + worker ltpFeed.ts |
| P&L with lot size multiplier | Critical | Fix in protocolHandlers.ts |
| SL order cancellation (slOrderId) | Critical | Store on TradeNode, pass to cancel |
| isProcessing race condition lock | High | Set/clear in tickEngine.ts |
| Order fill confirmation + fallback | High | Poll order status, MARKET fallback |
| Idempotency keys on orders | High | correlationId in Dhan payload |
| Razorpay subscription billing | High | api/razorpay-webhook.ts |
| Kill switch + circuit breaker | High | Admin system page + worker enforcement |
| Broker health monitoring | Medium | worker circuitBreaker.ts |

### Phase 5 — Polish (Week 9+)
- Mobile responsive layout (trading on phone during market hours)
- Notification system: Telegram bot / WhatsApp on T1/T2/T3/SL hit
- Trade replay: reconstruct tick-by-tick from `trade_events` table
- Analytics dashboard: platform-wide P&L, win rate, protocol performance
- Admin impersonation: super_admin can view as any user
- Export: download trade history as CSV/Excel

---

## 15. Constants, Lot Sizes & Symbol Map

### 15.1 Lot Sizes (NSE F&O)

| Symbol | Lot Size | Exchange Segment | Notes |
|---|---|---|---|
| NIFTY | 65 | NSE_FNO | Revised periodically by NSE |
| BANKNIFTY | 15 | NSE_FNO | |
| FINNIFTY | 40 | NSE_FNO | |
| MIDCPNIFTY | 75 | NSE_FNO | |
| SENSEX | 20 | BSE_FNO | BSE equivalent of NIFTY |
| BANKEX | 15 | BSE_FNO | BSE equivalent of BANKNIFTY |

> ⚠ Always verify lot sizes before each expiry as NSE revises them. Store in DB or a config file that can be updated without redeployment.

### 15.2 constants.ts (Complete File)

```typescript
export const MOMENTUM_DELTA = {
  PROTECTOR:      { T1: 15, T2: 30,  T3: 50  },
  HALF_AND_HALF:  { T1: 20, T2: 40,  T3: 70  },
  DOUBLE_SCALPER: { T1: 25, T2: 50,  T3: 80  },
  SINGLE_SCALPER: { T1: 12, T2: 24,  T3: 36  },
};

export const LOT_SIZES: Record<string, number> = {
  NIFTY: 65, BANKNIFTY: 15, FINNIFTY: 40,
  MIDCPNIFTY: 75, SENSEX: 20, BANKEX: 15,
};

export const PROTOCOL_BUCKETS: Record<string, number> = {
  PROTECTOR: 3, HALF_AND_HALF: 2,
  DOUBLE_SCALPER: 2, SINGLE_SCALPER: 1,
};

export const DAILY_TRADE_LIMITS: Record<string, number> = {
  free: 3, pro: 15, elite: Infinity,
};

export const SUBSCRIPTION_PRICES = {
  pro:   { monthly: 999,  annual: 9990  },
  elite: { monthly: 2499, annual: 24990 },
};

export const ORDER_FILL_TIMEOUT_MS = 30000; // 30 seconds before MARKET fallback
export const BROKER_MAX_FAILURES    = 3;    // before marking broker as DOWN
export const KILL_SWITCH_POLL_MS    = 5000; // fallback if Realtime disconnects
```

---

## 16. Security Checklist

### 16.1 Authentication & Authorization
- Supabase Auth handles all authentication — JWT tokens, refresh rotation
- All DB operations enforce RLS — user can never access another user's data via API
- Role checks done server-side (in RLS policies + Railway worker) — never trust client-side role claims
- Admin routes on frontend are UI-only guards — real enforcement is in DB policies
- Service role key only in Railway worker and Vercel server-side functions — never in frontend

### 16.2 Broker API Key Security
- API keys stored encrypted in `broker_accounts` table (use `pgcrypto` extension in Supabase)
- `access_token` refreshed daily — never cached in browser
- All Dhan API calls proxied through Vercel serverless functions — key never exposed to browser
- Users can only access their own broker accounts (RLS enforced)

### 16.3 Input Validation
- Signal parser: validate all parsed values are positive numbers, entry > SL, T1 > entry
- Manual deploy form: Zod schema validation on all inputs before DB insert
- Lot multiplier: clamp between 0.25 and 5.0 — prevent extreme position sizes
- Max lots per trade: enforce at tier level (e.g. Elite max 50 lots)

### 16.4 Financial Safety
- Circuit breaker: daily loss cap enforced in worker — trades auto-killed when breached
- Kill switch: propagated via Supabase Realtime within ~200ms to worker
- All LIVE trade deployments require explicit `mode=LIVE` confirmation modal
- Paper mode is default — user must actively switch to LIVE
- Duplicate order prevention via idempotency keys (`correlationId` in Dhan)

---

## 17. Testing Strategy

### 17.1 Unit Tests (Vitest)
- `signalParser.ts` — test all signal format variations
- `protocolHandlers.ts` — test each T1/T2/T3/SL trigger for all 4 protocols
- `calcPnl()` — verify lot size multiplication correctness
- `calcFollowerLots()` — test 0.5x/1x/2x multipliers with edge cases
- Bucket calculation — odd lots across 2/3 buckets

### 17.2 Integration Tests
- Full trade lifecycle in PAPER mode (deploy → T1 → T2 → T3 → CLOSED)
- PROTECTOR: verify T2 does NOT exit, only trails SL
- SINGLE_SCALPER: verify T1 and T2 are true no-ops
- SL hit mid-trade: verify ALL remaining quantity exits
- Copy trade creation: verify child trades created for eligible followers only
- Daily limit: verify 4th trade blocked for free tier

### 17.3 Staging Environment
- All broker orders in staging use Dhan sandbox environment
- Deploy to Vercel preview environment per PR
- Railway staging worker with `TICK_INTERVAL_MS=5000` (slower for debugging)
- Supabase branching (if available) or separate staging Supabase project

---

## 18. Quick Reference Card

### 18.1 Critical Bug Fixes from v1 (Must Fix Before LIVE)

| Bug | Impact | Fix Location |
|---|---|---|
| Simulated LTP for LIVE trades | Real orders on fake prices = real loss | worker/src/ltpFeed.ts — integrate Dhan Market Feed |
| P&L missing lot size multiplier | P&L off by 15-75x | calcPnl() — multiply by lotSize |
| SL not cancelled at T3 | Double-exit risk after T3 | Pass slOrderId to cancelOrder() in handleT3 |
| No tick engine lock | Race condition = ghost orders | isProcessing flag per trade in tickEngine.ts |
| T3 has no t1Hit guard | May exit before T1 for PROTECTOR | Add `if t1Hit` check before T3 trigger |
| Bucket qty rounding | Fractional lots sent to broker | Floor to whole lots in createTradeNode() |

### 18.2 Key Files Lookup

| Need to change... | File |
|---|---|
| Protocol exit rules | worker/src/protocolHandlers.ts |
| Target point deltas | src/lib/constants.ts → MOMENTUM_DELTA |
| Lot sizes | src/lib/constants.ts → LOT_SIZES |
| Tick timing | worker/src/tickEngine.ts → setInterval |
| Broker order payload | worker/src/brokerClient.ts |
| Signal parser formats | src/lib/signalParser.ts |
| RLS policies | Supabase SQL Editor |
| User tier limits | src/lib/constants.ts → DAILY_TRADE_LIMITS |
| Kill switch behavior | worker/src/index.ts → Realtime subscription |
| Copy trade logic | worker/src/copyTrading.ts |
| Admin pages | src/pages/admin/ |
| Razorpay webhooks | api/razorpay-webhook.ts |

### 18.3 Dhan API Endpoints Used

| Endpoint | Method | Used For |
|---|---|---|
| https://api.dhan.co/v2/orders | POST | Place any order (entry/exit/SL) |
| https://api.dhan.co/v2/orders/{orderId} | DELETE | Cancel order (SL cancel at T3) |
| https://api.dhan.co/v2/orders/{orderId} | PUT | Modify order (trail SL) |
| https://api.dhan.co/v2/orders/{orderId} | GET | Check order fill status |
| https://api.dhan.co/v2/marketfeed/ltp | POST | Get real-time LTP (batch) |
| https://api.dhan.co/v2/positions | GET | Current open positions |

### 18.4 Environment Setup Checklist
1. Create Supabase project → run schema SQL → run RLS SQL → enable Realtime
2. Create Vercel project → connect GitHub → set all env vars → deploy
3. Create Railway project → connect worker repo → set env vars → deploy
4. Dhan developer account → create app → get `client_id` + `api_key`
5. Razorpay account → create plans (pro/elite monthly+annual) → get keys
6. Test: deploy PAPER trade from frontend → verify worker processes it → verify DB updated
7. Test: deploy LIVE trade in Dhan sandbox → verify real order placed
8. Test: kill switch → verify worker stops processing within 5s
