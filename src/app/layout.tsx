import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Noto_Sans, Noto_Serif } from 'next/font/google';
import '../index.css';
import { Toaster } from '../components/ui/sonner';

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
  title: 'FlowForm',
  description: 'Create, share, and analyze forms.',
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
