import {
  ArrowRight,
  ChevronDown,
  ExternalLink,
  Flag,
  Layers,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import React, {useState} from 'react';
import {useT} from '../i18n/translations';
import {api} from '../services/api';
import type {Language, PublicStats, ThemeMode} from '../types';
import {formatBytes} from '../utils/format';

interface LandingPageProps {
  lang: Language;
  theme: ThemeMode;
  stats: PublicStats | null;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onOpenPublish: () => void;
  onOpenDashboard: () => void;
}

const FAQS = [
  {
    q: 'What files can I upload to WebLaunch AI?',
    a: 'You can upload a standalone index.html, an entire website folder, or a .zip archive containing HTML, CSS, JavaScript, images, SVG, fonts, and JSON files up to 50 MB per deployment.',
  },
  {
    q: 'How are uploaded websites isolated for security?',
    a: 'All hosted websites are served with strict Content-Security-Policy headers, X-Content-Type-Options: nosniff, and path-scoped authentication cookies (/api only) so static sites never access platform credentials.',
  },
  {
    q: 'Can I update or roll back a published website?',
    a: 'Yes. Every publish creates an immutable versioned snapshot in object storage. You can upload a new version or roll back to any prior version from My Websites in one click.',
  },
  {
    q: 'How do custom domains work?',
    a: 'Register your domain inside the Custom Domains tab, add the generated TXT verification record and CNAME target at your DNS provider, and run live DNS verification before activation.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  lang,
  theme,
  stats,
  onToggleLang,
  onToggleTheme,
  onOpenPublish,
  onOpenDashboard,
}) => {
  const t = useT(lang);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSlug, setReportSlug] = useState('');
  const [reportEmail, setReportEmail] = useState('');
  const [reportReason, setReportReason] = useState('Phishing or deceptive content');
  const [reportDetails, setReportDetails] = useState('');
  const [reportMsg, setReportMsg] = useState<string | null>(null);
  const [reportErr, setReportErr] = useState<string | null>(null);

  const submitAbuseReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportMsg(null);
    setReportErr(null);
    try {
      await api.submitReport({
        slug: reportSlug.trim(),
        reporterEmail: reportEmail.trim(),
        reason: reportReason,
        details: reportDetails.trim(),
      });
      setReportMsg('Abuse report submitted for administrator review.');
      setReportSlug('');
      setReportDetails('');
    } catch (err) {
      setReportErr(err instanceof Error ? err.message : 'Unable to submit report.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#070B14] dark:text-slate-100">
      {/* Top Bar Contract: Exactly 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/85 dark:bg-[#070B14]/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          >
            {t('brand')}
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#capabilities"
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              {t('navCapabilities')}
            </a>
            <a
              href="#pricing"
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              {t('navPricing')}
            </a>
            <a
              href="#docs"
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              {t('navDocs')}
            </a>
            <button
              type="button"
              onClick={onOpenDashboard}
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              {t('navDashboard')}
            </button>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={onOpenPublish}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              {t('ctaPublish')}
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Split */}
        <section className="max-w-7xl mx-auto px-6 pt-14 pb-12 lg:pt-20 lg:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <div className="text-xs font-medium text-sky-600 dark:text-sky-400 tracking-wide">
                {t('tagline')}
              </div>

              <h1
                className="font-display font-bold tracking-tight text-slate-900 dark:text-white leading-[1.08]"
                style={{fontSize: 'clamp(2.25rem, 4vw, 3.75rem)', textWrap: 'balance'}}
              >
                {t('heroTitle')}
              </h1>

              <p className="text-base md:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                {t('heroSubtitle')}
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={onOpenPublish}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  <span>{t('ctaPublish')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onOpenDashboard}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800/70 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  <span>{t('ctaExplore')}</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-6 flex">
              <div className="w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 relative min-h-[280px]">
                <img
                  src="/src/assets/images/hero_cloud_hosting_1794934538385.jpg"
                  alt="WebLaunch AI cloud publishing engineering control center"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between text-xs text-slate-200">
                  <span>Edge static routing · Isolated R2 object namespaces</span>
                  <span className="font-mono text-sky-300">/sites/your-site/</span>
                </div>
              </div>
            </div>
          </div>

          {/* Adjacent 4-Column Quantified Proof Strip */}
          <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-4 border-t border-b border-slate-200 dark:border-slate-800 py-7">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{t('metricPublished')}</div>
              <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {stats ? stats.totalWebsites : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{t('metricActive')}</div>
              <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {stats ? stats.activeWebsites : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{t('metricStorage')}</div>
              <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {stats ? formatBytes(stats.totalStorageBytes) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{t('metricDeployTime')}</div>
              <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {stats ? `${stats.avgDurationMs} ms` : '—'}
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities Bento + Technical Visual */}
        <section id="capabilities" className="max-w-7xl mx-auto px-6 py-16">
          <div className="max-w-2xl mb-10">
            <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t('capTitle')}
            </h2>
            <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 mt-2">
              Every upload passes through path traversal sanitization, ZIP bomb limits, MIME type verification, and isolated routing.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-6">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t('cap01Title')}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">{t('cap01Desc')}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-6">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t('cap02Title')}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">{t('cap02Desc')}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-6">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t('cap03Title')}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">{t('cap03Desc')}</p>
              </div>
              <div className="sm:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-6">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t('cap04Title')}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">{t('cap04Desc')}</p>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900 overflow-hidden flex flex-col">
              <div className="flex-1 min-h-[260px]">
                <img
                  src="/src/assets/images/edge_network_visual_1794934538200.jpg"
                  alt="Isolated cloud object storage and edge routing nodes"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-5 bg-white dark:bg-[#0E1525] border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <Layers className="w-4 h-4 text-sky-500" />
                  <span>Cloudflare R2 + D1 Architecture</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Files are stored under immutable version prefixes and served directly with accurate MIME headers and cache control.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Live Hosted Showcase (Real Websites on Server) */}
        {stats && stats.showcaseSites.length > 0 && (
          <section className="max-w-7xl mx-auto px-6 py-12">
            <div className="mb-6">
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                {t('liveShowcaseTitle')}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('liveShowcaseSubtitle')}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stats.showcaseSites.map((site) => (
                <div
                  key={site.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {site.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                      /sites/{site.slug}/ · {site.file_count} files · {formatBytes(site.storage_bytes)}
                    </div>
                  </div>
                  <a
                    href={`/sites/${site.slug}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0"
                  >
                    <span>{t('openLiveSite')}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Usage & Storage Plans */}
        <section id="pricing" className="max-w-7xl mx-auto px-6 py-16">
          <div className="max-w-2xl mb-10">
            <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Storage Quotas & Resource Limits
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              Transparent server-enforced upload limits and account storage allocations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-6 space-y-4">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">For Individual Creators</div>
                <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-white tabular-nums">$0 / mo</div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                <div>100 MB total account quota</div>
                <div>50 MB max ZIP or folder upload</div>
                <div>Up to 250 files per deployment</div>
                <div>Unlimited version rollbacks</div>
              </div>
              <button
                type="button"
                onClick={onOpenPublish}
                className="w-full py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
              >
                {t('ctaPublish')}
              </button>
            </div>

            <div className="rounded-xl border border-sky-500/60 bg-white dark:bg-[#0E1525] p-6 space-y-4">
              <div>
                <div className="text-sm font-semibold text-sky-600 dark:text-sky-400">For Scaling Portfolios</div>
                <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-white tabular-nums">500 MB</div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                <div>500 MB verified publisher quota</div>
                <div>Custom domain DNS verification</div>
                <div>Real-time traffic & visit counts</div>
                <div>Priority abuse & moderation SLAs</div>
              </div>
              <button
                type="button"
                onClick={onOpenDashboard}
                className="w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors"
              >
                {t('ctaExplore')}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-6 space-y-4">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Self-Hosted Cloudflare</div>
                <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-white tabular-nums">Open Source</div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                <div>Deploy on Cloudflare Workers + R2 + D1</div>
                <div>GitHub Actions CI/CD workflow included</div>
                <div>Configurable per-user quotas</div>
                <div>MIT License · Full SQL migrations</div>
              </div>
              <a
                href="#docs"
                className="block text-center w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors"
              >
                Read Deployment Docs
              </a>
            </div>
          </div>
        </section>

        {/* Documentation & FAQ */}
        <section id="docs" className="max-w-4xl mx-auto px-6 py-16">
          <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-8">
            Documentation & Frequently Asked Questions
          </h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-b border-slate-200 dark:border-slate-800">
            {FAQS.map((item, idx) => (
              <div key={item.q} className="py-4">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between gap-4 text-left text-sm md:text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                      openFaq === idx ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openFaq === idx && (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.a}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span className="font-display font-semibold text-slate-900 dark:text-slate-100">{t('brand')}</span>
            <span aria-hidden="true">·</span>
            <span>{t('tagline')}</span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onToggleLang}
              className="hover:text-slate-900 dark:hover:text-slate-200 font-medium"
            >
              {lang === 'en' ? 'বাংলা' : 'English'}
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 font-medium"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 font-medium"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Report Abuse</span>
            </button>
          </div>
        </div>
      </footer>

      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Report Hosted Website</h3>
              <button type="button" onClick={() => setReportOpen(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submitAbuseReport} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Website Slug (from /sites/slug/)
                </label>
                <input
                  type="text"
                  required
                  value={reportSlug}
                  onChange={(e) => setReportSlug(e.target.value)}
                  placeholder="e.g. aurora-studio"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Your Email
                </label>
                <input
                  type="email"
                  required
                  value={reportEmail}
                  onChange={(e) => setReportEmail(e.target.value)}
                  placeholder="reporter@domain.com"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Reason</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  <option>Phishing or deceptive content</option>
                  <option>Malware or malicious script</option>
                  <option>Copyright infringement</option>
                  <option>Other policy violation</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Details</label>
                <textarea
                  rows={3}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              {reportMsg && <div className="text-xs text-emerald-500">{reportMsg}</div>}
              {reportErr && <div className="text-xs text-red-500">{reportErr}</div>}
              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
              >
                Submit Report
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
