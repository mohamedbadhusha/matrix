import type { ParsedSignal } from '@/types';

/**
 * Parse a text-based trading signal into structured trade parameters.
 *
 * Supports formats:
 *   "NIFTY 25100 CE Above 70 TGT 85/100/120 SL 55"
 *   "BANKNIFTY 52000 PE Buy 120 Target 135/155/180 SL 95"
 *   "FINNIFTY 21500 CE Entry 45 T1 55 T2 65 T3 80 SL 35"
 *   "NIFTY 25100 CE Above 70 TGT 78/92/110+ SL 55"
 */
export function parseSignal(input: string): ParsedSignal | null {
  if (!input?.trim()) return null;

  const normalized = input.toUpperCase().trim().replace(/\s+/g, ' ');

  // ── Symbol ─────────────────────────────────────────────────────────────
  const symbolMatch = normalized.match(/\b(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY|SENSEX|BANKEX)\b/);
  const symbol = symbolMatch?.[1] ?? null;

  // ── Strike (number + CE/PE) ────────────────────────────────────────────
  const strikeMatch = normalized.match(/(\d{4,6})\s*(CE|PE)/);
  const strike = strikeMatch ? `${strikeMatch[1]} ${strikeMatch[2]}` : null;

  // ── Entry price (after Above / Buy / Entry / @ ) ───────────────────────
  const entryMatch = normalized.match(/(?:ABOVE|BUY|ENTRY|@)\s+(\d+(?:\.\d+)?)/);
  const entryPrice = entryMatch ? parseFloat(entryMatch[1]) : null;

  // ── Targets ────────────────────────────────────────────────────────────
  let t1 = 0, t2 = 0, t3 = 0;

  // Format: TGT 85/100/120 or TARGET 85/100/120
  const tgtSlash = normalized.match(/(?:TGT|TARGET)\s+(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\+?/);
  if (tgtSlash) {
    t1 = parseFloat(tgtSlash[1]);
    t2 = parseFloat(tgtSlash[2]);
    t3 = parseFloat(tgtSlash[3]);
  } else {
    // Format: T1 55 T2 65 T3 80
    const t1Match = normalized.match(/T1\s+(\d+(?:\.\d+)?)/);
    const t2Match = normalized.match(/T2\s+(\d+(?:\.\d+)?)/);
    const t3Match = normalized.match(/T3\s+(\d+(?:\.\d+)?)/);
    t1 = t1Match ? parseFloat(t1Match[1]) : 0;
    t2 = t2Match ? parseFloat(t2Match[1]) : 0;
    t3 = t3Match ? parseFloat(t3Match[1]) : 0;
  }

  // ── Stop Loss ──────────────────────────────────────────────────────────
  const slMatch = normalized.match(/SL\s+(\d+(?:\.\d+)?)/);
  const sl = slMatch ? parseFloat(slMatch[1]) : null;

  // ── Validate required fields ───────────────────────────────────────────
  if (!symbol || !strike || !entryPrice || !sl || !t1) return null;
  if (sl >= entryPrice) return null;
  if (t1 <= entryPrice) return null;

  // Fill in t2/t3 if missing (use t1 * 1.15 & t1 * 1.3 as approximations)
  const computedT2 = t2 > t1 ? t2 : parseFloat((entryPrice + (t1 - entryPrice) * 1.8).toFixed(2));
  const computedT3 = t3 > computedT2 ? t3 : parseFloat((entryPrice + (t1 - entryPrice) * 2.8).toFixed(2));

  return {
    symbol,
    strike,
    entryPrice,
    t1,
    t2: computedT2,
    t3: computedT3,
    sl,
    targetMode: 'MANUAL',
  };
}

/**
 * Validate a parsed signal result
 */
export function validateParsedSignal(signal: ParsedSignal): string | null {
  if (signal.entryPrice <= 0) return 'Entry price must be positive';
  if (signal.sl <= 0) return 'Stop loss must be positive';
  if (signal.sl >= signal.entryPrice) return 'Stop loss must be below entry price';
  if (signal.t1 <= signal.entryPrice) return 'T1 must be above entry';
  if (signal.t2 <= signal.t1) return 'T2 must be above T1';
  if (signal.t3 <= signal.t2) return 'T3 must be above T2';
  return null;
}

/**
 * Format a parsed signal back to a readable summary string
 */
export function formatSignalSummary(signal: ParsedSignal): string {
  return `${signal.symbol} ${signal.strike} | Entry: ${signal.entryPrice} | T1: ${signal.t1} | T2: ${signal.t2} | T3: ${signal.t3} | SL: ${signal.sl}`;
}
