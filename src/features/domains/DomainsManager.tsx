import {AlertCircle, CheckCircle2, Clock, Globe, Plus, RefreshCw, Trash2} from 'lucide-react';
import React, {useEffect, useState} from 'react';
import {useT} from '../../i18n/translations';
import {api} from '../../services/api';
import type {CustomDomain, Language, Website} from '../../types';

interface DomainsManagerProps {
  lang: Language;
  websites: Website[];
  isAuthenticated: boolean;
  onRequireAuth: () => void;
}

export const DomainsManager: React.FC<DomainsManagerProps> = ({
  lang,
  websites,
  isAuthenticated,
  onRequireAuth,
}) => {
  const t = useT(lang);
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string>('');
  const [domainInput, setDomainInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{type: 'error' | 'success'; text: string} | null>(null);

  const loadDomains = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await api.getDomains();
      setDomains(res.domains);
    } catch {
      // ignore if guest/unauth
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDomains();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!selectedWebsiteId && websites.length > 0) {
      setSelectedWebsiteId(websites[0].id);
    }
  }, [websites, selectedWebsiteId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setFeedback(null);
    try {
      const res = await api.createDomain(selectedWebsiteId, domainInput);
      setDomains((prev) => [res.domain, ...prev]);
      setDomainInput('');
      setFeedback({type: 'success', text: 'Domain registered. Configure the DNS records below and verify.'});
    } catch (err) {
      setFeedback({type: 'error', text: err instanceof Error ? err.message : 'Failed to register domain.'});
    }
  };

  const handleVerify = async (domainId: string) => {
    setVerifyingId(domainId);
    setFeedback(null);
    try {
      const res = await api.verifyDomain(domainId);
      setDomains((prev) => prev.map((d) => (d.id === domainId ? res.domain : d)));
      setFeedback({type: res.verified ? 'success' : 'error', text: res.message});
    } catch (err) {
      setFeedback({type: 'error', text: err instanceof Error ? err.message : 'Verification check failed.'});
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDelete = async (domainId: string) => {
    try {
      await api.deleteDomain(domainId);
      setDomains((prev) => prev.filter((d) => d.id !== domainId));
    } catch (err) {
      setFeedback({type: 'error', text: err instanceof Error ? err.message : 'Failed to remove domain.'});
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {t('sidebarDomains')}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Attach custom domains to your published websites and run live DNS TXT verification.
        </p>
      </div>

      {!isAuthenticated ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-8 text-center space-y-3">
          <Globe className="w-8 h-8 text-sky-500 mx-auto" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Sign in to connect custom domains to your published websites.
          </p>
          <button
            type="button"
            onClick={onRequireAuth}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
          >
            {t('signIn')}
          </button>
        </div>
      ) : (
        <>
          <form
            onSubmit={handleAdd}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
          >
            <div className="md:col-span-4">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Target Website
              </label>
              <select
                value={selectedWebsiteId}
                onChange={(e) => setSelectedWebsiteId(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                {websites.length === 0 && <option value="">No websites published yet</option>}
                {websites.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} (/sites/{w.slug}/)
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Domain or Subdomain
              </label>
              <input
                type="text"
                required
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="portfolio.yourdomain.com"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={websites.length === 0}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>{t('addDomain')}</span>
              </button>
            </div>
          </form>

          {feedback && (
            <div
              className={`flex items-start gap-2.5 rounded-lg border p-3 text-xs ${
                feedback.type === 'success'
                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                  : 'border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{feedback.text}</span>
            </div>
          )}

          {loading ? (
            <div className="text-xs text-slate-500">Loading domains...</div>
          ) : domains.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No custom domains registered yet.
            </div>
          ) : (
            <div className="space-y-4">
              {domains.map((dom) => (
                <div
                  key={dom.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-base font-semibold text-slate-900 dark:text-slate-100">
                          {dom.domain}
                        </span>
                        {dom.dns_verified ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t('verified')} · SSL {dom.ssl_status}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{t('pending')}</span>
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Target: {dom.website_name} (<span className="font-mono">/sites/{dom.website_slug}/</span>)
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={verifyingId === dom.id}
                        onClick={() => handleVerify(dom.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${verifyingId === dom.id ? 'animate-spin' : ''}`} />
                        <span>{t('verifyDns')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(dom.id)}
                        className="p-2 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                        aria-label={`Remove ${dom.domain}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3.5 text-xs space-y-2">
                    <div className="font-semibold text-slate-700 dark:text-slate-300">Required DNS Records</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">1. TXT Ownership Verification</div>
                        <div className="text-slate-900 dark:text-slate-100 mt-0.5 break-all">
                          Host: _weblaunch.{dom.domain}
                        </div>
                        <div className="text-sky-600 dark:text-sky-400 mt-0.5 break-all">
                          Value: {dom.verification_token}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 dark:text-slate-400">2. CNAME Routing Record</div>
                        <div className="text-slate-900 dark:text-slate-100 mt-0.5 break-all">Host: {dom.domain}</div>
                        <div className="text-sky-600 dark:text-sky-400 mt-0.5 break-all">
                          Target: edge.weblaunch.example.com
                        </div>
                      </div>
                    </div>
                    {dom.last_error && !dom.dns_verified && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-amber-700 dark:text-amber-300">
                        Last check: {dom.last_error}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
