import type {
  AbuseReport,
  AuditLog,
  AuthUser,
  CustomDomain,
  DeploymentRecord,
  DeploymentVersion,
  NotificationItem,
  PublicStats,
  StorageUsage,
  Website,
  WebsiteFileRecord,
} from '../types';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getPublicStats: () => requestJson<PublicStats>('/api/stats/public'),

  getMe: () =>
    requestJson<{
      user: AuthUser | null;
      usage?: StorageUsage;
      notifications?: NotificationItem[];
      googleConfigured: boolean;
    }>('/api/auth/me'),

  login: (email: string, password: string) =>
    requestJson<{user: AuthUser}>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({email, password}),
    }),

  register: (name: string, email: string, password: string) =>
    requestJson<{user: AuthUser}>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({name, email, password}),
    }),

  logout: () => requestJson<{ok: boolean}>('/api/auth/logout', {method: 'POST'}),

  updateProfile: (name: string) =>
    requestJson<{user: AuthUser}>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({name}),
    }),

  requestPasswordReset: (email: string) =>
    requestJson<{message: string; previewResetCode?: string}>('/api/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({email}),
    }),

  confirmPasswordReset: (email: string, token: string, newPassword: string) =>
    requestJson<{ok: boolean; message: string}>('/api/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({email, token, newPassword}),
    }),

  markNotificationsRead: () => requestJson<{ok: boolean}>('/api/auth/notifications/read', {method: 'POST'}),

  getDashboard: () =>
    requestJson<{
      metrics: {
        totalWebsites: number;
        activeWebsites: number;
        totalUsers: number;
        totalStorageBytes: number;
        failedDeployments: number;
        totalVisits: number;
      };
      recentDeployments: DeploymentRecord[];
      myWebsites: Website[];
    }>('/api/dashboard'),

  getWebsites: () => requestJson<{websites: Website[]}>('/api/websites'),

  getWebsiteDetails: (id: string) =>
    requestJson<{
      website: Website;
      versions: DeploymentVersion[];
      files: WebsiteFileRecord[];
      deployments: DeploymentRecord[];
    }>(`/api/websites/${id}`),

  updateWebsite: (id: string, payload: {status?: 'active' | 'unpublished'; name?: string; description?: string}) =>
    requestJson<{website: Website}>(`/api/websites/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  rollbackWebsite: (id: string, versionId: string) =>
    requestJson<{ok: boolean; versionNumber: number; slug: string}>(`/api/websites/${id}/rollback`, {
      method: 'POST',
      body: JSON.stringify({versionId}),
    }),

  deleteWebsite: (id: string) => requestJson<{ok: boolean}>(`/api/websites/${id}`, {method: 'DELETE'}),

  publishFormData: (formData: FormData, onProgress: (pct: number) => void) =>
    new Promise<{
      success: boolean;
      deployment: {
        websiteId: string;
        slug: string;
        versionId: string;
        versionNumber: number;
        deploymentId: string;
        publicPath: string;
        fileCount: number;
        totalBytes: number;
        durationMs: number;
      };
    }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/publish');
      xhr.withCredentials = true;

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          onProgress(Math.min(95, Math.round((ev.loaded / ev.total) * 100)));
        }
      };

      xhr.onload = () => {
        onProgress(100);
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            reject(new Error(data.error || `Publish failed (${xhr.status})`));
          }
        } catch {
          reject(new Error('Invalid server response during publish.'));
        }
      };

      xhr.onerror = () => reject(new Error('Network error while uploading website files.'));
      xhr.send(formData);
    }),

  getDomains: () => requestJson<{domains: CustomDomain[]}>('/api/domains'),

  createDomain: (websiteId: string, domain: string) =>
    requestJson<{domain: CustomDomain}>('/api/domains', {
      method: 'POST',
      body: JSON.stringify({websiteId, domain}),
    }),

  verifyDomain: (id: string) =>
    requestJson<{verified: boolean; message: string; domain: CustomDomain}>(`/api/domains/${id}/verify`, {
      method: 'POST',
    }),

  deleteDomain: (id: string) => requestJson<{ok: boolean}>(`/api/domains/${id}`, {method: 'DELETE'}),

  submitReport: (payload: {slug?: string; websiteId?: string; reporterEmail?: string; reason: string; details?: string}) =>
    requestJson<{ok: boolean; reportId: string}>('/api/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAdminOverview: () =>
    requestJson<{
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
    }>('/api/admin/overview'),

  adminUpdateUser: (id: string, payload: {suspended?: boolean; role?: 'user' | 'admin'}) =>
    requestJson<{ok: boolean}>(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  adminUpdateWebsiteStatus: (id: string, status: 'active' | 'suspended' | 'unpublished') =>
    requestJson<{ok: boolean}>(`/api/admin/websites/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({status}),
    }),

  adminDeleteWebsite: (id: string) => requestJson<{ok: boolean}>(`/api/admin/websites/${id}`, {method: 'DELETE'}),

  adminUpdateReport: (id: string, status: 'open' | 'resolved' | 'dismissed') =>
    requestJson<{ok: boolean}>(`/api/admin/reports/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({status}),
    }),
};
