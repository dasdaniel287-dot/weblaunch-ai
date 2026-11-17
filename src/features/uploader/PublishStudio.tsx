import {
  AlertCircle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  FileArchive,
  FileCode2,
  FolderOpen,
  Rocket,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import React, {useMemo, useRef, useState} from 'react';
import {useT} from '../../i18n/translations';
import {api} from '../../services/api';
import type {Language, StagedFile, Website} from '../../types';
import {formatBytes, getPublicSiteUrl} from '../../utils/format';
import {SitePreview} from '../publisher/SitePreview';

interface PublishStudioProps {
  lang: Language;
  targetWebsite?: Website | null;
  onCancelTarget?: () => void;
  onPublished: (result: {websiteId: string; slug: string; publicPath: string}) => void;
}

const ALLOWED_EXTS = new Set([
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.txt',
  '.xml',
  '.webmanifest',
  '.map',
  '.md',
]);

function checkFileAllowed(name: string): {allowed: boolean; error?: string} {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return {allowed: false, error: 'Missing file extension'};
  const ext = name.slice(idx).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    return {allowed: false, error: `Unsupported type ${ext}`};
  }
  return {allowed: true};
}

export const PublishStudio: React.FC<PublishStudioProps> = ({
  lang,
  targetWebsite,
  onCancelTarget,
  onPublished,
}) => {
  const t = useT(lang);
  const [siteName, setSiteName] = useState(targetWebsite?.name || '');
  const [commitNote, setCommitNote] = useState(targetWebsite ? 'Updated website files' : 'Initial release');
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [publishedInfo, setPublishedInfo] = useState<{
    websiteId: string;
    slug: string;
    publicPath: string;
    versionNumber: number;
    fileCount: number;
    totalBytes: number;
    durationMs: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [inlineHtml, setInlineHtml] = useState(
    `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>My WebLaunch Site</title>\n  <style>\n    body { font-family: system-ui, sans-serif; margin: 0; padding: 64px 24px; background: #0b1120; color: #f8fafc; }\n    main { max-width: 680px; margin: 0 auto; }\n    h1 { font-size: 2.5rem; margin-bottom: 12px; }\n    p { color: #94a3b8; line-height: 1.6; }\n    .btn { display: inline-block; margin-top: 20px; padding: 12px 20px; background: #0284c7; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; }\n  </style>\n</head>\n<body>\n  <main>\n    <h1>Live on WebLaunch AI</h1>\n    <p>Published directly from the browser in one click.</p>\n    <a class="btn" href="#about">Learn More</a>\n  </main>\n</body>\n</html>`,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const addFileList = (list: FileList | File[]) => {
    setError(null);
    setPublishedInfo(null);
    const incoming = Array.from(list);
    if (incoming.length === 0) return;

    if (incoming.length === 1 && incoming[0].name.toLowerCase().endsWith('.zip')) {
      setZipFile(incoming[0]);
      setStagedFiles([]);
      if (!siteName) {
        setSiteName(incoming[0].name.replace(/\.zip$/i, ''));
      }
      return;
    }

    setZipFile(null);
    const nonZip = incoming.filter((f) => !f.name.toLowerCase().endsWith('.zip'));
    if (nonZip.length === 0) return;

    // Preserve folder relative paths if selected via folder input
    const rawItems = nonZip.map((f) => {
      const rel = (f as File & {webkitRelativePath?: string}).webkitRelativePath || f.name;
      return {rel: rel.replace(/\\/g, '/').replace(/^\/+/, ''), file: f};
    });

    // Strip single common root folder prefix if folder upload
    const firstSegments = new Set(rawItems.map((i) => i.rel.split('/')[0]));
    const shouldStripRoot =
      rawItems.every((i) => i.rel.includes('/')) &&
      firstSegments.size === 1 &&
      !rawItems.some((i) => i.rel.toLowerCase() === 'index.html');
    const rootPrefix = shouldStripRoot ? `${Array.from(firstSegments)[0]}/` : '';

    setStagedFiles((prev) => {
      const map = new Map<string, StagedFile>();
      for (const existing of prev) {
        map.set(existing.path, existing);
      }
      for (const item of rawItems) {
        const cleanPath = rootPrefix ? item.rel.slice(rootPrefix.length) : item.rel;
        if (!cleanPath || cleanPath.startsWith('__MACOSX/') || cleanPath.endsWith('.DS_Store')) continue;
        const check = checkFileAllowed(cleanPath);
        map.set(cleanPath, {
          path: cleanPath,
          file: item.file,
          size: item.file.size,
          isAllowed: check.allowed,
          error: check.error,
        });
      }
      return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
    });

    if (!siteName) {
      const folderHint = rawItems[0]?.rel.split('/')[0];
      setSiteName(folderHint && folderHint !== 'index.html' ? folderHint : 'My Static Website');
    }
  };

  const loadStarterTemplate = () => {
    setError(null);
    setZipFile(null);
    setPublishedInfo(null);
    if (!siteName) setSiteName('Portfolio Starter');

    const htmlFile = new File(
      [
        `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Portfolio Starter — WebLaunch AI</title>
  <link rel="stylesheet" href="assets/style.css" />
</head>
<body>
  <main class="container">
    <header class="nav">
      <strong>Studio K</strong>
      <a href="#projects">Projects</a>
    </header>
    <section class="hero">
      <h1>Independent Product &amp; Systems Designer</h1>
      <p>Crafting fast, resilient web interfaces and developer tools.</p>
    </section>
    <section id="projects" class="cards">
      <div class="card"><h2>01. Telemetry Console</h2><p>Real-time infrastructure monitoring dashboard.</p></div>
      <div class="card"><h2>02. Static Edge Kit</h2><p>Zero-dependency static site generator.</p></div>
    </section>
  </main>
  <script src="assets/main.js"></script>
</body>
</html>`,
      ],
      'index.html',
      {type: 'text/html'},
    );

    const cssFile = new File(
      [
        `body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #070b14; color: #f1f5f9; }
.container { max-width: 840px; margin: 0 auto; padding: 40px 24px; }
.nav { display: flex; justify-content: space-between; padding-bottom: 24px; border-bottom: 1px solid #1e293b; }
.nav a { color: #38bdf8; text-decoration: none; font-size: 14px; }
.hero { padding: 64px 0 40px; }
h1 { font-size: 40px; line-height: 1.15; margin: 0 0 12px; }
.hero p { color: #94a3b8; font-size: 17px; margin: 0; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.card { border: 1px solid #1e293b; background: #0e1525; padding: 20px; border-radius: 10px; }
.card h2 { font-size: 16px; margin: 0 0 6px; }
.card p { font-size: 14px; color: #94a3b8; margin: 0; }`,
      ],
      'style.css',
      {type: 'text/css'},
    );

    const jsFile = new File([`console.log('Starter template live');`], 'main.js', {type: 'application/javascript'});

    setStagedFiles([
      {path: 'index.html', file: htmlFile, size: htmlFile.size, isAllowed: true},
      {path: 'assets/style.css', file: cssFile, size: cssFile.size, isAllowed: true},
      {path: 'assets/main.js', file: jsFile, size: jsFile.size, isAllowed: true},
    ]);
  };

  const applyInlineHtml = () => {
    setError(null);
    setZipFile(null);
    const file = new File([inlineHtml], 'index.html', {type: 'text/html'});
    setStagedFiles((prev) => {
      const rest = prev.filter((f) => f.path.toLowerCase() !== 'index.html');
      return [{path: 'index.html', file, size: file.size, isAllowed: true}, ...rest];
    });
    if (!siteName) setSiteName('Custom HTML Site');
    setShowEditor(false);
  };

  const validation = useMemo(() => {
    if (zipFile) {
      return {
        ready: zipFile.size <= 50 * 1024 * 1024,
        hasIndex: true,
        totalBytes: zipFile.size,
        invalidCount: 0,
        message: zipFile.size > 50 * 1024 * 1024 ? 'ZIP archive exceeds 50 MB limit.' : null,
      };
    }
    const hasIndex = stagedFiles.some((f) => f.path.toLowerCase() === 'index.html');
    const invalidCount = stagedFiles.filter((f) => !f.isAllowed).length;
    const totalBytes = stagedFiles.reduce((sum, f) => sum + f.size, 0);
    let message: string | null = null;
    if (stagedFiles.length > 0 && !hasIndex) {
      message = 'Missing required entry file "index.html" at root level.';
    } else if (invalidCount > 0) {
      message = `${invalidCount} file(s) have unsupported extensions and must be removed.`;
    } else if (totalBytes > 50 * 1024 * 1024) {
      message = 'Total upload exceeds 50 MB limit.';
    }
    return {
      ready: stagedFiles.length > 0 && hasIndex && invalidCount === 0 && totalBytes <= 50 * 1024 * 1024,
      hasIndex,
      totalBytes,
      invalidCount,
      message,
    };
  }, [stagedFiles, zipFile]);

  const handlePublish = async () => {
    setError(null);
    setPublishedInfo(null);
    if (!validation.ready) {
      setError(validation.message || 'Please stage valid website files with index.html or a ZIP archive.');
      return;
    }

    const formData = new FormData();
    formData.append('name', siteName.trim() || 'My Published Website');
    formData.append('commitNote', commitNote.trim() || 'Release');
    if (targetWebsite?.id) {
      formData.append('websiteId', targetWebsite.id);
    }

    if (zipFile) {
      formData.append('file', zipFile, zipFile.name);
    } else {
      const paths = stagedFiles.map((f) => f.path);
      formData.append('paths', JSON.stringify(paths));
      for (const item of stagedFiles) {
        formData.append('files', item.file, item.path);
      }
    }

    setUploading(true);
    setProgress(5);
    try {
      const res = await api.publishFormData(formData, (pct) => setProgress(pct));
      setPublishedInfo(res.deployment);
      onPublished(res.deployment);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publishing failed.');
    } finally {
      setUploading(false);
    }
  };

  const copyLiveUrl = () => {
    if (!publishedInfo) return;
    navigator.clipboard.writeText(getPublicSiteUrl(publishedInfo.slug));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-6">
      {targetWebsite && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50 dark:bg-sky-950/30 px-4 py-3 text-sm">
          <div>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Deploying new version for {targetWebsite.name}
            </span>
            <span className="ml-2 font-mono text-xs text-slate-500 dark:text-slate-400">
              /sites/{targetWebsite.slug}/
            </span>
          </div>
          {onCancelTarget && (
            <button
              type="button"
              onClick={onCancelTarget}
              className="text-xs font-medium text-sky-700 dark:text-sky-300 hover:underline whitespace-nowrap"
            >
              Switch to New Website
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Upload & Validation */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('siteNameLabel')}
              </label>
              <input
                type="text"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="e.g. Studio Portfolio"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('siteNoteLabel')}
              </label>
              <input
                type="text"
                value={commitNote}
                onChange={(e) => setCommitNote(e.target.value)}
                placeholder="Initial live release"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Drag and Drop Area */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files?.length) {
                  addFileList(e.dataTransfer.files);
                }
              }}
              className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                dragging
                  ? 'border-sky-500 bg-sky-500/10'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40'
              }`}
            >
              <UploadCloud className="w-8 h-8 text-sky-500 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('uploadDropTitle')}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{t('uploadDropHint')}</p>

              <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                >
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span>{t('browseFiles')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{t('browseFolder')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => zipInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                >
                  <FileArchive className="w-3.5 h-3.5" />
                  <span>{t('browseZip')}</span>
                </button>
              </div>

              <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={loadStarterTemplate}
                  className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap"
                >
                  {t('loadStarter')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditor((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 whitespace-nowrap"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Write index.html</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFileList(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                // @ts-expect-error webkitdirectory is standard in modern browsers
                webkitdirectory=""
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFileList(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFileList(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {showEditor && (
              <div className="space-y-2 pt-2">
                <textarea
                  value={inlineHtml}
                  onChange={(e) => setInlineHtml(e.target.value)}
                  rows={8}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button
                  type="button"
                  onClick={applyInlineHtml}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
                >
                  Stage index.html
                </button>
              </div>
            )}

            {/* Staged files or ZIP summary */}
            {zipFile && (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-3 py-2.5 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <FileArchive className="w-4 h-4 text-sky-500 shrink-0" />
                  <span className="font-mono truncate text-slate-900 dark:text-slate-100">{zipFile.name}</span>
                  <span className="text-slate-500 tabular-nums shrink-0">{formatBytes(zipFile.size)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setZipFile(null)}
                  className="p-1 text-slate-400 hover:text-red-500"
                  aria-label="Remove ZIP"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}

            {stagedFiles.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    {stagedFiles.length} file(s) · <span className="tabular-nums">{formatBytes(validation.totalBytes)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setStagedFiles([])}
                    className="text-red-500 hover:underline font-medium"
                  >
                    Clear all
                  </button>
                </div>
                <div className="max-h-52 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                  {stagedFiles.map((item) => (
                    <div
                      key={item.path}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-white dark:bg-slate-900/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-mono truncate text-slate-800 dark:text-slate-200">{item.path}</div>
                        {!item.isAllowed && <div className="text-red-500 mt-0.5">{item.error}</div>}
                      </div>
                      <span className="text-slate-500 tabular-nums shrink-0">{formatBytes(item.size)}</span>
                      <button
                        type="button"
                        onClick={() => setStagedFiles((prev) => prev.filter((f) => f.path !== item.path))}
                        className="p-1 text-slate-400 hover:text-red-500 shrink-0"
                        aria-label={`Remove ${item.path}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(validation.message || error) && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error || validation.message}</span>
              </div>
            )}

            {uploading && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                  <span>Uploading & verifying deployment...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-sky-500 transition-all duration-150"
                    style={{width: `${progress}%`}}
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={uploading || (!zipFile && stagedFiles.length === 0) || !validation.ready}
              onClick={handlePublish}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-semibold transition-colors whitespace-nowrap"
            >
              <Rocket className="w-4 h-4" />
              <span>{uploading ? t('publishing') : t('publishNow')}</span>
            </button>
          </div>

          {publishedInfo && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 p-5 space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-sm font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Website Live (v{publishedInfo.versionNumber})</span>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                {publishedInfo.fileCount} files verified · {formatBytes(publishedInfo.totalBytes)} · {publishedInfo.durationMs} ms
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 px-3 py-2">
                <span className="font-mono text-xs text-slate-800 dark:text-slate-200 truncate flex-1">
                  {getPublicSiteUrl(publishedInfo.slug)}
                </span>
                <button
                  type="button"
                  onClick={copyLiveUrl}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? t('copied') : t('copyUrl')}</span>
                </button>
              </div>
              <a
                href={publishedInfo.publicPath}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"
              >
                <span>{t('openLiveSite')}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>

        {/* Right: Sandboxed Live Preview */}
        <div className="lg:col-span-7">
          <SitePreview files={stagedFiles} lang={lang} />
        </div>
      </div>
    </div>
  );
};
