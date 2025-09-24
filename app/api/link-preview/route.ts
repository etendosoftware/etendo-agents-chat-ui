
import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  console.log(`Fetching preview for URL: ${url}`);

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
      console.log(`Skipping preview for non-HTML content type: ${contentType}`);
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

    console.log('Extracted metadata:', { title, description, image });

    return NextResponse.json({
      title,
      description,
      image,
    });
  } catch (error: any) {
    console.error(`Error fetching link preview for ${url}:`, error.name, error.message);
    return NextResponse.json({ error: 'Failed to fetch link preview', details: error.message }, { status: 500 });
  }
}
