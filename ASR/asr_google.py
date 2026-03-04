import google.generativeai as genai
import time
import os
from dotenv import load_dotenv


load_dotenv()
API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    raise ValueError("GOOGLE_API_KEY not found in .env file")
genai.configure(api_key=API_KEY)

def transcribe_audio_like_a_pro(audio_file_path):
    print(f"Uploading {audio_file_path} to Gemini...")
    
    
    
    audio_file = genai.upload_file(path=audio_file_path)
    
    
    while audio_file.state.name == "PROCESSING":
        print(".", end="", flush=True)
        time.sleep(2)
        audio_file = genai.get_file(audio_file.name)
    print("\nUpload complete and ready for processing!")

    
    
    prompt = """
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
    model = genai.GenerativeModel('models/gemini-3-flash-preview')

    print("Transcribing and analyzing the audio. This may take a minute...")
    
    
    response = model.generate_content([prompt, audio_file])

    
    genai.delete_file(audio_file.name)

    return response.text


if __name__ == "__main__":
    
    audio_path = "habib.mp3" 
    
    if os.path.exists(audio_path):
        transcription = transcribe_audio_like_a_pro(audio_path)
        with open("google_transcript.txt", "w", encoding="utf-8") as f:
            f.write(transcription)
        print("Transcription saved to google_transcript.txt")
    else:
        print(f"Error: Could not find file at {audio_path}")