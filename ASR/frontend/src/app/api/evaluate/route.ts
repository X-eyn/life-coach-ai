import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const BACKEND_URL = process.env.ASR_BACKEND_URL ?? "http://127.0.0.1:5001";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.transcript) {
      return NextResponse.json(
        { error: "No transcript provided" },
        { status: 400 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/evaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transcript: body.transcript }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        error: `Backend error: ${response.status}` 
      }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Evaluation API error:", error);
    return NextResponse.json(
      { error: `Evaluation failed: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
