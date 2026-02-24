import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

// TokenSource.endpoint sends a POST with proto field names (snake_case)
export async function POST(req: NextRequest) {
  let body: Record<string, string> = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  const room =
    body["room_name"] ??
    `room-${Math.random().toString(36).slice(2, 8)}`;
  const identity =
    body["participant_identity"] ??
    body["participant_name"] ??
    `user-${Math.random().toString(36).slice(2, 8)}`;

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json(
      { error: "LiveKit environment variables are not configured" },
      { status: 500 }
    );
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    ttl: "1h",
  });

  at.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const participantToken = await at.toJwt();

  // Response format expected by TokenSource.endpoint from livekit-client
  return NextResponse.json({
    serverUrl: url,
    participantToken,
    room,
    identity,
  });
}
