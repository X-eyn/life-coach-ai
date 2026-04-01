import { NextRequest, NextResponse } from "next/server";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export const runtime = "nodejs";
export const maxDuration = 180;

const BACKEND_URL = process.env.ASR_BACKEND_URL ?? "http://127.0.0.1:5001";
const PYTHON_BIN = process.env.PYTHON_BIN ?? "python";

interface CliTranscript {
  transcript: {
    bengali: string;
    english: string;
  };
}

async function tryBackendProxy(formData: FormData) {
  const response = await fetch(`${BACKEND_URL}/api/transcribe`, {
    method: "POST",
    body: formData,
    // @ts-expect-error Node fetch accepts duplex for streamed multipart bodies.
    duplex: "half",
  });

  const payload = await response.json().catch(() => ({ error: "Invalid backend response" }));
  return NextResponse.json(payload, { status: response.status });
}

async function runLocalPythonFallback(file: File): Promise<CliTranscript> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "asr-upload-"));
  const sourceName = file.name || "upload.webm";
  const safeName = path.basename(sourceName);
  const tempPath = path.join(tempDir, safeName);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(tempPath, buffer);

    const scriptPath = path.join(process.cwd(), "..", "transcribe_cli.py");
    const result = await new Promise<CliTranscript>((resolve, reject) => {
      const child = spawn(PYTHON_BIN, [scriptPath, tempPath], {
        cwd: path.join(process.cwd(), ".."),
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || stdout.trim() || `Python exited with code ${code}`));
          return;
        }

        try {
          resolve(JSON.parse(stdout) as CliTranscript);
        } catch (error) {
          reject(
            new Error(
              error instanceof Error
                ? `Unable to parse Python output: ${error.message}`
                : "Unable to parse Python output",
            ),
          );
        }
      });
    });

    return result;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    try {
      return await tryBackendProxy(formData);
    } catch (backendError) {
      console.warn("Backend proxy failed, falling back to local Python transcription.", backendError);
      const result = await runLocalPythonFallback(file);
      return NextResponse.json(result);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Transcription route error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
