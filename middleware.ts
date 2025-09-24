
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // This will refresh the session if it's expired
  const { data: { session } } = await supabase.auth.getSession(); // Get session data

  // Define protected paths
  const protectedPaths = ['/']; // Protect the home page

  // Check if the current path is protected
  const isProtectedPath = protectedPaths.some(path => request.nextUrl.pathname === path);

  // If trying to access a protected path and not authenticated, redirect to login
  if (isProtectedPath && !session) {
    const redirectUrl = new URL('/auth/login', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // If authenticated, allow access
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api (API routes)
     * - auth (authentication pages)
     * - public (public assets)
     */
    '/((?!_next/static|_next/image|favicon.ico|api|auth|public).*)',
  ],
};
