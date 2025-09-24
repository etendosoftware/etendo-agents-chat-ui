
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface LinkPreviewData {
  title?: string;
  description?: string;
  image?: string;
}

interface LinkPreviewProps {
  url: string;
}

export default function LinkPreview({ url }: LinkPreviewProps) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchPreview = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
        if (!response.ok) {
          throw new Error('Failed to fetch preview');
        }
        const previewData = await response.json();
        if (isMounted) {
          setData(previewData);
        }
      } catch (error) {
        console.error('Error fetching link preview:', error);
        if (isMounted) {
          setData(null); // Set data to null on error to stop showing skeleton
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchPreview();

    return () => {
      isMounted = false;
    };
  }, [url]);

  if (isLoading) {
    return (
      <div className="mt-3">
        <Card className="w-full max-w-sm p-3 bg-white/10 border-white/20">
          <div className="flex flex-col space-y-3">
            <Skeleton className="h-32 w-full bg-white/20" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-4/5 bg-white/20" />
              <Skeleton className="h-4 w-3/5 bg-white/20" />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!data || !data.title) {
    return null; // Don't render anything if preview fails or there's no title
  }

  const getDomain = (s: string) => {
    try {
      return new URL(s).hostname;
    } catch (e) {
      return s;
    }
  };

  return (
    <div className="mt-3">
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <Card className="w-full max-w-sm overflow-hidden bg-white/5 border-white/10 hover:bg-white/10 transition-colors">
          {data.image && (
            <img src={data.image} alt={data.title || 'Link preview'} className="w-full h-32 object-cover" />
          )}
          <div className="p-3">
            <div className="text-xs text-muted-foreground truncate">{getDomain(url)}</div>
            <h3 className="text-sm font-semibold text-card-foreground">{data.title}</h3>
            {data.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{data.description}</p>
            )}
          </div>
        </Card>
      </a>
    </div>
  );
}
