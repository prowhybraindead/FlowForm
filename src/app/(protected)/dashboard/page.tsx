'use client';

import { useRouter } from 'next/navigation';
import { Dashboard } from '../../../components/Dashboard';

export default function DashboardPage() {
  const router = useRouter();

  return (
    <Dashboard
      onEdit={(formId) => router.push(`/form/${formId}`)}
      onViewResults={(formId) => router.push(`/form/${formId}/responses`)}
    />
  );
}
