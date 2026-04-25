import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const baseUrl = process.env.TEMP_STORAGE_SERVER_URL?.trim();
  const token = process.env.TEMP_STORAGE_SERVER_TOKEN?.trim();

  if (!baseUrl) {
    return NextResponse.json({ ok: true, skipped: 'TEMP_STORAGE_SERVER_URL not configured' });
  }

  const payload = await request.json().catch(() => ({}));
  const formId = typeof payload.formId === 'string' ? payload.formId.trim() : '';
  const isClosed = Boolean(payload.isClosed);

  if (!formId) {
    return NextResponse.json({ error: 'Missing formId' }, { status: 400 });
  }

  const endpoint = `${baseUrl.replace(/\/$/, '')}/forms/${encodeURIComponent(formId)}/${isClosed ? 'close' : 'open'}`;
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const upstreamResponse = await fetch(endpoint, {
      method: 'POST',
      headers,
      cache: 'no-store',
    });
    const upstreamPayload = await upstreamResponse.json().catch(() => ({}));
    return NextResponse.json(upstreamPayload, { status: upstreamResponse.status });
  } catch (error) {
    console.error('Temp storage form status sync failed:', error);
    return NextResponse.json({ error: 'Temp storage form status sync failed.' }, { status: 502 });
  }
}
