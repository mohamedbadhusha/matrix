/**
 * Profile.tsx
 * Edit display name, view account info, and change password.
 */
import { useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { UserCircle, KeyRound, Save, Eye, EyeOff } from 'lucide-react';

export default function Profile() {
  const { profile, refreshProfile } = useAuth();

  // ── Name edit ────────────────────────────────────────────────────────────
  const [name, setName] = useState(profile?.full_name ?? '');
  const [savingName, setSavingName] = useState(false);

  const handleSaveName = async () => {
    if (!name.trim()) { toast.error('Name cannot be empty'); return; }
    setSavingName(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name.trim() })
      .eq('id', profile!.id);
    setSavingName(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Name updated');
      await refreshProfile();
    }
  };

  // ── Password change ──────────────────────────────────────────────────────
  const [pwForm, setPwForm] = useState({ newPw: '', confirmPw: '' });
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  const handleChangePassword = async () => {
    if (pwForm.newPw.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (pwForm.newPw !== pwForm.confirmPw) { toast.error('Passwords do not match'); return; }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pwForm.newPw });
    setSavingPw(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Password changed successfully');
      setPwForm({ newPw: '', confirmPw: '' });
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-cyan/20 to-accent-purple/20 border border-accent-cyan/30 flex items-center justify-center text-xl font-bold text-accent-cyan">
          {profile?.full_name?.[0]?.toUpperCase() ?? profile?.email?.[0]?.toUpperCase() ?? 'U'}
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Profile</h1>
          <p className="text-xs text-muted">{profile?.email}</p>
        </div>
      </div>

      {/* Account Info */}
      <div className="panel p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1.5">
          <UserCircle size={12} /> Account Info
        </h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted mb-0.5">Tier</p>
            <span className={cn('tier-' + (profile?.tier ?? 'free'), 'font-semibold uppercase text-sm')}>
              {profile?.tier?.toUpperCase() ?? 'FREE'}
            </span>
          </div>
          <div>
            <p className="text-muted mb-0.5">Role</p>
            <p className="text-foreground capitalize font-medium">{profile?.role ?? 'member'}</p>
          </div>
          <div>
            <p className="text-muted mb-0.5">Member since</p>
            <p className="text-foreground font-mono">
              {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-IN') : '—'}
            </p>
          </div>
          <div>
            <p className="text-muted mb-0.5">Trades today</p>
            <p className="text-foreground font-mono">{profile?.daily_trades_used ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Edit Name */}
      <div className="panel p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1.5">
          <UserCircle size={12} /> Display Name
        </h3>
        <div className="flex gap-2">
          <input
            className="input-base flex-1"
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            onClick={handleSaveName}
            disabled={savingName || name.trim() === (profile?.full_name ?? '')}
            className="btn-primary flex items-center gap-1.5 px-4"
          >
            <Save size={13} />
            {savingName ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Change Password */}
      <div className="panel p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1.5">
          <KeyRound size={12} /> Change Password
        </h3>
        <div className="space-y-2">
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              className="input-base pr-10"
              placeholder="New password (min. 8 chars)"
              value={pwForm.newPw}
              onChange={(e) => setPwForm((f) => ({ ...f, newPw: e.target.value }))}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <input
            type="password"
            className={cn(
              'input-base',
              pwForm.confirmPw && pwForm.newPw !== pwForm.confirmPw && 'border-loss/60',
            )}
            placeholder="Confirm new password"
            value={pwForm.confirmPw}
            onChange={(e) => setPwForm((f) => ({ ...f, confirmPw: e.target.value }))}
          />
          <button
            onClick={handleChangePassword}
            disabled={savingPw || !pwForm.newPw || !pwForm.confirmPw}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <KeyRound size={13} />
            {savingPw ? 'Changing…' : 'Change Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
