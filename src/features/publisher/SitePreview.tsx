import {Monitor, ShieldCheck, Smartphone, Tablet} from 'lucide-react';
import React, {useEffect, useState} from 'react';
import type {Language, StagedFile} from '../../types';
import {useT} from '../../i18n/translations';

interface SitePreviewProps {
  files: StagedFile[];
  lang: Language;
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const SitePreview: React.FC<SitePreviewProps> = ({files, lang}) => {
  const t = useT(lang);
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [srcDoc, setSrcDoc] = useState<string>('');
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function buildIsolatedSrcDoc() {
      setPreviewError(null);
      const indexEntry = files.find((f) => f.path.toLowerCase() === 'index.html');
      if (!indexEntry) {
        if (active) setSrcDoc('');
        return;
      }

      try {
        let html = await indexEntry.file.text();
        const fileMap = new Map<string, StagedFile>();
        for (const f of files) {
          fileMap.set(f.path.replace(/^\.\//, ''), f);
        }

        // Inline local CSS <link rel="stylesheet" href="...">
        const linkRegex = /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
        const linkMatches = Array.from(html.matchAll(linkRegex));
        for (const match of linkMatches) {
          const href = match[1].replace(/^\.\//, '').split('?')[0];
          const target = fileMap.get(href);
          if (target) {
            const cssText = await target.file.text();
            html = html.replace(match[0], `<style>\n${cssText}\n</style>`);
          }
        }

        // Inline local JS <script src="..."></script>
        const scriptRegex = /<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
        const scriptMatches = Array.from(html.matchAll(scriptRegex));
        for (const match of scriptMatches) {
          const src = match[1].replace(/^\.\//, '').split('?')[0];
          const target = fileMap.get(src);
          if (target) {
            const jsText = await target.file.text();
            html = html.replace(match[0], `<script>\n${jsText}\n</script>`);
          }
        }

        // Inline local <img src="..."> as data URLs for isolated sandbox rendering
        const imgRegex = /(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi;
        const imgMatches = Array.from(html.matchAll(imgRegex));
        for (const match of imgMatches) {
          const src = match[2].replace(/^\.\//, '').split('?')[0];
          const target = fileMap.get(src);
          if (target) {
            const dataUrl = await fileToDataUrl(target.file);
            html = html.replace(match[0], `${match[1]}${dataUrl}${match[3]}`);
          }
        }

        if (active) setSrcDoc(html);
      } catch {
        if (active) setPreviewError('Unable to assemble sandbox preview for staged files.');
      }
    }

    buildIsolatedSrcDoc();
    return () => {
      active = false;
    };
  }, [files]);

  const widthClass =
    viewport === 'desktop' ? 'w-full' : viewport === 'tablet' ? 'w-[768px] max-w-full' : 'w-[375px] max-w-full';

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1525] overflow-hidden flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="font-medium">Sandboxed Preview</span>
          <span className="text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="text-slate-500 dark:text-slate-400">Origin-isolated iframe</span>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setViewport('desktop')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              viewport === 'desktop'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>{t('previewDesktop')}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewport('tablet')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              viewport === 'tablet'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Tablet className="w-3.5 h-3.5" />
            <span>{t('previewTablet')}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewport('mobile')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              viewport === 'mobile'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>{t('previewMobile')}</span>
          </button>
        </div>
      </div>

      <div className="p-4 bg-slate-100 dark:bg-[#070B14] min-h-[420px] flex justify-center overflow-x-auto">
        {previewError ? (
          <div className="flex items-center justify-center text-sm text-red-500">{previewError}</div>
        ) : srcDoc ? (
          <iframe
            title="Sandboxed Website Preview"
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            className={`${widthClass} h-[420px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white transition-all duration-200`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-center max-w-sm text-sm text-slate-500 dark:text-slate-400">
            <p>{t('noFilesYet')}</p>
          </div>
        )}
      </div>
    </div>
  );
};
