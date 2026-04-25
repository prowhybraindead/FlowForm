'use client';

import { useParams, useRouter } from 'next/navigation';
import { Editor } from '../../../../components/Editor';

export default function EditorPage() {
  const router = useRouter();
  const params = useParams<{ formId: string }>();
  const formId = params.formId;

  return (
    <Editor
      formId={formId}
      onBack={() => router.push('/dashboard')}
      onPreview={() => router.push(`/form/${formId}/preview`)}
    />
  );
}
