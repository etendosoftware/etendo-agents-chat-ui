import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

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
        {children}
        {/* <Analytics /> */}
      </body>
    </html>
  )
}
