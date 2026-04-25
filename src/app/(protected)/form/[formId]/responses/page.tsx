'use client';

import { useParams, useRouter } from 'next/navigation';
import { Responses } from '../../../../../components/Responses';

export default function ResponsesPage() {
  const router = useRouter();
  const params = useParams<{ formId: string }>();

  return <Responses formId={params.formId} onBack={() => router.push('/dashboard')} />;
}
