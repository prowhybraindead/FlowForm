import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../index.css';
import { Toaster } from '../components/ui/sonner';

export const metadata: Metadata = {
  title: 'FlowForm',
  description: 'Create, share, and analyze forms.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
