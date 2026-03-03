
import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

function isUrlSafe(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);

    // Only allow http and https schemes
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost and common metadata endpoints
    const blockedHostnames = ['localhost', 'metadata.google.internal', 'metadata.google'];
    if (blockedHostnames.includes(hostname)) {
      return false;
    }

    // Block private/reserved IP ranges
    const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipMatch) {
      const [, a, b, c] = ipMatch.map(Number);
      if (
        a === 127 ||                              // 127.x.x.x (loopback)
        a === 10 ||                               // 10.x.x.x (private)
        (a === 172 && b >= 16 && b <= 31) ||      // 172.16-31.x.x (private)
        (a === 192 && b === 168) ||               // 192.168.x.x (private)
        a === 0 ||                                // 0.x.x.x
        (a === 169 && b === 254)                  // 169.254.x.x (link-local)
      ) {
        return false;
      }
    }

    // Block IPv6 loopback (::1) and private ranges
    if (hostname === '[::1]' || hostname.startsWith('[fc') || hostname.startsWith('[fd')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  if (!isUrlSafe(url)) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(5000), // Abort fetch after 5 seconds
    });

    if (!response.ok) {
      console.error(`Failed to fetch the URL: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Failed to fetch the URL: ${response.statusText}` }, { status: response.status });
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('text/html')) {
      return NextResponse.json({ title: url, description: 'Link to a non-HTML resource.', image: null });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const getMetaTag = (name: string) => {
      return (
        $(`meta[property="og:${name}"]`).attr('content') ||
        $(`meta[name="${name}"]`).attr('content') ||
        $(`meta[property="twitter:${name}"]`).attr('content')
      );
    };

    const title = getMetaTag('title') || $('title').first().text() || url;
    const description = getMetaTag('description');
    const image = getMetaTag('image');

    return NextResponse.json(
      { title, description, image },
      {
        headers: {
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
      },
    );
  } catch (error: any) {
    console.error(`Error fetching link preview for ${url}:`, error.name, error.message);
    return NextResponse.json({ error: 'Failed to fetch link preview', details: error.message }, { status: 500 });
  }
}
