import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Zap,
  List,
  ClipboardList,
  Activity,
  Wifi,
  Copy,
  CreditCard,
  Users,
  BarChart2,
  Settings,
  Shield,
  LogOut,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Package,
  Bell,
  ShieldOff,
  Wallet,
  FileText,
  Radio,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/app/providers/AuthProvider';
import { useState } from 'react';

const memberNav = [
  { to: '/dashboard',    label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/deploy',       label: 'Deploy Trade',  icon: Zap },
  { to: '/trades',       label: 'Trade History', icon: List },
  { to: '/orders',       label: 'Orders',        icon: ClipboardList },
  { to: '/positions',     label: 'Positions',      icon: Activity },
  { to: '/holdings',      label: 'Holdings',       icon: Package },
  { to: '/alerts',         label: 'Alerts',          icon: Bell },
  { to: '/trader-control', label: 'Trader Control',  icon: ShieldOff },
  { to: '/funds',          label: 'Funds',           icon: Wallet },
  { to: '/statement',      label: 'Statement',        icon: FileText },
  { to: '/live-orders',    label: 'Live Orders',      icon: Radio },
  { to: '/option-chain',   label: 'Option Chain',     icon: Layers },
  { to: '/broker',           label: 'Broker',           icon: Wifi },
  { to: '/copy-trading', label: 'Copy Trading',  icon: Copy },
  { to: '/subscription', label: 'Subscription',  icon: CreditCard },
];

const adminNav = [
  { to: '/admin/users',     label: 'Users',     icon: Users },
  { to: '/admin/trades',    label: 'All Trades', icon: TrendingUp },
  { to: '/admin/deploy',    label: 'Admin Deploy', icon: Zap },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart2 },
  { to: '/admin/system',    label: 'System',     icon: Settings },
];

export default function Sidebar() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const isAdmin = ['admin', 'super_admin'].includes(profile?.role ?? '');

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-panel-dark border-r border-border transition-all duration-300 relative',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-3 p-4 border-b border-border', collapsed && 'justify-center')}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-cyan/30 to-accent-purple/30 border border-accent-cyan/40 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-mono font-bold text-gradient-cyan">M</span>
        </div>
        {!collapsed && (
          <div>
            <p className="text-sm font-bold text-foreground leading-none">Matrix Pro</p>
            <p className="text-[10px] text-muted leading-none mt-0.5">v2.0</p>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-panel-dark border border-border flex items-center justify-center text-muted hover:text-foreground transition-colors z-10"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {memberNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn('nav-item', isActive && 'active', collapsed && 'justify-center px-2')
            }
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className="flex-shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className={cn('pt-4 pb-1', collapsed ? 'px-2' : 'px-3')}>
              {!collapsed && (
                <p className="text-[10px] uppercase tracking-widest text-muted/60 font-semibold flex items-center gap-1.5">
                  <Shield size={10} /> Admin
                </p>
              )}
              {collapsed && <div className="border-t border-border" />}
            </div>
            {adminNav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn('nav-item', isActive && 'active', collapsed && 'justify-center px-2')
                }
                title={collapsed ? label : undefined}
              >
                <Icon size={18} className="flex-shrink-0" />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User + Sign out */}
      <div className={cn('border-t border-border p-2', collapsed && 'flex justify-center')}>
        {!collapsed ? (
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-panel-mid transition-colors group">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-cyan/30 to-accent-purple/30 border border-border flex items-center justify-center text-xs font-bold text-accent-cyan flex-shrink-0">
              {profile?.full_name?.[0]?.toUpperCase() ?? profile?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                {profile?.full_name ?? profile?.email}
              </p>
              <span className={cn('tier-' + (profile?.tier ?? 'free'), 'text-[10px]')}>
                {profile?.tier?.toUpperCase()}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-loss"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleSignOut}
            className="p-2 rounded-lg text-muted hover:text-loss hover:bg-panel-mid transition-colors"
            title="Sign out"
          >
            <LogOut size={18} />
          </button>
        )}
      </div>
    </aside>
  );
}
