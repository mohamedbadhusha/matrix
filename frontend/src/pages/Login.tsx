import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, TrendingUp, Shield, Zap, Mail } from 'lucide-react';
import { toast } from 'sonner';

type Tab = 'signin' | 'signup' | 'forgot';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('signin');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    confirmPassword: '',
  });

  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(form.email, form.password);
    setLoading(false);
    if (error) {
      toast.error(error);
    } else {
      navigate('/dashboard');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    const { error } = await signUp(form.email, form.password, form.fullName);
    setLoading(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success('Account created! Check your email to confirm.');
      setTab('signin');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) { toast.error('Enter your email'); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/login`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setResetSent(true);
    }
  };

  return (
    <div className="min-h-screen bg-navy bg-grid flex">
      {/* Left: Branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-navy via-panel-dark to-navy/80 border-r border-border relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-accent-cyan/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent-purple/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-cyan/20 to-accent-purple/20 border border-accent-cyan/30 flex items-center justify-center">
              <span className="text-xl font-mono font-bold text-gradient-cyan">M</span>
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">Matrix Pro</p>
              <p className="text-xs text-muted">v2.0 — Trading Platform</p>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="relative z-10 space-y-6">
          <h1 className="text-3xl font-bold leading-snug">
            <span className="text-gradient-cyan">Automated</span> exit protocols
            <br />for Indian F&O traders
          </h1>
          <p className="text-muted text-sm leading-relaxed">
            Deploy structured multi-bucket trades on NSE/BSE with fully automated T1/T2/T3 exits,
            trailing stop-losses, and real-time Dhan API execution.
          </p>

          <div className="space-y-3">
            {[
              { icon: Zap, text: '4 exit protocols — Protector, Scalper & more' },
              { icon: TrendingUp, text: 'Always-on Railway worker — trade while you sleep' },
              { icon: Shield, text: 'Kill switch, circuit breaker, and full audit log' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center flex-shrink-0">
                  <Icon size={14} className="text-accent-cyan" />
                </div>
                <p className="text-sm text-muted">{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-xs text-muted/40">
          NSE/BSE F&O · Dhan HQ API · Supabase · Railway
        </p>
      </div>

      {/* Right: Auth form */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-cyan/20 to-accent-purple/20 border border-accent-cyan/30 flex items-center justify-center">
              <span className="text-sm font-mono font-bold text-gradient-cyan">M</span>
            </div>
            <span className="font-bold text-foreground">Matrix Pro v2</span>
          </div>

          {/* Tabs */}
          {tab !== 'forgot' && (
            <div className="flex bg-panel-mid rounded-xl p-1 mb-6 border border-border">
              {(['signin', 'signup'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex-1 py-2 text-sm font-medium rounded-lg transition-all',
                    tab === t
                      ? 'bg-accent-cyan text-navy shadow-sm'
                      : 'text-muted hover:text-foreground',
                  )}
                >
                  {t === 'signin' ? 'Sign In' : 'Sign Up'}
                </button>
              ))}
            </div>
          )}

          {/* Sign In Form */}
          {tab === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4 animate-fade-in">
              <div>
                <label className="block text-xs text-muted mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className="input-base"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    className="input-base pr-10"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => update('password', e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-2"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
              <div className="text-center">
                <button type="button" onClick={() => { setTab('forgot'); setResetSent(false); setResetEmail(form.email); }}
                  className="text-xs text-muted hover:text-accent-cyan transition-colors">
                  Forgot password?
                </button>
              </div>
            </form>
          )}

          {/* Forgot Password Form */}
          {tab === 'forgot' && (
            <div className="space-y-4 animate-fade-in">
              <div className="text-center mb-4">
                <div className="w-12 h-12 rounded-2xl bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center mx-auto mb-3">
                  <Mail size={20} className="text-accent-cyan" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Reset Password</h3>
                <p className="text-xs text-muted mt-1">We'll email you a reset link</p>
              </div>
              {resetSent ? (
                <div className="rounded-xl bg-profit/10 border border-profit/30 p-4 text-center space-y-2">
                  <p className="text-xs font-semibold text-profit">Email sent!</p>
                  <p className="text-xs text-muted">Check your inbox for the reset link. It may take a minute.</p>
                  <button onClick={() => setTab('signin')} className="text-xs text-accent-cyan hover:underline mt-2">Back to Sign In</button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs text-muted mb-1.5">Email</label>
                    <input type="email" required autoComplete="email" className="input-base"
                      placeholder="you@example.com" value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)} />
                  </div>
                  <button type="submit" disabled={loading} className="btn-primary w-full">
                    {loading ? 'Sending…' : 'Send Reset Link'}
                  </button>
                  <div className="text-center">
                    <button type="button" onClick={() => setTab('signin')} className="text-xs text-muted hover:text-foreground">
                      ← Back to Sign In
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Sign Up Form */}
          {tab === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-4 animate-fade-in">
              <div>
                <label className="block text-xs text-muted mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  className="input-base"
                  placeholder="Your Name"
                  value={form.fullName}
                  onChange={(e) => update('fullName', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className="input-base"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="input-base pr-10"
                    placeholder="Min. 8 characters"
                    value={form.password}
                    onChange={(e) => update('password', e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  className={cn('input-base', form.confirmPassword && form.password !== form.confirmPassword && 'border-loss/60')}
                  placeholder="Repeat password"
                  value={form.confirmPassword}
                  onChange={(e) => update('confirmPassword', e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-2"
              >
                {loading ? 'Creating account…' : 'Create Account'}
              </button>
              <p className="text-[10px] text-muted text-center">
                Free account includes 3 trades/day with SINGLE_SCALPER protocol.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
