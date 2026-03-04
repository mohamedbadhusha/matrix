/**
 * DhanCallback.tsx
 * Route: /auth/dhan/callback
 *
 * Handles the OAuth redirect from Dhan after the user logs in via the consent popup.
 * Dhan redirects to:  <our_redirect_url>?tokenId=<id>
 *
 * This page:
 *  1. Reads `tokenId` from the URL
 *  2. Reads `brokerId` from sessionStorage (set before opening the popup)
 *  3. Calls POST /api/dhan-consume-consent
 *  4. On success: posts a message to the opener window, then closes itself
 *     If not a popup: redirects to /broker with a success toast
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

type Status = 'loading' | 'success' | 'error';

export default function DhanCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const tokenId = searchParams.get('tokenId');
    const brokerId = sessionStorage.getItem('dhan_oauth_broker_id');

    if (!tokenId) {
      setStatus('error');
      setMessage('Missing tokenId from Dhan redirect. Please try again.');
      return;
    }
    if (!brokerId) {
      setStatus('error');
      setMessage('Session expired. Please start the OAuth flow again.');
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/dhan-consume-consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brokerId, tokenId }),
        });
        const data = await res.json() as { success?: boolean; expiryTime?: string; error?: string };

        if (!res.ok || !data.success) {
          throw new Error(data.error ?? 'Token exchange failed');
        }

        sessionStorage.removeItem('dhan_oauth_broker_id');
        setStatus('success');
        setMessage(`Connected! Token valid until ${data.expiryTime ?? 'next 24h'}.`);

        // If opened as popup, notify opener and close
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: 'DHAN_AUTH_SUCCESS', brokerId }, window.location.origin);
          setTimeout(() => window.close(), 1500);
        } else {
          // Standalone redirect
          toast.success('Dhan account connected successfully');
          setTimeout(() => navigate('/broker', { replace: true }), 1500);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Authentication failed';
        setStatus('error');
        setMessage(msg);
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: 'DHAN_AUTH_ERROR', error: msg }, window.location.origin);
        }
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center">
      <div className="panel p-8 max-w-sm w-full text-center space-y-4 animate-fade-in">
        {status === 'loading' && (
          <>
            <div className="w-10 h-10 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin mx-auto" />
            <p className="text-sm text-muted">Completing Dhan authentication…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-10 h-10 rounded-full bg-profit/10 border border-profit/30 flex items-center justify-center mx-auto">
              <svg className="w-5 h-5 text-profit" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-semibold text-foreground text-sm">Dhan Connected</p>
            <p className="text-xs text-muted">{message}</p>
            <p className="text-xs text-muted/50">Closing window…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-10 h-10 rounded-full bg-loss/10 border border-loss/30 flex items-center justify-center mx-auto">
              <svg className="w-5 h-5 text-loss" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="font-semibold text-foreground text-sm">Authentication Failed</p>
            <p className="text-xs text-muted">{message}</p>
            <button
              onClick={() => window.close()}
              className="btn-secondary text-xs w-full"
            >
              Close Window
            </button>
          </>
        )}
      </div>
    </div>
  );
}
