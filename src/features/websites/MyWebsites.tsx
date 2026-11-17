import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  EyeOff,
  FileText,
  History,
  PauseCircle,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import React, {useEffect, useState} from 'react';
import {useT} from '../../i18n/translations';
import {api} from '../../services/api';
import type {DeploymentVersion, Language, Website, WebsiteFileRecord} from '../../types';
import {formatBytes, formatDateTime, getPublicSiteUrl} from '../../utils/format';

interface MyWebsitesProps {
  lang: Language;
  websites: Website[];
  searchQuery: string;
  initialSelectedId?: string | null;
  onRefresh: () => void;
  onPublishNew: () => void;
  onRepublishWebsite: (site: Website) => void;
}

export const MyWebsites: React.FC<MyWebsitesProps> = ({
  lang,
  websites,
  searchQuery,
  initialSelectedId,
  onRefresh,
  onPublishNew,
  onRepublishWebsite,
}) => {
  const t = useT(lang);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'unpublished'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId || null);
  const [versions, setVersions] = useState<DeploymentVersion[]>([]);
  const [files, setFiles] = useState<WebsiteFileRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (initialSelectedId) setSelectedId(initialSelectedId);
  }, [initialSelectedId]);

  useEffect(() => {
    if (!selectedId) {
      setVersions([]);
      setFiles([]);
      return;
    }
    let active = true;
    setDetailLoading(true);
    setActionError(null);
    api
      .getWebsiteDetails(selectedId)
      .then((res) => {
        if (!active) return;
        setVersions(res.versions);
        setFiles(res.files);
      })
      .catch((err) => {
        if (active) setActionError(err instanceof Error ? err.message : 'Failed to load website details.');
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const query = searchQuery.trim().toLowerCase();
  const filtered = websites.filter((site) => {
    if (statusFilter !== 'all' && site.status !== statusFilter) return false;
    if (query && !site.name.toLowerCase().includes(query) && !site.slug.toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });

  const selectedSite = websites.find((w) => w.id === selectedId) || null;

  const handleCopy = (site: Website) => {
    navigator.clipboard.writeText(getPublicSiteUrl(site.slug));
    setCopiedId(site.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleToggleStatus = async (site: Website) => {
    setActionError(null);
    try {
      await api.updateWebsite(site.id, {
        status: site.status === 'active' ? 'unpublished' : 'active',
      });
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update website status.');
    }
  };

  const handleRollback = async (site: Website, versionId: string) => {
    setActionError(null);
    try {
      await api.rollbackWebsite(site.id, versionId);
      onRefresh();
      const details = await api.getWebsiteDetails(site.id);
      setVersions(details.versions);
      setFiles(details.files);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Rollback failed.');
    }
  };

  const handleDelete = async (site: Website) => {
    setActionError(null);
    try {
      await api.deleteWebsite(site.id);
      if (selectedId === site.id) setSelectedId(null);
      setConfirmDeleteId(null);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {t('sidebarWebsites')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage published URLs, inspect files, roll back versions, or remove deployments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {(['all', 'active', 'unpublished'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                  statusFilter === tab
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onPublishNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{t('ctaPublish')}</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
          {actionError}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-10 text-center space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            You do not have any websites matching this view yet.
          </p>
          <button
            type="button"
            onClick={onPublishNew}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{t('ctaPublish')}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Website List */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
            {filtered.map((site) => {
              const isSelected = selectedSite?.id === site.id;
              return (
                <div
                  key={site.id}
                  onClick={() => setSelectedId(site.id)}
                  className={`p-4 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-sky-50/70 dark:bg-sky-950/20'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {site.name}
                        </h3>
                        {site.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t('active')}</span>
                          </span>
                        ) : site.status === 'unpublished' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>{t('unpublished')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                            <PauseCircle className="w-3.5 h-3.5" />
                            <span>{t('suspended')}</span>
                          </span>
                        )}
                      </div>

                      <div className="mt-1 font-mono text-xs text-sky-600 dark:text-sky-400 truncate">
                        /sites/{site.slug}/
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        <span>{site.file_count} files</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatBytes(site.storage_bytes)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{site.visits_count} visits</span>
                        <span aria-hidden="true">·</span>
                        <span>Updated {formatDateTime(site.updated_at)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleCopy(site)}
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title={t('copyUrl')}
                      >
                        {copiedId === site.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <a
                        href={`/sites/${site.slug}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title={t('openLiveSite')}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Website Inspector Panel */}
          <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5 space-y-5">
            {!selectedSite ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                Select a website from the list to inspect files, manage versions, or roll back.
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{selectedSite.name}</h2>
                    <a
                      href={`/sites/${selectedSite.slug}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1 font-mono text-xs text-sky-600 dark:text-sky-400 hover:underline"
                    >
                      <span>{getPublicSiteUrl(selectedSite.slug)}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onRepublishWebsite(selectedSite)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload New Version</span>
                  </button>

                  {selectedSite.status !== 'suspended' && (
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(selectedSite)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>{selectedSite.status === 'active' ? t('unpublish') : t('republish')}</span>
                    </button>
                  )}

                  {confirmDeleteId === selectedSite.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDelete(selectedSite)}
                        className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold whitespace-nowrap"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(selectedSite.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-medium transition-colors whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t('deleteSite')}</span>
                    </button>
                  )}
                </div>

                {detailLoading ? (
                  <div className="py-6 text-xs text-slate-500 dark:text-slate-400">Loading deployment history...</div>
                ) : (
                  <>
                    {/* Version History */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <History className="w-3.5 h-3.5 text-slate-400" />
                        <span>Deployment Versions ({versions.length})</span>
                      </div>
                      <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 max-h-48 overflow-y-auto">
                        {versions.map((ver) => {
                          const isCurrent = ver.id === selectedSite.active_version_id;
                          return (
                            <div
                              key={ver.id}
                              className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 dark:text-slate-100">
                                  <span className="font-mono">v{ver.version_number}</span> · {ver.commit_note}
                                </div>
                                <div className="text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                                  {ver.file_count} files · {formatBytes(ver.total_bytes)} · {formatDateTime(ver.created_at)}
                                </div>
                              </div>
                              {isCurrent ? (
                                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                                  Active
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleRollback(selectedSite, ver.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 shrink-0"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>{t('rollback')}</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Deployed File Manifest */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        <span>Active Files ({files.length})</span>
                      </div>
                      <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 max-h-48 overflow-y-auto">
                        {files.map((file) => (
                          <div key={file.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                            <span className="font-mono text-slate-800 dark:text-slate-200 truncate">{file.path}</span>
                            <span className="text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                              {formatBytes(file.size_bytes)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
