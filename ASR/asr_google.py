import google.generativeai as genai
import time
import os
import sys
from dotenv import load_dotenv


load_dotenv()
API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    raise ValueError("GOOGLE_API_KEY not found in .env file")
genai.configure(api_key=API_KEY)

def translate_transcript(bengali_text: str) -> str:
    """
    Translate a Bengali speaker-diarized transcript into English.

    Rules enforced:
    - Speaker labels that are Bengali words are translated to their English meaning
      (e.g. **শিক্ষক:** → **Teacher:**, **ছাত্র:** → **Student:**).
    - Labels already in English (e.g. **Speaker 1:**) are kept unchanged.
    - Every turn is translated individually; the turn order and count are preserved exactly.
    - English words embedded in the Bengali (code-switching) stay in English.
    - Ellipses (...), dashes (-), and parenthetical stage directions are preserved and translated.
    - Output is the plain translated transcript only — no preamble, no commentary.
    """
    model = genai.GenerativeModel('models/gemini-3-flash-preview')
    prompt = f"""You are a professional Bengali-to-English translator specialising in spoken-language transcripts.

Your task is to translate the Bengali transcript below into natural, fluent English.

Strict rules — follow every one:
1. SPEAKER LABELS: Translate Bengali speaker labels into their English meaning.
   Examples: **শিক্ষক:** → **Teacher:** | **ছাত্র:** → **Student:** | **উপস্থাপক:** → **Host:**
   If a label is already in English (e.g. **Speaker 1:**) leave it exactly as-is.
2. TURN STRUCTURE: Keep exactly the same number of turns in exactly the same order.
   One Bengali turn → one English turn. Do not merge, split, or reorder turns.
3. CONTENT: Translate what was actually said — do not paraphrase or summarise.
   English words already present in the Bengali (code-switching) stay unchanged.
4. FORMATTING: Keep bold (**…**) for speaker labels. Keep ellipses (…), dashes (—/-),
   and parenthetical stage directions (e.g. *(long pause)*) — translate the stage directions too.
5. OUTPUT: The translated transcript only. No introduction, no commentary, nothing else.

Bengali transcript:
{bengali_text}"""

    print("Translating Bengali transcript to English...", file=sys.stderr)
    response = model.generate_content(prompt)
    return response.text


def transcribe(audio_file_path):
    print(f"Uploading {audio_file_path} to Gemini...", file=sys.stderr)
    
    audio_file = genai.upload_file(path=audio_file_path)
    
    while audio_file.state.name == "PROCESSING":
        print(".", end="", flush=True, file=sys.stderr)
        time.sleep(2)
        audio_file = genai.get_file(audio_file.name)
    print("\nUpload complete and ready for processing!", file=sys.stderr)

    model = genai.GenerativeModel('models/gemini-3-flash-preview')

    # Bengali transcription
    bengali_prompt = """
    You are an expert, professional audio transcriber who specializes in conversational Bengali mixed with English.
    
    Your task is to transcribe the provided audio clip with 100% accuracy, formatted beautifully.
    
    Follow these strict rules:
    1. **Speaker Diarization:** Identify who is speaking. Use contextual clues to name them appropriately (e.g., **শিক্ষক:** and **ছাত্র:**, or **Speaker 1:** and **Speaker 2:**).
    2. **Formatting:** Use Markdown bolding for the speaker's name. Put each speaker's dialogue on a new line.
    3. **Language Handling:** The audio may contain Bengali with English words mixed in. Transcribe the Bengali in standard Bengali script, and transcribe the English words in English alphabet if they are spoken as clear English terms (e.g., "group verb", "appropriate preposition"). 
    4. **Conversational Nuances:** Capture the natural flow. Include natural pauses, half-spoken words, and interruptions using ellipses (...) or hyphens (-). 
    5. **Contextual Accuracy:** Use your reasoning to understand the context. If a word is mumbled, use the context of the sentence (e.g., University admission test preparation) to deduce the correct word.
    6. **Timestamping (Optional but good):** If there are long pauses (like an Azan), note it in italics, e.g., *(দীর্ঘ বিরতি)*.
    
    Do not add any introductory or concluding remarks. Just output the pure, formatted transcription.
    """

    print("Transcribing in Bengali...", file=sys.stderr)
    bengali_response = model.generate_content([bengali_prompt, audio_file])
    bengali_text = bengali_response.text

    # English is produced by translating the Bengali transcript — NOT by running a
    # second independent audio pass — so both languages stay perfectly in sync.
    english_text = translate_transcript(bengali_text)

    genai.delete_file(audio_file.name)

    return {
        "bengali": bengali_text,
        "english": english_text
    }


if __name__ == "__main__":
    
    audio_path = "habib.mp3" 
    
    if os.path.exists(audio_path):
        result = transcribe(audio_path)
        with open("google_transcript_bengali.txt", "w", encoding="utf-8") as f:
            f.write(result["bengali"])
        with open("google_transcript_english.txt", "w", encoding="utf-8") as f:
            f.write(result["english"])
        print("Transcriptions saved to google_transcript_bengali.txt and google_transcript_english.txt")
    else:
        print(f"Error: Could not find file at {audio_path}")
