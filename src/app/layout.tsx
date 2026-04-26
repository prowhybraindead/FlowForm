import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Noto_Sans, Noto_Serif } from 'next/font/google';
import '../index.css';
import { Toaster } from '../components/ui/sonner';

const siteTitle = process.env.SITE_META_TITLE?.trim() || 'FlowForm';
const siteDescription =
  process.env.SITE_META_DESCRIPTION?.trim() || 'Create, share, and analyze forms.';
const siteUrl = process.env.SITE_URL?.trim() || undefined;
const siteOgImage = process.env.SITE_OG_IMAGE?.trim() || '/logo.png';

const notoSans = Noto_Sans({
  variable: '--font-noto-sans',
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'Arial', 'sans-serif'],
});

const notoSerif = Noto_Serif({
  variable: '--font-noto-serif',
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    type: 'website',
    url: siteUrl,
    images: [{ url: siteOgImage }],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: [siteOgImage],
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/logo.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${notoSans.variable} ${notoSerif.variable} antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
