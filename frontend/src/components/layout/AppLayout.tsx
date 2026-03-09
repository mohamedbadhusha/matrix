import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useAuth } from '@/app/providers/AuthProvider';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function AppLayout() {
  const { profileFetchFailed, refreshProfile } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-navy">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar />
        {profileFetchFailed && (
          <div className="flex items-center gap-3 px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/30 text-yellow-400 text-xs">
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span className="flex-1">
              Could not load your profile from the database — your role may be restricted. Run the schema SQL in Supabase, update your profile row to <code className="font-mono bg-yellow-500/20 px-1 rounded">role = 'super_admin'</code>, then click refresh.
            </span>
            <button
              onClick={refreshProfile}
              className="flex items-center gap-1 px-2 py-1 rounded bg-yellow-500/20 hover:bg-yellow-500/30 transition-colors whitespace-nowrap"
            >
              <RefreshCw size={12} />
              Refresh Profile
            </button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-6 bg-grid animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
