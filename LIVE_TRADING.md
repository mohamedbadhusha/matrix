# Matrix Pro — Live Trading Guide

This guide covers everything needed to go from signup to executing real trades on Dhan via Matrix Pro.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Dhan HQ account | Active F&O segment required |
| Dhan API subscription | Enable via Dhan → My Profile → API Settings |
| Matrix Pro account | Pro or Elite tier for live trading |
| Supabase session | Auto-managed on login |

---

## 1 — Connect Your Broker

### Step 1: Generate Consent
1. Go to **Broker** page in Matrix Pro
2. Enter your **Dhan Client ID** and **Access Token** (from Dhan API Settings)
3. Click **Connect Broker**
4. Status shows 🟢 **Connected** when verified

### Step 2: Verify Connection
The Broker page shows:
- Client ID
- Account status (Active / Inactive)
- Daily trade count used vs limit
- Kill Switch status

> **Tip:** Keep the Access Token safe — it expires daily. Re-paste it each trading session if needed.

---

## 2 — Deploy a Trade

Navigate to **Deploy** in the sidebar.

### Signal Tab (Recommended)
1. Copy your TradingView alert text
2. Paste into the Signal Parser input
3. The parser auto-fills: Symbol, Strike, Trading Symbol, Security ID, Entry, SL
4. Verify the parsed values, correct if needed
5. Proceed to Step 3

### Manual Tab
Fill in all fields:
- **Symbol** — NIFTY / BANKNIFTY / FINNIFTY / MIDCPNIFTY / SENSEX / BANKEX
- **Strike** — e.g. `25100 CE`
- **Entry Price** — current option premium
- **Stop Loss** — your max loss price

### Step 3: Configure the Trade

**Protocol** — choose based on your strategy (see table below)

**Target Mode:**
- **Momentum** — targets auto-calculated from entry (recommended for most traders)
- **Manual** — type T1/T2/T3 yourself (Pro/Elite only)

**Lots** — auto-snaps to nearest valid bucket multiple

**Trail SL Step** *(Half & Half / Trail Runner only)* — select Off through +20

**Mode:**
- **Paper** — fully simulated, no real orders placed. Use this first.
- **Live** — real orders sent to Dhan. Confirmation dialog appears.

### Step 4: Select Broker Account
*(Live mode only)* — Choose the connected Dhan account from the dropdown.

### Step 5: Deploy
Click **Deploy Trade**. The trade appears immediately on the **Trades** page.

---

## 3 — Monitor Active Trades

Go to **Trades** in the sidebar.

Each trade card shows:
- Symbol, strike, protocol badge
- Live LTP (updated every ~1 second via WebSocket)
- Current SL, T1/T2/T3 status (hit/pending)
- Running unrealised P&L
- Booked P&L from partial exits

**Target indicators** turn green when hit. **SL** turns red when triggered.

The worker runs a 1-second tick loop on Railway — it monitors LTP and fires exits automatically. You do not need to stay on screen.

---

## 4 — Protocol Behaviour in Live Trading

| Protocol | Buckets | T1 | T2 | T3 | SL Hit |
|---|:---:|---|---|---|---|
| **Protector** | 3 | Sell 1/3 + SL→entry | Sell 1/3 + SL→T1 | Sell last 1/3 | Market exit all |
| **Half & Half** | 2 | Sell 50% + SL→entry + trail | Milestone | Sell remaining 50% | Market exit all |
| **Double Scalper** | 2 | Sell 50% + SL→entry | Sell remaining 50% | — | Market exit all |
| **Single Scalper** | 1 | SL→entry (hold) | SL→T1 (hold) | Sell ALL lots | Market exit all |
| **Trail Runner** | 1 | SL→entry + trail ON | Milestone | Milestone | Market exit all |

> In **Live mode**, partial exits place LIMIT orders at the target price. SL hit closes remaining quantity at market.

---

## 5 — Kill Switch

The Kill Switch is an emergency stop for all active trades.

**Location:** Broker page → Kill Switch toggle

**What it does:**
- Immediately closes ALL open positions at market price
- Cancels all pending SL orders
- Marks all trades as CLOSED in the database
- Worker stops processing ticks for those trades

**Use it when:**
- Market is moving against all open trades rapidly
- You need to manually exit before broker session expires
- Unexpected news event

> The Kill Switch affects ALL active trades across ALL accounts. Use only when you intend to exit everything.

---

## 6 — Paper Mode vs Live Mode

| Feature | Paper | Live |
|---|---|---|
| Orders sent to Dhan | ❌ No | ✅ Yes |
| P&L tracking | ✅ Simulated | ✅ Real |
| Tick monitoring | ✅ Same worker | ✅ Same worker |
| SL / target exits | ✅ Logged only | ✅ Actual broker orders |
| Good for | Testing, practice | Real trading |

**Recommended workflow:**
1. Run the **Simulator** to validate your setup
2. Deploy in **Paper** mode to verify the system logs exits correctly
3. Switch to **Live** only when fully confident

---

## 7 — Daily Trade Limits

| Tier | Daily Limit | Max Lots | Protocols |
|---|---|---|---|
| Free | 3 trades | 5 lots | Single Scalper only |
| Pro | 15 trades | 20 lots | All 5 protocols |
| Elite | Unlimited | 50 lots | All 5 protocols |

The counter resets at midnight IST. The Deploy page shows remaining trades for the day.

---

## 8 — Option Chain → Deploy Shortcut

1. Go to **Option Chain** page
2. Find your strike (±8 strikes shown around ATM)
3. Click the **CE** or **PE** premium price
4. Deploy form opens pre-filled with symbol, strike, and entry price
5. Set SL, lots, protocol, and deploy

This is the fastest workflow for live scalping.

---

## 9 — Troubleshooting

| Issue | Fix |
|---|---|
| Broker shows Disconnected | Re-paste Access Token on Broker page — Dhan tokens expire daily |
| Trade stuck in ACTIVE after T3 | Check worker logs on Railway; may be a broker order fill timeout |
| Paper trade exits not showing | Trades page auto-refreshes every 5s; wait or refresh manually |
| Deploy button disabled | Check daily trade limit, or tier doesn't allow selected protocol |
| LTP not updating | WebSocket may have disconnected; refresh the Trades page |
| Order rejected by Dhan | Verify F&O segment is active and sufficient margin is available |

---

## 10 — Security Notes

- Access Tokens are stored encrypted in Supabase — never shared with third parties
- Live mode requires explicit confirmation (two-step dialog) before any order is placed
- Kill Switch requires a second confirm click to prevent accidental activation
- All API calls go through the secure Railway worker, not directly from the browser
- Postback handler validates Dhan order updates before processing

---

## Quick Reference Card

```
FLOW:  Signal → Deploy (Paper first) → Monitor → Auto-exits by worker

PROTOCOLS:
  Protector      3B  T1:Sell+SL→entry  T2:Sell+SL→T1   T3:Sell last
  Half & Half    2B  T1:Sell50%+trail  T2:Milestone     T3:Sell rest
  Double Scalper 2B  T1:Sell50%+SL     T2:Sell rest     —
  Single Scalper 1B  T1:Floor→entry    T2:Floor→T1      T3:Sell ALL
  Trail Runner   1B  T1:Floor+trail    T2:Milestone     T3:Milestone

TIERS:
  Free   3/day  5L   Single Scalper only
  Pro   15/day 20L   All protocols
  Elite  ∞/day 50L   All protocols
```
