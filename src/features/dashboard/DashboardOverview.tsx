import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  HardDrive,
  Plus,
  Users,
  XCircle,
} from 'lucide-react';
import React from 'react';
import {useT} from '../../i18n/translations';
import type {AuthUser, DeploymentRecord, Language, StorageUsage, Website} from '../../types';
import {formatBytes, formatDateTime} from '../../utils/format';

interface DashboardOverviewProps {
  lang: Language;
  user: AuthUser | null;
  usage?: StorageUsage;
  metrics: {
    totalWebsites: number;
    activeWebsites: number;
    totalUsers: number;
    totalStorageBytes: number;
    failedDeployments: number;
    totalVisits: number;
  } | null;
  recentDeployments: DeploymentRecord[];
  myWebsites: Website[];
  searchQuery: string;
  onQuickPublish: () => void;
  onSelectWebsite: (website: Website) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  lang,
  user,
  usage,
  metrics,
  recentDeployments,
  myWebsites,
  searchQuery,
  onQuickPublish,
  onSelectWebsite,
}) => {
  const t = useT(lang);
  const query = searchQuery.trim().toLowerCase();

  const filteredDeployments = recentDeployments.filter(
    (d) =>
      !query ||
      (d.website_name || '').toLowerCase().includes(query) ||
      (d.slug || '').toLowerCase().includes(query),
  );

  const quotaPct =
    user && usage ? Math.min(100, Math.round((usage.totalBytes / Math.max(1, user.quotaBytes)) * 100)) : 0;

  return (
    <div className="space-y-8">
      {/* Top Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {t('navDashboard')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Platform publishing activity, active websites, and storage allocation.
          </p>
        </div>
        <button
          type="button"
          onClick={onQuickPublish}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t('quickPublish')}</span>
        </button>
      </div>

      {/* 6-Metric Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('metricPublished')}</div>
          <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {metrics ? metrics.totalWebsites : '—'}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {metrics ? `${metrics.activeWebsites} ${t('active').toLowerCase()}` : ''}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('totalUsers')}</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {metrics ? metrics.totalUsers : '—'}
            </span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Registered publishers</div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('metricStorage')}</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {metrics ? formatBytes(metrics.totalStorageBytes) : '—'}
            </span>
            <HardDrive className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Across isolated namespaces</div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('metricActive')}</div>
          <div className="mt-2 text-3xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {metrics ? metrics.activeWebsites : '—'}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Serving HTTP 200 publicly</div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('failedDeployments')}</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {metrics ? metrics.failedDeployments : '—'}
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Rejected by pre-publish checks</div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('totalVisits')}</div>
          <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {metrics ? metrics.totalVisits.toLocaleString() : '—'}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Recorded HTML page requests</div>
        </div>
      </div>

      {/* Personal Storage Quota Bar (if signed in) */}
      {user && usage && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Your Storage Quota</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {formatBytes(usage.totalBytes)} used of {formatBytes(user.quotaBytes)} ({usage.websiteCount} websites ·{' '}
                {usage.fileCount} files)
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-sky-600 dark:text-sky-400 tabular-nums">
              {quotaPct}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-sky-500 transition-all duration-300" style={{width: `${quotaPct}%`}} />
          </div>
        </div>
      )}

      {/* Recent Deployments Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t('recentDeployments')}</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {filteredDeployments.length} record(s)
          </span>
        </div>

        {filteredDeployments.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No deployments match your current filter. Publish a website to see activity here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/40">
                  <th className="py-3 px-5 font-medium">Website</th>
                  <th className="py-3 px-4 font-medium">Version</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Files</th>
                  <th className="py-3 px-4 font-medium text-right">Size</th>
                  <th className="py-3 px-4 font-medium text-right">Duration</th>
                  <th className="py-3 px-5 font-medium text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredDeployments.map((dep) => {
                  const matchedSite = myWebsites.find((w) => w.id === dep.website_id);
                  return (
                    <tr
                      key={dep.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-2">
                          {matchedSite ? (
                            <button
                              type="button"
                              onClick={() => onSelectWebsite(matchedSite)}
                              className="font-medium text-slate-900 dark:text-slate-100 hover:text-sky-500 text-left"
                            >
                              {dep.website_name || dep.slug}
                            </button>
                          ) : (
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {dep.website_name || dep.slug}
                            </span>
                          )}
                          {dep.slug && (
                            <a
                              href={`/sites/${dep.slug}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-400 hover:text-sky-500"
                              aria-label={`Open ${dep.website_name}`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                        {dep.version_number ? `v${dep.version_number}` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        {dep.status === 'success' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Verified</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Failed</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                        {dep.file_count}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                        {formatBytes(dep.total_bytes)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                        {dep.duration_ms} ms
                      </td>
                      <td className="py-3 px-5 text-right text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {formatDateTime(dep.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
