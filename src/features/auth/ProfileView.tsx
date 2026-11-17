import {CheckCircle2, HardDrive, LogOut, Shield, UserCheck} from 'lucide-react';
import React, {useState} from 'react';
import {api} from '../../services/api';
import type {AuthUser, StorageUsage} from '../../types';
import {formatBytes} from '../../utils/format';

interface ProfileViewProps {
  user: AuthUser | null;
  usage?: StorageUsage;
  onUpdated: (user: AuthUser) => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  usage,
  onUpdated,
  onSignIn,
  onSignOut,
}) => {
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-10 text-center space-y-3">
        <UserCheck className="w-8 h-8 text-sky-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Sign in to manage your account</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Create a persistent account to track your storage quota, custom domains, and deployment history.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
        >
          Sign In / Create Account
        </button>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await api.updateProfile(name);
      onUpdated(res.user);
      setSavedMsg('Profile name updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setSaving(false);
    }
  };

  const usedBytes = usage?.totalBytes || 0;
  const pct = Math.min(100, Math.round((usedBytes / Math.max(1, user.quotaBytes)) * 100));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Account & Quota</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage your profile details, role permissions, and allocated object storage quota.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0">
              <img
                src={user.avatarUrl || '/src/assets/images/avatar_founder_1794934539788.jpg'}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{user.name}</div>
              <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {user.email} · {user.role.toUpperCase()}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user.isGuest && (
              <button
                type="button"
                onClick={onSignIn}
                className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
              >
                Register Email to Save Account
              </button>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Display Name</label>
            <input
              type="text"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          {savedMsg && (
            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>{savedMsg}</span>
            </div>
          )}
          {error && <div className="text-xs text-red-500">{error}</div>}

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <HardDrive className="w-4 h-4 text-sky-500" />
            <span>Storage Allocation</span>
          </div>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {formatBytes(usedBytes)} / {formatBytes(user.quotaBytes)} ({pct}%)
          </span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div className="h-full bg-sky-500" style={{width: `${pct}%`}} />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Shield className="w-3.5 h-3.5 text-slate-400" />
          <span>Maximum 50 MB per archive · Maximum 250 files per deployment · Isolated R2 storage namespace</span>
        </div>
      </div>
    </div>
  );
};
