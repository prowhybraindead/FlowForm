import type { ReactNode } from 'react';
import { AuthWrapper } from '../../components/AuthWrapper';

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <AuthWrapper>{children}</AuthWrapper>;
}
