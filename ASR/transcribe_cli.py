import json
import os
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from dotenv import load_dotenv

load_dotenv(CURRENT_DIR / ".env")

from asr_google import transcribe

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python transcribe_cli.py <audio_path>"}), file=sys.stderr)
        return 2

    audio_path = Path(sys.argv[1]).resolve()
    if not audio_path.exists():
        print(json.dumps({"error": f"Audio file not found: {audio_path}"}), file=sys.stderr)
        return 2

    try:
        result = transcribe(str(audio_path))
        print(
            json.dumps(
                {
                    "transcript": {
                        "bengali": result["bengali"],
                        "english": result["english"],
                    }
                },
                ensure_ascii=False,
            )
        )
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
