import {
  Bell,
  Globe,
  HardDrive,
  Home,
  LayoutDashboard,
  Menu,
  Moon,
  Rocket,
  Search,
  Shield,
  Sun,
  User as UserIcon,
  X,
} from 'lucide-react';
import {useCallback, useEffect, useState} from 'react';
import {AdminConsole} from './features/admin/AdminConsole';
import {AuthModal} from './features/auth/AuthModal';
import {ProfileView} from './features/auth/ProfileView';
import {DashboardOverview} from './features/dashboard/DashboardOverview';
import {DomainsManager} from './features/domains/DomainsManager';
import {PublishStudio} from './features/uploader/PublishStudio';
import {MyWebsites} from './features/websites/MyWebsites';
import {useT} from './i18n/translations';
import {LandingPage} from './pages/LandingPage';
import {api} from './services/api';
import type {
  AuthUser,
  DeploymentRecord,
  Language,
  NotificationItem,
  PublicStats,
  StorageUsage,
  ThemeMode,
  Website,
  WorkspaceTab,
} from './types';
import {formatDateTime} from './utils/format';

export default function App() {
  const [viewMode, setViewMode] = useState<'landing' | 'workspace'>('landing');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [lang, setLang] = useState<Language>('en');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [usage, setUsage] = useState<StorageUsage | undefined>(undefined);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [publicStats, setPublicStats] = useState<PublicStats | null>(null);
  const [dashboardMetrics, setDashboardMetrics] = useState<{
    totalWebsites: number;
    activeWebsites: number;
    totalUsers: number;
    totalStorageBytes: number;
    failedDeployments: number;
    totalVisits: number;
  } | null>(null);
  const [recentDeployments, setRecentDeployments] = useState<DeploymentRecord[]>([]);
  const [myWebsites, setMyWebsites] = useState<Website[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string | null>(null);
  const [republishTarget, setRepublishTarget] = useState<Website | null>(null);

  const t = useT(lang);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const refreshAll = useCallback(async () => {
    try {
      const [statsRes, meRes, dashRes] = await Promise.all([
        api.getPublicStats(),
        api.getMe(),
        api.getDashboard(),
      ]);
      setPublicStats(statsRes);
      setUser(meRes.user);
      setUsage(meRes.usage);
      setNotifications(meRes.notifications || []);
      setGoogleConfigured(meRes.googleConfigured);
      setDashboardMetrics(dashRes.metrics);
      setRecentDeployments(dashRes.recentDeployments);
      setMyWebsites(dashRes.myWebsites);
    } catch {
      // handled silently on background refresh
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const openWorkspace = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    setViewMode('workspace');
    setMobileMenuOpen(false);
  };

  const handleMarkNotificationsRead = async () => {
    if (!user) return;
    await api.markNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({...n, is_read: 1})));
  };

  const handleSignOut = async () => {
    await api.logout();
    setUser(null);
    setUsage(undefined);
    setNotifications([]);
    setMyWebsites([]);
    await refreshAll();
  };

  if (viewMode === 'landing') {
    return (
      <>
        <LandingPage
          lang={lang}
          theme={theme}
          stats={publicStats}
          onToggleLang={() => setLang((l) => (l === 'en' ? 'bn' : 'en'))}
          onToggleTheme={() => setTheme((m) => (m === 'dark' ? 'light' : 'dark'))}
          onOpenPublish={() => openWorkspace('publish')}
          onOpenDashboard={() => openWorkspace('overview')}
        />
        <AuthModal
          open={authModalOpen}
          googleConfigured={googleConfigured}
          onClose={() => setAuthModalOpen(false)}
          onAuthenticated={() => refreshAll()}
        />
      </>
    );
  }

  const navItems: Array<{id: WorkspaceTab; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean}> = [
    {id: 'overview', label: t('sidebarOverview'), icon: LayoutDashboard},
    {id: 'publish', label: t('sidebarPublish'), icon: Rocket},
    {id: 'websites', label: t('sidebarWebsites'), icon: HardDrive},
    {id: 'domains', label: t('sidebarDomains'), icon: Globe},
    {id: 'profile', label: t('sidebarProfile'), icon: UserIcon},
    ...(user?.role === 'admin' ? [{id: 'admin' as const, label: t('sidebarAdmin'), icon: Shield}] : []),
  ];

  const currentBreadcrumb = navItems.find((i) => i.id === activeTab)?.label || t('navDashboard');

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 dark:bg-[#070B14] dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B111E] shrink-0">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewMode('landing')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap"
          >
            {t('brand')}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openWorkspace(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
          <button
            type="button"
            onClick={() => setViewMode('landing')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
          >
            <Home className="w-4 h-4 shrink-0" />
            <span>{t('sidebarLanding')}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative w-64 max-w-[80vw] bg-white dark:bg-[#0B111E] border-r border-slate-200 dark:border-slate-800 flex flex-col z-10">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="font-display text-lg font-bold">{t('brand')}</span>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openWorkspace(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      active
                        ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Workspace Header */}
        <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0B111E]/90 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              <span>{t('brand')}</span>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{currentBreadcrumb}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Search Input */}
            <div className="relative hidden md:block w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Language Switch */}
            <button
              type="button"
              onClick={() => setLang((l) => (l === 'en' ? 'bn' : 'en'))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              {lang === 'en' ? 'বাংলা' : 'EN'}
            </button>

            {/* Theme Switch */}
            <button
              type="button"
              onClick={() => setTheme((m) => (m === 'dark' ? 'light' : 'dark'))}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Toggle color theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notifications Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 relative"
                aria-label={t('notifications')}
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-sky-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] shadow-xl p-4 z-40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {t('notifications')}
                    </span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkNotificationsRead}
                        className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        {t('markAllRead')}
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('noNotifications')}</p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
                      {notifications.map((n) => (
                        <div key={n.id} className="py-2.5 text-xs">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{n.title}</div>
                          <div className="text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</div>
                          <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                            {formatDateTime(n.created_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* User Auth Button / Profile Trigger */}
            {user && !user.isGuest ? (
              <button
                type="button"
                onClick={() => openWorkspace('profile')}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium whitespace-nowrap"
              >
                <span className="max-w-[110px] truncate">{user.name}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                {t('signIn')}
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'overview' && (
            <DashboardOverview
              lang={lang}
              user={user}
              usage={usage}
              metrics={dashboardMetrics}
              recentDeployments={recentDeployments}
              myWebsites={myWebsites}
              searchQuery={searchQuery}
              onQuickPublish={() => {
                setRepublishTarget(null);
                openWorkspace('publish');
              }}
              onSelectWebsite={(site) => {
                setSelectedWebsiteId(site.id);
                openWorkspace('websites');
              }}
            />
          )}

          {activeTab === 'publish' && (
            <PublishStudio
              lang={lang}
              targetWebsite={republishTarget}
              onCancelTarget={() => setRepublishTarget(null)}
              onPublished={() => {
                setRepublishTarget(null);
                refreshAll();
              }}
            />
          )}

          {activeTab === 'websites' && (
            <MyWebsites
              lang={lang}
              websites={myWebsites}
              searchQuery={searchQuery}
              initialSelectedId={selectedWebsiteId}
              onRefresh={refreshAll}
              onPublishNew={() => {
                setRepublishTarget(null);
                openWorkspace('publish');
              }}
              onRepublishWebsite={(site) => {
                setRepublishTarget(site);
                openWorkspace('publish');
              }}
            />
          )}

          {activeTab === 'domains' && (
            <DomainsManager
              lang={lang}
              websites={myWebsites}
              isAuthenticated={Boolean(user)}
              onRequireAuth={() => setAuthModalOpen(true)}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileView
              user={user}
              usage={usage}
              onUpdated={(updated) => setUser(updated)}
              onSignIn={() => setAuthModalOpen(true)}
              onSignOut={handleSignOut}
            />
          )}

          {activeTab === 'admin' && <AdminConsole currentUser={user} />}
        </main>
      </div>

      <AuthModal
        open={authModalOpen}
        googleConfigured={googleConfigured}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={() => refreshAll()}
      />
    </div>
  );
}
