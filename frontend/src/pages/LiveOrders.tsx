/**
 * LiveOrders.tsx
 * Real-time order updates via Dhan WebSocket (wss://api-order-update.dhan.co)
 * + Postback log viewer.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { BrokerAccount, DhanOrderUpdateData } from '@/types';
import { useOrderUpdateWs } from '@/hooks/useOrderUpdateWs';
import { Radio, X, Trash2, ChevronDown, Activity, Wifi, WifiOff } from 'lucide-react';

// ── Status coloring ───────────────────────────────────────────────────────────
const statusCfg: Record<string, string> = {
  Pending:   'bg-warning/10 text-warning border-warning/30',
  PENDING:   'bg-warning/10 text-warning border-warning/30',
  Traded:    'bg-profit/10 text-profit border-profit/30',
  TRADED:    'bg-profit/10 text-profit border-profit/30',
  Cancelled: 'bg-muted/10 text-muted border-muted/30',
  CANCELLED: 'bg-muted/10 text-muted border-muted/30',
  Rejected:  'bg-loss/10 text-loss border-loss/30',
  REJECTED:  'bg-loss/10 text-loss border-loss/30',
  TRANSIT:   'bg-accent-purple/10 text-accent-purple border-accent-purple/30',
  EXPIRED:   'bg-muted/10 text-muted border-muted/30',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border', statusCfg[status] ?? 'bg-border text-muted border-border')}>
      {status}
    </span>
  );
}

// ── Product code mapping ──────────────────────────────────────────────────────
const productMap: Record<string, string> = { C: 'CNC', I: 'INTRADAY', M: 'MARGIN', F: 'MTF', V: 'CO', B: 'BO' };
const sideMap:    Record<string, string> = { B: 'BUY', S: 'SELL' };

// ── WS status indicator ───────────────────────────────────────────────────────
function WsStatusDot({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    connected:    { cls: 'bg-profit', label: 'Live' },
    connecting:   { cls: 'bg-warning animate-pulse', label: 'Connecting' },
    disconnected: { cls: 'bg-muted', label: 'Disconnected' },
    error:        { cls: 'bg-loss', label: 'Error' },
    idle:         { cls: 'bg-border', label: 'Idle' },
  };
  const c = cfg[status] ?? cfg.idle;
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn('w-2 h-2 rounded-full', c.cls)} />
      <span className={cn('text-[11px] font-semibold', status === 'connected' ? 'text-profit' : 'text-muted')}>{c.label}</span>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function LiveOrders() {
  const { profile } = useAuth();
  const [brokers, setBrokers]               = useState<BrokerAccount[]>([]);
  const [selectedBroker, setSelectedBroker] = useState<BrokerAccount | null>(null);
  const [wsEnabled, setWsEnabled]           = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('broker_accounts')
      .select('id, broker_name, client_id, access_token, api_key, is_active, health_status')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .then(({ data }) => {
        const list = (data ?? []) as BrokerAccount[];
        setBrokers(list);
        if (list.length > 0) setSelectedBroker(list[0]);
      });
  }, [profile]);

  const { status, messages, clearMessages, disconnect, connect } = useOrderUpdateWs({
    clientId:    selectedBroker?.client_id ?? '',
    accessToken: selectedBroker?.access_token ?? selectedBroker?.api_key ?? '',
    enabled:     wsEnabled && !!selectedBroker,
    maxMessages: 200,
  });

  const handleBrokerChange = (id: string) => {
    const b = brokers.find(x => x.id === id) ?? null;
    setSelectedBroker(b);
    setWsEnabled(false);
    disconnect();
  };

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Radio size={20} className="text-profit" /> Live Order Updates
          </h1>
          <p className="text-xs text-muted mt-0.5">Real-time order stream via Dhan WebSocket</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={selectedBroker?.id ?? ''}
              onChange={e => handleBrokerChange(e.target.value)}
              className="input-base pr-8 text-sm min-w-[160px]">
              {brokers.length === 0 && <option value="">No brokers</option>}
              {brokers.map(b => <option key={b.id} value={b.id}>{b.broker_name} · {b.client_id}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
          <WsStatusDot status={status} />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {!wsEnabled ? (
          <button
            onClick={() => setWsEnabled(true)}
            disabled={!selectedBroker}
            className="btn-primary gap-2">
            <Wifi size={14} /> Connect
          </button>
        ) : (
          <button
            onClick={() => { setWsEnabled(false); disconnect(); }}
            className="btn-secondary gap-2 text-loss border-loss/30 hover:bg-loss/10">
            <WifiOff size={14} /> Disconnect
          </button>
        )}
        {messages.length > 0 && (
          <button onClick={clearMessages} className="btn-secondary gap-2 text-muted">
            <Trash2 size={13} /> Clear ({messages.length})
          </button>
        )}
      </div>

      {/* Connection info */}
      {wsEnabled && status === 'connected' && (
        <div className="rounded-xl bg-profit/5 border border-profit/20 px-4 py-2.5 flex items-center gap-2">
          <Activity size={14} className="text-profit animate-pulse" />
          <p className="text-xs text-profit font-semibold">
            Streaming live for {selectedBroker?.client_id} · {messages.length} update{messages.length !== 1 ? 's' : ''} received
          </p>
        </div>
      )}

      {wsEnabled && status === 'connecting' && (
        <div className="rounded-xl bg-warning/5 border border-warning/20 px-4 py-2.5 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-warning border-t-transparent animate-spin" />
          <p className="text-xs text-warning">Connecting to Dhan WebSocket…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-xl bg-loss/10 border border-loss/30 px-4 py-2.5">
          <p className="text-xs text-loss">WebSocket error — will auto-reconnect in 5 seconds</p>
        </div>
      )}

      {/* Feed */}
      {messages.length === 0 ? (
        <div className="panel p-14 text-center">
          <Radio size={32} className="mx-auto mb-3 text-muted opacity-30" />
          <p className="text-sm text-muted">
            {wsEnabled ? 'Waiting for order updates…' : 'Click Connect to start live order stream'}
          </p>
          <p className="text-xs text-muted/60 mt-1">Order updates appear in real time as your orders are placed, modified, or filled</p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg, i) => {
            const d: DhanOrderUpdateData = msg.Data;
            const side    = sideMap[d.TxnType] ?? d.TxnType;
            const product = productMap[d.Product] ?? d.Product;
            return (
              <div key={i} className="panel overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5">
                  {/* Side badge */}
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border w-10 text-center',
                    side === 'BUY' ? 'bg-profit/10 text-profit border-profit/30' : 'bg-loss/10 text-loss border-loss/30')}>
                    {side}
                  </span>
                  {/* Status */}
                  <StatusBadge status={d.Status} />
                  {/* Symbol */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{d.DisplayName || d.Symbol}</p>
                    <p className="text-[10px] text-muted">
                      {d.Exchange}·{d.Segment} · {product} · {d.OrderType} · #{d.OrderNo}
                    </p>
                  </div>
                  {/* Numbers */}
                  <div className="hidden md:flex items-center gap-5 text-xs font-mono">
                    <div className="text-center">
                      <p className="text-[9px] text-muted mb-0.5">QTY</p>
                      <p>{d.TradedQty}/{d.Quantity}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-muted mb-0.5">PRICE</p>
                      <p className="text-accent-cyan">{d.TradedPrice > 0 ? d.TradedPrice : d.Price}</p>
                    </div>
                    {d.TriggerPrice > 0 && (
                      <div className="text-center">
                        <p className="text-[9px] text-muted mb-0.5">TRIGGER</p>
                        <p className="text-warning">{d.TriggerPrice}</p>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-[9px] text-muted mb-0.5">LTP</p>
                      <p>{d.RefLtp}</p>
                    </div>
                  </div>
                  {/* Timestamp */}
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-[10px] text-muted">{d.LastUpdatedTime?.slice(11) ?? ''}</p>
                    {d.ReasonDescription && d.ReasonDescription !== 'CONFIRMED' && (
                      <p className="text-[10px] text-loss mt-0.5">{d.ReasonDescription}</p>
                    )}
                    {d.Remarks === 'Super Order' && (
                      <p className="text-[10px] text-accent-purple mt-0.5">Super Order</p>
                    )}
                  </div>
                  {/* Dismiss */}
                  <button
                    onClick={() => {
                      // remove single message (by index from messages array state doesn't apply here since setMessages has prev)
                    }}
                    className="p-1 text-muted hover:text-foreground opacity-40 hover:opacity-100 transition-opacity">
                    <X size={11} />
                  </button>
                </div>
                {/* Derivatives info */}
                {d.OptType && d.OptType !== 'XX' && (
                  <div className="px-4 py-1.5 border-t border-border/30 bg-border/5 flex gap-4 text-[10px] text-muted">
                    <span>Expiry: <span className="text-foreground">{d.ExpiryDate?.slice(0, 10)}</span></span>
                    <span>Strike: <span className="text-foreground">{d.StrikePrice}</span></span>
                    <span>Type: <span className={d.OptType === 'CE' ? 'text-profit' : 'text-loss'}>{d.OptType}</span></span>
                    <span>Lot: {d.LotSize}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
