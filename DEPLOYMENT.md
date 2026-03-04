# Matrix Pro v2 — Deployment Guide

---

## 1. Supabase — Run the Schema

1. Go to [supabase.com](https://supabase.com) → your project → **SQL Editor**
2. Paste the entire contents of `supabase/schema.sql` and click **Run**
3. Go to **Authentication → Providers** → enable **Email / Password**
4. Go to **Project Settings → API** → copy:

| Key | Used As |
|---|---|
| Project URL | `VITE_SUPABASE_URL` |
| anon key | `VITE_SUPABASE_ANON_KEY` |
| service_role key | `SUPABASE_SERVICE_ROLE_KEY` (server-side only, never frontend) |

---

## 2. Vercel — Frontend + API Functions

1. Push the repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the repo
3. Set **Root Directory** to `frontend`
4. Add **Environment Variables**:

```
VITE_SUPABASE_URL          = https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY     = eyJ...
SUPABASE_SERVICE_ROLE_KEY  = eyJ...
DHAN_BASE_URL              = https://api.dhan.co/v2
```

5. Click **Deploy** and note the deployment URL (e.g. `https://matrix-pro.vercel.app`)
6. Go to **Supabase → Authentication → URL Configuration** → set:
   - **Site URL**: `https://matrix-pro.vercel.app`
   - **Redirect URLs**: `https://matrix-pro.vercel.app/**`

---

## 3. Railway — Tick Engine Worker

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub**
2. Select the repo, set **Root Directory** to `worker`
3. Set **Start Command**: `npm run start`
4. Add **Environment Variables**:

```
SUPABASE_URL               = https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY  = eyJ...
DHAN_BASE_URL              = https://api.dhan.co/v2
DHAN_FEED_URL              = wss://api-feed.dhan.co
NODE_ENV                   = production
```

5. Click **Deploy** — Railway builds (`tsc`) then starts `node dist/index.js`

---

## 4. Dhan — Connect Broker Account

1. Log in to your Matrix Pro app
2. Go to **Broker** page → **Add Account**
3. Enter your Dhan **Client ID** and **Access Token** (from Dhan developer console)
4. Set mode to **LIVE**
5. Health status should flip to `OK` within 30 seconds

---

## 5. First Trade — 1-Lot Smoke Test

1. Go to **Deploy** page
2. Pick a symbol, fill in Entry / SL / T1 / T2 / T3
3. Set mode = **LIVE**, 1 lot
4. Confirm the LIVE warning modal
5. Trade appears in **Trades** page — worker processes it within 1 second

---

## Pre-Launch Checklist

| # | Check | Where to verify |
|---|---|---|
| 1 | Worker logs: `Tick engine started` | Railway → Deployments → Logs |
| 2 | Worker logs: `DhanFeed WS connected` | Railway → Deployments → Logs |
| 3 | Broker `health_status = OK` | Supabase → Table Editor → `broker_accounts` |
| 4 | `KILL_SWITCH = false` | Supabase → Table Editor → `system_flags` |
| 5 | `CIRCUIT_BREAKER = false` | Supabase → Table Editor → `system_flags` |
| 6 | LIVE mode warning modal appears | Frontend → Deploy page |
| 7 | Paper trade completes full T1→T2→T3 cycle | Frontend → Trades page |

---

## Environment Variables — Full Reference

### Vercel (frontend + `/api/*` functions)

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (API functions only) |
| `DHAN_BASE_URL` | `https://api.dhan.co/v2` |

### Railway (worker)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `DHAN_BASE_URL` | `https://api.dhan.co/v2` |
| `DHAN_FEED_URL` | `wss://api-feed.dhan.co` |
| `NODE_ENV` | `production` |

---

## Post-Launch — Before Scaling Capital

| Priority | Item |
|---|---|
| 🟡 | Enable `pgcrypto` encryption for broker API keys in `broker_accounts` |
| 🟡 | Run a full T1→T2→T3→SL cycle in PAPER mode and verify `trade_events` log |
| 🟢 | Set up Telegram/WhatsApp notifications on T1/T2/T3/SL hits |
| 🟢 | Add Vitest unit tests for `protocolHandlers` and `signalParser` |
