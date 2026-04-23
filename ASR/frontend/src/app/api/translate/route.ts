import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 180;

const BACKEND_URL = process.env.ASR_BACKEND_URL ?? "http://127.0.0.1:5001";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const bengali: string = (body?.bengali ?? "").trim();

    if (!bengali) {
      return NextResponse.json({ error: "No Bengali transcript provided" }, { status: 400 });
    }

    const response = await fetch(`${BACKEND_URL}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bengali }),
    });

    const payload = await response.json().catch(() => ({ error: "Invalid backend response" }));
    return NextResponse.json(payload, { status: response.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Translation failed" },
      { status: 500 },
    );
  }
}
