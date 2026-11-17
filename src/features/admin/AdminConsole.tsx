import {
  Activity,
  AlertOctagon,
  CheckCircle2,
  ExternalLink,
  Shield,
  Trash2,
  Users,
} from 'lucide-react';
import React, {useEffect, useState} from 'react';
import {api} from '../../services/api';
import type {AbuseReport, AuditLog, AuthUser, DeploymentRecord, Website} from '../../types';
import {formatBytes, formatDateTime} from '../../utils/format';

interface AdminConsoleProps {
  currentUser: AuthUser | null;
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({currentUser}) => {
  const [tab, setTab] = useState<'overview' | 'users' | 'websites' | 'reports' | 'audit'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    health: {database: string; objectStorage: string; totalDiskBytes: number; uptimeSeconds: number};
    users: Array<{
      id: string;
      email: string;
      name: string;
      role: 'user' | 'admin';
      quota_bytes: number;
      is_guest: number;
      suspended: number;
      used_bytes: number;
      website_count: number;
      created_at: number;
    }>;
    websites: Array<Website & {owner_email: string; owner_name: string}>;
    reports: AbuseReport[];
    auditLogs: AuditLog[];
    deployments: DeploymentRecord[];
  } | null>(null);

  const loadAdmin = async () => {
    if (!currentUser || currentUser.role !== 'admin') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminOverview();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin telemetry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmin();
  }, [currentUser?.id, currentUser?.role]);

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-10 text-center space-y-2">
        <Shield className="w-8 h-8 text-amber-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Administrator Access Required</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sign in with an administrator account to inspect users, moderation reports, and audit logs.
        </p>
      </div>
    );
  }

  const toggleUserSuspend = async (userId: string, currentSuspended: number) => {
    await api.adminUpdateUser(userId, {suspended: !currentSuspended});
    await loadAdmin();
  };

  const toggleSiteStatus = async (siteId: string, nextStatus: 'active' | 'suspended') => {
    await api.adminUpdateWebsiteStatus(siteId, nextStatus);
    await loadAdmin();
  };

  const removeWebsite = async (siteId: string) => {
    await api.adminDeleteWebsite(siteId);
    await loadAdmin();
  };

  const resolveReport = async (reportId: string, status: 'resolved' | 'dismissed') => {
    await api.adminUpdateReport(reportId, status);
    await loadAdmin();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Admin Console</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Platform moderation, storage monitoring, abuse reports, and security audit trail.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {(
            [
              ['overview', 'System Health'],
              ['users', 'Users'],
              ['websites', 'Websites'],
              ['reports', 'Abuse Reports'],
              ['audit', 'Audit Logs'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                tab === key
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading || !data ? (
        <div className="text-sm text-slate-500 dark:text-slate-400">Loading admin console...</div>
      ) : (
        <>
          {tab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>SQLite / D1 Database</span>
                  <Activity className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="mt-2 text-xl font-bold capitalize text-emerald-600 dark:text-emerald-400">
                  {data.health.database}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Object Store (R2)</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {formatBytes(data.health.totalDiskBytes)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Registered Accounts</span>
                  <Users className="w-4 h-4 text-sky-500" />
                </div>
                <div className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {data.users.length}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Open Abuse Reports</span>
                  <AlertOctagon className="w-4 h-4 text-amber-500" />
                </div>
                <div className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {data.reports.filter((r) => r.status === 'open').length}
                </div>
              </div>
            </div>
          )}

          {tab === 'users' && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/40">
                    <th className="py-3 px-4 font-medium">User</th>
                    <th className="py-3 px-4 font-medium">Role</th>
                    <th className="py-3 px-4 font-medium text-right">Sites</th>
                    <th className="py-3 px-4 font-medium text-right">Storage</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {data.users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{u.name}</div>
                        <div className="font-mono text-xs text-slate-500">{u.email}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs uppercase text-slate-600 dark:text-slate-300">
                        {u.role}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">{u.website_count}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                        {formatBytes(u.used_bytes)}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {u.suspended ? (
                          <span className="text-red-600 dark:text-red-400 font-medium">Suspended</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">Active</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {u.id !== currentUser.id && (
                          <button
                            type="button"
                            onClick={() => toggleUserSuspend(u.id, u.suspended)}
                            className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            {u.suspended ? 'Restore' : 'Suspend'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'websites' && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/40">
                    <th className="py-3 px-4 font-medium">Website</th>
                    <th className="py-3 px-4 font-medium">Owner</th>
                    <th className="py-3 px-4 font-medium text-right">Storage</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Moderation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {data.websites.map((w) => (
                    <tr key={w.id}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
                          <span>{w.name}</span>
                          <a
                            href={`/sites/${w.slug}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-sky-500"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        <div className="font-mono text-xs text-slate-500">/sites/{w.slug}/</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">{w.owner_email}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                        {formatBytes(w.storage_bytes)}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium capitalize">{w.status}</td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => toggleSiteStatus(w.id, w.status === 'suspended' ? 'active' : 'suspended')}
                          className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          {w.status === 'suspended' ? 'Reinstate' : 'Suspend'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeWebsite(w.id)}
                          className="p-1.5 rounded border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 inline-flex align-middle"
                          aria-label={`Delete ${w.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'reports' && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5 space-y-3">
              {data.reports.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No abuse reports submitted.</p>
              ) : (
                data.reports.map((rep) => (
                  <div
                    key={rep.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 border-b last:border-b-0 border-slate-200 dark:border-slate-800"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {rep.website_name} (<span className="font-mono text-xs">/sites/{rep.website_slug}/</span>)
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                        Reason: {rep.reason} · Reporter: {rep.reporter_email}
                      </div>
                      {rep.details && <div className="text-xs text-slate-500 mt-1">{rep.details}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium capitalize text-slate-500">{rep.status}</span>
                      {rep.status === 'open' && (
                        <>
                          <button
                            type="button"
                            onClick={() => resolveReport(rep.id, 'resolved')}
                            className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-medium"
                          >
                            Resolve
                          </button>
                          <button
                            type="button"
                            onClick={() => resolveReport(rep.id, 'dismissed')}
                            className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium"
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'audit' && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/40">
                    <th className="py-3 px-4 font-medium">Action</th>
                    <th className="py-3 px-4 font-medium">Actor</th>
                    <th className="py-3 px-4 font-medium">Target</th>
                    <th className="py-3 px-4 font-medium">Details</th>
                    <th className="py-3 px-4 font-medium text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {data.auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2.5 px-4 font-mono text-sky-600 dark:text-sky-400">{log.action}</td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                        {log.actor_email || log.actor_user_id || 'system'}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-500">
                        {log.target_type}:{log.target_id}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 dark:text-slate-200">{log.details}</td>
                      <td className="py-2.5 px-4 text-right text-slate-500 tabular-nums whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};
