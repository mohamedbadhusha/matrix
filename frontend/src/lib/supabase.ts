import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Fallback prevents a hard crash (blank screen) when env vars are missing.
// The app will load but Supabase calls will fail gracefully.
export const supabase = createClient<Database>(
  supabaseUrl  || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Consistent key ensures all tabs share the same lock namespace
      // instead of fighting over it — eliminates the Web Lock "steal" error.
      storageKey: 'matrix-pro-v2-auth',
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  },
);

export default supabase;
