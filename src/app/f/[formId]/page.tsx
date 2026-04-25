'use client';

import { useParams } from 'next/navigation';
import { ViewForm } from '../../../components/ViewForm';

export default function PublicFormPage() {
  const params = useParams<{ formId: string }>();
  return <ViewForm formId={params.formId} />;
}
