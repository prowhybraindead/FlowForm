import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const baseUrl = process.env.TEMP_STORAGE_SERVER_URL?.trim();
  const token = process.env.TEMP_STORAGE_SERVER_TOKEN?.trim();

  if (!baseUrl) {
    return NextResponse.json(
      { error: 'Temporary storage server is not configured.' },
      { status: 503 }
    );
  }

  const form = await request.formData();
  const file = form.get('file');
  const formId = form.get('formId');
  const uploaderId = form.get('uploaderId');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file field.' }, { status: 400 });
  }

  const upstreamForm = new FormData();
  upstreamForm.append('file', file, file.name);
  if (typeof formId === 'string' && formId.trim()) {
    upstreamForm.append('form_id', formId.trim());
  }
  if (typeof uploaderId === 'string' && uploaderId.trim()) {
    upstreamForm.append('uploader_id', uploaderId.trim());
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const upstreamResponse = await fetch(`${baseUrl.replace(/\/$/, '')}/upload`, {
      method: 'POST',
      headers,
      body: upstreamForm,
      cache: 'no-store',
    });

    const payload = await upstreamResponse.json().catch(() => ({}));
    return NextResponse.json(payload, { status: upstreamResponse.status });
  } catch (error) {
    console.error('Temp storage upload failed:', error);
    return NextResponse.json({ error: 'Temp storage upload failed.' }, { status: 502 });
  }
}
