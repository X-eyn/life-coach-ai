import os
import sys
import argparse
from pathlib import Path

# ── Load .env ─────────────────────────────────────────────────────────────────
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _key, _, _val = _line.partition("=")
                os.environ.setdefault(_key.strip(), _val.strip())

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
if not OPENAI_API_KEY or OPENAI_API_KEY == "your_secret_key_here":
    sys.exit(f"[ERROR] Set OPENAI_API_KEY in {_env_path}")

from openai import OpenAI
from openai.types.audio import Transcription

# ── Config — edit these as needed ─────────────────────────────────────────────
MODEL               = "gpt-4o-transcribe"
LANGUAGE            = "bn"          # Bengali (ISO-639-1)
TEMPERATURE         = 0.4          # 0.0 = deterministic, up to 1.0

# Prompt — guides model style/behaviour.  Passed via the `prompt` parameter.
# The API uses this as context to steer transcription; it is NOT echoed into
# the output text, so it will never leak into the saved transcript file.
PROMPT              = (
    "This is a long-form, roughly 30-minute informal Bengali audio recording. "
    "Multiple speakers are having a casual, highly conversational dialogue in "
    "colloquial spoken Bengali. They may use regional dialectal pronunciations, "
    "contractions, slang, filler words, false starts, and non-standard grammar. "
    "Transcribe every single utterance faithfully and completely in Bengali "
    "script exactly as spoken — do not skip, summarize, paraphrase, or omit "
    "any word, even if content is repetitive or trivial. "
    "Preserve colloquial and dialectal forms as-is; do not normalise them to "
    "formal or standard written Bengali. "
    "If a speaker genuinely code-switches to English words or phrases, render "
    "only those specific words in English inline; everything else must remain "
    "in Bengali script. "
    "Pay very close attention to similar-sounding Bengali consonants and vowels "
    "such as শ/স/ষ, ন/ণ, জ/য, and ত/ৎ — prefer the more common colloquial "
    "spelling when uncertain. "
    "When a speaker change is clearly audible, begin a new paragraph. "
    "Do not add speaker labels, timestamps, headers, commentary, translations, "
    "or any metadata — output only the raw transcribed Bengali text."
)
INCLUDE             = None          # set to ["logprobs"] to get token log-probabilities
CHUNKING_STRATEGY   = "auto"        # required for audio longer than 30 seconds

SUPPORTED_EXTENSIONS = {".flac", ".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".ogg", ".wav", ".webm"}
MAX_FILE_BYTES       = 25 * 1024 * 1024  # 25 MB


def transcribe(audio_path: str | Path) -> Transcription:
    audio_path = Path(audio_path)

    if not audio_path.exists():
        raise FileNotFoundError(f"File not found: {audio_path}")
    if audio_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported format '{audio_path.suffix}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}")
    if audio_path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError(f"File too large ({audio_path.stat().st_size / 1_048_576:.1f} MB). Limit is 25 MB.")

    client = OpenAI(api_key=OPENAI_API_KEY)

    with open(audio_path, "rb") as f:
        kwargs = {
            "model":           MODEL,
            "file":            f,
            "language":        LANGUAGE,
            "response_format": "json",
            "temperature":     TEMPERATURE,
            "chunking_strategy": CHUNKING_STRATEGY,
        }
        if PROMPT:   kwargs["prompt"]   = PROMPT
        if INCLUDE:  kwargs["include"]  = INCLUDE

        return client.audio.transcriptions.create(**kwargs)


def main() -> None:
    parser = argparse.ArgumentParser(description="Transcribe Bengali audio using gpt-4o-transcribe.")
    parser.add_argument("audio_file", nargs="?", help="Path to the audio file.")
    parser.add_argument("--output", "-o", metavar="FILE", help="Save transcript to this file.")
    args = parser.parse_args()

    audio_path = args.audio_file or input("Enter path to audio file: ").strip().strip("\"'")

    print(f"Transcribing: {audio_path}\n")
    result = transcribe(audio_path)

    print(result.text)

    if result.usage:
        print(f"\n[Usage] {result.usage}")

    if args.output:
        Path(args.output).write_text(result.text, encoding="utf-8")
        print(f"[Saved] → {args.output}")


if __name__ == "__main__":
    main()
