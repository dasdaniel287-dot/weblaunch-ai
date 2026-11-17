export type Language = 'en' | 'bn';
export type ThemeMode = 'dark' | 'light';
export type WorkspaceTab = 'overview' | 'publish' | 'websites' | 'domains' | 'admin' | 'profile';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  avatarUrl: string | null;
  quotaBytes: number;
  isGuest: boolean;
  suspended: boolean;
}

export interface StorageUsage {
  totalBytes: number;
  fileCount: number;
  websiteCount: number;
}

export interface Website {
  id: string;
  slug: string;
  user_id: string;
  name: string;
  description: string;
  status: 'active' | 'unpublished' | 'suspended';
  active_version_id: string | null;
  active_version_number?: number;
  storage_bytes: number;
  file_count: number;
  visits_count: number;
  created_at: number;
  updated_at: number;
}

export interface DeploymentVersion {
  id: string;
  website_id: string;
  version_number: number;
  storage_prefix: string;
  file_count: number;
  total_bytes: number;
  entry_file: string;
  commit_note: string;
  created_at: number;
}

export interface WebsiteFileRecord {
  id: string;
  path: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  created_at: number;
}

export interface DeploymentRecord {
  id: string;
  website_id: string;
  website_name?: string;
  slug?: string;
  version_id: string | null;
  version_number?: number | null;
  status: 'pending' | 'verifying' | 'success' | 'failed';
  file_count: number;
  total_bytes: number;
  error_message?: string | null;
  duration_ms: number;
  created_at: number;
}

export interface CustomDomain {
  id: string;
  website_id: string;
  website_name: string;
  website_slug: string;
  domain: string;
  verification_token: string;
  dns_verified: number;
  ssl_status: 'pending' | 'active' | 'failed';
  last_checked_at: number | null;
  last_error: string | null;
  created_at: number;
  verified_at: number | null;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: number;
  created_at: number;
}

export interface AbuseReport {
  id: string;
  website_id: string;
  website_slug: string;
  website_name: string;
  reporter_email: string;
  reason: string;
  details: string;
  status: 'open' | 'resolved' | 'dismissed';
  created_at: number;
  resolved_at: number | null;
}

export interface AuditLog {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  ip_address: string;
  created_at: number;
}

export interface PublicStats {
  totalWebsites: number;
  activeWebsites: number;
  totalStorageBytes: number;
  totalVisits: number;
  totalUsers: number;
  totalDeployments: number;
  failedDeployments: number;
  avgDurationMs: number;
  showcaseSites: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    file_count: number;
    storage_bytes: number;
    visits_count: number;
    updated_at: number;
  }>;
}

export interface StagedFile {
  path: string;
  file: File;
  size: number;
  isAllowed: boolean;
  error?: string;
}
