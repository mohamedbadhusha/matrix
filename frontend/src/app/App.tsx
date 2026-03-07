import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './providers/AuthProvider';
import { TradeProvider } from './providers/TradeProvider';
import { Toaster } from 'sonner';

// Pages
import Login from '@/pages/Login';
import DhanCallback from '@/pages/DhanCallback';
import Dashboard from '@/pages/Dashboard';
import Deploy from '@/pages/Deploy';
import Trades from '@/pages/Trades';
import BrokerPage from '@/pages/Broker';
import CopyTrading from '@/pages/CopyTrading';
import Subscription from '@/pages/Subscription';
import Orders from '@/pages/Orders';
import Positions from '@/pages/Positions';
import Holdings from '@/pages/Holdings';
import Alerts from '@/pages/Alerts';
import TraderControl from '@/pages/TraderControl';
import Funds from '@/pages/Funds';
import Statement from '@/pages/Statement';
import LiveOrders from '@/pages/LiveOrders';
import OptionChain from '@/pages/OptionChain';
import Simulator from '@/pages/Simulator';

// Admin Pages
import AdminLayout from '@/pages/admin/AdminLayout';
import AdminUsers from '@/pages/admin/Users';
import AdminAllTrades from '@/pages/admin/AllTrades';
import AdminDeploy from '@/pages/admin/DeployAdmin';
import AdminSystem from '@/pages/admin/System';
import AdminAnalytics from '@/pages/admin/Analytics';

// Layout
import AppLayout from '@/components/layout/AppLayout';

// Loading screen
import LoadingScreen from '@/components/ui/LoadingScreen';

function ProtectedRoute({
  children,
  requireAdmin,
  requireSuperAdmin,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireSuperAdmin?: boolean;
}) {
  const { user, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  if (requireSuperAdmin && profile?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireAdmin && !['admin', 'super_admin'].includes(profile?.role ?? '')) {
    return <Navigate to="/dashboard" replace />;
  }

  // Profile fetch failed (schema issue / RLS) — show retry rather than infinite loader
  if (!profile) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="panel p-8 text-center max-w-sm space-y-3">
          <p className="text-muted text-sm">Could not load profile. Check your connection.</p>
          <button className="btn-secondary text-xs" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!profile.is_active) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="panel p-8 text-center max-w-sm">
          <p className="text-loss font-semibold mb-2">Account Suspended</p>
          <p className="text-muted text-sm">
            Your account has been suspended. Contact{' '}
            <a href="mailto:support@matrixpro.in" className="text-accent-cyan underline">support</a>.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      {/* Dhan OAuth callback — must be public, works inside popup */}
      <Route path="/auth/dhan/callback" element={<DhanCallback />} />

      {/* Protected member routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <TradeProvider>
              <AppLayout />
            </TradeProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="deploy" element={<Deploy />} />
        <Route path="trades" element={<Trades />} />
        <Route path="orders" element={<Orders />} />
        <Route path="positions"      element={<Positions />} />
        <Route path="holdings"      element={<Holdings />} />
        <Route path="alerts"         element={<Alerts />} />
        <Route path="trader-control" element={<TraderControl />} />
        <Route path="funds"          element={<Funds />} />
        <Route path="statement"       element={<Statement />} />
        <Route path="live-orders"     element={<LiveOrders />} />
        <Route path="option-chain"     element={<OptionChain />} />
        <Route path="simulator"           element={<Simulator />} />
        <Route path="broker" element={<BrokerPage />} />
        <Route path="copy-trading" element={<CopyTrading />} />
        <Route path="subscription" element={<Subscription />} />

        {/* Admin routes */}
        <Route
          path="admin"
          element={
            <ProtectedRoute requireAdmin>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/users" replace />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="trades" element={<AdminAllTrades />} />
          <Route path="deploy" element={<AdminDeploy />} />
          <Route
            path="system"
            element={
              <ProtectedRoute requireSuperAdmin>
                <AdminSystem />
              </ProtectedRoute>
            }
          />
          <Route path="analytics" element={<AdminAnalytics />} />
        </Route>
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#0F3460',
              border: '1px solid #2A3A5C',
              color: '#E2E8F0',
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
