import type { Metadata } from 'next';
import { ViewForm } from '../../../components/ViewForm';
import { stripRichText } from '../../../lib/richText';

type PageProps = {
  params: Promise<{ formId: string }>;
};

type FormMetaRow = {
  title: string | null;
  description: string | null;
  theme: {
    logo?: string;
    headerImage?: string;
  } | null;
};

const siteTitle = process.env.SITE_META_TITLE?.trim() || 'FlowForm';
const siteDescription = process.env.SITE_META_DESCRIPTION?.trim() || 'Create, share, and analyze forms.';
const siteUrl = process.env.SITE_URL?.trim() || '';
const siteOgImage = process.env.SITE_OG_IMAGE?.trim() || '/logo.png';

function toAbsoluteUrl(value: string): string {
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (!siteUrl) return value;
  try {
    return new URL(value, siteUrl).toString();
  } catch {
    return value;
  }
}

async function getFormMetadataRow(formId: string): Promise<FormMetaRow | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const baseUrl = supabaseUrl.replace(/\/+$/, '');
  const endpoint =
    `${baseUrl}/rest/v1/forms` +
    `?select=title,description,theme` +
    `&id=eq.${encodeURIComponent(formId)}` +
    `&limit=1`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      next: { revalidate: 60 },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as FormMetaRow[];
    return data[0] || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { formId } = await params;
  const row = await getFormMetadataRow(formId);

  const formTitle = stripRichText(row?.title || '') || 'Form';
  const formDescription = stripRichText(row?.description || '') || siteDescription;
  const imageCandidate = row?.theme?.logo || row?.theme?.headerImage || siteOgImage;
  const imageUrl = toAbsoluteUrl(imageCandidate);
  const canonicalUrl = siteUrl ? `${siteUrl.replace(/\/+$/, '')}/f/${formId}` : undefined;

  return {
    title: `${formTitle} | ${siteTitle}`,
    description: formDescription,
    alternates: canonicalUrl ? { canonical: canonicalUrl } : undefined,
    openGraph: {
      title: formTitle,
      description: formDescription,
      type: 'website',
      url: canonicalUrl,
      images: [{ url: imageUrl }],
    },
    twitter: {
      card: 'summary_large_image',
      title: formTitle,
      description: formDescription,
      images: [imageUrl],
    },
  };
}

export default async function PublicFormPage({ params }: PageProps) {
  const { formId } = await params;
  return <ViewForm formId={formId} />;
}
