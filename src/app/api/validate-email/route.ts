import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { email } = await request.json().catch(() => ({ email: undefined }));

  if (typeof email !== 'string') {
    return NextResponse.json({ valid: false, error: 'Must be a string' }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ valid: false, error: 'Must be a valid email address' }, { status: 400 });
  }

  return NextResponse.json({ valid: true });
}
