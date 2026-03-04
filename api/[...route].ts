/**
 * Catch-all API router — /api/*
 *
 * Consolidates all 38 handlers into a single Vercel serverless function,
 * staying within the Hobby-plan 12-function limit.
 *
 * Routes are matched by the last path segment of the URL, e.g.
 *   POST /api/dhan-order           → handlers['dhan-order']
 *   GET  /api/dhan-profile         → handlers['dhan-profile']
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── static imports (all 38 handlers) ────────────────────────────────────────
import adminAction              from './_handlers/admin-action.js';
import dhanCancelForeverOrder   from './_handlers/dhan-cancel-forever-order.js';
import dhanCancelOrder          from './_handlers/dhan-cancel-order.js';
import dhanCancelSuperOrder     from './_handlers/dhan-cancel-super-order.js';
import dhanConditionalTrigger   from './_handlers/dhan-conditional-trigger.js';
import dhanConditionalTriggers  from './_handlers/dhan-conditional-triggers.js';
import dhanConsumeConsent       from './_handlers/dhan-consume-consent.js';
import dhanConvertPosition      from './_handlers/dhan-convert-position.js';
import dhanDeleteConditionalTrigger from './_handlers/dhan-delete-conditional-trigger.js';
import dhanExitPositions        from './_handlers/dhan-exit-positions.js';
import dhanForeverOrder         from './_handlers/dhan-forever-order.js';
import dhanForeverOrderbook     from './_handlers/dhan-forever-orderbook.js';
import dhanFundLimit            from './_handlers/dhan-fund-limit.js';
import dhanGenerateConsent      from './_handlers/dhan-generate-consent.js';
import dhanHoldings             from './_handlers/dhan-holdings.js';
import dhanKillswitch           from './_handlers/dhan-killswitch.js';
import dhanLedger               from './_handlers/dhan-ledger.js';
import dhanLtp                  from './_handlers/dhan-ltp.js';
import dhanMarginCalculator     from './_handlers/dhan-margin-calculator.js';
import dhanMarginCalculatorMulti from './_handlers/dhan-margin-calculator-multi.js';
import dhanModifyConditionalTrigger from './_handlers/dhan-modify-conditional-trigger.js';
import dhanModifyForeverOrder   from './_handlers/dhan-modify-forever-order.js';
import dhanModifyOrder          from './_handlers/dhan-modify-order.js';
import dhanModifySuperOrder     from './_handlers/dhan-modify-super-order.js';
import dhanOptionChain          from './_handlers/dhan-option-chain.js';
import dhanOptionChainExpiry    from './_handlers/dhan-option-chain-expiry.js';
import dhanOrder                from './_handlers/dhan-order.js';
import dhanOrderbook            from './_handlers/dhan-orderbook.js';
import dhanPnlExit              from './_handlers/dhan-pnl-exit.js';
import dhanPositions            from './_handlers/dhan-positions.js';
import dhanPostback             from './_handlers/dhan-postback.js';
import dhanProfile              from './_handlers/dhan-profile.js';
import dhanRenewToken           from './_handlers/dhan-renew-token.js';
import dhanSuperOrder           from './_handlers/dhan-super-order.js';
import dhanSuperOrderbook       from './_handlers/dhan-super-orderbook.js';
import dhanTradeHistory         from './_handlers/dhan-trade-history.js';
import dhanTradebook            from './_handlers/dhan-tradebook.js';
import razorpayWebhook          from './_handlers/razorpay-webhook.js';

// ── route table ──────────────────────────────────────────────────────────────
type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

const routes: Record<string, Handler> = {
  'admin-action':                   adminAction,
  'dhan-cancel-forever-order':      dhanCancelForeverOrder,
  'dhan-cancel-order':              dhanCancelOrder,
  'dhan-cancel-super-order':        dhanCancelSuperOrder,
  'dhan-conditional-trigger':       dhanConditionalTrigger,
  'dhan-conditional-triggers':      dhanConditionalTriggers,
  'dhan-consume-consent':           dhanConsumeConsent,
  'dhan-convert-position':          dhanConvertPosition,
  'dhan-delete-conditional-trigger':dhanDeleteConditionalTrigger,
  'dhan-exit-positions':            dhanExitPositions,
  'dhan-forever-order':             dhanForeverOrder,
  'dhan-forever-orderbook':         dhanForeverOrderbook,
  'dhan-fund-limit':                dhanFundLimit,
  'dhan-generate-consent':          dhanGenerateConsent,
  'dhan-holdings':                  dhanHoldings,
  'dhan-killswitch':                dhanKillswitch,
  'dhan-ledger':                    dhanLedger,
  'dhan-ltp':                       dhanLtp,
  'dhan-margin-calculator':         dhanMarginCalculator,
  'dhan-margin-calculator-multi':   dhanMarginCalculatorMulti,
  'dhan-modify-conditional-trigger':dhanModifyConditionalTrigger,
  'dhan-modify-forever-order':      dhanModifyForeverOrder,
  'dhan-modify-order':              dhanModifyOrder,
  'dhan-modify-super-order':        dhanModifySuperOrder,
  'dhan-option-chain':              dhanOptionChain,
  'dhan-option-chain-expiry':       dhanOptionChainExpiry,
  'dhan-order':                     dhanOrder,
  'dhan-orderbook':                 dhanOrderbook,
  'dhan-pnl-exit':                  dhanPnlExit,
  'dhan-positions':                 dhanPositions,
  'dhan-postback':                  dhanPostback,
  'dhan-profile':                   dhanProfile,
  'dhan-renew-token':               dhanRenewToken,
  'dhan-super-order':               dhanSuperOrder,
  'dhan-super-orderbook':           dhanSuperOrderbook,
  'dhan-trade-history':             dhanTradeHistory,
  'dhan-tradebook':                 dhanTradebook,
  'razorpay-webhook':               razorpayWebhook,
};

// ── dispatcher ───────────────────────────────────────────────────────────────
export default function handler(req: VercelRequest, res: VercelResponse) {
  // req.url = '/api/dhan-order' or '/api/dhan-order?foo=bar'
  const pathname = (req.url ?? '').split('?')[0];           // strip query
  const segment  = pathname.replace(/^\/api\//, '').replace(/\/$/, '');

  const fn = routes[segment];
  if (!fn) {
    return res.status(404).json({ error: `Unknown route: /api/${segment}` });
  }

  return fn(req, res);
}
