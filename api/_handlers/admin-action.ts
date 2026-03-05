import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase } from '../_lib/supabase-admin.js';

type Action =
  | 'KILL_TRADE'
  | 'CLOSE_TRADE'
  | 'UPDATE_SL'
  | 'SET_FLAG'
  | 'RESET_DAILY_TRADES'
  | 'UPDATE_USER_TIER';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, payload, adminId } = req.body ?? {};

  if (!action || !adminId) {
    return res.status(400).json({ error: 'action and adminId required' });
  }

  // Verify admin role
  const { data: admin } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single();

  if (!admin || !['admin', 'super_admin'].includes(admin.role)) {
    return res.status(403).json({ error: 'Forbidden — Admin only' });
  }

  try {
    switch (action as Action) {
      case 'KILL_TRADE': {
        const { tradeId } = payload;
        const { error } = await supabase
          .from('trade_nodes')
          .update({ status: 'KILLED', closed_at: new Date().toISOString() })
          .eq('id', tradeId);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      case 'CLOSE_TRADE': {
        const { tradeId, exitPrice } = payload;
        const { data: trade } = await supabase
          .from('trade_nodes')
          .select('entry_price, lots, lot_size')
          .eq('id', tradeId)
          .single();
        const pnl = trade
          ? (exitPrice - trade.entry_price) * trade.lots * trade.lot_size
          : 0;
        const { error } = await supabase
          .from('trade_nodes')
          .update({
            status: 'CLOSED',
            exit_price: exitPrice,
            realised_pnl: pnl,
            closed_at: new Date().toISOString(),
          })
          .eq('id', tradeId);
        if (error) throw error;
        return res.status(200).json({ success: true, pnl });
      }

      case 'UPDATE_SL': {
        const { tradeId, newSl } = payload;
        const { error } = await supabase
          .from('trade_nodes')
          .update({ sl: newSl })
          .eq('id', tradeId);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      case 'SET_FLAG': {
        // super_admin only for KILL_SWITCH
        if (payload.flagKey === 'KILL_SWITCH' && admin.role !== 'super_admin') {
          return res.status(403).json({ error: 'Super Admin only' });
        }
        const { error } = await supabase
          .from('system_flags')
          .upsert({
            flag_key: payload.flagKey,
            flag_value: payload.value,
            updated_by: adminId,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'flag_key' });
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      case 'RESET_DAILY_TRADES': {
        const { error } = await supabase
          .from('profiles')
          .update({ daily_trades_used: 0 })
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      case 'UPDATE_USER_TIER': {
        const { userId, tier } = payload;
        const { error } = await supabase
          .from('profiles')
          .update({ tier })
          .eq('id', userId);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
