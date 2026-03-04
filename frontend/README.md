# Matrix Pro v2 — Frontend

Multi-user Indian F&O trading dashboard. Vite + React 19 + TypeScript + Tailwind + Supabase + Dhan API v2.

## Stack

| Layer | Technology |
|---|---|
| UI | React 19 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS |
| Icons | lucide-react |
| Notifications | sonner |
| Router | React Router v6 |
| Database | Supabase (PostgreSQL + Realtime) |
| Auth | Supabase Auth |
| Broker | Dhan HQ API v2 |

## Quick Start

```bash
cd frontend
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev
```

## Source Structure

```
src/
├── app/            # Root router (App.tsx) + AuthProvider + TradeProvider
├── constants/      # dhan.ts — all Dhan API annexure enums
├── pages/          # 15 member pages + 5 admin pages
├── components/     # AppLayout, Sidebar, TopBar
├── hooks/          # useOrderUpdateWs (Dhan WSS live orders)
├── types/          # index.ts — all TypeScript interfaces
└── lib/            # supabase, constants, signalParser, utils
```

## Pages

| Route | Page | Notes |
|---|---|---|
| /dashboard | Dashboard | Active trades + P&L |
| /deploy | Deploy | Signal paste or manual |
| /trades | Trade History | Filters by status/protocol |
| /orders | Orders | 4 tabs: Live/Super/Forever/History |
| /positions | Positions | Open positions + convert |
| /holdings | Holdings | |
| /alerts | Alerts | Conditional trigger orders |
| /trader-control | Trader Control | Kill switch + P&L exit |
| /funds | Funds | Fund limit + margin calculators |
| /statement | Statement | Ledger + paginated trade history |
| /live-orders | Live Orders | WebSocket order feed |
| /option-chain | Option Chain | OC with Greeks, OI bars, ATM |
| /broker | Broker | Dhan account management |
| /copy-trading | Copy Trading | Pro/Elite only |
| /subscription | Subscription | Tier upgrade + billing |

## TypeScript Check

```powershell
npx tsc --noEmit
# Expected: Exit=0
```

## API Functions

All Dhan API calls proxied through Vercel serverless `/api/*.ts`.
See `MatrixPro_v2_Blueprint.md` for full reference.
