import { NextRequest, NextResponse } from 'next/server';

// Allow up to 2 min for Gemini to process long audio files
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const response = await fetch('http://localhost:5001/api/transcribe', {
      method: 'POST',
      body: formData,
      // @ts-expect-error Node 18 fetch supports duplex for streaming
      duplex: 'half',
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Proxy error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
