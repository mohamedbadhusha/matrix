import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { Profile, UserRole, UserTier } from '@/types';
import { toast } from 'sonner';
import { Search, RefreshCw } from 'lucide-react';

const TIER_OPTIONS: UserTier[] = ['free', 'pro', 'elite'];
const ROLE_OPTIONS: UserRole[] = ['member', 'admin', 'super_admin'];

export default function Users() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    setUsers((data as Profile[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleUpdate = async (userId: string, field: 'tier' | 'role' | 'is_active', value: any) => {
    setUpdating(userId);
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', userId);
    if (error) {
      toast.error(error.message);
    } else {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, [field]: value } : u)),
      );
      toast.success('User updated');
    }
    setUpdating(null);
  };

  const filtered = users.filter(
    (u) =>
      !search ||
      (u.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (u.email ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input-base pl-9 text-sm"
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button onClick={fetchUsers} className="btn-secondary flex items-center gap-1.5 text-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
        <span className="text-xs text-muted">{filtered.length} users</span>
      </div>

      <div className="panel overflow-hidden">
        <table className="table-base">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Tier</th>
              <th>Trades Used</th>
              <th>Joined</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-10">
                  <div className="w-6 h-6 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin mx-auto" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted text-sm">No users found</td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className={cn(updating === u.id && 'opacity-50')}>
                  <td>
                    <div>
                      <p className="font-medium text-sm text-foreground">{u.full_name ?? '—'}</p>
                      <p className="text-[10px] text-muted">{u.email}</p>
                    </div>
                  </td>
                  <td>
                    <select
                      className="input-base text-xs py-1 w-32"
                      value={u.role}
                      disabled={updating === u.id}
                      onChange={(e) => handleUpdate(u.id, 'role', e.target.value)}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="input-base text-xs py-1 w-24"
                      value={u.tier}
                      disabled={updating === u.id}
                      onChange={(e) => handleUpdate(u.id, 'tier', e.target.value)}
                    >
                      {TIER_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className="font-mono text-sm">{u.daily_trades_used}</span>
                  </td>
                  <td>
                    <span className="text-xs text-muted">
                      {new Date(u.created_at).toLocaleDateString('en-IN')}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => handleUpdate(u.id, 'is_active', !u.is_active)}
                      disabled={updating === u.id}
                      className={cn(
                        'relative inline-flex h-5 w-9 rounded-full border-2 transition-colors',
                        u.is_active ? 'bg-profit border-profit' : 'bg-muted/20 border-border',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform',
                          u.is_active && 'translate-x-4',
                        )}
                      />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
