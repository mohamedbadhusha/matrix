/**
 * Broker.tsx — Connect / manage Dhan HQ broker accounts
 *
 * Three connection modes:
 *  - manual  : Paste Client ID + Access Token directly
 *  - oauth   : Enter Client ID + App ID + App Secret → Dhan OAuth popup
 *  - totp    : Enter Client ID + Login PIN + TOTP code → auto-generate token
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/app/providers/AuthProvider';
import { cn } from '@/lib/utils';
import type { BrokerAccount, DhanAuthMethod } from '@/types';
import { toast } from 'sonner';
import {
  CheckCircle,
  Trash2,
  Plus,
  RefreshCw,
  Link,
  Clock,
  ShieldCheck,
  KeyRound,
  Smartphone,
}  from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatExpiry(isoString: string | null | undefined): string {
  if (!isoString) return 'Unknown expiry';
  const d = new Date(isoString);
  const diffMs = d.getTime() - Date.now();
  if (diffMs < 0) return 'Expired';
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffM = Math.floor((diffMs % 3_600_000) / 60_000);
  if (diffH >= 1) return `Expires in ${diffH}h ${diffM}m`;
  return `Expires in ${diffM}m`;
}

function expiryColor(isoString: string | null | undefined): string {
  if (!isoString) return 'text-muted';
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff < 0) return 'text-loss';
  if (diff < 2 * 3_600_000) return 'text-warning';
  return 'text-profit';
}

function healthColor(s?: string | null) {
  if (!s) return 'text-muted';
  if (s === 'OK') return 'text-profit';
  if (s === 'ERROR') return 'text-loss';
  return 'text-warning';
}
function healthDot(s?: string | null) {
  if (!s || s === 'UNKNOWN') return 'dot-paper';
  if (s === 'OK') return 'dot-live';
  return 'dot-closed';
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ConnectMode = DhanAuthMethod;

interface ManualForm {
  clientId: string;
  accessToken: string;
  mode: 'LIVE' | 'PAPER';
}

interface OAuthForm {
  clientId: string;
  appId: string;
  appSecret: string;
  mode: 'LIVE' | 'PAPER';
}

interface TotpForm {
  clientId: string;
  pin: string;
  totp: string;
  mode: 'LIVE' | 'PAPER';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Broker() {
  const { profile } = useAuth();
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [connectMode, setConnectMode] = useState<ConnectMode>('manual');

  const [testing, setTesting] = useState<string | null>(null);
  const [renewing, setRenewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [manualForm, setManualForm] = useState<ManualForm>({ clientId: '', accessToken: '', mode: 'LIVE' });
  const [oauthForm, setOAuthForm] = useState<OAuthForm>({ clientId: '', appId: '', appSecret: '', mode: 'LIVE' });
  const [totpForm, setTotpForm] = useState<TotpForm>({ clientId: '', pin: '', totp: '', mode: 'LIVE' });

  const [saving, setSaving] = useState(false);
  const [oauthStep, setOAuthStep] = useState<'idle' | 'opening' | 'waiting' | 'done'>('idle');
  const [pendingBrokerId, setPendingBrokerId] = useState<string | null>(null);

  // ─── Data loader ───────────────────────────────────────────────────────────
  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('broker_accounts')
      .select('*')
      .eq('user_id', profile!.id)
      .order('created_at', { ascending: false });
    setAccounts((data as BrokerAccount[]) ?? []);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    if (profile) fetchAccounts();
  }, [profile, fetchAccounts]);

  // ─── Listen for OAuth popup message ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'DHAN_AUTH_SUCCESS') {
        setOAuthStep('done');
        setPendingBrokerId(null);
        toast.success('Dhan account connected via OAuth');
        setShowForm(false);
        setOAuthForm({ clientId: '', appId: '', appSecret: '', mode: 'LIVE' });
        fetchAccounts();
      } else if (e.data?.type === 'DHAN_AUTH_ERROR') {
        setOAuthStep('idle');
        toast.error((e.data as { error?: string }).error ?? 'OAuth authentication failed');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [fetchAccounts]);

  const switchMode = (mode: ConnectMode) => {
    setConnectMode(mode);
    setOAuthStep('idle');
    setPendingBrokerId(null);
  };

  // ─── Add: Manual ───────────────────────────────────────────────────────────
  const handleAddManual = async () => {
    if (!manualForm.clientId.trim() || !manualForm.accessToken.trim()) {
      toast.error('Client ID and Access Token are required');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('broker_accounts').insert({
      user_id: profile!.id,
      broker: 'DHAN',
      client_id: manualForm.clientId.trim(),
      api_key: '',
      access_token: manualForm.accessToken.trim(),
      auth_method: 'manual',
      is_active: true,
      mode: manualForm.mode,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Broker account added');
      setManualForm({ clientId: '', accessToken: '', mode: 'LIVE' });
      setShowForm(false);
      fetchAccounts();
    }
  };

  // ─── Add: OAuth (Step 1) ───────────────────────────────────────────────────
  const handleStartOAuth = async () => {
    if (!oauthForm.clientId.trim() || !oauthForm.appId.trim() || !oauthForm.appSecret.trim()) {
      toast.error('Client ID, App ID and App Secret are all required');
      return;
    }
    setSaving(true);
    const { data: inserted, error: iErr } = await supabase
      .from('broker_accounts')
      .insert({
        user_id: profile!.id,
        broker: 'DHAN',
        client_id: oauthForm.clientId.trim(),
        api_key: oauthForm.appId.trim(),
        app_secret: oauthForm.appSecret.trim(),
        auth_method: 'oauth',
        is_active: false,
        mode: oauthForm.mode,
      })
      .select('id')
      .single();

    if (iErr || !inserted) {
      setSaving(false);
      toast.error(iErr?.message ?? 'Failed to save broker');
      return;
    }
    const brokerId = inserted.id as string;

    const res = await fetch('/api/dhan-generate-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brokerId }),
    });
    const data = await res.json() as { loginUrl?: string; error?: string };
    setSaving(false);

    if (!res.ok || !data.loginUrl) {
      await supabase.from('broker_accounts').delete().eq('id', brokerId);
      toast.error(data.error ?? 'Failed to start OAuth flow');
      return;
    }

    sessionStorage.setItem('dhan_oauth_broker_id', brokerId);
    setPendingBrokerId(brokerId);

    const popup = window.open(data.loginUrl, 'dhan_oauth', 'width=520,height=700,scrollbars=yes');
    if (!popup) {
      toast.error('Popup blocked. Please allow popups for this site and retry.');
      await supabase.from('broker_accounts').delete().eq('id', brokerId);
      setPendingBrokerId(null);
      return;
    }
    setOAuthStep('opening');
    setTimeout(() => setOAuthStep('waiting'), 1000);
  };

  // ─── Add: TOTP ─────────────────────────────────────────────────────────────
  const handleAddTotp = async () => {
    if (!totpForm.clientId.trim() || !totpForm.pin.trim() || !totpForm.totp.trim()) {
      toast.error('Client ID, PIN and TOTP are all required');
      return;
    }
    setSaving(true);
    const dhanRes = await fetch(
      `https://auth.dhan.co/app/generateAccessToken?dhanClientId=${encodeURIComponent(totpForm.clientId.trim())}&pin=${encodeURIComponent(totpForm.pin.trim())}&totp=${encodeURIComponent(totpForm.totp.trim())}`,
      { method: 'POST' },
    ).catch(() => null);

    if (!dhanRes || !dhanRes.ok) {
      setSaving(false);
      toast.error('TOTP authentication failed. Check credentials.');
      return;
    }
    const body = await dhanRes.json() as { accessToken?: string; tokenValidity?: string; errorMessage?: string };
    if (!body.accessToken) {
      setSaving(false);
      toast.error(body.errorMessage ?? 'No access token returned');
      return;
    }
    const expiresAt = body.tokenValidity
      ? new Date(body.tokenValidity).toISOString()
      : new Date(Date.now() + 24 * 3_600_000).toISOString();

    const { error } = await supabase.from('broker_accounts').insert({
      user_id: profile!.id,
      broker: 'DHAN',
      client_id: totpForm.clientId.trim(),
      api_key: '',
      access_token: body.accessToken,
      token_expires_at: expiresAt,
      auth_method: 'totp',
      is_active: true,
      mode: totpForm.mode,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Dhan connected via TOTP');
      setTotpForm({ clientId: '', pin: '', totp: '', mode: 'LIVE' });
      setShowForm(false);
      fetchAccounts();
    }
  };

  // ─── Test (profile check) ──────────────────────────────────────────────────
  const handleTest = async (account: BrokerAccount) => {
    setTesting(account.id);
    try {
      const res = await fetch(`/api/dhan-profile?brokerId=${account.id}`);
      if (res.ok) {
        toast.success('Connection verified — token is valid');
        fetchAccounts();
      } else {
        const b = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(b.error ?? 'Profile check failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    }
    setTesting(null);
  };

  // ─── Renew token ───────────────────────────────────────────────────────────
  const handleRenew = async (account: BrokerAccount) => {
    setRenewing(account.id);
    try {
      const res = await fetch('/api/dhan-renew-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId: account.id }),
      });
      const body = await res.json() as { success?: boolean; message?: string; error?: string };
      if (res.ok && body.success) {
        toast.success(body.message ?? 'Token renewed for 24h');
        fetchAccounts();
      } else {
        throw new Error(body.error ?? 'Renewal failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Renewal failed');
    }
    setRenewing(null);
  };

  // ─── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Remove this broker account?')) return;
    setDeleting(id);
    await supabase.from('broker_accounts').delete().eq('id', id);
    toast.success('Broker account removed');
    fetchAccounts();
    setDeleting(null);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Broker Accounts</h1>
          <p className="text-sm text-muted mt-0.5">Connect your Dhan HQ trading account</p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setOAuthStep('idle'); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          Add Account
        </button>
      </div>

      {/* ── Add form ─────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="panel p-5 space-y-4 animate-slide-up border-l-2 border-accent-cyan/50">
          <h3 className="text-sm font-semibold text-foreground">New Dhan Account</h3>

          {/* Mode tabs */}
          <div className="flex gap-2">
            {([
              { key: 'manual', label: 'Direct Token', icon: KeyRound },
              { key: 'oauth', label: 'OAuth (API Key)', icon: ShieldCheck },
              { key: 'totp', label: 'TOTP Auto', icon: Smartphone },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => switchMode(key)}
                className={cn(
                  'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all',
                  connectMode === key
                    ? 'bg-accent-cyan/15 border-accent-cyan/50 text-accent-cyan font-semibold'
                    : 'border-border text-muted hover:text-foreground',
                )}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>

          {/* ── Manual ─────────────────────────────────────────────────── */}
          {connectMode === 'manual' && (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                Paste the access token from{' '}
                <a href="https://dhanhq.co" target="_blank" rel="noreferrer" className="text-accent-cyan underline">
                  dhanhq.co
                </a>{' '}
                → My Profile → Access Token.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1.5">Client ID</label>
                  <input
                    className="input-base font-mono"
                    placeholder="1100012345"
                    value={manualForm.clientId}
                    onChange={(e) => setManualForm((f) => ({ ...f, clientId: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Mode</label>
                  <select
                    className="input-base"
                    value={manualForm.mode}
                    onChange={(e) => setManualForm((f) => ({ ...f, mode: e.target.value as 'LIVE' | 'PAPER' }))}
                  >
                    <option value="LIVE">Live</option>
                    <option value="PAPER">Paper</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-muted mb-1.5">Access Token</label>
                  <input
                    className="input-base font-mono"
                    type="password"
                    placeholder="Paste your Dhan access token"
                    value={manualForm.accessToken}
                    onChange={(e) => setManualForm((f) => ({ ...f, accessToken: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleAddManual} disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving…' : 'Add Account'}
                </button>
              </div>
            </div>
          )}

          {/* ── OAuth ──────────────────────────────────────────────────── */}
          {connectMode === 'oauth' && (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                Requires a Dhan App (Individual trader plan). A popup will open for you to log in via Dhan's secure consent screen.
              </p>
              {(oauthStep === 'opening' || oauthStep === 'waiting') ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="w-8 h-8 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" />
                  <p className="text-sm text-muted">Waiting for Dhan login in popup…</p>
                  <button
                    onClick={async () => {
                      setOAuthStep('idle');
                      if (pendingBrokerId) {
                        await supabase.from('broker_accounts').delete().eq('id', pendingBrokerId);
                        setPendingBrokerId(null);
                      }
                    }}
                    className="btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-muted mb-1.5">Client ID</label>
                      <input
                        className="input-base font-mono"
                        placeholder="1100012345"
                        value={oauthForm.clientId}
                        onChange={(e) => setOAuthForm((f) => ({ ...f, clientId: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted mb-1.5">Mode</label>
                      <select
                        className="input-base"
                        value={oauthForm.mode}
                        onChange={(e) => setOAuthForm((f) => ({ ...f, mode: e.target.value as 'LIVE' | 'PAPER' }))}
                      >
                        <option value="LIVE">Live</option>
                        <option value="PAPER">Paper</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-muted mb-1.5">App ID (app_id)</label>
                      <input
                        className="input-base font-mono"
                        placeholder="Your Dhan app_id"
                        value={oauthForm.appId}
                        onChange={(e) => setOAuthForm((f) => ({ ...f, appId: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted mb-1.5">App Secret</label>
                      <input
                        className="input-base font-mono"
                        type="password"
                        placeholder="Your Dhan app_secret"
                        value={oauthForm.appSecret}
                        onChange={(e) => setOAuthForm((f) => ({ ...f, appSecret: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                    <button onClick={handleStartOAuth} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                      <ShieldCheck size={14} />
                      {saving ? 'Starting…' : 'Open Dhan Login'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── TOTP ───────────────────────────────────────────────────── */}
          {connectMode === 'totp' && (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                Uses your Dhan login PIN + a live TOTP code to auto-generate a token. Your server IP must be whitelisted on Dhan Web first.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1.5">Client ID</label>
                  <input
                    className="input-base font-mono"
                    placeholder="1100012345"
                    value={totpForm.clientId}
                    onChange={(e) => setTotpForm((f) => ({ ...f, clientId: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Mode</label>
                  <select
                    className="input-base"
                    value={totpForm.mode}
                    onChange={(e) => setTotpForm((f) => ({ ...f, mode: e.target.value as 'LIVE' | 'PAPER' }))}
                  >
                    <option value="LIVE">Live</option>
                    <option value="PAPER">Paper</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Login PIN</label>
                  <input
                    className="input-base font-mono"
                    type="password"
                    placeholder="6-digit PIN"
                    maxLength={6}
                    value={totpForm.pin}
                    onChange={(e) => setTotpForm((f) => ({ ...f, pin: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">TOTP Code</label>
                  <input
                    className="input-base font-mono"
                    placeholder="6-digit TOTP"
                    maxLength={6}
                    value={totpForm.totp}
                    onChange={(e) => setTotpForm((f) => ({ ...f, totp: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleAddTotp} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  <Smartphone size={14} />
                  {saving ? 'Authenticating…' : 'Generate Token'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Account list ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="panel p-12 text-center space-y-3">
          <Link size={28} className="mx-auto text-muted" />
          <p className="text-sm text-muted">No broker accounts connected yet</p>
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">
            Connect your first account
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div key={account.id} className="panel p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center text-accent-cyan font-bold text-sm">
                    D
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-foreground">{account.broker}</p>
                      <span className="font-mono text-xs text-muted">· {account.client_id}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-border/50 text-muted uppercase">
                        {account.mode ?? 'LIVE'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={cn('w-1.5 h-1.5 rounded-full', healthDot(account.health_status))} />
                      <span className={cn('text-xs', healthColor(account.health_status))}>
                        {account.health_status ?? 'Not tested'}
                      </span>
                      {account.failure_count > 0 && (
                        <span className="text-xs text-loss">({account.failure_count} failures)</span>
                      )}
                      {account.token_expires_at && (
                        <span className={cn('text-xs flex items-center gap-1', expiryColor(account.token_expires_at))}>
                          <Clock size={10} />
                          {formatExpiry(account.token_expires_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {account.auth_method !== 'manual' && account.token_expires_at && (
                    <button
                      onClick={() => handleRenew(account)}
                      disabled={renewing === account.id}
                      className="text-xs flex items-center gap-1 text-warning border border-warning/30 bg-warning/5 hover:bg-warning/10 px-3 py-1.5 rounded-lg transition-all"
                    >
                      <RefreshCw size={12} className={renewing === account.id ? 'animate-spin' : ''} />
                      Renew
                    </button>
                  )}
                  <button
                    onClick={() => handleTest(account)}
                    disabled={testing === account.id}
                    className="text-xs flex items-center gap-1 text-accent-cyan border border-accent-cyan/30 bg-accent-cyan/5 hover:bg-accent-cyan/10 px-3 py-1.5 rounded-lg transition-all"
                  >
                    <CheckCircle size={12} className={testing === account.id ? 'animate-spin' : ''} />
                    Verify
                  </button>
                  <button
                    onClick={() => handleDelete(account.id)}
                    disabled={deleting === account.id}
                    className="text-xs flex items-center gap-1 text-loss border border-loss/20 bg-loss/5 hover:bg-loss/10 px-3 py-1.5 rounded-lg transition-all"
                  >
                    <Trash2 size={12} />
                    Remove
                  </button>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                <p className="text-[10px] text-muted font-mono">
                  Auth: <span className="text-foreground capitalize">{account.auth_method ?? 'manual'}</span>
                  {account.api_key
                    ? ` · App ID: ${account.api_key.slice(0, 6)}${'•'.repeat(14)}`
                    : ''}
                </p>
                {account.last_checked_at && (
                  <p className="text-[10px] text-muted">
                    Checked {new Date(account.last_checked_at).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Help panel ───────────────────────────────────────────────────── */}
      <div className="panel-mid p-4 rounded-xl border border-border/50 space-y-3">
        <h4 className="text-xs font-semibold text-foreground">Dhan connection methods</h4>
        <div className="grid grid-cols-3 gap-3 text-xs text-muted">
          <div className="space-y-1">
            <p className="text-foreground font-medium flex items-center gap-1"><KeyRound size={11} /> Direct Token</p>
            <p>Quick setup. Paste a 24h token from Dhan Web → My Profile.</p>
          </div>
          <div className="space-y-1">
            <p className="text-foreground font-medium flex items-center gap-1"><ShieldCheck size={11} /> OAuth</p>
            <p>Needs a Dhan App (Individual plan). Tokens auto-renew without re-login.</p>
          </div>
          <div className="space-y-1">
            <p className="text-foreground font-medium flex items-center gap-1"><Smartphone size={11} /> TOTP Auto</p>
            <p>Uses PIN + TOTP to generate tokens programmatically. IP must be whitelisted.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
