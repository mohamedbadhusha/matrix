/**
 * useOrderUpdateWs.ts
 * React hook for Dhan Live Order Update WebSocket.
 * Connects to wss://api-order-update.dhan.co and emits real-time order updates.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { DhanOrderUpdateMessage } from '@/types';

export type WsStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface UseOrderUpdateWsOptions {
  clientId: string;
  accessToken: string;
  enabled?: boolean;
  maxMessages?: number;
}

const WS_URL = 'wss://api-order-update.dhan.co';
const RECONNECT_DELAY_MS = 5000;

export function useOrderUpdateWs({
  clientId,
  accessToken,
  enabled = true,
  maxMessages = 100,
}: UseOrderUpdateWsOptions) {
  const [status, setStatus]   = useState<WsStatus>('idle');
  const [messages, setMessages] = useState<DhanOrderUpdateMessage[]>([]);
  const [lastMsg, setLastMsg] = useState<DhanOrderUpdateMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearMessages = useCallback(() => setMessages([]), []);

  const connect = useCallback(() => {
    if (!enabled || !clientId || !accessToken) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      setStatus('connected');
      // Send authorisation message
      ws.send(JSON.stringify({
        LoginReq: {
          MsgCode: 42,
          ClientId: clientId,
          Token: accessToken,
        },
        UserType: 'SELF',
      }));
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data as string) as DhanOrderUpdateMessage;
        if (msg?.Type === 'order_alert') {
          setLastMsg(msg);
          setMessages((prev) => {
            const next = [msg, ...prev];
            return next.length > maxMessages ? next.slice(0, maxMessages) : next;
          });
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setStatus('error');
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setStatus('disconnected');
      wsRef.current = null;
      // Auto-reconnect
      if (enabled) {
        reconnectRef.current = setTimeout(() => {
          if (mountedRef.current && enabled) connect();
        }, RECONNECT_DELAY_MS);
      }
    };
  }, [clientId, accessToken, enabled, maxMessages]);

  const disconnect = useCallback(() => {
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('disconnected');
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled && clientId && accessToken) {
      connect();
    } else {
      disconnect();
    }
    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [enabled, clientId, accessToken]);

  return { status, messages, lastMsg, clearMessages, connect, disconnect };
}
