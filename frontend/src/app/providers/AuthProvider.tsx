import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

// Minimal profile built from session data when the DB fetch fails.
// Lets the user into the app so they're not permanently blocked.
// Role defaults to 'member' — will be corrected once the RLS SQL fix is applied.
function buildFallbackProfile(user: User): Profile {
  return {
    id: user.id,
    email: user.email ?? '',
    full_name: (user.user_metadata?.full_name as string | undefined) ?? user.email ?? null,
    role: 'member',
    tier: 'free',
    is_active: true,
    daily_trades_used: 0,
    daily_trades_reset_at: null,
    created_at: user.created_at,
    updated_at: user.created_at,
  };
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // Tracks whether we have successfully loaded a profile in this session.
  // Prevents re-fetching (and the resulting "Could not load profile" flash)
  // when the browser fires a duplicate SIGNED_IN on tab focus / token refresh.
  const profileLoadedRef = useRef(false);

  const fetchProfile = useCallback(async (userId: string): Promise<boolean> => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        // Use the SECURITY DEFINER RPC so the request bypasses RLS admin
        // policies entirely — avoids the recursive profile lookup 500 error.
        // Falls back to direct table query if the function doesn't exist yet.
        const rpcResult = await supabase.rpc('get_my_profile' as never);
        const rpcData = (rpcResult.data as Profile[] | null)?.[0];
        if (!rpcResult.error && rpcData) {
          setProfile(rpcData);
          profileLoadedRef.current = true;
          return true;
        }
        // RPC not available yet — fall back to direct table query
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
        if (!error && data) {
          setProfile(data as Profile);
          profileLoadedRef.current = true;
          return true;
        }
      } catch {
        // retry
      }
      if (attempt < 4) await new Promise(r => setTimeout(r, 600));
    }
    return false;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) await fetchProfile(user.id);
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    let mounted = true;

    // Hard safety net — never stay stuck in loading more than 8 seconds
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 8000);

    // Use ONLY onAuthStateChange — it fires INITIAL_SESSION first which
    // covers the getSession() case without competing for the same Web Lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (event === 'INITIAL_SESSION') {
          // App just loaded — bootstrap profile from existing session
          clearTimeout(timeout);
          if (session?.user) {
            const ok = await fetchProfile(session.user.id);
            // If DB fetch fails (e.g. RLS 500) use session data so the app
            // still loads instead of permanently showing the error screen.
            if (!ok && mounted) {
              setProfile(buildFallbackProfile(session.user));
              profileLoadedRef.current = true;
            }
          }
          if (mounted) setLoading(false);
          return;
        }

        if (event === 'SIGNED_IN' && session?.user) {
          // If profile is already loaded this session (e.g. tab regained focus
          // and Supabase re-fired SIGNED_IN after a background token refresh),
          // do nothing — avoids the "Could not load profile" flash.
          if (profileLoadedRef.current) return;
          // Fresh login — fetch profile.
          setLoading(true);
          const ok = await fetchProfile(session.user.id);
          if (!ok && mounted) {
            setProfile(buildFallbackProfile(session.user));
            profileLoadedRef.current = true;
          }
          if (mounted) setLoading(false);
          return;
        }

        if (event === 'SIGNED_OUT') {
          setProfile(null);
          profileLoadedRef.current = false;
          setLoading(false);
          return;
        }

        // TOKEN_REFRESHED / USER_UPDATED — silent, no spinner
      },
    );

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = async (
    email: string,
    password: string,
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
  ): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    if (error) return { error: error.message };

    // Retry fetching profile: the on_auth_user_created trigger on Supabase
    // can have a short race with the client-side fetchProfile call.
    if (data.user) {
      const uid = data.user.id;
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise(r => setTimeout(r, 500));
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', uid)
          .single();
        if (prof) { setProfile(prof as Profile); break; }
      }
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, signIn, signUp, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
