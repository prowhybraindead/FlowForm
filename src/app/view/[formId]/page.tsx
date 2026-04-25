import { redirect } from 'next/navigation';

export default async function LegacyViewPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  redirect(`/f/${formId}`);
}
