import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { cn } from '@/lib/utils';
import { Users, BarChart2, Activity, Settings, Zap, ChevronLeft } from 'lucide-react';

const ADMIN_NAV = [
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/trades', label: 'All Trades', icon: Activity },
  { to: '/admin/deploy', label: 'Deploy Signal', icon: Zap },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart2 },
  { to: '/admin/system', label: 'System', icon: Settings },
];

export default function AdminLayout() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-full flex flex-col space-y-6 animate-fade-in">
      {/* Admin subheader */}
      <div className="flex items-center gap-4 pb-4 border-b border-border">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-muted hover:text-foreground transition-colors flex items-center gap-1 text-sm"
        >
          <ChevronLeft size={16} />
          Back
        </button>
        <div className="flex items-center gap-2">
          <span className="badge tier-elite text-[10px]">ADMIN PANEL</span>
          <h2 className="text-lg font-bold text-foreground">Admin Console</h2>
        </div>
        <span className="text-xs text-muted ml-auto">
          Logged as <strong className="text-foreground">{profile?.full_name ?? profile?.email}</strong>
          {' '}· {profile?.role}
        </span>
      </div>

      {/* Admin nav tabs */}
      <nav className="flex gap-1 bg-panel-mid border border-border rounded-xl p-1">
        {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) => cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center',
              isActive
                ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20'
                : 'text-muted hover:text-foreground',
            )}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Admin page content */}
      <Outlet />
    </div>
  );
}
