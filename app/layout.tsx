import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'Etendo Agents',
  description: 'Interact with and manage your Etendo AI agents.',
  openGraph: {
    title: 'Etendo Agents',
    description: 'Interact with and manage your Etendo AI agents.',
    siteName: 'Etendo Agents',
    images: [
      {
        url: '/logo-etendo.png',
        width: 1200,
        height: 630,
        alt: 'Etendo Agents Logo',
      },
    ],
    locale: 'en_US',
    type: 'website',
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', {
                  anonymize_ip: true,
                });
              `}
            </Script>
          </>
        )}
        {children}
        {/* <Analytics /> */}
      </body>
    </html>
  )
}
