# Matrix Pro — Simulator Guide

The Simulator lets you **dry-run any trade setup without real money**. It mirrors the exact same protocol logic running in the live worker, so what you see here is exactly what will happen in a real trade.

---

## What the Simulator Does

- Accepts a signal (paste TradingView alert text or fill manually)
- Calculates targets & lot quantities using the same engine as Deploy
- Lets you scrub an LTP slider tick-by-tick to watch the protocol play out
- Shows a real-time Event Log of every SL movement, target hit, and exit
- Displays final P&L once the trade closes (SL hit or T3 reached)

**Nothing is sent to a broker. No orders are placed. Fully safe to use anytime.**

---

## Step-by-Step Usage

### 1 — Choose a Protocol
Select the protocol at the top. Each one handles your buckets differently (see table below).

### 2 — Paste or Fill a Signal
**Signal tab:** Paste your TradingView alert text. The parser reads symbol, strike, entry, SL automatically.

**Manual tab:** Fill in Symbol → Strike → Entry → SL directly.

### 3 — Set Lots & Target Mode
- **Lots** — snaps to the nearest valid bucket multiple automatically
- **Momentum** — targets auto-calculated from entry using protocol deltas
- **Manual** — type T1/T2/T3 yourself (Pro/Elite only)

### 4 — Trail SL Step *(Half & Half and Trail Runner only)*
Choose how aggressively the SL trails after T1 is hit:

| Button | Meaning |
|--------|---------|
| Off | No trailing — SL stays at entry after T1 |
| +1 | SL moves up 1 pt for every 1 pt LTP gains past T1 |
| +3 | SL moves up 3 pts for every 3 pts LTP gains |
| +10 | Large step — SL lags more, lets trade breathe |
| +20 | Maximum step — maximum room |

Formula: `SL = entry + floor((LTP − T1) / step) × step`

Example — Entry ₹70, T1 ₹85, step = +5:
- LTP ₹90 → SL = 70 + floor(5/5)×5 = **₹75**
- LTP ₹94 → SL = 70 + floor(9/5)×5 = **₹75** (no change yet)
- LTP ₹95 → SL = 70 + floor(10/5)×5 = **₹80**

### 5 — Run the Simulation
Click **Run**. Drag the LTP slider left/right to simulate price movement.

- The Event Log populates in reverse-chronological order (newest at top)
- Green events = profit exits; Red events = SL hits; White = milestones
- P&L badge at top shows running booked P&L

Click **Reset** to clear and start again with new parameters.

---

## Protocol Behaviour Reference

| Protocol | Buckets | T1 | T2 | T3 | SL Hit |
|---|:---:|---|---|---|---|
| **Protector** | 3 | Exit 1/3 + SL→entry | Exit 1/3 + SL→T1 | Exit last 1/3 | Exit all remaining |
| **Half & Half** | 2 | Exit 50% + SL→entry + trail | Milestone only | Exit remaining 50% | Exit all remaining |
| **Double Scalper** | 2 | Exit 50% + SL→entry | Exit remaining 50% | — | Exit all remaining |
| **Single Scalper** | 1 | Floor locked at entry | Floor locked at T1 | Exit ALL lots | Exit all remaining |
| **Trail Runner** | 1 | SL→entry + trail ON | Milestone (trail continues) | Milestone (trail continues) | Exit all remaining |

---

## Momentum Delta Defaults

When Target Mode = **Momentum**, targets are: `entry + delta`

| Protocol | T1 | T2 | T3 |
|---|---|---|---|
| Protector | +15 | +30 | +50 |
| Half & Half | +20 | +40 | +70 |
| Double Scalper | +25 | +50 | +80 |
| Single Scalper | +12 | +24 | +36 |
| Trail Runner | +15 | +30 | +50 |

---

## Bucket Quantities

Lots are split evenly across buckets. The lot count is auto-snapped to a multiple of the protocol's bucket count.

| Protocol | Buckets | Example: 4 lots, 65/lot |
|---|:---:|---|
| Protector | 3 | Snapped to 3 lots → 65 qty/bucket |
| Half & Half | 2 | 4 lots → 130 qty/bucket |
| Double Scalper | 2 | 4 lots → 130 qty/bucket |
| Single Scalper | 1 | 4 lots → 260 qty total |
| Trail Runner | 1 | 4 lots → 260 qty total |

---

## Lot Sizes (NSE/BSE F&O)

| Symbol | Lot Size |
|---|---|
| NIFTY | 65 |
| BANKNIFTY | 15 |
| FINNIFTY | 40 |
| MIDCPNIFTY | 75 |
| SENSEX | 20 |
| BANKEX | 15 |

---

## Choosing the Right Protocol

| You want to… | Use |
|---|---|
| Protect capital, exit methodically | **Protector** |
| Take half profit early, trail the rest | **Half & Half** |
| Two quick scalps on a trending move | **Double Scalper** |
| Ride the whole move, lock the floor | **Single Scalper** |
| Let the trade run indefinitely with a rising SL | **Trail Runner** |

---

## Tips

- Always simulate a new protocol setup before going live — the event log reveals exactly when each exit fires
- Try a high LTP first (to see all targets hit), then try a reversal (to test SL logic)
- Use Off trail step to understand baseline P&L before adding trailing
- Simulator and Live worker use identical logic — if it looks right here, it is right in live
