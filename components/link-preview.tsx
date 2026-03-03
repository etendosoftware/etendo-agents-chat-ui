'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLinkPreview } from '@/hooks/use-link-preview';
import { ExternalLink, FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface LinkPreviewProps {
  url: string;
}

export default function LinkPreview({ url }: LinkPreviewProps) {
  const t = useTranslations('chat.linkPreview');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [shouldFetch, setShouldFetch] = useState(false);
  const { data, isLoading } = useLinkPreview(url, { enabled: shouldFetch });
  const [faviconFailed, setFaviconFailed] = useState(false);

  useEffect(() => {
    if (shouldFetch) return;
    const element = rootRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setShouldFetch(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldFetch(true);
          observer.disconnect();
        }
      },
      { rootMargin: '250px 0px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [shouldFetch]);

  const parsedUrl = (() => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  })();

  const domain = parsedUrl?.hostname ?? url;
  const cleanPath = parsedUrl?.pathname
    ? decodeURIComponent(parsedUrl.pathname).replace(/\/$/, '')
    : '';
  const fallbackTitle = cleanPath && cleanPath !== '/' ? cleanPath : domain;
  const title = (data?.title ?? '').trim() || fallbackTitle;
  const description = (data?.description ?? '').trim();
  const faviconUrl = parsedUrl
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsedUrl.hostname)}&sz=64`
    : null;
  const domainInitial = domain.charAt(0).toUpperCase();

  if (!shouldFetch || isLoading) {
    return (
      <div ref={rootRef} className="mt-3" onMouseEnter={() => setShouldFetch(true)} onFocus={() => setShouldFetch(true)}>
        <Card className="w-full max-w-sm border-border/60 bg-background/70 p-3">
          <div className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="w-full space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="mt-3">
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <Card className="w-full max-w-sm border-border/60 bg-background/80 p-3 transition-all hover:border-primary/40 hover:bg-background">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
              {faviconUrl && !faviconFailed ? (
                <img
                  src={faviconUrl}
                  alt={domain}
                  className="h-5 w-5"
                  onError={() => setFaviconFailed(true)}
                />
              ) : (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span className="text-[10px] font-semibold">{domainInitial}</span>
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{domain}</p>
              <h3 className="truncate text-sm font-semibold text-card-foreground">{title}</h3>
              {description ? (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{description}</p>
              ) : cleanPath && cleanPath !== '/' ? (
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{cleanPath}</p>
              ) : null}
            </div>

            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {t('open')}
              <ExternalLink className="h-3 w-3" />
            </span>
          </div>
        </Card>
      </a>
    </div>
  );
}
